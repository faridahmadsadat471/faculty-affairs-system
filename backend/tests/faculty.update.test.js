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
const databaseName = `faculty_affairs_test_update_${randomBytes(12).toString('hex')}`;
const accounts = {};
let server;
let baseUrl;
let passwordHash;
let sequence = 0;

before(async () => {
  assert.ok(process.env.MONGO_URI, 'Set MONGO_URI in backend/.env before running tests');
  await mongoose.connect(process.env.MONGO_URI, { dbName: databaseName, serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Faculty.init(), RevokedToken.init()]);
  passwordHash = await bcrypt.hash('FacultyUpdateFixture123!', 4);
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
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  } finally {
    try {
      if (mongoose.connection.readyState === 1) {
        assert.equal(mongoose.connection.name, databaseName);
        assert.match(databaseName, /^faculty_affairs_test_update_[a-f0-9]{24}$/);
        await mongoose.connection.dropDatabase();
      }
    } finally {
      await mongoose.disconnect();
    }
  }
});

async function request(path, { method = 'PATCH', token, body, headers = {} } = {}) {
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
  const user = await User.create({ fullName: 'Faculty Update Test User', email, passwordHash, role });
  const login = await request('/api/auth/login', {
    method: 'POST', body: { email, password: 'FacultyUpdateFixture123!' },
  });
  assert.equal(login.status, 200);
  return { user, token: login.body.accessToken };
}

async function createProfile(overrides = {}) {
  sequence += 1;
  return Faculty.create({
    employeeId: `FAC-UPDATE-${sequence}`, fullName: 'Faculty Update Person',
    department: 'Computer Science', academicRank: 'lecturer', phone: '0700000000',
    education: [{ degree: 'MSc', institution: 'Test University', graduationYear: 2020 }],
    employmentHistory: [{ organization: 'Test University', position: 'Lecturer', startDate: '2021-01-01' }],
    ...overrides,
  });
}

function update(id, body, account = accounts.system_admin, query = '') {
  return request(`/api/faculty/${id}${query}`, { token: account.token, body });
}

test('administrator partially updates a profile while preserving omitted fields and creation time', async () => {
  const profile = await createProfile();
  const response = await update(profile._id, { fullName: '  Updated Faculty Person  ' });
  assert.equal(response.status, 200);
  assert.equal(response.body.message, 'Faculty updated successfully');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const saved = await Faculty.findById(profile._id).lean();
  assert.equal(saved.fullName, 'Updated Faculty Person');
  assert.equal(saved.phone, profile.phone);
  assert.equal(saved.department, profile.department);
  assert.deepEqual(saved.education, profile.toObject().education);
  assert.deepEqual(saved.employmentHistory, profile.toObject().employmentHistory);
  assert.equal(saved.createdAt.toISOString(), profile.createdAt.toISOString());
  assert.ok(saved.updatedAt >= profile.updatedAt);
  assert.equal(response.body.faculty._id, String(profile._id));
});

test('staff update normalized identifiers, contacts, department, rank, and employment status', async () => {
  const profile = await createProfile();
  const response = await update(profile._id, {
    employeeId: '  fac-updated-staff  ', department: '  Mathematics  ',
    email: '  UPDATED@EXAMPLE.TEST  ', phone: '  0700000001  ',
    academicRank: 'senior_lecturer', employmentStatus: 'on_leave',
  }, accounts.directorate_staff);
  assert.equal(response.status, 200);
  assert.equal(response.body.faculty.employeeId, 'FAC-UPDATED-STAFF');
  assert.equal(response.body.faculty.department, 'Mathematics');
  assert.equal(response.body.faculty.email, 'updated@example.test');
  assert.equal(response.body.faculty.phone, '0700000001');
  assert.equal(response.body.faculty.academicRank, 'senior_lecturer');
  assert.equal(response.body.faculty.employmentStatus, 'on_leave');
});

