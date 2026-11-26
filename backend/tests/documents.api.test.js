import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { startApi } from '../test-support/api.js';
import { testPdf } from '../test-support/pdf.js';
import Faculty from '../src/models/faculty.model.js';
import Promotion from '../src/models/promotion.model.js';
let api, admin, member, outsider, own;
before(async () => {
  api = await startApi('documents'); admin = await api.account('system_admin'); member = await api.account('faculty_member'); outsider = await api.account('faculty_member');
  own = await Faculty.create({ employeeId: 'DOC-OWN', fullName: 'Own Faculty', department: 'CS', academicRank: 'lecturer', user: member.user._id });
});
after(async () => { await api?.close(); });
function form(bytes = testPdf(), filename = 'certificate.pdf', type = 'application/pdf') {
  const body = new FormData(); body.set('title', 'Supporting certificate'); body.set('file', new Blob([bytes], { type }), filename); return body;
}
const upload = (module, id, body = form(), user = member) => api.request(`/api/documents/${module}/${id}`, { method: 'POST', body, token: user.token });

test('authorized PDF upload uses server-owned metadata and private authenticated download', async () => {
  const response = await upload('faculty', own._id); assert.equal(response.status, 201);
  assert.equal(response.body.document.uploadedBy, String(member.user._id)); assert.equal(response.body.document.size, testPdf().length);
  assert.equal(response.body.document.storageKey, undefined);
  const route = `/api/documents/faculty/${own._id}/${response.body.document._id}`;
  const downloaded = await api.request(route, { token: member.token });
  assert.equal(downloaded.status, 200); assert.equal(downloaded.body, testPdf().toString());
  assert.match(downloaded.headers.get('content-disposition'), /attachment/);
  assert.match(downloaded.headers.get('content-security-policy'), /sandbox/);
  assert.equal(downloaded.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await api.request(route)).status, 401);
  assert.equal((await api.request(route, { token: outsider.token })).status, 404);
  assert.equal((await api.request('/uploads/private/test.pdf')).status, 404);
});

test('uploads reject disguised files, incomplete PDF, excess size, fields, file count and forged metadata', async () => {
  const before = await readdir(process.env.UPLOAD_DIR);
  for (const body of [form(Buffer.from('<html>not PDF</html>')), form(testPdf(), 'file.html', 'text/html'), form(Buffer.from('%PDF-1.4\nincomplete')), form(testPdf(), 'file.pdf', 'text/plain')]) assert.equal((await upload('faculty', own._id, body)).status, 400);
  assert.equal((await upload('faculty', own._id, form(Buffer.alloc(2 * 1024 * 1024 + 1)))).status, 413);
  const extra = form(); extra.set('storageKey', '../secret'); assert.equal((await upload('faculty', own._id, extra)).status, 400);
  const repeated = form(); repeated.append('file', new Blob([testPdf()], { type: 'application/pdf' }), 'second.pdf'); assert.equal((await upload('faculty', own._id, repeated)).status, 400);
  assert.deepEqual(await readdir(process.env.UPLOAD_DIR), before);
});

test('draft document permissions follow module rules and lock after submission', async () => {
  const promotion = await Promotion.create({ faculty: own._id, createdBy: member.user._id, currentRank: 'lecturer', requestedRank: 'senior_lecturer' });
  assert.equal((await upload('promotions', promotion._id, form(), outsider)).status, 404);
  assert.equal((await upload('promotions', promotion._id)).status, 201);
  promotion.status = 'submitted'; promotion.submittedAt = new Date();
  // Reload because upload increments the optimistic concurrency version.
  const latest = await Promotion.findById(promotion._id); latest.status = 'submitted'; latest.submittedAt = new Date(); await latest.save();
  assert.equal((await upload('promotions', promotion._id)).status, 409);
  assert.equal((await upload('unknown', promotion._id)).status, 404);
  assert.equal((await upload('faculty', 'bad')).status, 400);
  const contract = await api.request('/api/contracts', { method: 'POST', token: admin.token, body: { faculty: String(own._id), contractNumber: 'DOC-CON', title: 'Appointment', startDate: '2026-01-01', endDate: '2026-12-31' } });
  assert.equal((await upload('contracts', contract.body.record._id)).status, 403);
  assert.equal((await upload('contracts', contract.body.record._id, form(), admin)).status, 201);
});

test('failed optimistic save removes newly written file and record document limit prevents excess storage', async () => {
  const original = Faculty.prototype.save;
  const before = await readdir(process.env.UPLOAD_DIR);
  Faculty.prototype.save = async function () { const error = new Error('changed'); error.name = 'VersionError'; throw error; };
  try { assert.equal((await upload('faculty', own._id)).status, 409); } finally { Faculty.prototype.save = original; }
  assert.deepEqual(await readdir(process.env.UPLOAD_DIR), before);
  const profile = await Faculty.findById(own._id);
  profile.documents = Array.from({ length: 20 }, () => ({ title: 'Existing', storageKey: 'legacy-key' })); await profile.save();
  assert.equal((await upload('faculty', own._id)).status, 409);
  profile.deletedAt = new Date(); await profile.save();
  assert.equal((await upload('faculty', own._id)).status, 404);
});
