import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, test } from 'node:test';
import bcrypt from 'bcryptjs';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../src/models/user.model.js';
import RevokedToken from '../src/models/revoked-token.model.js';
import { requireAuth } from '../src/middleware/auth.middleware.js';
import { requireRoles } from '../src/middleware/role.middleware.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
const { default: app } = await import('../src/app.js');

const databaseName = `faculty_affairs_test_roles_${randomBytes(12).toString('hex')}`;
const roles = ['system_admin', 'directorate_staff', 'department_manager', 'faculty_member'];
const accounts = {};
let server;
let roleServer;
let baseUrl;
let roleBaseUrl;
let passwordHash;

async function listen(application) {
  return new Promise((resolve, reject) => {
    const listener = application.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
}

before(async () => {
  assert.ok(process.env.MONGO_URI, 'Set MONGO_URI in backend/.env before running tests');
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 5000,
  });
  await Promise.all([User.init(), RevokedToken.init()]);
  server = await listen(app);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  passwordHash = await bcrypt.hash('RoleFixturePassword123!', 4);

  for (const role of roles) {
    accounts[role] = await createAccount(role, `${role}@example.test`);
  }

  // These routes exist only inside this test process, not in the production app.
  const roleApp = express();
  roleApp.use(express.json());
  roleApp.get('/staff-or-manager', requireAuth, requireRoles('directorate_staff', 'department_manager'), (req, res) => {
    res.json({ role: req.user.role });
  });
  roleApp.post('/staff-only', requireAuth, requireRoles('directorate_staff'), (req, res) => {
    res.json({ role: req.user.role });
  });
  roleApp.get('/missing-auth-middleware', requireRoles('system_admin'), (req, res) => {
    res.json({ allowed: true });
  });
  roleServer = await listen(roleApp);
  roleBaseUrl = `http://127.0.0.1:${roleServer.address().port}`;
});

after(async () => {
  try {
    for (const listener of [server, roleServer]) {
      if (listener?.listening) {
        await new Promise((resolve, reject) => {
          listener.close((error) => error ? reject(error) : resolve());
        });
      }
    }
  } finally {
    try {
      if (mongoose.connection.readyState === 1) {
        assert.equal(mongoose.connection.name, databaseName);
        assert.match(databaseName, /^faculty_affairs_test_roles_[a-f0-9]{24}$/);
        await mongoose.connection.dropDatabase();
      }
    } finally {
      await mongoose.disconnect();
    }
  }
});

