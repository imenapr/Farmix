import { STORAGE_KEYS, ROLES } from "../app/config.js";
import { seedDbV1, hashPasswordMock } from "./seed.js";

const CURRENT_VERSION = 1;

function now() {
  return Date.now();
}

function safeJsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false, error: e };
  }
}

function ensureEnvelopeShape(db) {
  if (!db || typeof db !== "object") return false;
  if (!db.meta || typeof db.meta !== "object") return false;
  if (typeof db.meta.version !== "number") return false;
  if (!Array.isArray(db.users)) return false;
  if (!Array.isArray(db.listings)) return false;
  if (!Array.isArray(db.messages)) return false;
  if (!db.favorites || typeof db.favorites !== "object") return false;
  return true;
}

// Backfills fields added after the initial schema without a version bump.
function normalizeDb(db) {
  let dirty = false;
  if (!Array.isArray(db.orders))        { db.orders        = []; dirty = true; }
  if (!Array.isArray(db.notifications)) { db.notifications = []; dirty = true; }
  return dirty;
}

function backupCorrupt(raw) {
  try {
    const key = `${STORAGE_KEYS.db}.corrupt.${now()}`;
    localStorage.setItem(key, raw);
  } catch {
    // ignore; best-effort only
  }
}

function migrate(db) {
  // v1 is the initial schema. Future migrations go here.
  return db;
}

// Ensures privileged accounts always exist, even in DBs seeded before they
// were added. Mutates db in place and returns true if anything changed.
function ensureDefaultAdmins(db) {
  const required = [
    {
      email: "imenapro14@gmail.com",
      password: "Nikoloz556!",
      name: "Gagan Ashvili",
      location: "Tbilisi",
    },
  ];

  let dirty = false;
  for (const spec of required) {
    const exists = db.users.some((u) => u.email === spec.email);
    if (exists) continue;
    const t = now();
    db.users.unshift({
      id: `usr_${t.toString(16)}_${Math.random().toString(16).slice(2)}`,
      email: spec.email,
      passwordHash: hashPasswordMock(spec.password),
      role: ROLES.admin,
      name: spec.name,
      location: spec.location,
      createdAt: t,
      updatedAt: t,
    });
    dirty = true;
  }
  return dirty;
}

export function createFreshDb() {
  return seedDbV1({
    version: CURRENT_VERSION,
    seededAt: now(),
  });
}

export function getDb() {
  const raw = localStorage.getItem(STORAGE_KEYS.db);
  if (!raw) {
    const fresh = createFreshDb();
    saveDb(fresh);
    return fresh;
  }

  const parsed = safeJsonParse(raw);
  if (!parsed.ok) {
    backupCorrupt(raw);
    const fresh = createFreshDb();
    saveDb(fresh);
    return fresh;
  }

  let db = parsed.value;
  if (!ensureEnvelopeShape(db)) {
    backupCorrupt(raw);
    const fresh = createFreshDb();
    saveDb(fresh);
    return fresh;
  }

  if (db.meta.version !== CURRENT_VERSION) {
    db = migrate(db);
    db.meta.version = CURRENT_VERSION;
    db.meta.updatedAt = now();
    saveDb(db);
  }

  const dirty = [ensureDefaultAdmins(db), normalizeDb(db)].some(Boolean);
  if (dirty) saveDb(db);

  return db;
}

export function saveDb(nextDb) {
  const db = structuredClone(nextDb);
  db.meta.updatedAt = now();
  localStorage.setItem(STORAGE_KEYS.db, JSON.stringify(db));
}

export function withDb(mutator) {
  const db = getDb();
  const next = mutator(structuredClone(db));
  saveDb(next);
  return next;
}

