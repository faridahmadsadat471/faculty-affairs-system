import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { startApi } from '../test-support/api.js';

let api;
const accounts = {};
const profile = (employeeId) => ({ employeeId, fullName: 'Faculty Form Fixture', department: 'Computer Science', academicRank: 'lecturer', employmentStatus: 'active' });
before(async () => {
  api = await startApi('faculty_form');
  for (const role of ['system_admin', 'directorate_staff', 'department_manager', 'faculty_member']) accounts[role] = await api.account(role);
});
after(async () => { if (api) await api.close(); });
const write = (path, role, body, method = 'POST') => api.request(path, { method, token: accounts[role].token, body });

test('form create and partial edit preserve education, employment history, and linked account', async () => {
  const created = await write('/api/faculty', 'system_admin', { ...profile('FORM-BASE'), email: 'before@example.test', user: String(accounts.faculty_member.user._id), education: [{ degree: 'Bachelor', institution: 'Fixture University' }], employmentHistory: [{ organization: 'Fixture University', position: 'Lecturer', startDate: '2020-01-01' }] });
  assert.equal(created.status, 201);
  const edited = await write(`/api/faculty/${created.body.faculty._id}`, 'directorate_staff', { fullName: 'Updated Faculty', phone: '0000000000' }, 'PATCH');
  assert.equal(edited.status, 200); assert.equal(edited.body.faculty.fullName, 'Updated Faculty');
  assert.equal(edited.body.faculty.email, 'before@example.test');
  assert.equal(edited.body.faculty.user, String(accounts.faculty_member.user._id));
  assert.equal(edited.body.faculty.education[0].institution, 'Fixture University');
  assert.equal(edited.body.faculty.employmentHistory[0].position, 'Lecturer');
});
test('an optional email can be explicitly cleared while malformed email remains rejected', async () => {
  const created = await write('/api/faculty', 'system_admin', { ...profile('FORM-EMAIL'), email: 'before@example.test' });
  assert.equal(created.status, 201);
  const cleared = await write(`/api/faculty/${created.body.faculty._id}`, 'system_admin', { email: '' }, 'PATCH');
  assert.equal(cleared.status, 200); assert.equal(cleared.body.faculty.email, '');
  const invalid = await write(`/api/faculty/${created.body.faculty._id}`, 'system_admin', { email: 'not-an-email' }, 'PATCH');
  assert.equal(invalid.status, 400); assert.ok(invalid.body.errors.some((issue) => issue.field === 'email'));
  const blankCreate = await write('/api/faculty', 'directorate_staff', { ...profile('FORM-BLANK-EMAIL'), email: '   ' });
  assert.equal(blankCreate.status, 201);
});
test('read-only roles cannot bypass hidden create and edit controls', async () => {
  const created = await write('/api/faculty', 'system_admin', profile('FORM-PERMISSION'));
  assert.equal(created.status, 201);
  for (const role of ['department_manager', 'faculty_member']) {
    assert.equal((await write('/api/faculty', role, profile(`FORM-${role}`))).status, 403);
    assert.equal((await write(`/api/faculty/${created.body.faculty._id}`, role, { fullName: 'Forbidden' }, 'PATCH')).status, 403);
  }
});
test('duplicate employee identifiers return a conflict without overwriting the first faculty', async () => {
  const first = await write('/api/faculty', 'system_admin', profile('FORM-DUPLICATE'));
  assert.equal(first.status, 201);
  const duplicate = await write('/api/faculty', 'directorate_staff', { ...profile('FORM-DUPLICATE'), fullName: 'Duplicate Fixture' });
  assert.equal(duplicate.status, 409);
  const unchanged = await api.request(`/api/faculty/${first.body.faculty._id}`, { token: accounts.system_admin.token });
  assert.equal(unchanged.body.faculty.fullName, 'Faculty Form Fixture');
});
test('session restoration returns server identity and rejects a token after logout', async () => {
  const account = await api.account('directorate_staff');
  const restored = await api.request('/api/auth/me', { token: account.token });
  assert.equal(restored.status, 200); assert.equal(restored.body.user.id, String(account.user._id));
  assert.equal(restored.body.user.role, 'directorate_staff'); assert.equal(restored.body.user.passwordHash, undefined);
  assert.equal((await api.request('/api/auth/logout', { method: 'POST', token: account.token })).status, 200);
  assert.equal((await api.request('/api/auth/me', { token: account.token })).status, 401);
});
