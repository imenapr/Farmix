import { loadDb, withDb } from "../data/db.js";
import { emit } from "../app/events.js";

function now() { return Date.now(); }

export function createNotification({ userId, type, message, metadata = {} }) {
  let created = null;
  withDb((db) => {
    if (!Array.isArray(db.notifications)) db.notifications = [];
    const n = {
      id: `notif_${now().toString(16)}_${Math.random().toString(16).slice(2)}`,
      userId,
      type,
      message,
      read: false,
      metadata,
      createdAt: now(),
    };
    db.notifications.push(n);
    created = n;
    return db;
  });
  if (created) emit("notifications:changed", { userId });
  return created;
}

export function getNotificationsForUser(userId, { limit = 20 } = {}) {
  const db = loadDb();
  const notifications = (db.notifications ?? [])
    .filter((n) => n.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
  return { ok: true, data: notifications };
}

export function getUnreadCount(userId) {
  const db = loadDb();
  return (db.notifications ?? []).filter((n) => n.userId === userId && !n.read).length;
}

export function markNotificationRead(notificationId) {
  let notifUserId = null;
  withDb((db) => {
    const n = (db.notifications ?? []).find((x) => x.id === notificationId);
    if (n && !n.read) { n.read = true; notifUserId = n.userId; }
    return db;
  });
  if (notifUserId) emit("notifications:changed", { userId: notifUserId });
  return { ok: true };
}

export function markAllRead(userId) {
  withDb((db) => {
    (db.notifications ?? []).forEach((n) => {
      if (n.userId === userId) n.read = true;
    });
    return db;
  });
  emit("notifications:changed", { userId });
  return { ok: true };
}
