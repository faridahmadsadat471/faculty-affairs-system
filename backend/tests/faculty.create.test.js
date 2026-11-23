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

const databaseName = `faculty_affairs_test_create_${randomBytes(12).toString('hex')}`;
const accounts = {};
let server;
let baseUrl;
let passwordHash;
let sequence = 0;

before(async () => {
  assert.ok(process.env.MONGO_URI, 'Set MONGO_URI in backend/.env before running tests');
  await mongoose.connect(process.env.MONGO_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Faculty.init(), RevokedToken.init()]);
  passwordHash = await bcrypt.hash('FacultyCreateFixture123!', 4);
  server = await new Promise((resolve, reject) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  for (const role of ['system_admin', 'directorate_staff', 'department_manager', 'faculty_member']) {
    accounts[role] = await createAccount(role, `${role}@example.test`);
  }
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
        assert.match(databaseName, /^faculty_affairs_test_create_[a-f0-9]{24}$/);
        await mongoose.connection.dropDatabase();
      }
    } finally {
      await mongoose.disconnect();
    }
  }
});

async function request(path, { method = 'POST', token, body, headers = {} } = {}) {
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
  return { status: response.status, body: await response.json() };
}

async function createAccount(role, email) {
  const user = await User.create({ fullName: 'Faculty Creator Test User', email, passwordHash, role });
  const login = await request('/api/auth/login', { body: { email, password: 'FacultyCreateFixture123!' } });
  assert.equal(login.status, 200);
  return { user, token: login.body.accessToken };
}

function facultyData(overrides = {}) {
  sequence += 1;
  return {
    employeeId: `FAC-CREATE-${sequence}`,
    fullName: 'Faculty Test Person',
    department: 'Computer Science',
    academicRank: 'lecturer',
    ...overrides,
  };
}

function create(body, token = accounts.system_admin.token) {
  return request('/api/faculty', { token, body });
}

test('an administrator creates a normalized profile with defaults and timestamps', async () => {
  const response = await create(facultyData({
    employeeId: '  fac-admin-001  ', fullName: '  Faculty Test Person  ', department: '  Computer Science  ',
  }));
  assert.equal(response.status, 201);
  assert.equal(response.body.message, 'Faculty created successfully');
  assert.equal(response.body.faculty.employeeId, 'FAC-ADMIN-001');
  assert.equal(response.body.faculty.fullName, 'Faculty Test Person');
  assert.equal(response.body.faculty.department, 'Computer Science');
  assert.equal(response.body.faculty.employmentStatus, 'active');
  assert.deepEqual(response.body.faculty.education, []);
  assert.deepEqual(response.body.faculty.employmentHistory, []);
  assert.ok(response.body.faculty.createdAt);
  assert.ok(response.body.faculty.updatedAt);
  assert.ok(await Faculty.findById(response.body.faculty._id));
});

test('staff can create a profile with linked user, contacts, education, and employment history', async () => {
  const linked = accounts.faculty_member.user;
  const response = await create(facultyData({
    user: String(linked._id), email: '  FACULTY@EXAMPLE.TEST  ', phone: '  0700000000  ',
    employmentStatus: 'on_leave',
    education: [{ degree: 'MSc', institution: 'Test University', fieldOfStudy: 'Computer Science', graduationYear: 2020 }],
    employmentHistory: [{ organization: 'Test University', position: 'Lecturer', startDate: '2021-01-01' }],
  }), accounts.directorate_staff.token);
  assert.equal(response.status, 201);
  assert.equal(response.body.faculty.user, String(linked._id));
  assert.equal(response.body.faculty.email, 'faculty@example.test');
  assert.equal(response.body.faculty.phone, '0700000000');
  assert.equal(response.body.faculty.education[0].degree, 'MSc');
  assert.equal(response.body.faculty.employmentHistory[0].position, 'Lecturer');
  assert.equal((await User.findById(linked._id)).role, 'faculty_member');
  assert.ok(!JSON.stringify(response.body).includes(passwordHash));
});

test('managers and faculty members cannot create profiles, including role-spoofing attempts', async () => {
  const count = await Faculty.countDocuments();
  for (const role of ['department_manager', 'faculty_member']) {
    const response = await request('/api/faculty?role=system_admin', {
      token: accounts[role].token, headers: { 'X-Role': 'system_admin' },
      body: facultyData({ role: 'system_admin' }),
    });
    assert.equal(response.status, 403);
  }
  assert.equal(await Faculty.countDocuments(), count);
});

test('missing or invalid tokens return 401 without creating profiles', async () => {
  const count = await Faculty.countDocuments();
  assert.equal((await request('/api/faculty', { body: facultyData() })).status, 401);
  assert.equal((await create(facultyData(), 'invalid-token')).status, 401);
  assert.equal(await Faculty.countDocuments(), count);
});

test('duplicate normalized employee IDs return 409', async () => {
  assert.equal((await create(facultyData({ employeeId: 'FAC-UNIQUE-001' }))).status, 201);
  const duplicate = await create(facultyData({ employeeId: ' fac-unique-001 ' }));
  assert.equal(duplicate.status, 409);
  assert.equal(await Faculty.countDocuments({ employeeId: 'FAC-UNIQUE-001' }), 1);
});

