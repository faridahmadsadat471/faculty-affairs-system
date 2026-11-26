import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from '../test-support/api.js';
import Faculty from '../src/models/faculty.model.js';
let api, admin, member, manager, own, other, serial = 0;
before(async () => {
  api = await startApi('contracts'); admin = await api.account('system_admin'); member = await api.account('faculty_member'); manager = await api.account('department_manager');
  [own, other] = await Faculty.create([
    { employeeId: 'C-OWN', fullName: 'Own Faculty', department: 'CS', academicRank: 'lecturer', user: member.user._id },
    { employeeId: 'C-OTHER', fullName: 'Other Faculty', department: 'Math', academicRank: 'lecturer' },
    { employeeId: 'C-MANAGER', fullName: 'Manager Faculty', department: 'CS', academicRank: 'professor', user: manager.user._id },
  ]);
});
after(async () => { await api?.close(); });
const data = () => ({ contractNumber: 'CON-' + ++serial, title: 'Lecturer appointment', startDate: '2026-01-01', endDate: '2026-12-31', renewalReminderDate: '2026-12-01' });
const send = (path, method, body, user = admin) => api.request('/api/contracts' + path, { method, body, token: user.token });
async function create(faculty = own) { const response = await send('', 'POST', { faculty: String(faculty._id), ...data() }); assert.equal(response.status, 201); return response.body.record; }

test('contract writes are official-only; readers retain department and own-profile scope', async () => {
  const record = await create(); const foreign = await create(other);
  for (const user of [member, manager]) {
    assert.equal((await send('', 'POST', { faculty: String(own._id), ...data() }, user)).status, 403);
    assert.equal((await send('/' + record._id, 'PATCH', { title: 'Changed' }, user)).status, 403);
    assert.equal((await send('/' + foreign._id, 'GET', undefined, user)).status, 404);
    const list = await send('', 'GET', undefined, user); assert.equal(list.status, 200);
    assert.ok(list.body.records.every((item) => item.faculty === String(own._id)));
  }
});

test('contract validation prevents bad date ranges, reminders, forged approvals, identifiers and unknown nested data', async () => {
  for (const extra of [{ endDate: '2025-01-01' }, { renewalReminderDate: '2027-01-01' }, { approvalStatus: 'approved' }, { documents: [] }, { startDate: '2026-02-30' }]) assert.equal((await send('', 'POST', { faculty: String(own._id), ...data(), ...extra })).status, 400);
  const record = await create();
  assert.equal((await send('', 'POST', { faculty: String(own._id), ...data(), contractNumber: record.contractNumber.toLowerCase() })).status, 409);
  assert.equal((await send('/' + record._id, 'PATCH', { startDate: '2028-01-01' })).status, 400);
});

test('contract approvals and renewals preserve previous records and reject duplicate or overlapping renewals', async () => {
  const record = await create(); const path = '/' + record._id;
  assert.equal((await send(path + '/renew', 'POST', data())).status, 409);
  assert.equal((await send(path + '/status', 'PATCH', { status: 'approved', reviewNotes: 'OK' })).status, 409);
  assert.equal((await send(path + '/status', 'PATCH', { status: 'pending' })).status, 200);
  assert.equal((await send(path, 'PATCH', { title: 'Changed' })).status, 409);
  assert.equal((await send(path + '/status', 'PATCH', { status: 'approved' })).status, 400);
  assert.equal((await send(path + '/status', 'PATCH', { status: 'approved', reviewNotes: 'Appointment approved' })).status, 200);
  assert.equal((await send(path + '/renew', 'POST', data())).status, 400);
  const renewal = await send(path + '/renew', 'POST', { ...data(), startDate: '2027-01-01', endDate: '2027-12-31', renewalReminderDate: '2027-12-01' });
  assert.equal(renewal.status, 201); assert.equal(renewal.body.record.renewedFrom, record._id); assert.equal(renewal.body.record.approvalStatus, 'draft');
  assert.equal((await send(path + '/renew', 'POST', { ...data(), startDate: '2027-01-01', endDate: '2027-12-31' })).status, 409);
  assert.equal((await send(path, 'GET')).body.record.approvalStatus, 'approved');
});

test('contract archiving hides records without erasing history or faculty; archived profiles are inaccessible', async () => {
  const record = await create();
  assert.equal((await send('/' + record._id, 'DELETE', undefined, member)).status, 403);
  assert.equal((await send('/' + record._id, 'DELETE')).status, 200);
  assert.equal((await send('/' + record._id, 'GET')).status, 404);
  const source = await create(other); other.deletedAt = new Date(); await other.save();
  assert.equal((await send('/' + source._id, 'GET')).status, 404);
  assert.equal((await send('', 'POST', { faculty: String(other._id), ...data() })).status, 404);
});
