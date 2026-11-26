import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { startApi } from '../test-support/api.js';
import { createRateLimit } from '../src/middleware/rate-limit.middleware.js';
let api;
before(async () => { api = await startApi('security'); });
after(async () => { await api?.close(); });
test('CORS allows configured origins and local API clients while denying unknown websites', async () => {
  assert.equal((await api.request('/api/health')).status, 200);
  const allowed = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',')[0];
  const response = await api.request('/api/health', { headers: { Origin: allowed } });
  assert.equal(response.status, 200); assert.equal(response.headers.get('access-control-allow-origin'), allowed);
  assert.equal((await api.request('/api/health', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
});
test('malformed and oversized bodies get safe errors with security headers', async () => {
  const malformed = await api.request('/api/auth/login', { method: 'POST', raw: '{bad', headers: { 'Content-Type': 'application/json' } });
  assert.equal(malformed.status, 400); assert.equal(malformed.body.message, 'Invalid JSON body');
  const large = await api.request('/api/auth/login', { method: 'POST', body: { text: 'a'.repeat(1024 * 1024 + 1) } });
  assert.equal(large.status, 413); assert.equal(large.headers.get('x-powered-by'), null);
  assert.equal(large.headers.get('x-content-type-options'), 'nosniff');
});
test('bounded limiter enforces IP windows, retry delay, spoofed-header independence, capacity and expiry', () => {
  let now = 0, passed = 0, status, retry;
  const limiter = createRateLimit({ max: 2, windowMs: 5000, capacity: 1, clock: () => now });
  const response = { status(code) { status = code; return this; }, set(name, value) { retry = value; return this; }, json() { return this; } };
  const run = (ip) => { status = 200; limiter({ ip, headers: { 'x-forwarded-for': Math.random().toString() } }, response, () => passed++); return status; };
  assert.equal(run('127.0.0.1'), 200); assert.equal(run('127.0.0.1'), 200);
  assert.equal(run('127.0.0.1'), 429); assert.equal(retry, '5'); assert.equal(passed, 2);
  assert.equal(run('127.0.0.2'), 429);
  now = 5000; assert.equal(run('127.0.0.2'), 200);
});
test('authentication endpoints enforce the limiter through HTTP before password processing', async () => {
  let blocked;
  for (let index = 0; index < 102; index++) {
    const response = await api.request('/api/auth/login', { method: 'POST', body: {} });
    if (response.status === 429) { blocked = response; break; }
    assert.equal(response.status, 400);
  }
  assert.ok(blocked); assert.ok(Number(blocked.headers.get('retry-after')) > 0);
});
