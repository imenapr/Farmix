/**
 * TTL cache for Supabase read operations.
 * Memory layer (per page) + sessionStorage for listings/search (cross-page MPA).
 */

const SESSION_PREFIX = "farmix.cache.v1:";

/** @type {Map<string, { value: unknown, expiresAt: number }>} */
const store = new Map();

function readSessionEntry(key) {
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || typeof entry.expiresAt !== "number") return null;
    if (Date.now() > entry.expiresAt) {
      sessionStorage.removeItem(SESSION_PREFIX + key);
      return null;
    }
    return entry;
  } catch {
    return null;
  }
}

function writeSessionEntry(key, entry) {
  if (!key.startsWith("listings:") && !key.startsWith("ratings:")) return;
  try {
    sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(entry));
  } catch {
    pruneSessionCache();
    try {
      sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(entry));
    } catch {
      /* quota full — memory cache still works */
    }
  }
}

function pruneSessionCache() {
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(SESSION_PREFIX)) keys.push(k);
    }
    keys.sort();
    for (let i = 0; i < Math.ceil(keys.length / 3); i++) {
      sessionStorage.removeItem(keys[i]);
    }
  } catch {
    /* ignore */
  }
}

function removeSessionByPrefix(prefix) {
  try {
    const toRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(SESSION_PREFIX + prefix)) toRemove.push(k);
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

export function getCache(key) {
  const mem = store.get(key);
  if (mem) {
    if (Date.now() > mem.expiresAt) {
      store.delete(key);
    } else {
      return mem.value;
    }
  }

  const session = readSessionEntry(key);
  if (!session) return null;
  store.set(key, session);
  return session.value;
}

export function setCache(key, value, ttlMs = 60_000) {
  const entry = { value, expiresAt: Date.now() + ttlMs };
  store.set(key, entry);
  writeSessionEntry(key, entry);
}

export function invalidateCache(prefix = "") {
  if (!prefix) {
    store.clear();
    removeSessionByPrefix("");
    return;
  }
  for (const key of [...store.keys()]) {
    if (key.startsWith(prefix)) store.delete(key);
  }
  removeSessionByPrefix(prefix);
}
