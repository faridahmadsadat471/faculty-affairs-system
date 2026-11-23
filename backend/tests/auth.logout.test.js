import 'dotenv/config';
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { after, before, test } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../src/models/user.model.js';
import RevokedToken from '../src/models/revoked-token.model.js';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = randomBytes(48).toString('hex');
const { default: app } = await import('../src/app.js');

const databaseName = `faculty_affairs_test_logout_${randomBytes(12).toString('hex')}`;
const credentials = { email: 'logout@example.test', password: 'LogoutFixturePassword123!' };
let server;
let baseUrl;
let fixtureHash;
let userId;

async function connectTestDatabase() {
  await mongoose.connect(process.env.MONGO_URI, {
    dbName: databaseName,
    serverSelectionTimeoutMS: 5000,
  });
}

before(async () => {
  assert.ok(process.env.MONGO_URI, 'Set MONGO_URI in backend/.env before running tests');
  await connectTestDatabase();
  await Promise.all([User.init(), RevokedToken.init()]);
  fixtureHash = await bcrypt.hash(credentials.password, 4);
  const user = await User.create({
    fullName: 'Logout Test User',
    email: credentials.email,
    passwordHash: fixtureHash,
  });
  userId = String(user._id);

  server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
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
        assert.match(databaseName, /^faculty_affairs_test_logout_[a-f0-9]{24}$/);
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
  return { status: response.status, headers: response.headers, body: await response.json() };
}

async function login(email = credentials.email) {
  const response = await request('/api/auth/login', {
    method: 'POST', body: { email, password: credentials.password },
  });
  assert.equal(response.status, 200);
  return response.body.accessToken;
}

function tokenDigest(token) {
  return createHash('sha256').update(token).digest('hex');
}

function logout(token, body) {
  return request('/api/auth/logout', { method: 'POST', token, body });
}

test('logout succeeds and immediately denies protected requests with the same token', async () => {
  const token = await login();
  assert.equal((await request('/api/auth/me', { token })).status, 200);
  const response = await logout(token);
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { message: 'Logout successful' });
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal((await request('/api/auth/me', { token })).status, 401);
  assert.equal((await logout(token)).status, 401);
});

test('revocation stores only a token digest and the original JWT expiration', async () => {
  const token = await login();
  assert.equal((await logout(token)).status, 200);
  const saved = await RevokedToken.findOne({ tokenHash: tokenDigest(token) }).lean();
  assert.ok(saved);
  assert.equal(saved.tokenHash, tokenDigest(token));
  assert.equal(saved.expiresAt.getTime(), jwt.decode(token).exp * 1000);
  assert.ok(!JSON.stringify(saved).includes(token));
  assert.ok(!Object.hasOwn(saved, 'token'));
  assert.ok(!Object.hasOwn(saved, 'accessToken'));
});

test('each login has a distinct token ID and logging out does not revoke another login', async () => {
  const first = await login();
  const second = await login();
  assert.notEqual(first, second);
  assert.ok(jwt.decode(first).jti);
  assert.notEqual(jwt.decode(first).jti, jwt.decode(second).jti);
  assert.equal((await logout(first)).status, 200);
  assert.equal((await request('/api/auth/me', { token: first })).status, 401);
  assert.equal((await request('/api/auth/me', { token: second })).status, 200);
});

test('client-supplied user IDs or tokens cannot log out another user', async () => {
  const other = await User.create({
    fullName: 'Other Logout Test User', email: 'other-logout@example.test', passwordHash: fixtureHash,
  });
  const ownToken = await login();
  const otherToken = await login(other.email);
  const response = await logout(ownToken, {
    userId: String(other._id), accessToken: otherToken, tokenHash: tokenDigest(otherToken),
  });
  assert.equal(response.status, 200);
  assert.equal((await request('/api/auth/me', { token: ownToken })).status, 401);
  assert.equal((await request('/api/auth/me', { token: otherToken })).status, 200);
  assert.equal(await RevokedToken.countDocuments({ tokenHash: tokenDigest(otherToken) }), 0);
});

test('a user can log in again after logout without reviving the old token', async () => {
  const oldToken = await login();
  assert.equal((await logout(oldToken)).status, 200);
  const newToken = await login();
  assert.equal((await request('/api/auth/me', { token: newToken })).status, 200);
  assert.equal((await request('/api/auth/me', { token: oldToken })).status, 401);
  assert.equal((await User.findById(userId)).isActive, true);
});

test('missing, invalid, and expired credentials cannot create revocation entries', async () => {
  const count = await RevokedToken.countDocuments();
  assert.equal((await request('/api/auth/logout', { method: 'POST' })).status, 401);
  assert.equal((await logout('invalid-token')).status, 401);
  const expired = jwt.sign({ iat: Math.floor(Date.now() / 1000) - 1000 }, process.env.JWT_SECRET, {
    algorithm: 'HS256', subject: userId, expiresIn: 900,
    issuer: 'faculty-affairs-api', audience: 'faculty-affairs-client',
  });
  assert.equal((await logout(expired)).status, 401);
  assert.equal(await RevokedToken.countDocuments(), count);
});

test('simultaneous logout requests do not fail with 500 or create duplicate revocations', async () => {
  const token = await login();
  const results = await Promise.all([logout(token), logout(token)]);
  assert.ok(results.some((response) => response.status === 200));
  assert.ok(results.every((response) => [200, 401].includes(response.status)));
  assert.equal(await RevokedToken.countDocuments({ tokenHash: tokenDigest(token) }), 1);
  assert.equal((await request('/api/auth/me', { token })).status, 401);
});

test('MongoDB has unique token-digest and automatic-expiry indexes', async () => {
  const indexes = await RevokedToken.collection.indexes();
  assert.ok(indexes.some((index) => index.key.tokenHash === 1 && index.unique === true));
  assert.ok(indexes.some((index) => index.key.expiresAt === 1 && index.expireAfterSeconds === 0));
});

test('revocation remains effective after reconnecting to MongoDB', async () => {
  const token = await login();
  assert.equal((await logout(token)).status, 200);
  await mongoose.disconnect();
  await connectTestDatabase();
  assert.equal((await request('/api/auth/me', { token })).status, 401);
  assert.equal((await request('/api/auth/me', { token: await login() })).status, 200);
});

test('a failed revocation write returns 500 rather than claiming logout succeeded', async (context) => {
  const token = await login();
  context.mock.method(RevokedToken, 'updateOne', () => { throw new Error('Simulated revocation write failure'); });
  context.mock.method(console, 'error', () => {});
  const response = await logout(token);
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { message: 'Internal server error' });
  assert.equal((await request('/api/auth/me', { token })).status, 200);
});

test('revocation lookup failures do not grant access', async (context) => {
  const token = await login();
  context.mock.method(RevokedToken, 'exists', () => { throw new Error('Simulated revocation lookup failure'); });
  context.mock.method(console, 'error', () => {});
  const response = await request('/api/auth/me', { token });
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { message: 'Internal server error' });
});

test('the revocation model rejects invalid digests and missing expiration dates', async () => {
  await assert.rejects(new RevokedToken({ tokenHash: 'not-a-digest' }).validate(), (error) => {
    return Boolean(error.errors.tokenHash && error.errors.expiresAt);
  });
});
