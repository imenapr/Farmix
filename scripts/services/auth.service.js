import { STORAGE_KEYS } from "../app/config.js";
import { emit } from "../app/events.js";
import { getSupabase } from "../lib/supabase.js";
import { userFromDb } from "../lib/transform.js";
import { validateLogin, validateSignup, validateForgotPassword, validateResetPassword, validateCompleteProfile } from "../data/validators.js";
import { authEmailFromPhone } from "../lib/auth-email.js";
import { createNotification } from "./notifications.service.js";
import { findEmailByPhone } from "./users.service.js";
import { ROLES } from "../app/config.js";
import { getCurrentLang, t } from "../app/i18n.js";

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

async function upsertUserProfile(row) {
  const supabase = getSupabase();
  const { error } = await supabase.from("users").upsert(row, { onConflict: "id" });
  return !error;
}

async function insertUserProfile(row) {
  const supabase = getSupabase();
  const { error } = await supabase.from("users").insert(row);
  if (!error) return { ok: true, duplicate: false };
  if (error.code === "23505") return { ok: true, duplicate: true };
  return { ok: false, duplicate: false };
}

function googleOAuthRedirectTo(relativePath = "/index.html") {
  if (typeof window !== "undefined" && window.location?.origin) {
    const path = String(relativePath || "/index.html").startsWith("/")
      ? relativePath
      : `/${relativePath}`;
    return `${window.location.origin}${path}`;
  }
  return undefined;
}

function isGoogleAuthUser(authUser) {
  return (
    authUser?.app_metadata?.provider === "google" ||
    authUser?.identities?.some((i) => i.provider === "google")
  );
}

function authUserNeedsProfileCompletion(authUser, profile) {
  if (!authUser) return false;
  if (needsRoleSelection(authUser)) return true;
  if (!isGoogleAuthUser(authUser)) return false;
  return !String(profile?.phone ?? "").trim();
}

async function redirectToCompleteProfileIfNeeded(authUser, profile = null) {
  if (typeof window === "undefined" || !authUser) return;
  if (window.location.pathname.includes("complete-profile.html")) return;

  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user ?? authUser;
  const resolvedProfile = profile ?? (await fetchUserProfile(user.id));

  if (!authUserNeedsProfileCompletion(user, resolvedProfile)) return;
  window.location.replace("/pages/complete-profile.html");
}

function oauthParamsFromUrl() {
  if (typeof window === "undefined") return { search: new URLSearchParams(), hash: new URLSearchParams() };
  const search = new URLSearchParams(window.location.search);
  const hash = window.location.hash?.startsWith("#")
    ? new URLSearchParams(window.location.hash.slice(1))
    : new URLSearchParams();
  return { search, hash };
}

function consumeOAuthUrlError() {
  if (typeof window === "undefined") return null;
  const { search, hash } = oauthParamsFromUrl();
  const description =
    search.get("error_description") ||
    hash.get("error_description") ||
    search.get("error") ||
    hash.get("error");
  if (!description) return null;

  const normalized = String(description).toLowerCase();
  if (normalized.includes("access_denied") || normalized.includes("cancel")) {
    return t("auth.google.cancelled", { default: "Google sign-in was cancelled." });
  }
  return t("auth.google.failed", { default: "Could not sign in with Google. Try again." });
}