test('concurrent requests for the same employee ID create one profile', async () => {
  const data = facultyData({ employeeId: 'FAC-CONCURRENT-001' });
  const responses = await Promise.all([
    create(data), create(data, accounts.directorate_staff.token),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  assert.equal(await Faculty.countDocuments({ employeeId: data.employeeId }), 1);
});

test('required fields and invalid field types are rejected with 400', async () => {
  const bodies = [
    {}, null, [],
    facultyData({ employeeId: ' ' }), facultyData({ fullName: ' ' }),
    facultyData({ department: ' ' }), facultyData({ academicRank: 'unknown' }),
    facultyData({ fullName: ['Test', 'Name'] }), facultyData({ employeeId: { $ne: null } }),
    facultyData({ fullName: 'x'.repeat(101) }), facultyData({ department: 'x'.repeat(151) }),
    facultyData({ email: 'bad-email' }), facultyData({ phone: 12345 }),
    facultyData({ employmentStatus: 'unknown' }), facultyData({ user: 'bad-id' }),
  ];
  const count = await Faculty.countDocuments();
  for (const body of bodies) assert.equal((await create(body)).status, 400);
  assert.equal(await Faculty.countDocuments(), count);
});

test('every configured academic rank can be registered', async () => {
  for (const academicRank of ['lecturer', 'senior_lecturer', 'associate_professor', 'professor']) {
    const response = await create(facultyData({ academicRank }));
    assert.equal(response.status, 201);
    assert.equal(response.body.faculty.academicRank, academicRank);
  }
});

test('a valid but nonexistent linked user returns 404 and does not create a profile', async () => {
  const count = await Faculty.countDocuments();
  const response = await create(facultyData({ user: new mongoose.Types.ObjectId().toString() }));
  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { message: 'Linked user not found' });
  assert.equal(await Faculty.countDocuments(), count);
});

test('a user already linked to another faculty profile cannot be linked twice', async () => {
  const response = await create(facultyData({ user: String(accounts.faculty_member.user._id) }));
  assert.equal(response.status, 409);
  assert.deepEqual(response.body, { message: 'This user is already linked to a faculty profile' });
});

test('multiple profiles can be created without accounts, including an explicit null link', async () => {
  assert.equal((await create(facultyData())).status, 201);
  assert.equal((await create(facultyData({ user: null }))).status, 201);
});

test('server-controlled and unknown nested fields are rejected', async () => {
  for (const extra of [
    { _id: new mongoose.Types.ObjectId().toString() },
    { createdAt: '2000-01-01' }, { role: 'system_admin' }, { passwordHash: 'forbidden' },
    { education: [{ degree: 'MSc', institution: 'Test University', _id: new mongoose.Types.ObjectId().toString() }] },
    { employmentHistory: [{ organization: 'Test University', position: 'Lecturer', startDate: '2020-01-01', admin: true }] },
  ]) {
    assert.equal((await create(facultyData(extra))).status, 400);
  }
});

test('nested schema rules return 400 instead of internal server errors', async () => {
  const bodies = [
    facultyData({ education: [{}] }),
    facultyData({ education: [{ degree: 'MSc', institution: 'Test University', graduationYear: new Date().getUTCFullYear() + 1 }] }),
    facultyData({ education: [{ degree: 'MSc', institution: 'Test University', graduationYear: 2020.5 }] }),
    facultyData({ employmentHistory: [{}] }),
    facultyData({ employmentHistory: [{ organization: 'Test University', position: 'Lecturer', startDate: '2021-01-01', endDate: '2020-01-01' }] }),
    facultyData({ employmentHistory: [{ organization: 'Test University', position: 'Lecturer', startDate: 'SensitiveInvalidDateFixture' }] }),
  ];
  for (const body of bodies) {
    const response = await create(body);
    assert.equal(response.status, 400);
    assert.equal(response.body.message, 'Validation failed');
    assert.ok(response.body.errors.every((error) => !Object.hasOwn(error, 'value')));
    assert.ok(!JSON.stringify(response.body).includes('SensitiveInvalidDateFixture'));
  }
});

test('malformed or excessive nested arrays are rejected', async () => {
  for (const extra of [
    { education: 'not-an-array' }, { education: [null] }, { education: [[]] },
    { education: Array.from({ length: 51 }, () => ({ degree: 'MSc', institution: 'Test University' })) },
    { employmentHistory: 'not-an-array' }, { employmentHistory: [null] },
  ]) assert.equal((await create(facultyData(extra))).status, 400);
});

test('revoked tokens cannot create profiles', async () => {
  const account = await createAccount('system_admin', 'logged-out-creator@example.test');
  assert.equal((await request('/api/auth/logout', { token: account.token })).status, 200);
  assert.equal((await create(facultyData(), account.token)).status, 401);
});

test('deactivated staff cannot create profiles with an existing token', async () => {
  const account = await createAccount('directorate_staff', 'inactive-creator@example.test');
  await User.updateOne({ _id: account.user._id }, { $set: { isActive: false } });
  assert.equal((await create(facultyData(), account.token)).status, 401);
});

test('unexpected database failures return a safe 500 response', async (context) => {
  context.mock.method(Faculty, 'create', () => { throw new Error('Simulated faculty database failure'); });
  context.mock.method(console, 'error', () => {});
  const response = await create(facultyData());
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { message: 'Internal server error' });
});
