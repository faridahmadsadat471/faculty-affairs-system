import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi, fixturePassword } from '../test-support/api.js';
import User from '../src/models/user.model.js';
let api, admin, member;
before(async () => { api = await startApi('user_management'); admin = await api.account('system_admin'); member = await api.account('faculty_member'); });
after(async () => { await api?.close(); });
const send = (path, method, body, actor = admin) => api.request('/api/users' + path, { method, body, token: actor.token });
test('administrators create normalized accounts, view safe details and reject duplicates and internal fields', async () => {
  const body = { fullName: ' New Staff ', email: ' STAFF@EXAMPLE.TEST ', password: fixturePassword, role: 'directorate_staff' };
  const result = await send('', 'POST', body); assert.equal(result.status, 201);
  assert.equal(result.body.user.email, 'staff@example.test'); assert.equal(result.body.user.fullName, 'New Staff');
  const stored = await User.findById(result.body.user.id).select('+passwordHash'); assert.notEqual(stored.passwordHash, fixturePassword);
  const detail = await send('/' + stored._id, 'GET'); assert.equal(detail.status, 200);
  for (const key of ['passwordHash', 'tokenVersion', 'passwordResetHash']) assert.equal(detail.body.user[key], undefined);
  assert.equal((await send('', 'POST', body)).status, 409);
  for (const extra of [{ tokenVersion: 100 }, { passwordHash: 'forged' }, { role: 'owner' }, { isActive: 'false' }]) assert.equal((await send('', 'POST', { ...body, email: 'fresh@example.test', ...extra })).status, 400);
  assert.equal((await send('/bad', 'GET')).status, 400);
});
test('only administrators manage accounts; unknown fields never become updates', async () => {
  assert.equal((await send('', 'POST', { fullName: 'Forged User', email: 'forged@example.test', password: fixturePassword, role: 'system_admin' }, member)).status, 403);
  for (const body of [{ passwordHash: 'forged' }, { tokenVersion: 0 }, { fullName: 'Changed', passwordResetHash: 'forged' }, {}, []]) assert.equal((await send('/' + member.user._id, 'PATCH', body)).status, 400);
  assert.equal((await User.findById(member.user._id)).fullName, member.user.fullName);
});
test('role and activation changes invalidate existing tokens and cannot revive sessions after reactivation', async () => {
  const target = await api.account('faculty_member');
  assert.equal((await send('/' + target.user._id, 'PATCH', { role: 'directorate_staff' })).status, 200);
  assert.equal((await api.request('/api/auth/me', { token: target.token })).status, 401);
  const login = await api.request('/api/auth/login', { method: 'POST', body: { email: target.user.email, password: fixturePassword } }); assert.equal(login.status, 200);
  assert.equal((await send('/' + target.user._id, 'PATCH', { isActive: false })).status, 200);
  assert.equal((await send('/' + target.user._id, 'PATCH', { isActive: true })).status, 200);
  assert.equal((await api.request('/api/auth/me', { token: login.body.accessToken })).status, 401);
});
test('the last active administrator cannot be demoted or disabled', async () => {
  for (const body of [{ role: 'faculty_member' }, { isActive: false }]) assert.equal((await send('/' + admin.user._id, 'PATCH', body)).status, 409);
  assert.equal((await User.findById(admin.user._id)).role, 'system_admin');
});
test('simultaneous administrator demotions recheck queued permissions and retain an active administrator', async () => {
  const second = await api.account('system_admin');
  const responses = await Promise.all([
    send('/' + second.user._id, 'PATCH', { role: 'faculty_member' }),
    send('/' + admin.user._id, 'PATCH', { role: 'faculty_member' }, second),
  ]);
  assert.deepEqual(responses.map((r) => r.status).sort(), [200, 403]);
  assert.equal(await User.countDocuments({ role: 'system_admin', isActive: true }), 1);
});
