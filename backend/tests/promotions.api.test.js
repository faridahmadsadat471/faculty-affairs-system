import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { startApi } from '../test-support/api.js';
import Faculty from '../src/models/faculty.model.js';

let api, admin, staff, member, manager, own, other;
before(async () => {
  api = await startApi('promotions');
  admin = await api.account('system_admin'); staff = await api.account('directorate_staff');
  member = await api.account('faculty_member'); manager = await api.account('department_manager');
  [own, other] = await Faculty.create([
    { employeeId: 'P-OWN', fullName: 'Own Faculty', department: 'CS', academicRank: 'lecturer', user: member.user._id },
    { employeeId: 'P-OTHER', fullName: 'Other Faculty', department: 'Math', academicRank: 'lecturer' },
    { employeeId: 'P-MANAGER', fullName: 'Manager Faculty', department: 'CS', academicRank: 'professor', user: manager.user._id },
  ]);
});
after(async () => { await api?.close(); });
const send = (path, method, body, user = member) => api.request('/api/promotions' + path, { method, body, token: user.token });
async function draft(user = member, faculty = own) {
  const result = await send('', 'POST', { faculty: String(faculty._id), requestedRank: 'senior_lecturer' }, user);
  assert.equal(result.status, 201); return result.body.record;
}

test('promotion creation derives current rank and actor, rejects privileged fields and invalid ranks', async () => {
  const record = await draft();
  assert.equal(record.currentRank, 'lecturer'); assert.equal(record.createdBy, String(member.user._id));
  for (const extra of [{ status: 'approved' }, { createdBy: String(admin.user._id) }, { supportingDocuments: [] }, { currentRank: 'professor' }]) {
    assert.equal((await send('', 'POST', { faculty: String(own._id), requestedRank: 'professor', ...extra })).status, 400);
  }
  assert.equal((await send('', 'POST', { faculty: String(own._id), requestedRank: 'lecturer' })).status, 400);
});

test('promotion scopes protect records, counts, writes, and review decisions', async () => {
  const record = await draft(admin, other);
  assert.equal((await send('/' + record._id, 'GET')).status, 404);
  assert.equal((await send('/' + record._id, 'PATCH', { requestedRank: 'professor' }, manager)).status, 404);
  assert.equal((await send('?faculty=' + other._id, 'GET')).status, 404);
  const ownRecord = await draft();
  assert.equal((await send('/' + ownRecord._id + '/status', 'PATCH', { status: 'submitted', eligibilityStatus: 'eligible' })).status, 403);
  assert.equal((await send('/' + ownRecord._id + '/status', 'PATCH', { status: 'submitted' })).status, 200);
  assert.equal((await send('/' + ownRecord._id + '/status', 'PATCH', { status: 'under_review' })).status, 403);
  assert.equal((await send('/' + ownRecord._id, 'PATCH', { requestedRank: 'professor' })).status, 409);
});

test('promotion workflow requires ordered review, eligible assessment, notes, date, and records history', async () => {
  const record = await draft(); const path = '/' + record._id + '/status';
  assert.equal((await send(path, 'PATCH', { status: 'approved' }, staff)).status, 409);
  assert.equal((await send(path, 'PATCH', { status: 'submitted' })).status, 200);
  assert.equal((await send(path, 'PATCH', { status: 'under_review', eligibilityStatus: 'eligible', eligibilityNotes: 'Verified institutional criteria' }, staff)).status, 200);
  assert.equal((await send(path, 'PATCH', { status: 'approved', reviewNotes: 'Approved' }, staff)).status, 400);
  const approved = await send(path, 'PATCH', { status: 'approved', reviewNotes: 'Approved after review', effectiveDate: '2027-01-01' }, staff);
  assert.equal(approved.status, 200); assert.equal(approved.body.record.reviewedBy, String(staff.user._id));
  assert.equal(approved.body.record.history.length, 4);
  assert.equal((await send(path, 'PATCH', { status: 'rejected', reviewNotes: 'Changed' }, staff)).status, 409);
  // Approval history is separate from the official profile rank, which may have a future effective date.
  assert.equal((await Faculty.findById(own._id)).academicRank, 'lecturer');
});

test('self-review is blocked even for privileged faculty; archive is administrator-only', async () => {
  const self = await Faculty.create({ employeeId: 'P-ADMIN', fullName: 'Admin Faculty', department: 'CS', academicRank: 'lecturer', user: admin.user._id });
  const record = await draft(admin, self); const path = '/' + record._id;
  await send(path + '/status', 'PATCH', { status: 'submitted' }, admin);
  assert.equal((await send(path + '/status', 'PATCH', { status: 'under_review' }, admin)).status, 403);
  assert.equal((await send(path, 'DELETE', undefined, staff)).status, 403);
  assert.equal((await send(path, 'DELETE', undefined, admin)).status, 200);
  assert.equal((await send(path, 'GET', undefined, admin)).status, 404);
  assert.ok((await mongoose.model('Promotion').findById(record._id)).deletedAt);
});

test('promotion endpoints reject invalid IDs, repeated queries, no token, invalid dates and arbitrary objects', async () => {
  assert.equal((await api.request('/api/promotions')).status, 401);
  for (const path of ['/bad', '?page=0', '?limit=101', '?status=unknown', '?faculty[$ne]=x', '?page=1&page=2']) assert.equal((await send(path, 'GET')).status, 400);
  assert.equal((await send('', 'POST', { faculty: { $ne: null }, requestedRank: 'professor' })).status, 400);
  const record = await draft();
  assert.equal((await send('/' + record._id + '/status', 'PATCH', { status: 'submitted', effectiveDate: '2026-02-30' })).status, 400);
});