test('managers and members cannot update profiles, including their own or with spoofed roles', async () => {
  for (const role of ['department_manager', 'faculty_member']) {
    const profile = await createProfile({ user: accounts[role].user._id });
    const response = await request(`/api/faculty/${profile._id}?role=system_admin`, {
      token: accounts[role].token, body: { fullName: 'Unauthorized Change', role: 'system_admin' },
      headers: { 'X-Role': 'system_admin' },
    });
    assert.equal(response.status, 403);
    assert.equal((await Faculty.findById(profile._id)).fullName, profile.fullName);
  }
});

test('missing and invalid tokens cannot update profiles', async () => {
  const profile = await createProfile();
  for (const token of [undefined, 'invalid-token']) {
    const response = await request(`/api/faculty/${profile._id}`, { token, body: { phone: '0700000001' } });
    assert.equal(response.status, 401);
  }
  assert.equal((await Faculty.findById(profile._id)).phone, profile.phone);
});

test('invalid IDs return 400 and nonexistent profiles return 404 without inserting a document', async () => {
  const count = await Faculty.countDocuments();
  assert.equal((await update('invalid-id', { fullName: 'Valid Name' })).status, 400);
  const missing = await update(new mongoose.Types.ObjectId(), { fullName: 'Valid Name' });
  assert.equal(missing.status, 404);
  assert.deepEqual(missing.body, { message: 'Faculty not found' });
  assert.equal(await Faculty.countDocuments(), count);
});

test('empty, missing, null, or array bodies return 400', async () => {
  const profile = await createProfile();
  for (const body of [undefined, {}, null, [], [{ fullName: 'Valid Name' }]]) {
    assert.equal((await update(profile._id, body)).status, 400);
  }
});

test('invalid field values do not persist even other valid changes in the same request', async () => {
  const profile = await createProfile();
  const original = await Faculty.findById(profile._id).lean();
  for (const extra of [
    { employeeId: ' ' }, { fullName: null }, { fullName: ['Invalid', 'Name'] },
    { department: '' }, { department: 'x'.repeat(151) }, { academicRank: 'unknown' },
    { email: 'bad-email' }, { email: null }, { phone: 123 },
    { employmentStatus: 'unknown' }, { user: 'invalid-id' }, { user: { $ne: null } },
  ]) {
    const response = await update(profile._id, { phone: '0700000002', ...extra });
    assert.equal(response.status, 400);
    assert.deepEqual(await Faculty.findById(profile._id).lean(), original);
  }
});

test('internal fields, update operators, and unknown nested fields are rejected without changes', async () => {
  const profile = await createProfile();
  const original = await Faculty.findById(profile._id).lean();
  for (const extra of [
    { _id: new mongoose.Types.ObjectId().toString() }, { __v: 100 },
    { createdAt: '2000-01-01' }, { updatedAt: '2000-01-01' },
    { role: 'system_admin' }, { passwordHash: 'SecretFixture' },
    { $set: { department: 'Mathematics' } }, { 'department.name': 'Mathematics' },
    { education: [{ degree: 'PhD', institution: 'Test University', admin: true }] },
    { employmentHistory: [{ organization: 'Test University', position: 'Lecturer', startDate: '2020-01-01', _id: new mongoose.Types.ObjectId().toString() }] },
  ]) {
    const response = await update(profile._id, { phone: '0700000002', ...extra });
    assert.equal(response.status, 400, JSON.stringify(Object.keys(extra)));
    assert.ok(!JSON.stringify(response.body).includes('SecretFixture'));
    assert.deepEqual(await Faculty.findById(profile._id).lean(), original);
  }
});

test('query parameters cannot change the update target or bypass validation', async () => {
  const profile = await createProfile();
  for (const query of ['?id=other', '?role=system_admin', '?department=Mathematics', '?upsert=true']) {
    assert.equal((await update(profile._id, { phone: '0700000002' }, accounts.system_admin, query)).status, 400);
  }
  assert.equal((await Faculty.findById(profile._id)).phone, profile.phone);
});

