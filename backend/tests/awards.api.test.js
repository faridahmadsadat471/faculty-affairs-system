import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from '../test-support/api.js';
import Faculty from '../src/models/faculty.model.js';
let api, admin, member, manager, own, foreign;
before(async () => {
  api = await startApi('awards'); admin = await api.account('system_admin'); member = await api.account('faculty_member'); manager = await api.account('department_manager');
  [own, foreign] = await Faculty.create([
    { employeeId: 'A-OWN', fullName: 'Own Faculty', department: 'CS', academicRank: 'lecturer', user: member.user._id },
    { employeeId: 'A-OTHER', fullName: 'Other Faculty', department: 'Math', academicRank: 'lecturer' },
    { employeeId: 'A-MGR', fullName: 'Manager Faculty', department: 'CS', academicRank: 'professor', user: manager.user._id },
  ]);
});
after(async () => { await api?.close(); });
const send = (path, method, body, user = member) => api.request('/api/awards' + path, { method, body, token: user.token });
const data = () => ({ faculty: String(own._id), title: 'Community service', awardType: 'achievement', dateReceived: '2026-01-01' });
test('faculty and managers record scoped achievements; official awards require staff and organization', async () => {
  const created = await send('', 'POST', data()); assert.equal(created.status, 201);
  assert.equal((await send('', 'POST', data(), manager)).status, 201);
  assert.equal((await send('', 'POST', { ...data(), awardType: 'award', awardingOrganization: 'University' })).status, 403);
  assert.equal((await send('', 'POST', { ...data(), awardType: 'award' }, admin)).status, 400);
  const award = await send('', 'POST', { ...data(), awardType: 'award', awardingOrganization: 'University' }, admin); assert.equal(award.status, 201);
  assert.equal((await send('/' + award.body.record._id, 'PATCH', { awardType: 'achievement' })).status, 403);
  assert.equal((await send('/' + created.body.record._id, 'PATCH', { awardType: 'award', awardingOrganization: 'Forged' })).status, 403);
  assert.equal((await send('/' + created.body.record._id, 'PATCH', { description: 'Updated achievement' })).status, 200);
});
test('award scopes, filters, dates, archive permissions and metadata are enforced', async () => {
  const foreignRecord = await send('', 'POST', { ...data(), faculty: String(foreign._id) }, admin);
  for (const user of [member, manager]) assert.equal((await send('/' + foreignRecord.body.record._id, 'GET', undefined, user)).status, 404);
  for (const extra of [{ dateReceived: '2099-01-01' }, { documents: [] }, { createdBy: String(admin.user._id) }, { dateReceived: {} }]) assert.equal((await send('', 'POST', { ...data(), ...extra })).status, 400);
  assert.equal((await send('?status=achievement&limit=1', 'GET')).body.records.length, 1);
  const created = await send('', 'POST', data()), path = '/' + created.body.record._id;
  assert.equal((await send(path, 'DELETE')).status, 403);
  assert.equal((await send(path, 'DELETE', undefined, admin)).status, 200);
  assert.equal((await send(path, 'GET', undefined, admin)).status, 404);
});
