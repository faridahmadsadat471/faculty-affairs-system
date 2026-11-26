import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, test } from 'node:test';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import Faculty from '../src/models/faculty.model.js';
import User from '../src/models/user.model.js';
import RevokedToken from '../src/models/revoked-token.model.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
const { default: app } = await import('../src/app.js');
const databaseName = `faculty_affairs_test_list_${randomBytes(12).toString('hex')}`;
const accounts = {};
let server;
let baseUrl;
let passwordHash;
let sequence = 0;

before(async () => {
  assert.ok(process.env.MONGO_URI, 'Set MONGO_URI in backend/.env before running tests');
  await mongoose.connect(process.env.MONGO_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Faculty.init(), RevokedToken.init()]);
  passwordHash = await bcrypt.hash('FacultyListFixture123!', 4);
  server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  for (const [name, role, department] of [
    ['admin', 'system_admin'], ['staff', 'directorate_staff'],
    ['csManager', 'department_manager', 'Computer Science'],
    ['csMember', 'faculty_member', 'Computer Science'],
    ['mathManager', 'department_manager', 'Mathematics'],
    ['mathMember', 'faculty_member', 'Mathematics'],
    ['literalManager', 'department_manager', 'CS.*'],
    ['unlinkedManager', 'department_manager'], ['unlinkedMember', 'faculty_member'],
  ]) {
    accounts[name] = await createAccount(role, `${name.toLowerCase()}@example.test`);
    if (department) await createProfile(department, accounts[name].user._id);
  }
  await createProfile('Computer Science');
  await createProfile('Mathematics');
  await createProfile('CSX');
});

after(async () => {
  try {
    if (server?.listening) {
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  } finally {
    try {
      if (mongoose.connection.readyState === 1) {
        assert.equal(mongoose.connection.name, databaseName);
        assert.match(databaseName, /^faculty_affairs_test_list_[a-f0-9]{24}$/);
        await mongoose.connection.dropDatabase();
      }
    } finally {
      await mongoose.disconnect();
    }
  }
});

async function request(path, { method = 'GET', token, body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
}

async function createAccount(role, email) {
  const user = await User.create({ fullName: 'Faculty List Test User', email, passwordHash, role });
  const login = await request('/api/auth/login', {
    method: 'POST', body: { email, password: 'FacultyListFixture123!' },
  });
  assert.equal(login.status, 200);
  return { user, token: login.body.accessToken };
}

async function createProfile(department, user) {
  sequence += 1;
  return Faculty.create({
    employeeId: `FAC-LIST-${sequence}`, fullName: `Faculty List Person ${sequence}`,
    department, academicRank: 'lecturer', ...(user ? { user } : {}),
  });
}

function list(account = accounts.admin, query = '') {
  return request(`/api/faculty${query}`, { token: account.token });
}

test('administrators and staff list all profiles without needing a linked profile', async () => {
  for (const account of [accounts.admin, accounts.staff]) {
    const response = await list(account);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.body.faculty.length, 8);
    assert.deepEqual(response.body.pagination, { page: 1, limit: 20, total: 8, totalPages: 1 });
  }
});

test('each manager sees only their trusted department including unlinked profiles', async () => {
  for (const [name, department] of [['csManager', 'Computer Science'], ['mathManager', 'Mathematics']]) {
    const response = await list(accounts[name]);
    assert.equal(response.status, 200);
    assert.equal(response.body.faculty.length, 3);
    assert.equal(response.body.pagination.total, 3);
    assert.ok(response.body.faculty.every((profile) => profile.department === department));
    assert.ok(response.body.faculty.some((profile) => !profile.user));
  }
});

test('department names are matched literally rather than interpreted as regular expressions', async () => {
  const response = await list(accounts.literalManager);
  assert.equal(response.status, 200);
  assert.equal(response.body.pagination.total, 1);
  assert.deepEqual(response.body.faculty.map((profile) => profile.department), ['CS.*']);
});

test('faculty members can read only their own linked profile', async () => {
  for (const account of [accounts.csMember, accounts.mathMember]) {
    const response = await list(account);
    assert.equal(response.status, 200);
    assert.equal(response.body.pagination.total, 1);
    assert.equal(response.body.faculty.length, 1);
    assert.equal(response.body.faculty[0].user, String(account.user._id));
  }
});

test('unlinked faculty members receive an empty scoped list', async () => {
  const response = await list(accounts.unlinkedMember);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { faculty: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
});

test('managers without a linked department are denied instead of receiving all profiles', async () => {
  const response = await list(accounts.unlinkedManager);
  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { message: 'Department access is not configured' });
});

test('pagination has a deterministic order and no overlap between unchanged pages', async () => {
  const first = await list(accounts.admin, '?page=1&limit=2');
  const second = await list(accounts.admin, '?page=2&limit=2');
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.deepEqual(first.body.pagination, { page: 1, limit: 2, total: 8, totalPages: 4 });
  const expected = await Faculty.find().sort({ createdAt: -1, _id: -1 }).limit(4).lean();
  const actualIds = [...first.body.faculty, ...second.body.faculty].map((profile) => profile._id);
  assert.deepEqual(actualIds, expected.map((profile) => String(profile._id)));
  assert.equal(new Set(actualIds).size, 4);
});

test('empty pages retain only the authorized count and pagination supports its maximum limit', async () => {
  const response = await list(accounts.csManager, '?page=3&limit=2');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { faculty: [], pagination: { page: 3, limit: 2, total: 3, totalPages: 2 } });
  const maximum = await list(accounts.admin, '?limit=100');
  assert.equal(maximum.status, 200);
  assert.equal(maximum.body.pagination.limit, 100);
});

