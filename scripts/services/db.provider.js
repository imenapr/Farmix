import { seedDbV1 } from "../data/seed.js";

let DB = seedDbV1({
  version: 1,
  seededAt: Date.now(),
});

/* ─────────────────────────────
   READ ACCESS
───────────────────────────── */
export function getDb() {
  return DB;
}

/* ─────────────────────────────
   WRITE ACCESS (TRANSACTION STYLE)
───────────────────────────── */
export function updateDb(mutator) {
  const next = structuredClone(DB);
  const result = mutator(next);

  // allow mutator to either return DB or modify clone
  DB = result ?? next;

  return DB;
}

/* ─────────────────────────────
   OPTIONAL RESET (useful for dev/admin tools)
───────────────────────────── */
export function resetDb() {
  DB = seedDbV1({
    version: 1,
    seededAt: Date.now(),
  });

  return DB;
}