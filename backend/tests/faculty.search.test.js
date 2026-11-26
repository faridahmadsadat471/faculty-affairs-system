import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import Faculty from '../src/models/faculty.model.js';
import { startApi } from '../test-support/api.js';
let api, admin, manager, member;
before(async () => {
  api = await startApi('search');
  admin = await api.account('system_admin'); manager = await api.account('department_manager'); member = await api.account('faculty_member');
  await Faculty.create([
    { employeeId: 'SEARCH-MANAGER', fullName: 'Computer Manager', department: 'CS', academicRank: 'lecturer', user: manager.user._id },
    { employeeId: 'SEARCH-01', fullName: 'Farid Literal.* Faculty', email: 'farid@example.test', department: 'CS', academicRank: 'professor', user: member.user._id },
    { employeeId: 'SEARCH-02', fullName: 'Farid Other Faculty', department: 'Math', academicRank: 'lecturer', employmentStatus: 'on_leave' },
    { employeeId: 'SEARCH-ARCHIVED', fullName: 'Farid Archived', department: 'CS', academicRank: 'lecturer', deletedAt: new Date() },
  ]);
});
after(async () => { if (api) await api.close(); });
function search(query, account = admin) { return api.request(`/api/faculty?${query}`, { token: account.token }); }
test('search matches names, identifiers, and emails case insensitively and excludes archived profiles', async () => {
  assert.equal((await search('search=farid')).body.pagination.total, 2);
  assert.equal((await search('search=search-01')).body.faculty[0].employeeId, 'SEARCH-01');
  assert.equal((await search('search=FARID%40example.test')).body.pagination.total, 1);
  assert.equal((await search('search=Literal.*')).body.pagination.total, 1);
  assert.equal((await search('search=%5E')).body.pagination.total, 0);
});
test('filters combine with search and paginate only matching profiles', async () => {
  const response = await search('search=Farid&department=CS&academicRank=professor&employmentStatus=active&limit=1');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.pagination, { page: 1, limit: 1, total: 1, totalPages: 1 });
  assert.equal(response.body.faculty[0].employeeId, 'SEARCH-01');
});
test('search and department filters cannot widen role scopes or counts', async () => {
  assert.equal((await search('search=Farid', manager)).body.pagination.total, 1);
  assert.equal((await search('department=Math', manager)).body.pagination.total, 0);
  assert.equal((await search('search=Farid', member)).body.pagination.total, 1);
  assert.equal((await search('search=Other', member)).body.pagination.total, 0);
});
test('malformed searches and unsupported filters are rejected', async () => {
  for (const query of ['search=', 'search=a&search=b', `search=${'x'.repeat(101)}`, 'department=', 'academicRank=unknown', 'employmentStatus=unknown', 'search[$ne]=x']) {
    assert.equal((await search(query)).status, 400, query);
  }
});
