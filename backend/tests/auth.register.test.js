import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, test } from 'node:test';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import User from '../src/models/user.model.js';

process.env.NODE_ENV = 'test';
const { default: app } = await import('../src/app.js');

const databaseName = `faculty_affairs_test_register_${randomBytes(12).toString('hex')}`;
let server;
let baseUrl;

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
        assert.match(databaseName, /^faculty_affairs_test_register_[a-f0-9]{24}$/);
        await mongoose.connection.dropDatabase();
      }
    } finally {
      await mongoose.disconnect();
    }
  }
});

function registrationData(overrides = {}) {
  return {
    fullName: 'Registration Test User',
    email: 'fixture@example.test',
    password: 'FacultyTestPassword123!',
    ...overrides,
  };
}

async function register(body) {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  return { status: response.status, body: await response.json() };
}

test('registration normalizes name and email, hashes the password, and returns safe user data', async () => {
  const input = registrationData({
    fullName: '  Registration Test User  ',
    email: '  FIRST.LAST+TEST@EXAMPLE.TEST  ',
  });
  const response = await register(input);

  assert.equal(response.status, 201);
  assert.equal(response.body.message, 'User registered successfully');
  assert.equal(response.body.user.fullName, 'Registration Test User');
  assert.equal(response.body.user.email, 'first.last+test@example.test');
  assert.equal(response.body.user.role, 'faculty_member');
  assert.equal(response.body.user.isActive, true);
  assert.ok(response.body.user.id);
  assert.ok(!Object.hasOwn(response.body.user, 'password'));
  assert.ok(!Object.hasOwn(response.body.user, 'passwordHash'));

  const saved = await User.findById(response.body.user.id).select('+passwordHash').lean();
  assert.ok(!Object.hasOwn(saved, 'password'));
  assert.notEqual(saved.passwordHash, input.password);
  assert.equal(bcrypt.getRounds(saved.passwordHash), 12);
  assert.equal(await bcrypt.compare(input.password, saved.passwordHash), true);
});

test('password hashing preserves leading and trailing spaces', async () => {
  const password = '  FacultyPasswordWithSpaces123!  ';
  const response = await register(registrationData({ email: 'spaces@example.test', password }));
  assert.equal(response.status, 201);

  const saved = await User.findById(response.body.user.id).select('+passwordHash');
  assert.equal(await bcrypt.compare(password, saved.passwordHash), true);
  assert.equal(await bcrypt.compare(password.trim(), saved.passwordHash), false);
});

test('duplicate emails return 409 even with different case and surrounding spaces', async () => {
  assert.equal((await register(registrationData({ email: 'duplicate@example.test' }))).status, 201);
  const duplicate = await register(registrationData({ email: ' DUPLICATE@EXAMPLE.TEST ' }));
  assert.equal(duplicate.status, 409);
  assert.equal(await User.countDocuments({ email: 'duplicate@example.test' }), 1);
});

test('registration rejects attempts to choose privileges or write internal fields', async () => {
  const fields = [
    { role: 'system_admin' },
    { isActive: false },
    { passwordHash: 'client-supplied-hash' },
    { _id: new mongoose.Types.ObjectId().toString() },
    { $set: { role: 'system_admin' } },
  ];

  for (const field of fields) {
    const response = await register({ ...registrationData({ email: 'privileges@example.test' }), ...field });
    assert.equal(response.status, 400);
    assert.equal(response.body.message, 'Validation failed');
  }
  assert.equal(await User.countDocuments({ email: 'privileges@example.test' }), 0);
});

test('missing, malformed, or incorrectly typed registration fields return 400', async () => {
  const invalidBodies = [
    {},
    null,
    [],
    registrationData({ fullName: ' ' }),
    registrationData({ fullName: ['First', 'Last'] }),
    registrationData({ fullName: 'x'.repeat(101) }),
    registrationData({ email: 'invalid-email' }),
    registrationData({ email: { $ne: null } }),
    registrationData({ email: ['valid@example.test'] }),
    registrationData({ password: 123456789012 }),
    registrationData({ password: ['FacultyPassword123!'] }),
    registrationData({ password: null }),
    registrationData({ password: 'short' }),
    registrationData({ password: ' '.repeat(12) }),
  ];

  for (const body of invalidBodies) {
    assert.equal((await register(body)).status, 400);
  }
});

test('bcrypt password limits use UTF-8 bytes rather than only character count', async () => {
  const tooLong = registrationData({ email: 'long-password@example.test', password: 'پ'.repeat(37) });
  assert.equal((await register(tooLong)).status, 400);

  const boundary = registrationData({ email: 'boundary@example.test', password: 'پ'.repeat(36) });
  const response = await register(boundary);
  assert.equal(response.status, 201);
  const saved = await User.findById(response.body.user.id).select('+passwordHash');
  assert.equal(await bcrypt.compare(boundary.password, saved.passwordHash), true);
});

test('validation responses never echo submitted passwords or unknown field values', async () => {
  const password = 'SensitiveTestPassword123!';
  const unknownValue = 'SensitiveUnknownFieldFixture';
  const response = await register({ ...registrationData({ password }), extra: unknownValue });
  assert.equal(response.status, 400);
  const serialized = JSON.stringify(response.body);
  assert.ok(!serialized.includes(password));
  assert.ok(!serialized.includes(unknownValue));
  assert.ok(response.body.errors.every((error) => !Object.hasOwn(error, 'value')));
});

test('concurrent registrations for the same email create exactly one user', async () => {
  const input = registrationData({ email: 'concurrent@example.test' });
  const responses = await Promise.all([register(input), register(input)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  assert.equal(await User.countDocuments({ email: input.email }), 1);
});

test('malformed JSON returns a safe 400 response without echoing the request body', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"password":"SensitiveMalformedJsonFixture",',
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { message: 'Invalid JSON body' });
});
