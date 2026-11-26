import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import mongoose from 'mongoose';
import { startApi } from '../test-support/api.js';
import Faculty from '../src/models/faculty.model.js';
let api;
const accounts = {};
let sequence = 0;
before(async () => {
  api = await startApi('archive');
  for (const role of ['system_admin', 'directorate_staff', 'department_manager', 'faculty_member']) accounts[role] = await api.account(role);
});
after(async () => { if (api) await api.close(); });
async function profile(overrides = {}) {
  return Faculty.create({ employeeId: `ARCHIVE-${++sequence}`, fullName: 'Archive Test Faculty', department: 'Computer Science', academicRank: 'lecturer', ...overrides });
}
function remove(id, token = accounts.system_admin.token) { return api.request(`/api/faculty/${id}`, { method: 'DELETE', token }); }

test('an administrator archives a profile, hides reads, preserves history and does not delete its account', async () => {
  const item = await profile({ user: accounts.faculty_member.user._id });
  assert.equal((await remove(item._id)).status, 200);
  const stored = await Faculty.findById(item._id);
  assert.ok(stored.deletedAt instanceof Date);
  assert.equal(stored.fullName, item.fullName);
  assert.equal((await api.request(`/api/faculty/${item._id}`, { token: accounts.system_admin.token })).status, 404);
  const list = await api.request('/api/faculty', { token: accounts.system_admin.token });
  assert.ok(!list.body.faculty.some((entry) => entry._id === String(item._id)));
  assert.ok(await mongoose.model('User').findById(accounts.faculty_member.user._id));
  assert.equal((await remove(item._id)).status, 404);
  assert.equal((await api.request(`/api/faculty/${item._id}`, { method: 'PATCH', token: accounts.system_admin.token, body: { fullName: 'Should Not Change' } })).status, 404);
});

test('other roles and invalid credentials cannot archive profiles', async () => {
  const item = await profile();
  for (const role of ['directorate_staff', 'department_manager', 'faculty_member']) assert.equal((await remove(item._id, accounts[role].token)).status, 403);
  assert.equal((await api.request(`/api/faculty/${item._id}`, { method: 'DELETE' })).status, 401);
  assert.equal((await remove(item._id, 'invalid')).status, 401);
  assert.equal((await Faculty.findById(item._id)).deletedAt, null);
});

test('invalid IDs, query overrides, and nonexistent profiles are handled safely', async () => {
  assert.equal((await remove('bad-id')).status, 400);
  assert.equal((await remove(new mongoose.Types.ObjectId())).status, 404);
  const item = await profile();
  assert.equal((await remove(`${item._id}?id=other`)).status, 400);
  assert.equal((await Faculty.findById(item._id)).deletedAt, null);
});

test('archiving a manager profile removes its department scope and invalidates stale saves', async () => {
  const item = await profile({ user: accounts.department_manager.user._id });
  const stale = await Faculty.findById(item._id);
  assert.equal((await remove(item._id)).status, 200);
  assert.equal((await api.request('/api/faculty', { token: accounts.department_manager.token })).status, 403);
  stale.fullName = 'Concurrent Change';
  await assert.rejects(stale.save(), { name: 'VersionError' });
});

test('archive storage failures return safe 500 errors', async (context) => {
  context.mock.method(Faculty, 'findOneAndUpdate', () => { throw new Error('Private archive failure'); });
  context.mock.method(console, 'error', () => {});
  assert.deepEqual((await remove(new mongoose.Types.ObjectId())).body, { message: 'Internal server error' });
});