test('duplicate normalized employee IDs return 409 but retaining the current ID is allowed', async () => {
  const first = await createProfile();
  const second = await createProfile();
  const duplicate = await update(second._id, { employeeId: ` ${first.employeeId.toLowerCase()} `, fullName: 'Must Not Persist' });
  assert.equal(duplicate.status, 409);
  assert.equal((await Faculty.findById(second._id)).fullName, second.fullName);
  assert.equal((await update(first._id, { employeeId: first.employeeId.toLowerCase() })).status, 200);
});

test('user links can be set, retained, cleared with null, and reassigned without changing user credentials', async () => {
  const account = await createAccount('faculty_member', 'link-target@example.test');
  const userBefore = await User.findById(account.user._id).select('+passwordHash').lean();
  const first = await createProfile();
  const second = await createProfile();
  assert.equal((await update(first._id, { user: String(account.user._id) })).status, 200);
  assert.equal((await update(first._id, { user: String(account.user._id), phone: '0700000001' })).status, 200);
  const duplicate = await update(second._id, { user: String(account.user._id) });
  assert.equal(duplicate.status, 409);
  assert.deepEqual(duplicate.body, { message: 'This user is already linked to a faculty profile' });
  const cleared = await update(first._id, { user: null });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.faculty.user, null);
  assert.equal((await Faculty.findById(first._id)).user, null);
  assert.equal((await update(second._id, { user: String(account.user._id) })).status, 200);
  assert.deepEqual(await User.findById(account.user._id).select('+passwordHash').lean(), userBefore);
});

test('nonexistent linked accounts return 404 with no partial write', async () => {
  const profile = await createProfile();
  const response = await update(profile._id, { user: String(new mongoose.Types.ObjectId()), fullName: 'Must Not Persist' });
  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { message: 'Linked user not found' });
  assert.equal((await Faculty.findById(profile._id)).fullName, profile.fullName);
});

