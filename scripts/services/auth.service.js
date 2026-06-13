import { STORAGE_KEYS } from "../app/config.js";
import { emit } from "../app/events.js";
import { getSupabase } from "../lib/supabase.js";
import { userFromDb } from "../lib/transform.js";
import { validateLogin, validateSignup, validateForgotPassword, validateResetPassword } from "../data/validators.js";
import { createNotification } from "./notifications.service.js";
import { findEmailByPhone } from "./users.service.js";
import { ROLES } from "../app/config.js";
import { t } from "../app/i18n.js";

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
  if (!v.ok) return err("VALIDATION_FAILED", t("service.fixHighlighted", { default: "Fix the highlighted fields." }), v.fieldErrors);

  const { email, password, role, name, location, phone, farmName, companyName } = v.value;
  if (![ROLES.farmer, ROLES.business, ROLES.consumer].includes(role)) {
    return err("VALIDATION_FAILED", t("service.roleInvalid", { default: "Select a valid role." }));
  }

  const supabase = getSupabase();
  const { data: signData, error: signError } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, role, location, phone } },
  });

  if (signError) {
    if (signError.message?.toLowerCase().includes("already registered")) {
      const { data: existingProfile } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (!existingProfile) {
        return err(
          "CONFLICT",
          t("service.emailAuthOrphan", {
            default:
              "This email still has an auth account, but the profile was deleted. Try logging in instead — your profile will be recreated. To sign up fresh, delete the user under Supabase Authentication → Users.",
          }),
        );
      }

      return err("CONFLICT", t("service.emailExists", { default: "An account with this email already exists." }));
    }
    return err("AUTH_ERROR", signError.message);
  }

  const authUser = signData.user;
  if (!authUser?.id) return err("AUTH_ERROR", t("service.createAccountFailed", { default: "Failed to create account." }));

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
  if (!saved) return err("DB_ERROR", t("service.profileSaveFailed", { default: "Account created but profile save failed. Try logging in." }));

  const userPublic = userFromDb(profileRow);
  setCurrentUserInternal(userPublic);

  if (role === ROLES.farmer) {
    const { data: admins } = await supabase.from("users").select("id").eq("role", ROLES.admin);
    for (const admin of admins ?? []) {
      createNotification({
        userId: admin.id,
        type: "system",
        title: t("service.newFarmer", { default: "New farmer registered" }),
        message: `New farmer registered: ${name} (${email})`,
        metadata: { farmerId: authUser.id, farmerName: name, farmerEmail: email },
      });
    }
  }

  return ok({ user: userPublic });
}

export async function login(input) {
  const v = validateLogin(input);
  if (!v.ok) return err("VALIDATION_FAILED", t("service.fixHighlighted", { default: "Fix the highlighted fields." }), v.fieldErrors);

  const { email: identifier, password, isPhoneLogin } = v.value;
  const supabase = getSupabase();

  let email = identifier;
  if (isPhoneLogin) {
    const lookup = await findEmailByPhone(identifier);
    if (!lookup.ok) return err("AUTH_FAILED", t("service.phoneNotFound", { default: "No account found for this phone number." }));
    email = lookup.data.email;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.user?.id) {
    return err("AUTH_FAILED", t("service.invalidCredentials", { default: "Invalid email or password." }));
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
    return err("ACCOUNT_SUSPENDED", t("service.accountSuspended", { default: "Your account has been suspended. Please contact support." }));
  }

  setCurrentUserInternal(profile);
  return ok({ user: profile });
}

function passwordResetRedirectUrl() {
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/pages/reset-password.html`;
  }
  return undefined;
}

export async function requestPasswordReset(input) {
  const v = validateForgotPassword(input);
  if (!v.ok) {
    return err(
      "VALIDATION_FAILED",
      t("service.fixHighlighted", { default: "Fix the highlighted fields." }),
      v.fieldErrors,
    );
  }

  const supabase = getSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(v.value, {
    redirectTo: passwordResetRedirectUrl(),
  });

  if (error) {
    return err("AUTH_ERROR", error.message || t("auth.forgot.failed"));
  }

  return ok(null);
}

export async function completePasswordReset(input) {
  const v = validateResetPassword(input);
  if (!v.ok) {
    return err(
      "VALIDATION_FAILED",
      t("service.fixHighlighted", { default: "Fix the highlighted fields." }),
      v.fieldErrors,
    );
  }

  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return err("AUTH_REQUIRED", t("auth.reset.invalidLink"));
  }

  const { error } = await supabase.auth.updateUser({ password: v.value });
  if (error) {
    return err("AUTH_ERROR", error.message || t("auth.reset.failed"));
  }

  return ok(null);
}

export async function waitForRecoverySession(timeoutMs = 4000) {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return ok({ ready: true });

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      subscription.unsubscribe();
      clearTimeout(timer);
      resolve(result);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && nextSession) {
        finish(ok({ ready: true }));
      }
    });

    const timer = setTimeout(() => {
      finish(err("AUTH_REQUIRED", t("auth.reset.invalidLink")));
    }, timeoutMs);
  });
}

export function requireAuth() {
  if (!currentUser) return err("AUTH_REQUIRED", t("common.loginRequired"));
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
