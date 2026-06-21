import { getSupabase } from "../lib/supabase.js";
import { userFromDb } from "../lib/transform.js";
import { invalidateCache } from "../lib/cache.js";
import { emit } from "../app/events.js";
import { validateAvatarFile } from "../data/validators.js";
import { t } from "../app/i18n.js";

const BUCKET = "avatars";
const USER_CACHE_PREFIX = "users:id:";

function err(code, message, fieldErrors) {
  return { ok: false, error: { code, message, fieldErrors } };
}

function ok(data) {
  return { ok: true, data };
}

const EXT_BY_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function uploadUserAvatar(userId, file) {
  const validation = validateAvatarFile(file);
  if (!validation.ok) {
    return err(
      "VALIDATION_FAILED",
      t("account.avatarInvalid", { default: "Choose a valid image file." }),
      validation.fieldErrors,
    );
  }

  const ext = EXT_BY_TYPE[file.type];
  const path = `${userId}/avatar.${ext}`;

  const supabase = getSupabase();
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "3600",
  });

  if (uploadError) {
    return err("UPLOAD_FAILED", uploadError.message ?? t("account.avatarUploadFailed", { default: "Could not upload photo." }));
  }

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  const avatarUrl = `${urlData.publicUrl}?v=${Date.now()}`;

  const { data, error } = await supabase
    .from("users")
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single();

  if (error || !data) {
    return err("DB_ERROR", error?.message ?? t("account.avatarSaveFailed", { default: "Photo uploaded but profile update failed." }));
  }

  invalidateCache(`${USER_CACHE_PREFIX}${userId}`);
  const user = userFromDb(data);
  emit("profile:updated", { user });
  return ok(user);
}
