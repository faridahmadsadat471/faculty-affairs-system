import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { after, before, test } from 'node:test';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../src/models/user.model.js';
import { getJwtSecret } from '../src/utils/jwt.js';

process.env.NODE_ENV = 'test';
const testSecret = randomBytes(48).toString('hex');
process.env.JWT_SECRET = testSecret;
const { default: app } = await import('../src/app.js');

const databaseName = `faculty_affairs_test_login_${randomBytes(12).toString('hex')}`;
const credentials = { email: 'login@example.test', password: 'FacultyLoginPassword123!' };
let server;
let baseUrl;
let successfulLogin;

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

  const registered = await post('/api/auth/register', {
    fullName: 'Login Test User',
    ...credentials,
  });
  assert.equal(registered.status, 201);

  await User.create([
    {
      fullName: 'Inactive Test User',
      email: 'inactive@example.test',
      passwordHash: await bcrypt.hash('InactiveFixturePassword123!', 12),
      isActive: false,
    },
    {
      fullName: 'Legacy Test User',
      email: 'legacy@example.test',
      passwordHash: await bcrypt.hash('oldpass', 4),
    },
    {
      fullName: 'Space Password Test User',
      email: 'spaces-login@example.test',
      passwordHash: await bcrypt.hash('  PasswordWithSpaces123!  ', 4),
    },
    {
      fullName: 'Unicode Test User',
      email: 'unicode-login@example.test',
      passwordHash: await bcrypt.hash('\u067e'.repeat(36), 4),
    },
  ]);
  successfulLogin = await post('/api/auth/login', credentials);
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
        assert.match(databaseName, /^faculty_affairs_test_login_[a-f0-9]{24}$/);
        await mongoose.connection.dropDatabase();
      }
    } finally {
      await mongoose.disconnect();
    }
  }
});

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  return { status: response.status, headers: response.headers, body: await response.json() };
}

const verificationOptions = {
  algorithms: ['HS256'],
  issuer: 'faculty-affairs-api',
  audience: 'faculty-affairs-client',
};

test('valid credentials return a safe user response and an uncacheable bearer token', () => {
  assert.equal(successfulLogin.status, 200);
  assert.equal(successfulLogin.body.message, 'Login successful');
  assert.equal(successfulLogin.body.tokenType, 'Bearer');
  assert.equal(successfulLogin.body.expiresIn, 900);
  assert.equal(successfulLogin.headers.get('cache-control'), 'no-store');
  assert.equal(successfulLogin.body.user.email, credentials.email);
  assert.equal(successfulLogin.body.user.role, 'faculty_member');
  assert.ok(!Object.hasOwn(successfulLogin.body.user, 'password'));
  assert.ok(!Object.hasOwn(successfulLogin.body.user, 'passwordHash'));
  assert.ok(!JSON.stringify(successfulLogin.body).includes(credentials.password));
});

test('JWT signature, subject, issuer, audience, and 15-minute expiry are correct', () => {
  const payload = jwt.verify(successfulLogin.body.accessToken, testSecret, verificationOptions);
  assert.equal(payload.sub, successfulLogin.body.user.id);
  assert.equal(payload.exp - payload.iat, 900);
  assert.ok(!Object.hasOwn(payload, 'password'));
  assert.ok(!Object.hasOwn(payload, 'passwordHash'));
  assert.ok(!Object.hasOwn(payload, 'email'));
  assert.ok(!Object.hasOwn(payload, 'role'));
  assert.equal(jwt.decode(successfulLogin.body.accessToken, { complete: true }).header.alg, 'HS256');
});

test('altered JWTs and tokens verified with the wrong secret or algorithm fail verification', () => {
  const token = successfulLogin.body.accessToken;
  const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  parts[1] = Buffer.from(JSON.stringify({ ...payload, sub: new mongoose.Types.ObjectId().toString() })).toString('base64url');

  assert.throws(() => jwt.verify(parts.join('.'), testSecret, verificationOptions), { name: 'JsonWebTokenError' });
  assert.throws(() => jwt.verify(token, randomBytes(48).toString('hex'), verificationOptions), { name: 'JsonWebTokenError' });
  assert.throws(() => jwt.verify(token, testSecret, { algorithms: ['HS512'] }), { name: 'JsonWebTokenError' });
});

