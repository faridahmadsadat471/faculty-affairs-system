const storageKey = 'bost.faculty.session';

function browserStorage() {
  try { return globalThis.window?.sessionStorage || null; } catch { return null; }
}

export function clearStoredSession(storage = browserStorage()) {
  try { storage?.removeItem(storageKey); } catch { /* Storage may be blocked by browser policy. */ }
}

export function sessionRecord({ accessToken, expiresIn }, now = Date.now()) {
  if (typeof accessToken !== 'string' || !accessToken || accessToken.length > 4096
    || (expiresIn !== null && (!Number.isSafeInteger(expiresIn) || expiresIn < 1 || expiresIn > 86400))) {
    throw new Error('Invalid session response');
  }
  return { accessToken, expiresAt: expiresIn === null ? null : now + expiresIn * 1000 };
}

export function storeSession(record, storage = browserStorage()) {
  try {
    if (!storage) return false;
    // Deliberately omit the password and cached user/role information.
    storage.setItem(storageKey, JSON.stringify({ accessToken: record.accessToken, expiresAt: record.expiresAt }));
    return true;
  } catch { return false; }
}

export function readStoredSession(storage = browserStorage(), now = Date.now()) {
  try {
    const value = storage?.getItem(storageKey);
    if (!value) return null;
    const record = JSON.parse(value);
    if (!record || typeof record.accessToken !== 'string' || !record.accessToken || record.accessToken.length > 4096
      || (record.expiresAt !== null && (!Number.isSafeInteger(record.expiresAt) || record.expiresAt <= now || record.expiresAt > now + 86400000))) {
      clearStoredSession(storage);
      return null;
    }
    return { accessToken: record.accessToken, expiresAt: record.expiresAt };
  } catch { clearStoredSession(storage); return null; }
}
