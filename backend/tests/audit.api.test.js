import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from '../test-support/api.js';
import AuditLog from '../src/models/audit-log.model.js';
import Faculty from '../src/models/faculty.model.js';
let api, admin, member;
before(async () => { api = await startApi('audit'); admin = await api.account('system_admin'); member = await api.account('faculty_member'); });
after(async () => { await api?.close(); });
test('faculty create, privileged changes, and archive produce durable actor and outcome records', async () => {
  const created = await api.request('/api/faculty', { method: 'POST', token: admin.token, body: { employeeId: 'AUDIT-1', fullName: 'Audit Faculty', department: 'CS', academicRank: 'lecturer' } }); assert.equal(created.status, 201);
  const id = created.body.faculty._id;
  const update = await api.request('/api/faculty/' + id, { method: 'PATCH', token: admin.token, body: { department: 'Math' } }); assert.equal(update.status, 200);
  const entry = await AuditLog.findOne({ requestId: update.headers.get('x-request-id') }).lean();
  assert.equal(String(entry.actor), String(admin.user._id)); assert.equal(String(entry.resourceId), id); assert.equal(entry.outcome, 'succeeded');
  assert.deepEqual(entry.changes, [{ field: 'department', before: 'CS', after: 'Math' }]);
  assert.equal((await api.request('/api/faculty/' + id, { method: 'DELETE', token: admin.token })).status, 200);
  assert.equal(await AuditLog.countDocuments({ resourceId: id, outcome: 'succeeded' }), 3);
});
test('audit log access is administrator-only, filtered, bounded, immutable through the API, and secret-free', async () => {
  assert.equal((await api.request('/api/audit-logs', { token: member.token })).status, 403);
  const response = await api.request('/api/audit-logs?resource=auth&limit=1', { token: admin.token }); assert.equal(response.status, 200); assert.equal(response.body.logs.length, 1);
  const serialized = JSON.stringify(await AuditLog.find().lean());
  for (const secret of ['IntegrationFixture123!', 'passwordHash', 'accessToken', 'resetToken', 'passwordResetHash']) assert.ok(!serialized.includes(secret));
  for (const query of ['?limit=101', '?actor[$ne]=x', '?from=2026-02-30', '?outcome=forged', '?page=1&page=2']) assert.equal((await api.request('/api/audit-logs' + query, { token: admin.token })).status, 400);
  assert.equal((await api.request('/api/audit-logs', { method: 'DELETE', token: admin.token })).status, 404);
});
test('unavailable audit storage prevents a mutation and outcome failure reports uncertain success honestly', async () => {
  const originalCreate = AuditLog.create, originalUpdate = AuditLog.updateOne;
  AuditLog.create = async () => { throw new Error('unavailable'); };
  try {
    const response = await api.request('/api/faculty', { method: 'POST', token: admin.token, body: { employeeId: 'AUDIT-BLOCKED', fullName: 'Blocked Faculty', department: 'CS', academicRank: 'lecturer' } });
    assert.equal(response.status, 503); assert.equal(await Faculty.countDocuments({ employeeId: 'AUDIT-BLOCKED' }), 0);
  } finally { AuditLog.create = originalCreate; }
  AuditLog.updateOne = async () => { throw new Error('confirmation unavailable'); };
  try {
    const response = await api.request('/api/faculty', { method: 'POST', token: admin.token, body: { employeeId: 'AUDIT-PENDING', fullName: 'Pending Faculty', department: 'CS', academicRank: 'lecturer' } });
    assert.equal(response.status, 503); assert.match(response.body.message, /may have completed/); assert.equal(await Faculty.countDocuments({ employeeId: 'AUDIT-PENDING' }), 1);
    assert.equal((await AuditLog.findOne({ requestId: response.body.requestId })).outcome, 'started');
  } finally { AuditLog.updateOne = originalUpdate; }
});
