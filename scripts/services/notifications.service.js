import { getSupabase } from "../lib/supabase.js";
import { keysToCamel } from "../lib/transform.js";
import { emit } from "../app/events.js";

/** @type {Map<string, { items: unknown[], unread: number, fetchedAt: number }>} */
const notifyCache = new Map();
const CACHE_TTL = 30_000;

function err(code, message) {
  return { ok: false, error: { code, message } };
}

function ok(data) {
  return { ok: true, data };
}

function cacheKey(userId) {
  return `notify:${userId}`;
}

function invalidateNotifyCache(userId) {
  notifyCache.delete(cacheKey(userId));
}

export async function createNotification({ userId, type, title, message, metadata = {} }) {
  const supabase = getSupabase();
  const { error } = await supabase.from("notifications").insert({
    user_id: userId,
    type,
    title: title ?? type,
    message,
    metadata,
    created_at: new Date().toISOString(),
  });

  if (error) return err("DB_ERROR", error.message);
  invalidateNotifyCache(userId);
  emit("notifications:changed", { userId });
  return ok({ userId });
}

export async function getNotificationsForUser(userId, { limit = 20 } = {}) {
  const key = cacheKey(userId);
  const cached = notifyCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return ok(cached.items.slice(0, limit));
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return err("DB_ERROR", error.message);

  const items = (data ?? []).map((n) => {
    const row = keysToCamel(n);
    return { ...row, read: Boolean(row.readAt), createdAt: new Date(row.createdAt).getTime() };
  });

  const unread = await fetchUnreadCount(userId);
  notifyCache.set(key, { items, unread, fetchedAt: Date.now() });
  return ok(items);
}

async function fetchUnreadCount(userId) {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) return 0;
  return count ?? 0;
}

/** Sync read from short-lived cache (navbar badge). Returns 0 while loading. */
export function getUnreadCount(userId) {
  const cached = notifyCache.get(cacheKey(userId));
  return cached?.unread ?? 0;
}

/** Prime notification cache for navbar — call after auth init. */
export async function primeNotificationCache(userId) {
  if (primeNotificationCache._primed?.has(userId)) return;
  if (!primeNotificationCache._primed) primeNotificationCache._primed = new Set();
  primeNotificationCache._primed.add(userId);
  await getNotificationsForUser(userId);
}

export async function markNotificationRead(notificationId, userId) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId);

  if (error) return err("DB_ERROR", error.message);
  if (userId) invalidateNotifyCache(userId);
  emit("notifications:changed", { userId });
  return ok(null);
}

export async function markAllRead(userId) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) return err("DB_ERROR", error.message);
  invalidateNotifyCache(userId);
  emit("notifications:changed", { userId });
  return ok(null);
}
