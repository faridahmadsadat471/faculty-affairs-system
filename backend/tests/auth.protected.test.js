import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, test } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../src/models/user.model.js';

process.env.NODE_ENV = 'test';
const testSecret = randomBytes(48).toString('hex');
process.env.JWT_SECRET = testSecret;
const { default: app } = await import('../src/app.js');

const databaseName = `faculty_affairs_test_protected_${randomBytes(12).toString('hex')}`;
const credentials = { email: 'protected@example.test', password: 'ProtectedFixturePassword123!' };
let server;
let baseUrl;
let userId;
let accessToken;
let fixtureHash;

before(async () => {
  assert.ok(process.env.MONGO_URI, 'Set MONGO_URI in backend/.env before running tests');
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 5000,
  });
  await User.init();

  server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const registration = await request('/api/auth/register', {
    method: 'POST', body: { fullName: 'Protected Test User', ...credentials },
  });
  assert.equal(registration.status, 201);
  userId = registration.body.user.id;

  const login = await request('/api/auth/login', { method: 'POST', body: credentials });
  assert.equal(login.status, 200);
  accessToken = login.body.accessToken;
  fixtureHash = await bcrypt.hash('OtherFixturePassword123!', 4);
});

after(async () => {
  try {
    if (server?.listening) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
  } finally {
    try {
      if (mongoose.connection.readyState === 1) {
        assert.equal(mongoose.connection.name, databaseName);
        assert.match(databaseName, /^faculty_affairs_test_protected_[a-f0-9]{24}$/);
        await mongoose.connection.dropDatabase();
      }
    } finally {
      await mongoose.disconnect();
    }
  }
});

async function request(path, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

function getMe(token) {
  return request('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
}

function mintToken(claims = {}, overrides = {}, secret = testSecret) {
  const payload = { sub: userId, ...claims };
  const options = {
    algorithm: 'HS256',
    issuer: 'faculty-affairs-api',
    audience: 'faculty-affairs-client',
    expiresIn: 900,
    ...overrides,
  };
  for (const object of [payload, options]) {
    for (const key of Object.keys(object)) {
      if (object[key] === undefined) delete object[key];
    }
  }
  return jwt.sign(payload, secret, options);
}

async function createAccount(email) {
  const user = await User.create({
    fullName: 'Other Protected Test User', email, passwordHash: fixtureHash,
  });
  const login = await request('/api/auth/login', {
    method: 'POST', body: { email, password: 'OtherFixturePassword123!' },
  });
  assert.equal(login.status, 200);
  return { user, token: login.body.accessToken };
}

test('a real login token returns only the authenticated user public data', async () => {
  const response = await getMe(accessToken);
  assert.equal(response.status, 200);
  assert.equal(response.body.user.id, userId);
  assert.equal(response.body.user.email, credentials.email);
  assert.equal(response.body.user.role, 'faculty_member');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Object.keys(response.body.user).sort(), ['id', 'fullName', 'email', 'role', 'isActive', 'createdAt'].sort());
  assert.ok(!JSON.stringify(response.body).includes(credentials.password));
});

test('missing authorization returns 401 with a Bearer challenge', async () => {
  const response = await request('/api/auth/me');
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('www-authenticate'), 'Bearer');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(response.body, { message: 'Authentication required' });
});

test('malformed headers and other authorization schemes are rejected', async () => {
  for (const Authorization of ['', 'Bearer', 'Basic abc', 'Bearer undefined', 'Bearer null', `Bearer ${accessToken} extra`]) {
    const response = await request('/api/auth/me', { headers: { Authorization } });
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, { message: 'Authentication required' });
  }
});

test('Bearer scheme casing and multiple separating spaces are accepted', async () => {
  const response = await request('/api/auth/me', { headers: { Authorization: `bEaReR   ${accessToken}` } });
  assert.equal(response.status, 200);
  assert.equal(response.body.user.id, userId);
});