test('invalid or repeated pagination parameters return 400', async () => {
  for (const query of [
    '?page=0', '?page=-1', '?page=1.5', '?page=1000001', '?page=no', '?page=',
    '?limit=0', '?limit=101', '?limit=1.5', '?limit=', '?page=1&page=2', '?limit=1&limit=2',
  ]) assert.equal((await list(accounts.admin, query)).status, 400, query);
});

test('query scope overrides and unknown parameters cannot bypass department access', async () => {
  for (const query of ['?unknown=Mathematics', '?user=other', '?role=system_admin', '?unknown=person', '?page[$gt]=0']) {
    const response = await list(accounts.csManager, query);
    assert.equal(response.status, 400, query);
    assert.equal(response.body.message, 'Validation failed');
    assert.ok(response.body.errors.every((error) => !Object.hasOwn(error, 'value')));
  }
  const response = await request('/api/faculty', {
    token: accounts.csManager.token, headers: { 'X-Role': 'system_admin', 'X-Department': 'Mathematics' },
  });
  assert.equal(response.status, 200);
  assert.ok(response.body.faculty.every((profile) => profile.department === 'Computer Science'));
});

test('responses exclude unapproved database fields and do not populate user credentials', async () => {
  await Faculty.collection.updateOne({ user: accounts.csMember.user._id }, { $set: { privateMarker: 'must-not-leak' } });
  const response = await list(accounts.csMember);
  assert.equal(response.status, 200);
  assert.equal(typeof response.body.faculty[0].user, 'string');
  for (const field of ['privateMarker', '__v', 'passwordHash', 'password', 'accessToken']) {
    assert.ok(!JSON.stringify(response.body).includes(field));
  }
  assert.ok(!JSON.stringify(response.body).includes(passwordHash));
});

test('missing and invalid tokens return 401', async () => {
  for (const token of [undefined, 'invalid-token']) {
    const response = await request('/api/faculty', { token });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), 'Bearer');
  }
});

test('revoked and deactivated accounts cannot list faculty', async () => {
  const revoked = await createAccount('system_admin', 'revoked-list@example.test');
  assert.equal((await request('/api/auth/logout', { method: 'POST', token: revoked.token })).status, 200);
  assert.equal((await list(revoked)).status, 401);
  const inactive = await createAccount('directorate_staff', 'inactive-list@example.test');
  await User.updateOne({ _id: inactive.user._id }, { $set: { isActive: false } });
  assert.equal((await list(inactive)).status, 401);
});

test('the same token respects trusted department changes immediately', async () => {
  const account = accounts.csManager;
  try {
    await Faculty.updateOne({ user: account.user._id }, { $set: { department: 'Mathematics' } });
    const response = await list(account);
    assert.equal(response.status, 200);
    assert.equal(response.body.pagination.total, 4);
    assert.ok(response.body.faculty.every((profile) => profile.department === 'Mathematics'));
  } finally {
    await Faculty.updateOne({ user: account.user._id }, { $set: { department: 'Computer Science' } });
  }
});

test('role changes take effect without issuing another token and unknown roles fail closed', async () => {
  const account = accounts.csManager;
  try {
    await User.updateOne({ _id: account.user._id }, { $set: { role: 'faculty_member' } });
    const response = await list(account);
    assert.equal(response.status, 200);
    assert.equal(response.body.pagination.total, 1);
    assert.equal(response.body.faculty[0].user, String(account.user._id));
    await User.collection.updateOne({ _id: account.user._id }, { $set: { role: 'unknown-role' } });
    assert.equal((await list(account)).status, 403);
  } finally {
    await User.updateOne({ _id: account.user._id }, { $set: { role: 'department_manager' } });
  }
});

test('department lookup failures return safe server errors', async (context) => {
  context.mock.method(Faculty, 'findOne', () => { throw new Error('Private lookup failure'); });
  context.mock.method(console, 'error', () => {});
  const response = await list(accounts.csManager);
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { message: 'Internal server error' });
});

test('listing failures return safe server errors', async (context) => {
  context.mock.method(Faculty, 'find', () => { throw new Error('Private listing failure'); });
  context.mock.method(console, 'error', () => {});
  const response = await list();
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { message: 'Internal server error' });
});
