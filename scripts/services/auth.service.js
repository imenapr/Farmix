import { STORAGE_KEYS, ROLES } from "../app/config.js";
import { emit } from "../app/events.js";
import { loadDb, withDb } from "../data/db.js";
import { hashPasswordMock } from "../data/seed.js";
import { validateLogin, validateSignup } from "../data/validators.js";
import { createNotification } from "./notifications.service.js";
import { supabase, SUPABASE_SESSION_KEY } from "../lib/supabase.js";

/** @typedef {{ ok: true, data: any } | { ok: false, error: { code: string, message: string, fieldErrors?: Record<string,string> } }} Result */

/** @type {any | null} */
let currentUser = null;

function now() {
  return Date.now();
}

function toUserPublic(u) {
  if (!u) return null;
  // eslint-disable-next-line no-unused-vars
  const { passwordHash, ...rest } = u;
  return rest;
}

function setSession(session) {
  if (!session) localStorage.removeItem(STORAGE_KEYS.session);
  else localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
}

function getSession() {
  const raw = localStorage.getItem(STORAGE_KEYS.session);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function setCurrentUserInternal(userRecordOrNull) {
  currentUser = userRecordOrNull ? toUserPublic(userRecordOrNull) : null;
  emit("auth:changed", { user: currentUser });
}

export function getCurrentUser() {
  return currentUser;
}

// ─── initAuthSession ─────────────────────────────────────────────────────────
// Synchronous bridge: reads the Supabase session directly from localStorage
// (at the known key) so router-guards can call getCurrentUser() immediately.
export function initAuthSession() {
  const db = loadDb();

  // 1. Try reading the live Supabase session synchronously from localStorage
  try {
    const raw = localStorage.getItem(SUPABASE_SESSION_KEY);
    if (raw) {
      const parsed    = JSON.parse(raw);
      const supaEmail = parsed?.user?.email;
      if (supaEmail) {
        const user = db.users.find((u) => u.email === supaEmail) ?? null;
        if (user && !user.suspended) {
          setCurrentUserInternal(user);
          // Silently refresh the Supabase token in the background
          supabase.auth.getSession().catch(() => {});
          return;
        }
      }
    }
  } catch { /* fall through */ }

  // 2. Legacy localStorage session fallback
  const session = getSession();
  if (!session?.userId) { setCurrentUserInternal(null); return; }
  const user = db.users.find((u) => u.id === session.userId) ?? null;
  if (user?.suspended) { setSession(null); setCurrentUserInternal(null); return; }
  setCurrentUserInternal(user);
}

// ─── logout ──────────────────────────────────────────────────────────────────
export async function logout() {
  supabase.auth.signOut().catch(() => {});
  setSession(null);
  setCurrentUserInternal(null);
  return { ok: true, data: null };
}

// ─── signup ──────────────────────────────────────────────────────────────────
export async function signup(input) {
  const v = validateSignup(input);
  if (!v.ok) {
    return {
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Fix the highlighted fields.", fieldErrors: v.fieldErrors },
    };
  }

  const { email, password, role, name, location, farmName, companyName } = v.value;

  if (![ROLES.farmer, ROLES.business, ROLES.consumer].includes(role)) {
    return { ok: false, error: { code: "VALIDATION_FAILED", message: "Select a valid role." } };
  }

  // Check for existing email before touching Supabase
  const dbCheck = loadDb();
  if (dbCheck.users.some((u) => u.email === email)) {
    return { ok: false, error: { code: "CONFLICT", message: "An account with this email already exists." } };
  }

  // Register in Supabase (best-effort; failure still allows local signup)
  const supaSignup = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, role } },
  });
  if (supaSignup.error && supaSignup.error.message?.toLowerCase().includes("already registered")) {
    return { ok: false, error: { code: "CONFLICT", message: "An account with this email already exists." } };
  }

  const created = { userPublic: null };

  withDb((db) => {
    if (db.users.some((u) => u.email === email)) return db; // race guard

    const t = now();
    const user = {
      id: `usr_${crypto.randomUUID?.() ?? `${t}_${Math.random().toString(16).slice(2)}`}`,
      email,
      passwordHash: hashPasswordMock(password),
      role,
      name,
      location,
      createdAt: t,
      updatedAt: t,
    };

    if (role === ROLES.farmer   && farmName)    user.farmName    = farmName;
    if (role === ROLES.business && companyName) user.companyName = companyName;

    db.users.push(user);
    created.userPublic = toUserPublic(user);
    return db;
  });

  if (!created.userPublic) {
    return { ok: false, error: { code: "CONFLICT", message: "An account with this email already exists." } };
  }

  // Notify admins on new farmer registration
  if (role === ROLES.farmer) {
    const currentDb = loadDb();
    currentDb.users
      .filter((u) => u.role === ROLES.admin)
      .forEach((admin) => {
        createNotification({
          userId  : admin.id,
          type    : "new_farmer_registered",
          message : `New farmer registered: ${name} (${email})`,
          metadata: { farmerId: created.userPublic.id, farmerName: name, farmerEmail: email },
        });
      });
  }

  setSession({ userId: created.userPublic.id, token: `t_${now()}`, createdAt: now() });
  setCurrentUserInternal(created.userPublic);
  return { ok: true, data: { user: created.userPublic } };
}

