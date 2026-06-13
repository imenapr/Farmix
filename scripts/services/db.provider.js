/**
 * @deprecated Legacy in-memory DB removed. Use services + Supabase via scripts/app/state.js.
 * This module remains only to surface a clear error if imported accidentally.
 */
export function getDb() {
  throw new Error("db.provider.js is deprecated. Use Supabase services via scripts/app/state.js.");
}

export function updateDb() {
  throw new Error("db.provider.js is deprecated. Use Supabase services via scripts/app/state.js.");
}

export function resetDb() {
  throw new Error("db.provider.js is deprecated. Use Supabase services via scripts/app/state.js.");
}
