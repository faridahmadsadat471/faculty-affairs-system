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
const databaseName = `faculty_affairs_test_get_${randomBytes(12).toString('hex')}`;
const accounts = {};
const profiles = {};
let server;
let baseUrl;
let passwordHash;
let sequence = 0;

before(async () => {
  assert.ok(process.env.MONGO_URI, 'Set MONGO_URI in backend/.env before running tests');
  await mongoose.connect(process.env.MONGO_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Faculty.init(), RevokedToken.init()]);
  passwordHash = await bcrypt.hash('FacultyGetFixture123!', 4);
  server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  for (const [name, role, department] of [
    ['admin', 'system_admin'], ['staff', 'directorate_staff'],
    ['manager', 'department_manager', 'Computer Science'],
    ['member', 'faculty_member', 'Computer Science'],
    ['otherMember', 'faculty_member', 'Mathematics'],
    ['unlinkedManager', 'department_manager'], ['unlinkedMember', 'faculty_member'],
    ['literalManager', 'department_manager', 'CS.*'],
  ]) {
    accounts[name] = await createAccount(role, `${name.toLowerCase()}@example.test`);
    if (department) profiles[name] = await createProfile(department, accounts[name].user._id);
  }
  profiles.unlinked = await createProfile('Computer Science');
  profiles.literalOther = await createProfile('CSX');
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
        assert.match(databaseName, /^faculty_affairs_test_get_[a-f0-9]{24}$/);
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
  const user = await User.create({ fullName: 'Faculty Get Test User', email, passwordHash, role });
  const login = await request('/api/auth/login', {
    method: 'POST', body: { email, password: 'FacultyGetFixture123!' },
  });
  assert.equal(login.status, 200);
  return { user, token: login.body.accessToken };
}

async function createProfile(department, user) {
  sequence += 1;
  return Faculty.create({
    employeeId: `FAC-GET-${sequence}`, fullName: `Faculty Get Person ${sequence}`,
    department, academicRank: 'lecturer', ...(user ? { user } : {}),
    email: `faculty${sequence}@example.test`, phone: '0700000000',
    education: [{ degree: 'MSc', institution: 'Test University', graduationYear: 2020 }],
    employmentHistory: [{ organization: 'Test University', position: 'Lecturer', startDate: '2021-01-01' }],
  });
}

function get(id = profiles.member._id, account = accounts.admin, query = '') {
  return request(`/api/faculty/${id}${query}`, { token: account.token });
}

test('administrators and staff retrieve a single profile from any department', async () => {
  for (const account of [accounts.admin, accounts.staff]) {
    for (const profile of [profiles.member, profiles.otherMember, profiles.unlinked]) {
      const response = await get(profile._id, account);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.deepEqual(Object.keys(response.body), ['faculty']);
      assert.equal(response.body.faculty._id, String(profile._id));
      assert.equal(response.body.faculty.employeeId, profile.employeeId);
    }
  }
});

test('managers retrieve their own and other linked or unlinked profiles in their department', async () => {
  for (const profile of [profiles.manager, profiles.member, profiles.unlinked]) {
    const response = await get(profile._id, accounts.manager);
    assert.equal(response.status, 200);
    assert.equal(response.body.faculty.department, 'Computer Science');
  }
});

test('out-of-department and nonexistent profiles have the same 404 response', async () => {
  const forbidden = await get(profiles.otherMember._id, accounts.manager);
  const missing = await get(new mongoose.Types.ObjectId(), accounts.manager);
  assert.equal(forbidden.status, 404);
  assert.equal(missing.status, 404);
  assert.deepEqual(forbidden.body, { message: 'Faculty not found' });
  assert.deepEqual(forbidden.body, missing.body);
});

test('faculty members retrieve only their own profile even when another profile shares their department', async () => {
  assert.equal((await get(profiles.member._id, accounts.member)).status, 200);
  assert.equal((await get(profiles.otherMember._id, accounts.otherMember)).status, 200);
  for (const profile of [profiles.manager, profiles.unlinked, profiles.otherMember]) {
    const response = await get(profile._id, accounts.member);
    assert.equal(response.status, 404);
    assert.deepEqual(response.body, { message: 'Faculty not found' });
  }
});

test('unlinked members cannot retrieve another faculty profile', async () => {
  const response = await get(profiles.member._id, accounts.unlinkedMember);
  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { message: 'Faculty not found' });
});

test('managers without configured department access receive 403', async () => {
  const response = await get(profiles.member._id, accounts.unlinkedManager);
  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { message: 'Department access is not configured' });
});

test('department names with regex characters still use literal matching', async () => {
  assert.equal((await get(profiles.literalManager._id, accounts.literalManager)).status, 200);
  assert.equal((await get(profiles.literalOther._id, accounts.literalManager)).status, 404);
});