function cleanOAuthUrl() {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  const oauthKeys = ["code", "error", "error_description", "access_token", "refresh_token", "type"];
  let dirty = false;

  for (const key of oauthKeys) {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      dirty = true;
    }
  }

  if (url.hash && (url.hash.includes("access_token") || url.hash.includes("error"))) {
    url.hash = "";
    dirty = true;
  }

  if (dirty) {
    window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash}`);
  }
}

function needsRoleSelection(authUser) {
  return authUser?.user_metadata?.pending_role_selection === true;
}

function displayNameFromAuthUser(authUser) {
  const meta = authUser.user_metadata ?? {};
  return (
    meta.full_name ||
    meta.name ||
    authUser.email?.split("@")[0] ||
    "User"
  );
}

function avatarUrlFromAuthUser(authUser) {
  const meta = authUser.user_metadata ?? {};
  return meta.avatar_url || meta.picture || null;
}

async function ensureProfileForAuthUser(authUser) {
  const existing = await fetchUserProfile(authUser.id);
  if (existing) return { profile: existing, created: false };

  const now = new Date().toISOString();
  const profileRow = {
    id: authUser.id,
    email: authUser.email ?? "",
    name: displayNameFromAuthUser(authUser),
    role: ROLES.consumer,
    location: "",
    avatar_url: avatarUrlFromAuthUser(authUser),
    created_at: now,
    updated_at: now,
  };

  const inserted = await insertUserProfile(profileRow);
  if (!inserted.ok) {
    emit("toast", {
      type: "error",
      message: t("service.profileSaveFailed", {
        default: "Account created but profile save failed. Try logging in.",
      }),
    });
    return { profile: null, created: false, error: true };
  }

  if (inserted.duplicate) {
    const profile = await fetchUserProfile(authUser.id);
    return { profile, created: false };
  }

  const supabase = getSupabase();
  const { error: metaError } = await supabase.auth.updateUser({
    data: { pending_role_selection: true },
  });
  if (!metaError) {
    await supabase.auth.refreshSession();
  }

  return { profile: userFromDb(profileRow), created: true };
}

async function resolveAuthenticatedUser(session) {
  const authUser = session?.user;
  if (!authUser?.id) {
    setCurrentUserInternal(null);
    return null;
  }

  if (authUser.app_metadata?.provider === "google" || authUser.identities?.some((i) => i.provider === "google")) {
    const result = await ensureProfileForAuthUser(authUser);
    if (result.error) {
      setCurrentUserInternal(null);
      return null;
    }
    if (result.profile?.suspended) {
      await getSupabase().auth.signOut();
      setCurrentUserInternal(null);
      return null;
    }
    setCurrentUserInternal(result.profile);
    if (result.created) {
      emit("toast", {
        type: "success",
        message: t("auth.google.welcome", {
          name: result.profile.name,
          default: `Welcome, ${result.profile.name}!`,
        }),
      });
    }
    await redirectToCompleteProfileIfNeeded(authUser, result.profile);
    return result.profile;
  }

  const cachedProfile = getCachedProfile(authUser.id);
  if (cachedProfile) {
    currentUser = cachedProfile;
    emit("auth:changed", { user: currentUser });
    return cachedProfile;
  }

  const profile = await fetchUserProfile(authUser.id);
  setCurrentUserInternal(profile);
  return profile;
}

async function signInWithGoogleOAuth(redirectPath = "/index.html") {
  const redirectTo = googleOAuthRedirectTo(redirectPath);
  if (!redirectTo) {
    return err(
      "AUTH_ERROR",
      t("auth.google.unavailable", { default: "Google sign-in is unavailable here." }),
    );
  }

  const supabase = getSupabase();
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      return err(
        "AUTH_ERROR",
        t("auth.google.failed", { default: "Could not sign in with Google. Try again." }),
      );
    }

    return ok(null);
  } catch {
    return err(
      "AUTH_ERROR",
      t("auth.google.failed", { default: "Could not sign in with Google. Try again." }),
    );
  }
}

export async function loginWithGoogle() {
  return signInWithGoogleOAuth("/index.html");
}

export async function signupWithGoogle() {
  return signInWithGoogleOAuth("/pages/complete-profile.html");
}

export async function completeOAuthRole(input) {
  const v = validateCompleteProfile(input);
  if (!v.ok) {
    return err(
      "VALIDATION_FAILED",
      t("service.fixHighlighted", { default: "Fix the highlighted fields." }),
      v.fieldErrors,
    );
  }

  const { role, phone, farmName, companyName } = v.value;
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    return err("AUTH_REQUIRED", t("auth.completeProfile.signInRequired", { default: "Sign in to continue." }));
  }

  const existingProfile = await fetchUserProfile(session.user.id);
  if (!authUserNeedsProfileCompletion(session.user, existingProfile)) {
    if (existingProfile) {
      setCurrentUserInternal(existingProfile);
      return ok({ user: existingProfile, alreadyComplete: true });
    }
  }

  const { data: existingPhone } = await supabase
    .from("users")
    .select("id")
    .eq("phone", phone)
    .neq("id", session.user.id)
    .maybeSingle();
  if (existingPhone) {
    return err(
      "CONFLICT",
      t("service.phoneExists", { default: "An account with this phone number already exists." }),
      { phone: t("service.phoneExists", { default: "An account with this phone number already exists." }) },
    );
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("users")
    .update({
      role,
      phone,
      farm_name: farmName || null,
      company_name: companyName || null,
      updated_at: now,
    })
    .eq("id", session.user.id)
    .select()
    .single();

  if (error || !data) {
    return err(
      "DB_ERROR",
      t("auth.completeProfile.failed", { default: "Could not save your profile. Try again." }),
    );
  }

  await supabase.auth.updateUser({
    data: { pending_role_selection: false, role },
  });
  await supabase.auth.refreshSession();

  const profile = userFromDb(data);
  setCurrentUserInternal(profile);

  if (role === ROLES.farmer) {
    const { data: admins } = await supabase.from("users").select("id").eq("role", ROLES.admin);
    for (const admin of admins ?? []) {
      createNotification({
        userId: admin.id,
        type: "system",
        title: t("service.newFarmer", { default: "New farmer registered" }),
        message: `New farmer registered: ${profile.name} (${profile.email ?? ""})`,
        metadata: {
          farmerId: session.user.id,
          farmerName: profile.name,
          farmerEmail: profile.email ?? null,
        },
      });
    }
  }

  return ok({ user: profile });
}

export async function userNeedsRoleSelection() {
  const supabase = getSupabase();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) return false;
  const profile = await fetchUserProfile(session.user.id);
  return authUserNeedsProfileCompletion(session.user, profile);
}

let authSessionReady = false;

// ─── Session init (Supabase authoritative) ───────────────────────────────────
export async function initAuthSession() {
  const supabase = getSupabase();

  try {
    const oauthErrorMessage = consumeOAuthUrlError();
    if (oauthErrorMessage) {
      emit("toast", { type: "error", message: oauthErrorMessage });
      cleanOAuthUrl();
      setCurrentUserInternal(null);
      authSessionReady = true;
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user?.id) {
      setCurrentUserInternal(null);
      cleanOAuthUrl();
      authSessionReady = true;
      return;
    }

    await resolveAuthenticatedUser(session);
    cleanOAuthUrl();
    authSessionReady = true;
    return;
  } catch {
    setCurrentUserInternal(null);
    authSessionReady = true;
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

  const { data: existingPhone } = await supabase.from("users").select("id").eq("phone", phone).maybeSingle();
  if (existingPhone) {
    return err("CONFLICT", t("service.phoneExists", { default: "An account with this phone number already exists." }));
  }

  const authEmail = email ?? authEmailFromPhone(phone);
  const { data: signData, error: signError } = await supabase.auth.signUp({
    email: authEmail,
    password,
    options: { data: { name, role, location, phone } },
  });

  if (signError) {
    if (signError.message?.toLowerCase().includes("already registered")) {
      const { data: existingProfile } = await supabase
        .from("users")
        .select("id")
        .eq("email", authEmail)
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
    email: authEmail,
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
        message: `New farmer registered: ${name} (${email ?? phone})`,
        metadata: { farmerId: authUser.id, farmerName: name, farmerEmail: email ?? null, farmerPhone: phone },
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

function passwordResetRedirectUrl(lang) {
  const resolved = lang === "ka" ? "ka" : "en";
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}/pages/reset-password.html?lang=${resolved}`;
  }
  return undefined;
}