test('tokens supplied only in query parameters or cookies do not authenticate', async () => {
  const response = await request(`/api/auth/me?access_token=${encodeURIComponent(accessToken)}`, {
    headers: { Cookie: `accessToken=${accessToken}` },
  });
  assert.equal(response.status, 401);
});

test('query parameters cannot select another user profile', async () => {
  const other = await createAccount('other-profile@example.test');
  const response = await request(`/api/auth/me?userId=${other.user._id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.user.id, userId);
});

test('tampered payloads and wrong signing secrets return 401', async () => {
  const parts = accessToken.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  parts[1] = Buffer.from(JSON.stringify({ ...payload, sub: new mongoose.Types.ObjectId().toString() })).toString('base64url');
  for (const token of [parts.join('.'), mintToken({}, {}, randomBytes(48).toString('hex'))]) {
    assert.equal((await getMe(token)).status, 401);
  }
});

test('expired and not-yet-valid tokens return 401', async () => {
  const tokens = [
    mintToken({ iat: Math.floor(Date.now() / 1000) - 1000 }),
    mintToken({}, { notBefore: '5m' }),
  ];
  for (const token of tokens) {
    assert.equal((await getMe(token)).status, 401);
  }
});

test('unsigned tokens and disallowed signing algorithms return 401', async () => {
  for (const token of [mintToken({}, { algorithm: 'none' }, ''), mintToken({}, { algorithm: 'HS384' })]) {
    assert.equal((await getMe(token)).status, 401);
  }
});

test('tokens from another issuer or for another audience return 401', async () => {
  for (const options of [{ issuer: 'another-api' }, { audience: 'another-client' }]) {
    assert.equal((await getMe(mintToken({}, options))).status, 401);
  }
});

test('missing, malformed, or nonexistent user subjects return 401 instead of database cast errors', async () => {
  for (const sub of [undefined, 'invalid-id', '123456789012', { $ne: null }, new mongoose.Types.ObjectId().toString()]) {
    assert.equal((await getMe(mintToken({ sub }))).status, 401);
  }
});

test('missing expiry or issue time, future issue times, and excessive token lifetimes are rejected', async () => {
  const tokens = [
    mintToken({}, { expiresIn: undefined }),
    mintToken({}, { noTimestamp: true }),
    mintToken({ iat: Math.floor(Date.now() / 1000) + 300 }),
    mintToken({}, { expiresIn: 1800 }),
  ];
  for (const token of tokens) {
    assert.equal((await getMe(token)).status, 401);
  }
});

test('deactivating a user denies access with an already-issued token', async () => {
  const account = await createAccount('deactivated-after-login@example.test');
  assert.equal((await getMe(account.token)).status, 200);
  await User.updateOne({ _id: account.user._id }, { $set: { isActive: false } });
  assert.equal((await getMe(account.token)).status, 401);
});

test('deleting a user denies access with an already-issued token', async () => {
  const account = await createAccount('deleted-after-login@example.test');
  await User.deleteOne({ _id: account.user._id });
  assert.equal((await getMe(account.token)).status, 401);
});

test('current database profile and role override stale or extra token claims', async () => {
  const account = await createAccount('changed-profile@example.test');
  const staleToken = mintToken({ sub: String(account.user._id), role: 'system_admin' });
  await User.updateOne({ _id: account.user._id }, { $set: { fullName: 'Updated Test Name', role: 'department_manager' } });
  const response = await getMe(staleToken);
  assert.equal(response.status, 200);
  assert.equal(response.body.user.fullName, 'Updated Test Name');
  assert.equal(response.body.user.role, 'department_manager');
});

test('database failures remain safe 500 errors instead of becoming authentication errors', async (context) => {
  context.mock.method(User, 'findById', () => { throw new Error('Simulated database failure'); });
  context.mock.method(console, 'error', () => {});
  const response = await getMe(accessToken);
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { message: 'Internal server error' });
});
