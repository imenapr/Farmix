import { getSupabase } from "../lib/supabase.js";
import { userFromDb, keysToSnake } from "../lib/transform.js";
import { validateProfileUpdate } from "../data/validators.js";
import { invalidateCache } from "../lib/cache.js";

function err(code, message, fieldErrors) {
  return { ok: false, error: { code, message, fieldErrors } };
}

function ok(data) {
  return { ok: true, data };
}

export async function getUserById(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("users").select("*").eq("id", userId).maybeSingle();
  if (error || !data) return err("NOT_FOUND", "User not found.");
  return ok(userFromDb(data));
}

/** Resolve auth email from a profile phone number (for phone-based login). */
export async function findEmailByPhone(phone) {
  const value = String(phone ?? "").trim();
  if (!value) return err("NOT_FOUND", "Phone number required.");

  const supabase = getSupabase();
  const { data, error } = await supabase.from("users").select("email").eq("phone", value).maybeSingle();
  if (error || !data?.email) return err("NOT_FOUND", "No account found for this phone number.");
  return ok({ email: data.email });
}

export async function updateProfile(userId, input) {
  const validation = validateProfileUpdate(input);
  if (!validation.ok) {
    return err("VALIDATION_FAILED", "Fix the highlighted fields.", validation.fieldErrors);
  }

  const snake = keysToSnake(validation.value);
  snake.updated_at = new Date().toISOString();

  const supabase = getSupabase();
  const { data, error } = await supabase.from("users").update(snake).eq("id", userId).select().single();
  if (error || !data) return err("DB_ERROR", error?.message ?? "Update failed.");

  invalidateCache("listings:");
  return ok(userFromDb(data));
}
