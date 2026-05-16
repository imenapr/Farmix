import { loadDb, withDb } from "../data/db.js";
import { validateProfileUpdate } from "../data/validators.js";

function toUserPublic(u) {
  // eslint-disable-next-line no-unused-vars
  const { passwordHash, ...rest } = u;
  return rest;
}

export function getUserById(userId) {
  const db = loadDb();
  const u = db.users.find((x) => x.id === userId);
  if (!u) return { ok: false, error: { code: "NOT_FOUND", message: "User not found." } };
  return { ok: true, data: toUserPublic(u) };
}

export function updateProfile(userId, input) {
  const v = validateProfileUpdate(input);
  if (!v.ok) {
    return { ok: false, error: { code: "VALIDATION_FAILED", message: "Fix the highlighted fields.", fieldErrors: v.fieldErrors } };
  }

  const updated = { user: null };
  withDb((db) => {
    const u = db.users.find((x) => x.id === userId);
    if (!u) return db;
    Object.assign(u, v.value, { updatedAt: Date.now() });
    updated.user = toUserPublic(u);
    return db;
  });

  if (!updated.user) return { ok: false, error: { code: "NOT_FOUND", message: "User not found." } };
  return { ok: true, data: updated.user };
}

