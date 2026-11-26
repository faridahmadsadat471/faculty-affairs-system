import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from '../test-support/api.js';
import Faculty from '../src/models/faculty.model.js';
import Contract from '../src/models/contract.model.js';
import Award from '../src/models/award.model.js';
import { csvCell } from '../src/controllers/report.controller.js';
let api, admin, member, manager, own;
before(async () => {
  api = await startApi('reports'); admin = await api.account('system_admin'); member = await api.account('faculty_member'); manager = await api.account('department_manager');
  const profiles = await Faculty.create([
    { employeeId: 'REP-OWN', fullName: '=HYPERLINK("bad")', department: 'CS', academicRank: 'lecturer', user: member.user._id },
    { employeeId: 'REP-MGR', fullName: 'Department Manager', department: 'CS', academicRank: 'professor', user: manager.user._id },
    { employeeId: 'REP-OTHER', fullName: 'Other Faculty', department: 'Math', academicRank: 'lecturer' },
    { employeeId: 'REP-ARCHIVED', fullName: 'Archived Faculty', department: 'CS', academicRank: 'lecturer', deletedAt: new Date() },
  ]); own = profiles[0];
  const now = new Date(), end = new Date(now.getTime() + 5 * 86400000);
  for (const profile of profiles) {
    await Contract.create({ contractNumber: String(profile.employeeId), title: 'Appointment', faculty: profile._id, createdBy: admin.user._id, startDate: new Date(now.getTime() - 10 * 86400000), endDate: end, renewalReminderDate: new Date(now.getTime() - 86400000), approvalStatus: 'approved', submittedAt: now, reviewedAt: now, reviewedBy: admin.user._id });
    await Award.create({ title: 'Achievement', faculty: profile._id, createdBy: admin.user._id, awardType: 'achievement', dateReceived: '2026-01-01' });
  }
});
after(async () => { await api?.close(); });
const get = (path, user = admin) => api.request('/api/reports/' + path, { token: user.token });
test('summary counts and related records follow role scopes and omit archived profiles', async () => {
  for (const [user, expected] of [[admin, 3], [manager, 2], [member, 1]]) {
    const response = await get('summary', user); assert.equal(response.status, 200);
    assert.equal(response.body.faculty.total, expected); assert.equal(response.body.contracts.expiringWithin30Days, expected); assert.equal(response.body.contracts.remindersDue, expected);
    assert.equal(response.body.awards[0].count, expected);
  }
  assert.equal((await get('summary?from=2099-01-01&to=2099-12-31')).body.faculty.total, 0);
});
test('expiration report has deterministic pagination and respects faculty scope', async () => {
  const response = await get('contracts/expiring?days=7&limit=1', member);
  assert.equal(response.status, 200); assert.equal(response.body.pagination.total, 1); assert.equal(response.body.records[0].faculty, String(own._id));
  assert.equal((await get('contracts/expiring?days=1')).body.pagination.total, 0);
});
test('CSV exports only authorized columns and neutralizes spreadsheet formulas', async () => {
  const response = await get('faculty.csv', member);
  assert.equal(response.status, 200); assert.match(response.headers.get('content-disposition'), /attachment/);
  assert.match(response.body, /'=HYPERLINK/); assert.doesNotMatch(response.body, /REP-OTHER|passwordHash|createdBy/);
  assert.equal(csvCell('  +SUM(1,2)'), '"\'  +SUM(1,2)"');
  assert.equal(csvCell('safe,"quoted"'), '"safe,""quoted"""');
});
test('reports reject query overrides, impossible dates and invalid pagination', async () => {
  assert.equal((await api.request('/api/reports/summary')).status, 401);
  for (const path of ['summary?faculty=x', 'summary?from=2026-02-30', 'summary?from=2027-01-01&to=2026-01-01', 'summary?from=2026-01-01&from=2026-02-01', 'contracts/expiring?days=366', 'contracts/expiring?limit=0', 'contracts/expiring?status=approved']) assert.equal((await get(path)).status, 400);
});
