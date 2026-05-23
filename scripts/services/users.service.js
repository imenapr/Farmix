import { getDb, updateDb } from "../services/db.provider.js";
import { validateProfileUpdate } from "../data/validators.js";

function toUserPublic(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

/* ─────────────────────────────
   GET USER
───────────────────────────── */
export function getUserById(userId) {
  const db = getDb();

  const user = db.users.find((x) => x.id === userId);

  if (!user) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "User not found." },
    };
  }

  return {
    ok: true,
    data: toUserPublic(user),
  };
}

/* ─────────────────────────────
   UPDATE PROFILE
───────────────────────────── */
export function updateProfile(userId, input) {
  const validation = validateProfileUpdate(input);

  if (!validation.ok) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Fix the highlighted fields.",
        fieldErrors: validation.fieldErrors,
      },
    };
  }

  let updatedUser = null;

  updateDb((db) => {
    const user = db.users.find((x) => x.id === userId);

    if (!user) return db;

    Object.assign(user, validation.value, {
      updatedAt: Date.now(),
    });

    updatedUser = toUserPublic(user);
    return db;
  });

  if (!updatedUser) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "User not found." },
    };
  }

  return {
    ok: true,
    data: updatedUser,
  };
}