// ─── login ───────────────────────────────────────────────────────────────────
export async function login(input) {
  const v = validateLogin(input);
  if (!v.ok) {
    return {
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Fix the highlighted fields.", fieldErrors: v.fieldErrors },
    };
  }

  const { email, password } = v.value;

  // 1. Try Supabase auth first
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data?.user) {
      const db   = loadDb();
      const user = db.users.find((u) => u.email === email) ?? null;
      if (user) {
        if (user.suspended) {
          await supabase.auth.signOut();
          return { ok: false, error: { code: "ACCOUNT_SUSPENDED", message: "Your account has been suspended. Please contact support." } };
        }
        setCurrentUserInternal(user);
        return { ok: true, data: { user: toUserPublic(user) } };
      }
      // Supabase user exists but no local profile — create one
      const t = now();
      const newUser = {
        id          : `usr_${crypto.randomUUID?.() ?? `${t}_${Math.random().toString(16).slice(2)}`}`,
        email,
        passwordHash: hashPasswordMock(password),
        role        : (data.user.user_metadata?.role ?? ROLES.consumer),
        name        : (data.user.user_metadata?.name ?? email.split("@")[0]),
        location    : "",
        createdAt   : t,
        updatedAt   : t,
      };
      withDb((db) => { db.users.push(newUser); return db; });
      setCurrentUserInternal(newUser);
      return { ok: true, data: { user: toUserPublic(newUser) } };
    }
  } catch { /* fall through to localStorage */ }

  // 2. Fallback: localStorage auth (handles seed/demo users)
  const db   = loadDb();
  const user = db.users.find((u) => u.email === email);
  if (!user)                                         return { ok: false, error: { code: "AUTH_FAILED", message: "Invalid email or password." } };
  if (user.passwordHash !== hashPasswordMock(password)) return { ok: false, error: { code: "AUTH_FAILED", message: "Invalid email or password." } };
  if (user.suspended)                                return { ok: false, error: { code: "ACCOUNT_SUSPENDED", message: "Your account has been suspended. Please contact support." } };

  // Silently auto-register seed user in Supabase so future logins go through Supabase
  supabase.auth.signInWithPassword({ email, password }).catch(() => {
    supabase.auth.signUp({ email, password, options: { data: { name: user.name, role: user.role } } }).catch(() => {});
  });

  setSession({ userId: user.id, token: `t_${now()}`, createdAt: now() });
  setCurrentUserInternal(user);
  return { ok: true, data: { user: toUserPublic(user) } };
}

// ─── loginWithGoogle ─────────────────────────────────────────────────────────
export function loginWithGoogle(googleUser) {
  const { email, name, picture } = googleUser;
  const created = { userPublic: null };

  withDb((db) => {
    let user = db.users.find((u) => u.email === email);
    if (user) {
      if (user.name !== name || user.picture !== picture) {
        user.name    = name;
        user.picture = picture;
        user.updatedAt = now();
      }
    } else {
      const t = now();
      user = {
        id          : `usr_${crypto.randomUUID?.() ?? `${t}_${Math.random().toString(16).slice(2)}`}`,
        email,
        passwordHash: null,
        role        : ROLES.consumer,
        name,
        location    : "",
        picture,
        createdAt   : t,
        updatedAt   : t,
      };
      db.users.push(user);
    }
    created.userPublic = toUserPublic(user);
    return db;
  });

  setSession({ userId: created.userPublic.id, token: `t_${now()}`, createdAt: now() });
  setCurrentUserInternal(created.userPublic);
  return { ok: true, data: { user: created.userPublic } };
}

export function requireAuth() {
  if (!currentUser) return { ok: false, error: { code: "AUTH_REQUIRED", message: "Login required." } };
  return { ok: true, data: { user: currentUser } };
}

export function watchSession() {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEYS.db) return;
    const session = getSession();
    if (!session?.userId) return;
    const db   = loadDb();
    const user = db.users.find((u) => u.id === session.userId) ?? null;
    if (!user || user.suspended) {
      setSession(null);
      setCurrentUserInternal(null);
      window.location.href = "/pages/login.html";
    }
  });
}