async function request(path, { token, method = 'GET', body, headers = {}, root = baseUrl } = {}) {
  const response = await fetch(`${root}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

async function createAccount(role, email) {
  const user = await User.create({ fullName: 'Role Test User', email, passwordHash, role });
  const login = await request('/api/auth/login', {
    method: 'POST', body: { email, password: 'RoleFixturePassword123!' },
  });
  assert.equal(login.status, 200);
  return { user, token: login.body.accessToken };
}

test('system administrators can list accounts with safe public fields and default pagination', async () => {
  const response = await request('/api/users', { token: accounts.system_admin.token });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.body.pagination.page, 1);
  assert.equal(response.body.pagination.limit, 20);
  assert.equal(response.body.pagination.total, await User.countDocuments());
  for (const user of response.body.users) {
    assert.deepEqual(Object.keys(user).sort(), ['id', 'fullName', 'email', 'role', 'isActive', 'createdAt'].sort());
  }
  assert.ok(!JSON.stringify(response.body).includes(passwordHash));
});

test('staff, managers, and faculty members receive 403 without account data', async () => {
  for (const role of ['directorate_staff', 'department_manager', 'faculty_member']) {
    const response = await request('/api/users', { token: accounts[role].token });
    assert.equal(response.status, 403);
    assert.deepEqual(response.body, { message: 'Access denied' });
  }
});

test('all four authenticated roles retain access to their own profile', async () => {
  for (const role of roles) {
    const response = await request('/api/auth/me', { token: accounts[role].token });
    assert.equal(response.status, 200);
    assert.equal(response.body.user.id, String(accounts[role].user._id));
  }
});

test('missing or invalid credentials return 401 rather than 403', async () => {
  for (const token of [undefined, 'invalid-token']) {
    const response = await request('/api/users', { token });
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, { message: 'Authentication required' });
  }
});

test('multiple allowed roles work without an implicit administrator bypass', async () => {
  for (const role of roles) {
    const response = await request('/staff-or-manager', { root: roleBaseUrl, token: accounts[role].token });
    assert.equal(response.status, ['directorate_staff', 'department_manager'].includes(role) ? 200 : 403);
  }
});

test('body, query, and header role values cannot replace the authenticated database role', async () => {
  const account = accounts.faculty_member;
  const bodyAttempt = await request('/staff-only?role=directorate_staff', {
    root: roleBaseUrl, token: account.token, method: 'POST',
    headers: { 'X-Role': 'directorate_staff' },
    body: { role: 'directorate_staff', user: { role: 'directorate_staff', isActive: true } },
  });
  assert.equal(bodyAttempt.status, 403);
  const queryAttempt = await request('/api/users?role=system_admin', {
    token: account.token, headers: { 'X-Role': 'system_admin' },
  });
  assert.equal(queryAttempt.status, 403);
});

test('an extra administrator claim inside a signed JWT cannot elevate a faculty account', async () => {
  const token = jwt.sign({ role: 'system_admin' }, process.env.JWT_SECRET, {
    algorithm: 'HS256', subject: String(accounts.faculty_member.user._id),
    issuer: 'faculty-affairs-api', audience: 'faculty-affairs-client', expiresIn: 900,
  });
  assert.equal((await request('/api/users', { token })).status, 403);
});

test('database role changes immediately affect an already-issued token', async () => {
  const account = await createAccount('faculty_member', 'role-change@example.test');
  assert.equal((await request('/api/users', { token: account.token })).status, 403);
  await User.updateOne({ _id: account.user._id }, { $set: { role: 'system_admin' } });
  assert.equal((await request('/api/users', { token: account.token })).status, 200);
  await User.updateOne({ _id: account.user._id }, { $set: { role: 'faculty_member' } });
  assert.equal((await request('/api/users', { token: account.token })).status, 403);
});

test('deactivated administrators cannot use their previous token', async () => {
  const account = await createAccount('system_admin', 'inactive-admin@example.test');
  await User.updateOne({ _id: account.user._id }, { $set: { isActive: false } });
  assert.equal((await request('/api/users', { token: account.token })).status, 401);
});

test('logged-out administrator tokens cannot access the account list', async () => {
  const account = await createAccount('system_admin', 'logged-out-admin@example.test');
  assert.equal((await request('/api/auth/logout', { token: account.token, method: 'POST' })).status, 200);
  assert.equal((await request('/api/users', { token: account.token })).status, 401);
});

test('pagination returns bounded, non-overlapping pages with numeric metadata', async () => {
  const token = accounts.system_admin.token;
  const first = await request('/api/users?page=1&limit=2', { token });
  const second = await request('/api/users?page=2&limit=2', { token });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.body.users.length, 2);
  assert.equal(second.body.users.length, 2);
  assert.equal(second.body.pagination.page, 2);
  assert.equal(second.body.pagination.limit, 2);
  assert.equal(second.body.pagination.totalPages, Math.ceil(second.body.pagination.total / 2));
  assert.ok(second.body.users.every((user) => !first.body.users.some((other) => other.id === user.id)));
  assert.deepEqual((await request('/api/users?page=1000000&limit=2', { token })).body.users, []);
});

test('invalid, repeated, or unknown pagination inputs are rejected', async () => {
  for (const query of ['page=0', 'page=1.5', 'page=1000001', 'page=one', 'limit=0', 'limit=101', 'limit=1.5', 'page=1&page=2', 'page[x]=1', 'role=system_admin']) {
    const response = await request(`/api/users?${query}`, { token: accounts.system_admin.token });
    assert.equal(response.status, 400);
    assert.equal(response.body.message, 'Validation failed');
  }
});

test('unrecognized database roles do not receive account-list access', async () => {
  const account = await createAccount('faculty_member', 'invalid-role@example.test');
  await User.collection.updateOne({ _id: account.user._id }, { $set: { role: 'unrecognized' } });
  assert.equal((await request('/api/users', { token: account.token })).status, 403);
});

test('role middleware fails closed when authentication middleware was omitted', async () => {
  const response = await request('/missing-auth-middleware', { root: roleBaseUrl, token: accounts.system_admin.token });
  assert.equal(response.status, 401);
});

test('empty and misspelled role configurations fail early', () => {
  assert.throws(() => requireRoles(), TypeError);
  assert.throws(() => requireRoles('admin'), TypeError);
  assert.throws(() => requireRoles('system_admin', 'unknown'), TypeError);
});

test('account-list database failures return a safe 500 response', async (context) => {
  context.mock.method(User, 'find', () => { throw new Error('Simulated account-list database failure'); });
  context.mock.method(console, 'error', () => {});
  const response = await request('/api/users', { token: accounts.system_admin.token });
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { message: 'Internal server error' });
});
