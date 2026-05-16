import { MESSAGE_STATUS } from "../app/config.js";
import { emit } from "../app/events.js";
import { loadDb, withDb } from "../data/db.js";
import { validateInquiry } from "../data/validators.js";

function now() {
  return Date.now();
}

export function createInquiry(fromUserId, listingId, input) {
  const v = validateInquiry(input);
  if (!v.ok) {
    return { ok: false, error: { code: "VALIDATION_FAILED", message: "Fix the highlighted fields.", fieldErrors: v.fieldErrors } };
  }

  const db = loadDb();
  const listing = db.listings.find((l) => l.id === listingId);
  if (!listing) return { ok: false, error: { code: "NOT_FOUND", message: "Listing not found." } };
  if (listing.sellerId === fromUserId) return { ok: false, error: { code: "FORBIDDEN", message: "You can't message your own listing." } };
  if (listing.status === "archived") return { ok: false, error: { code: "NOT_FOUND", message: "Listing not found." } };

  const created = { message: null };
  withDb((db2) => {
    const t = now();
    const m = {
      id: `msg_${crypto.randomUUID?.() ?? `${t}_${Math.random().toString(16).slice(2)}`}`,
      listingId,
      fromUserId,
      toUserId: listing.sellerId,
      name: v.value.name,
      email: v.value.email,
      phone: v.value.phone,
      body: v.value.body,
      status: MESSAGE_STATUS.new,
      createdAt: t,
    };
    db2.messages.push(m);
    created.message = m;
    return db2;
  });

  emit("messages:changed", { reason: "created" });
  return { ok: true, data: created.message };
}

export function listInquiriesForSeller(sellerId, opts = {}) {
  const db = loadDb();
  const items = db.messages
    .filter((m) => m.toUserId === sellerId)
    .filter((m) => (opts.includeArchived ? true : m.status !== MESSAGE_STATUS.archived))
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
  return { ok: true, data: items };
}

export function markMessageRead(messageId) {
  const updated = { message: null };
  withDb((db) => {
    const m = db.messages.find((x) => x.id === messageId);
    if (!m) return db;
    if (m.status !== MESSAGE_STATUS.archived) m.status = MESSAGE_STATUS.read;
    updated.message = m;
    return db;
  });
  if (!updated.message) return { ok: false, error: { code: "NOT_FOUND", message: "Message not found." } };
  emit("messages:changed", { reason: "statusChanged" });
  return { ok: true, data: updated.message };
}

export function archiveMessage(messageId) {
  const updated = { message: null };
  withDb((db) => {
    const m = db.messages.find((x) => x.id === messageId);
    if (!m) return db;
    m.status = MESSAGE_STATUS.archived;
    updated.message = m;
    return db;
  });
  if (!updated.message) return { ok: false, error: { code: "NOT_FOUND", message: "Message not found." } };
  emit("messages:changed", { reason: "statusChanged" });
  return { ok: true, data: updated.message };
}