test('nested arrays are replaced as complete arrays and can be cleared explicitly', async () => {
  const profile = await createProfile();
  const response = await update(profile._id, {
    education: [{ degree: 'PhD', institution: 'Other University', fieldOfStudy: 'Mathematics', graduationYear: 2022 }],
    employmentHistory: [{ organization: 'Other University', position: 'Professor', startDate: '2022-01-01', endDate: '2024-01-01' }],
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.faculty.education.length, 1);
  assert.equal(response.body.faculty.education[0].degree, 'PhD');
  assert.equal(response.body.faculty.employmentHistory[0].position, 'Professor');
  const cleared = await update(profile._id, { education: [], employmentHistory: [], phone: '' });
  assert.equal(cleared.status, 200);
  assert.deepEqual(cleared.body.faculty.education, []);
  assert.deepEqual(cleared.body.faculty.employmentHistory, []);
  assert.equal(cleared.body.faculty.phone, '');
});

test('nested schema checks reject invalid dates, missing fields, and future or fractional graduation years', async () => {
  const profile = await createProfile();
  const original = await Faculty.findById(profile._id).lean();
  for (const extra of [
    { education: [{}] },
    { education: [{ degree: 'PhD', institution: 'Test', graduationYear: new Date().getUTCFullYear() + 1 }] },
    { education: [{ degree: 'PhD', institution: 'Test', graduationYear: 2020.5 }] },
    { employmentHistory: [{}] },
    { employmentHistory: [{ organization: 'Test', position: 'Lecturer', startDate: '2022-01-01', endDate: '2020-01-01' }] },
    { employmentHistory: [{ organization: 'Test', position: 'Lecturer', startDate: 'PrivateInvalidDateFixture' }] },
  ]) {
    const response = await update(profile._id, { phone: '0700000001', ...extra });
    assert.equal(response.status, 400);
    assert.ok(!JSON.stringify(response.body).includes('PrivateInvalidDateFixture'));
    assert.deepEqual(await Faculty.findById(profile._id).lean(), original);
  }
});

test('malformed and oversized nested arrays return 400', async () => {
  const profile = await createProfile();
  for (const extra of [
    { education: null }, { education: [null] }, { education: [[]] }, { education: 'invalid' },
    { education: Array.from({ length: 51 }, () => ({ degree: 'MSc', institution: 'Test' })) },
    { employmentHistory: null }, { employmentHistory: [null] }, { employmentHistory: 'invalid' },
  ]) assert.equal((await update(profile._id, extra)).status, 400);
});

test('responses exclude version and unapproved stored fields without populating account credentials', async () => {
  const profile = await createProfile();
  await Faculty.collection.updateOne({ _id: profile._id }, { $set: { privateMarker: 'must-not-leak' } });
  const response = await update(profile._id, { phone: '0700000001' });
  assert.equal(response.status, 200);
  for (const field of ['__v', 'privateMarker', 'passwordHash', 'accessToken']) assert.ok(!JSON.stringify(response.body).includes(field));
  assert.ok(!JSON.stringify(response.body).includes(passwordHash));
});

test('revoked and inactive accounts cannot update profiles', async () => {
  const profile = await createProfile();
  const revoked = await createAccount('system_admin', 'revoked-update@example.test');
  assert.equal((await request('/api/auth/logout', { method: 'POST', token: revoked.token })).status, 200);
  assert.equal((await update(profile._id, { phone: '0700000001' }, revoked)).status, 401);
  const inactive = await createAccount('directorate_staff', 'inactive-update@example.test');
  await User.updateOne({ _id: inactive.user._id }, { $set: { isActive: false } });
  assert.equal((await update(profile._id, { phone: '0700000001' }, inactive)).status, 401);
});

test('role downgrades immediately remove update access from existing tokens', async () => {
  const account = await createAccount('system_admin', 'downgraded-update@example.test');
  const profile = await createProfile();
  await User.updateOne({ _id: account.user._id }, { $set: { role: 'faculty_member' } });
  assert.equal((await update(profile._id, { phone: '0700000001' }, account)).status, 403);
});

test('simultaneous writes based on the same document version produce one 200 and one safe 409', async (context) => {
  const profile = await createProfile();
  const save = Faculty.prototype.save;
  let entered = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  context.mock.method(Faculty.prototype, 'save', async function (...args) {
    if (this._id.equals(profile._id)) {
      entered += 1;
      if (entered === 2) release();
      await gate;
    }
    return save.apply(this, args);
  });
  const responses = await Promise.all([
    update(profile._id, { phone: '0700000001' }), update(profile._id, { phone: '0700000002' }),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.deepEqual(responses.find((response) => response.status === 409).body, {
    message: 'Faculty was changed by another request. Reload it and try again',
  });
  const winner = responses.find((response) => response.status === 200);
  assert.equal((await Faculty.findById(profile._id)).phone, winner.body.faculty.phone);
});

test('lookup failures return safe server errors', async (context) => {
  context.mock.method(Faculty, 'findById', () => { throw new Error('Private lookup failure'); });
  context.mock.method(console, 'error', () => {});
  const response = await update(new mongoose.Types.ObjectId(), { phone: '0700000001' });
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { message: 'Internal server error' });
});

test('save failures do not claim success or persist the requested changes', async (context) => {
  const profile = await createProfile();
  context.mock.method(Faculty.prototype, 'save', () => { throw new Error('Private write failure'); });
  context.mock.method(console, 'error', () => {});
  const response = await update(profile._id, { phone: '0700000001' });
  assert.equal(response.status, 500);
  assert.deepEqual(response.body, { message: 'Internal server error' });
  assert.equal((await Faculty.findById(profile._id)).phone, profile.phone);
});