test('invalid IDs return safe validation errors before any faculty lookup', async (context) => {
  const lookup = context.mock.method(Faculty, 'findOne', () => { throw new Error('Invalid ID reached database'); });
  for (const id of ['bad-id', 'abcdefghijkl', 'z'.repeat(24), 'a'.repeat(23), 'a'.repeat(25), '%7B%22%24ne%22%3Anull%7D']) {
    const response = await get(id);
    assert.equal(response.status, 400, id);
    assert.equal(response.body.message, 'Validation failed');
    assert.deepEqual(response.body.errors, [{ field: 'id', message: 'Enter a valid faculty ID' }]);
  }
  assert.equal(lookup.mock.callCount(), 0);
});

test('valid nonexistent IDs return 404 and uppercase hexadecimal IDs are supported', async () => {
  const response = await get(new mongoose.Types.ObjectId());
  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { message: 'Faculty not found' });
  assert.equal((await get(String(profiles.member._id).toUpperCase())).status, 200);
});

test('query parameters cannot replace the path ID or scope and role headers do not grant access', async () => {
  for (const query of ['?id=other', '?department=Mathematics', '?user=other', '?role=system_admin', '?populate=user', '?page=1']) {
    assert.equal((await get(profiles.member._id, accounts.admin, query)).status, 400, query);
  }
  const response = await request(`/api/faculty/${profiles.otherMember._id}`, {
    token: accounts.member.token, headers: { 'X-Role': 'system_admin', 'X-Department': 'Mathematics' },
  });
  assert.equal(response.status, 404);
});

test('only approved profile fields are returned, including education and history without user credentials', async () => {
  await Faculty.collection.updateOne({ _id: profiles.member._id }, { $set: { privateMarker: 'must-not-leak' } });
  const response = await get();
  assert.equal(response.status, 200);
  assert.equal(response.body.faculty.user, String(accounts.member.user._id));
  assert.equal(response.body.faculty.education[0].degree, 'MSc');
  assert.equal(response.body.faculty.employmentHistory[0].position, 'Lecturer');
  assert.ok(response.body.faculty.createdAt);
  for (const field of ['privateMarker', '__v', 'passwordHash', 'password', 'accessToken']) {
    assert.ok(!JSON.stringify(response.body).includes(field));
  }
  assert.ok(!JSON.stringify(response.body).includes(passwordHash));
});

test('missing or invalid tokens receive 401 before ID validation', async () => {
  for (const token of [undefined, 'invalid-token']) {
    const response = await request('/api/faculty/bad-id', { token });
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('www-authenticate'), 'Bearer');
  }
});

test('revoked and deactivated accounts cannot retrieve profiles', async () => {
  const revoked = await createAccount('system_admin', 'revoked-get@example.test');
  assert.equal((await request('/api/auth/logout', { method: 'POST', token: revoked.token })).status, 200);
  assert.equal((await get(profiles.member._id, revoked)).status, 401);
  const inactive = await createAccount('directorate_staff', 'inactive-get@example.test');
  await User.updateOne({ _id: inactive.user._id }, { $set: { isActive: false } });
  assert.equal((await get(profiles.member._id, inactive)).status, 401);
});

test('department and role changes affect access with the same token', async () => {
  const account = accounts.manager;
  try {
    await Faculty.updateOne({ user: account.user._id }, { $set: { department: 'Mathematics' } });
    assert.equal((await get(profiles.otherMember._id, account)).status, 200);
    assert.equal((await get(profiles.member._id, account)).status, 404);
    await User.updateOne({ _id: account.user._id }, { $set: { role: 'faculty_member' } });
    assert.equal((await get(profiles.otherMember._id, account)).status, 404);
    assert.equal((await get(profiles.manager._id, account)).status, 200);
    await User.collection.updateOne({ _id: account.user._id }, { $set: { role: 'unknown-role' } });
    assert.equal((await get(profiles.manager._id, account)).status, 403);
  } finally {
    await User.updateOne({ _id: account.user._id }, { $set: { role: 'department_manager' } });
    await Faculty.updateOne({ user: account.user._id }, { $set: { department: 'Computer Science' } });
  }
});

test('reading a profile does not modify its data or timestamps', async () => {
  const beforeProfile = await Faculty.findById(profiles.member._id).lean();
  assert.equal((await get()).status, 200);
  const afterProfile = await Faculty.findById(profiles.member._id).lean();
  assert.deepEqual(afterProfile, beforeProfile);
});

test('profile database failures return safe server errors', async (context) => {
  context.mock.method(Faculty, 'findOne', () => { throw new Error('Private faculty lookup failure'); });
  context.mock.method(console, 'error', () => {});
  for (const account of [accounts.admin, accounts.manager]) {
    const response = await get(profiles.member._id, account);
    assert.equal(response.status, 500);
    assert.deepEqual(response.body, { message: 'Internal server error' });
  }
});
