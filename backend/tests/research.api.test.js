import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from '../test-support/api.js';
import Faculty from '../src/models/faculty.model.js';
let api, admin, member, own, foreign;
before(async () => {
  api = await startApi('research'); admin = await api.account('system_admin'); member = await api.account('faculty_member');
  [own, foreign] = await Faculty.create([
    { employeeId: 'R-OWN', fullName: 'Own Faculty', department: 'CS', academicRank: 'lecturer', user: member.user._id },
    { employeeId: 'R-OTHER', fullName: 'Other Faculty', department: 'Math', academicRank: 'lecturer' },
  ]);
});
after(async () => { await api?.close(); });
const send = (path, method, body, user = member) => api.request('/api/research' + path, { method, body, token: user.token });
const data = (faculty = own) => ({ faculty: String(faculty._id), title: 'Literal .* research', researchType: 'journal_article', coAuthors: [{ fullName: 'Second Author', affiliation: 'University' }], keywords: ['Education'] });
async function draft() { const response = await send('', 'POST', data()); assert.equal(response.status, 201); return response.body.record; }
test('research data validates nested arrays, URLs, DOI and server-owned metadata', async () => {
  const record = await draft(); assert.deepEqual(record.keywords, ['education']);
  for (const extra of [{ publicationStatus: 'published' }, { publicationUrl: 'javascript:alert(1)' }, { doi: 'bad-doi' }, { coAuthors: [{ fullName: 'Someone', role: 'admin' }] }, { keywords: [{}] }, { documents: [] }, { coAuthors: new Array(51).fill({ fullName: 'Author' }) }]) assert.equal((await send('', 'POST', { ...data(), ...extra })).status, 400);
  assert.equal((await send('/' + record._id, 'PATCH', { title: 'Updated study', doi: '10.1234/example' })).status, 200);
});
test('research permissions protect foreign profiles and literal searches', async () => {
  const created = await send('', 'POST', data(foreign), admin); assert.equal(created.status, 201);
  assert.equal((await send('/' + created.body.record._id, 'GET')).status, 404);
  assert.equal((await send('', 'POST', data(foreign))).status, 404);
  assert.equal((await send('?search=%5E', 'GET')).body.pagination.total, 0);
  assert.equal((await send('?search=.*&limit=1', 'GET')).status, 200);
});
test('research workflow restricts review, requires publication date and locks published records', async () => {
  const record = await draft(), path = '/' + record._id;
  assert.equal((await send(path + '/status', 'PATCH', { status: 'accepted' }, admin)).status, 409);
  assert.equal((await send(path + '/status', 'PATCH', { status: 'submitted' })).status, 200);
  assert.equal((await send(path + '/status', 'PATCH', { status: 'accepted' })).status, 403);
  assert.equal((await send(path + '/status', 'PATCH', { status: 'accepted' }, admin)).status, 200);
  for (const body of [{ status: 'published' }, { status: 'published', publicationDate: '2099-01-01' }, { status: 'published', publicationDate: '2026-02-30' }]) assert.equal((await send(path + '/status', 'PATCH', body, admin)).status, 400);
  const published = await send(path + '/status', 'PATCH', { status: 'published', publicationDate: '2026-01-01' }, admin);
  assert.equal(published.status, 200); assert.equal(published.body.record.history.length, 4);
  assert.equal((await send(path, 'PATCH', { title: 'Tampered' })).status, 409);
  assert.equal((await send(path, 'DELETE')).status, 403);
  assert.equal((await send(path, 'DELETE', undefined, admin)).status, 200);
  assert.equal((await send(path, 'GET', undefined, admin)).status, 404);
});