test('expired JWTs and mismatched issuer or audience fail verification', () => {
  const token = successfulLogin.body.accessToken;
  const payload = jwt.verify(token, testSecret, verificationOptions);
  assert.throws(() => jwt.verify(token, testSecret, {
    ...verificationOptions,
    clockTimestamp: payload.exp + 1,
  }), { name: 'TokenExpiredError' });
  assert.throws(() => jwt.verify(token, testSecret, { ...verificationOptions, issuer: 'wrong-api' }), { name: 'JsonWebTokenError' });
  assert.throws(() => jwt.verify(token, testSecret, { ...verificationOptions, audience: 'wrong-client' }), { name: 'JsonWebTokenError' });
});

test('wrong password, nonexistent email, and inactive account return the same 401 response', async () => {
  const attempts = [
    { ...credentials, password: 'wrong-password' },
    { email: 'missing@example.test', password: credentials.password },
    { email: 'inactive@example.test', password: 'InactiveFixturePassword123!' },
  ];

  for (const attempt of attempts) {
    const response = await post('/api/auth/login', attempt);
    assert.equal(response.status, 401);
    assert.deepEqual(response.body, { message: 'Invalid email or password' });
  }
});

test('login normalizes email without changing password characters', async () => {
  const normalized = await post('/api/auth/login', { ...credentials, email: '  LOGIN@EXAMPLE.TEST  ' });
  assert.equal(normalized.status, 200);

  const preserved = await post('/api/auth/login', {
    email: 'spaces-login@example.test', password: '  PasswordWithSpaces123!  ',
  });
  assert.equal(preserved.status, 200);
  const trimmed = await post('/api/auth/login', {
    email: 'spaces-login@example.test', password: 'PasswordWithSpaces123!',
  });
  assert.equal(trimmed.status, 401);
});

test('existing passwords are checked without imposing the new registration minimum length', async () => {
  const response = await post('/api/auth/login', { email: 'legacy@example.test', password: 'oldpass' });
  assert.equal(response.status, 200);
});

test('missing or incorrectly typed credentials return 400', async () => {
  const invalidBodies = [
    {}, null, [],
    { ...credentials, email: 'not-an-email' },
    { ...credentials, email: { $ne: null } },
    { ...credentials, email: ['login@example.test'] },
    { ...credentials, password: null },
    { ...credentials, password: 123456789012 },
    { ...credentials, password: ['FacultyLoginPassword123!'] },
    { ...credentials, password: '' },
    { ...credentials, password: '   ' },
  ];
  for (const body of invalidBodies) {
    assert.equal((await post('/api/auth/login', body)).status, 400);
  }
});

test('login rejects passwords over 72 UTF-8 bytes instead of accepting a truncated match', async () => {
  const boundary = await post('/api/auth/login', { email: 'unicode-login@example.test', password: '\u067e'.repeat(36) });
  assert.equal(boundary.status, 200);
  const oversized = await post('/api/auth/login', { email: 'unicode-login@example.test', password: '\u067e'.repeat(37) });
  assert.equal(oversized.status, 400);
});

test('unknown login fields cannot override token duration, role, or account status', async () => {
  for (const extra of [{ role: 'system_admin' }, { expiresIn: 99999999 }, { isActive: true }, { accessToken: 'client-token' }]) {
    const response = await post('/api/auth/login', { ...credentials, ...extra });
    assert.equal(response.status, 400);
    assert.ok(!JSON.stringify(response.body).includes(credentials.password));
    assert.ok(!Object.hasOwn(response.body, 'accessToken'));
  }
});

test('missing, short, and placeholder signing secrets are rejected without revealing their values', () => {
  try {
    for (const value of ['', 'short-secret', 'replace_with_a_long_random_secret_before_implementing_login']) {
      process.env.JWT_SECRET = value;
      assert.throws(() => getJwtSecret(), /Set JWT_SECRET to a random secret/);
    }
  } finally {
    process.env.JWT_SECRET = testSecret;
  }
});

test('server refuses to start without a JWT secret before attempting database connection', () => {
  const result = spawnSync(process.execPath, ['src/server.js'], {
    env: { ...process.env, JWT_SECRET: '', MONGO_URI: 'mongodb://127.0.0.1:1/unused' },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Startup failed: Set JWT_SECRET/);
  assert.ok(!result.stdout.includes('MongoDB connected'));
  assert.ok(!result.stdout.includes('listening on port'));
});
