/**
 * @deprecated Legacy localStorage DB removed. Business data lives in Supabase.
 * UI-only keys: see STORAGE_KEYS in scripts/app/config.js.
 */
export function getDb() {
  throw new Error("data/db.js is deprecated. Use Supabase services via scripts/app/state.js.");
}

export function saveDb() {
  throw new Error("data/db.js is deprecated.");
}

export function withDb() {
  throw new Error("data/db.js is deprecated.");
}

export function createFreshDb() {
  throw new Error("data/db.js is deprecated.");
}
