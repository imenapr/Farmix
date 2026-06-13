import { STORAGE_KEYS } from "../app/config.js";
import { emit } from "../app/events.js";
import { getSupabase } from "../lib/supabase.js";
import { userFromDb } from "../lib/transform.js";
import { validateLogin, validateSignup } from "../data/validators.js";
import { createNotification } from "./notifications.service.js";
import { ROLES } from "../app/config.js";

/** @typedef {{ ok: true, data: any } | { ok: false, error: { code: string, message: string, fieldErrors?: Record<string,string> } }} Result */

/** @type {ReturnType<typeof userFromDb>} */
let currentUser = null;

/**
 * Profile (incl. role) cache TTL. The cache is a UI-performance optimization
 * ONLY — it is never the authority for admin actions. Server-side RLS
 * (public.is_admin) remains the source of truth, so a stale cached role
 * cannot grant real privileges. Kept short so demotions/suspensions reflect
 * quickly in the UI.
 */
const PROFILE_TTL_MS = 5 * 60 * 1000;

function err(code, message, fieldErrors) {
  return { ok: false, error: { code, message, fieldErrors } };
}

function ok(data) {
  return { ok: true, data };
}

function setAuthCache(user) {
  try {
    if (!user) {
      localStorage.removeItem(STORAGE_KEYS.authCache);
      return;
    }
    localStorage.setItem(
      STORAGE_KEYS.authCache,
      JSON.stringify({ user, fetchedAt: Date.now() })
    );
  } catch {
    /* ignore quota errors */
  }
}

function readAuthCache() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.authCache);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Back-compat: tolerate the older shape where the user was stored directly.
    if (parsed && parsed.user) return parsed;
    if (parsed && parsed.id) return { user: parsed, fetchedAt: 0 };
    return null;
  } catch {
    return null;
  }
}

function isCacheFresh(entry, userId) {
  return Boolean(
    entry?.user?.id === userId &&
    typeof entry.fetchedAt === "number" &&
    Date.now() - entry.fetchedAt < PROFILE_TTL_MS
  );
}

function setCurrentUserInternal(user) {
  currentUser = user;
  setAuthCache(user);
  emit("auth:changed", { user: currentUser });
}

export function getCurrentUser() {
  return currentUser;
}

async function fetchUserProfile(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
  if (error || !data) return null;
  if (data.suspended) return null;
  return userFromDb(data);
}

/**
 * Returns the cached profile for `userId` if still within the TTL, else null.
 * Used to skip a Supabase round-trip on every page navigation.
 */
function getCachedProfile(userId) {
  const entry = readAuthCache();
  return isCacheFresh(entry, userId) ? entry.user : null;
}

/** Force-refresh the cached profile/role from Supabase (e.g. after a role change). */
export async function refreshCurrentUser() {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    setCurrentUserInternal(null);
    return null;
  }
  const profile = await fetchUserProfile(session.user.id);
  setCurrentUserInternal(profile);
  return profile;
}

async function upsertUserProfile(row) {
  const supabase = getSupabase();
  const { error } = await supabase.from("users").upsert(row, { onConflict: "id" });
  return !error;
}

// ─── Session init (Supabase authoritative) ───────────────────────────────────
export async function initAuthSession() {
  const supabase = getSupabase();

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      setCurrentUserInternal(null);
      return;
    }

    // Role cache: skip the Supabase round-trip if we fetched this user's
    // profile recently. RLS still guards every real admin operation, so a
    // fresh cached role is safe to trust for UI purposes only.
    const cachedProfile = getCachedProfile(session.user.id);
    if (cachedProfile) {
      currentUser = cachedProfile;
      emit("auth:changed", { user: currentUser });
      return;
    }

    const profile = await fetchUserProfile(session.user.id);
    setCurrentUserInternal(profile);
    return;
  } catch {
    setCurrentUserInternal(null);
  }
}

export async function logout() {
  const supabase = getSupabase();
  await supabase.auth.signOut().catch(() => {});
  setCurrentUserInternal(null);
  return ok(null);
}