/**
 * Sends a password reset email using the user's current UI language.
 * redirectTo includes ?lang=en|ka so Supabase email templates can branch on
 * {{ .RedirectTo }} and the reset page opens in the same language.
 */
export async function sendPasswordResetEmail(email) {
  const lang = getCurrentLang();
  const supabase = getSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(String(email).trim(), {
    redirectTo: passwordResetRedirectUrl(lang),
  });

  if (error) {
    return err("AUTH_ERROR", error.message || t("auth.forgot.failed"));
  }

  return ok(null);
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

  return sendPasswordResetEmail(v.value);
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

export function watchSession() {
  const supabase = getSupabase();
  supabase.auth.onAuthStateChange(async (event, nextSession) => {
    if (event === "SIGNED_OUT") {
      setCurrentUserInternal(null);
      return;
    }
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
      if (event === "INITIAL_SESSION" && authSessionReady) return;
      if (!nextSession?.user?.id) {
        setCurrentUserInternal(null);
        return;
      }
      await resolveAuthenticatedUser(nextSession);
      return;
    }
    if (event === "USER_UPDATED") {
      if (!nextSession?.user?.id) {
        setCurrentUserInternal(null);
        return;
      }
      const profile = await fetchUserProfile(nextSession.user.id);
      setCurrentUserInternal(profile);
    }
  });
}
