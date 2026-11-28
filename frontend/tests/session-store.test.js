import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionRecord, storeSession, readStoredSession, clearStoredSession } from '../src/services/session-store.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: (key) => data.delete(key), entries: () => [...data.entries()] };
}
test('a saved session survives a fresh read without storing a password or a cached role', () => {
  const storage = memoryStorage(), now = 100000;
  const record = sessionRecord({ accessToken: 'test-token', expiresIn: 900 }, now);
  assert.equal(storeSession({ ...record, password: 'not-to-store', user: { role: 'system_admin' } }, storage), true);
  assert.deepEqual(readStoredSession(storage, now + 1000), record);
  assert.deepEqual(JSON.parse(storage.entries()[0][1]), { accessToken: 'test-token', expiresAt: 1000000 });
});

test('until-logout sessions survive time passing without storing credentials or identity', () => {
  const storage = memoryStorage(), now = 100000;
  const record = sessionRecord({ accessToken: 'persistent-token', expiresIn: null }, now);
  assert.deepEqual(record, { accessToken: 'persistent-token', expiresAt: null });
  assert.equal(storeSession({ ...record, password: 'never-store', user: { role: 'system_admin' } }, storage), true);
  assert.deepEqual(readStoredSession(storage, now + 365 * 86400000), record);
  assert.deepEqual(JSON.parse(storage.entries()[0][1]), record);
  clearStoredSession(storage);
  assert.equal(readStoredSession(storage), null);
});
test('expired sessions and exact expiration boundaries are removed', () => {
  for (const now of [1000000, 1000001]) {
    const storage = memoryStorage(); storeSession({ accessToken: 'old-token', expiresAt: 1000000 }, storage);
    assert.equal(readStoredSession(storage, now), null); assert.equal(storage.entries().length, 0);
  }
});
test('malformed, missing, oversized, or unreasonably extended sessions cannot restore', () => {
  const cases = ['not-json', 'null', '{}', JSON.stringify({ accessToken: '', expiresAt: 2000 }), JSON.stringify({ accessToken: 'x'.repeat(4097), expiresAt: 2000 }), JSON.stringify({ accessToken: 'token', expiresAt: '2000' }), JSON.stringify({ accessToken: 'token', expiresAt: 90000000 })];
  for (const value of cases) {
    const storage = memoryStorage(); storage.setItem('bost.faculty.session', value);
    assert.equal(readStoredSession(storage, 1000), null); assert.equal(storage.entries().length, 0);
  }
});
test('logout clears this session without deleting other application storage', () => {
  const storage = memoryStorage(); storage.setItem('other-key', 'keep');
  storeSession({ accessToken: 'token', expiresAt: 2000 }, storage); clearStoredSession(storage);
  assert.equal(readStoredSession(storage, 1000), null); assert.equal(storage.getItem('other-key'), 'keep');
});
test('blocked storage fails safely while a normal in-memory login can still be used', () => {
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.equal(storeSession({ accessToken: 'token', expiresAt: 2000 }, blocked), false);
  assert.equal(readStoredSession(blocked, 1000), null); assert.doesNotThrow(() => clearStoredSession(blocked));
});
test('invalid API session metadata is rejected before persistence', () => {
  for (const expiresIn of [0, -1, 1.5, '900', 86401, undefined]) assert.throws(() => sessionRecord({ accessToken: 'token', expiresIn }));
  assert.throws(() => sessionRecord({ accessToken: '', expiresIn: 900 }));
});