export async function signup(input) {
  const v = validateSignup(input);
  if (!v.ok) return err("VALIDATION_FAILED", "Fix the highlighted fields.", v.fieldErrors);

  const { email, password, role, name, location, phone, farmName, companyName } = v.value;
  if (![ROLES.farmer, ROLES.business, ROLES.consumer].includes(role)) {
    return err("VALIDATION_FAILED", "Select a valid role.");
  }

  const supabase = getSupabase();
  const { data: signData, error: signError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, role, location, phone } },
  });

  if (signError) {
    if (signError.message?.toLowerCase().includes("already registered")) {
      return err("CONFLICT", "An account with this email already exists.");
    }
    return err("AUTH_ERROR", signError.message);
  }

  const authUser = signData.user;
  if (!authUser?.id) return err("AUTH_ERROR", "Failed to create account.");

  const now = new Date().toISOString();
  const profileRow = {
    id: authUser.id,
    email,
    role,
    name,
    location,
    phone: phone || null,
    farm_name: farmName || null,
    company_name: companyName || null,
    created_at: now,
    updated_at: now,
  };

  const saved = await upsertUserProfile(profileRow);
  if (!saved) return err("DB_ERROR", "Account created but profile save failed. Try logging in.");

  const userPublic = userFromDb(profileRow);
  setCurrentUserInternal(userPublic);

  if (role === ROLES.farmer) {
    const { data: admins } = await supabase.from("users").select("id").eq("role", ROLES.admin);
    for (const admin of admins ?? []) {
      createNotification({
        userId: admin.id,
        type: "system",
        title: "New farmer registered",
        message: `New farmer registered: ${name} (${email})`,
        metadata: { farmerId: authUser.id, farmerName: name, farmerEmail: email },
      });
    }
  }

  return ok({ user: userPublic });
}

export async function login(input) {
  const v = validateLogin(input);
  if (!v.ok) return err("VALIDATION_FAILED", "Fix the highlighted fields.", v.fieldErrors);

  const { email, password } = v.value;
  const supabase = getSupabase();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.user?.id) {
    return err("AUTH_FAILED", "Invalid email or password.");
  }

  let profile = await fetchUserProfile(data.user.id);
  if (!profile) {
    const meta = data.user.user_metadata ?? {};
    const now = new Date().toISOString();
    const row = {
      id: data.user.id,
      email: data.user.email,
      role: meta.role ?? ROLES.consumer,
      name: meta.name ?? String(email).split("@")[0],
      location: meta.location ?? "",
      created_at: now,
      updated_at: now,
    };
    await upsertUserProfile(row);
    profile = userFromDb(row);
  }

  if (profile.suspended) {
    await supabase.auth.signOut();
    return err("ACCOUNT_SUSPENDED", "Your account has been suspended. Please contact support.");
  }

  setCurrentUserInternal(profile);
  return ok({ user: profile });
}

/** Google OAuth — creates/updates Supabase-linked profile row. */
export async function loginWithGoogle(googleUser) {
  const { email, name, picture } = googleUser;
  const supabase = getSupabase();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return err("AUTH_REQUIRED", "Complete Google sign-in first.");
  }

  const existing = await fetchUserProfile(session.user.id);
  const now = new Date().toISOString();
  const row = {
    id: session.user.id,
    email: email ?? session.user.email,
    role: existing?.role ?? ROLES.consumer,
    name: name ?? existing?.name ?? "User",
    location: existing?.location ?? "",
    avatar_url: picture ?? existing?.avatarUrl ?? null,
    updated_at: now,
    created_at: existing?.createdAt ?? now,
  };

  await upsertUserProfile(row);
  const profile = userFromDb(row);
  setCurrentUserInternal(profile);
  return ok({ user: profile });
}

export function requireAuth() {
  if (!currentUser) return err("AUTH_REQUIRED", "Login required.");
  return ok({ user: currentUser });
}

export function watchSession() {
  const supabase = getSupabase();
  supabase.auth.onAuthStateChange(async (event) => {
    if (event === "SIGNED_OUT") {
      setCurrentUserInternal(null);
      return;
    }
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        setCurrentUserInternal(null);
        return;
      }
      const profile = await fetchUserProfile(session.user.id);
      setCurrentUserInternal(profile);
    }
  });
}
