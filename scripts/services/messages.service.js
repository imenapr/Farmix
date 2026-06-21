import { getSupabase } from "../lib/supabase.js";
import { keysToCamel } from "../lib/transform.js";
import { validateInquiry } from "../data/validators.js";
import { getListingById } from "./listings.service.js";
import { getUserById } from "./users.service.js";
import { createNotification } from "./notifications.service.js";
import { emit } from "../app/events.js";
import { t } from "../app/i18n.js";

function err(code, message, fieldErrors) {
  return { ok: false, error: { code, message, fieldErrors } };
}

function ok(data) {
  return { ok: true, data };
}

/** Stable conversation key for a (listing, userA, userB) triple. */
function conversationKey(listingId, a, b) {
  const [x, y] = [a, b].sort();
  return `${listingId ?? "none"}:${x}:${y}`;
}

export async function createInquiry(fromUserId, listingId, input) {
  const v = validateInquiry(input);
  if (!v.ok) return err("VALIDATION_FAILED", t("service.fixHighlighted", { default: "Fix the highlighted fields." }), v.fieldErrors);

  const listingRes = await getListingById(listingId);
  if (!listingRes.ok) return err("NOT_FOUND", t("product.notFoundTitle"));

  const listing = listingRes.data;
  if (listing.sellerId === fromUserId) {
    return err("FORBIDDEN", t("service.noSelfInquiry", { default: "You cannot send an inquiry on your own listing." }));
  }

  const profileRes = await getUserById(fromUserId);
  if (!profileRes.ok) return err("AUTH_REQUIRED", t("service.completeProfileFirst", { default: "Complete your profile before sending inquiries." }));

  const profile = profileRes.data;
  const name = profile.name || profile.email?.split("@")[0] || "User";
  const email = profile.email || "";
  const phone = profile.phone || null;

  const supabase = getSupabase();
  const now = new Date().toISOString();
  const { body } = v.value;

  const { data, error } = await supabase
    .from("messages")
    .insert({
      sender_id: fromUserId,
      recipient_id: listing.sellerId,
      listing_id: listingId,
      content: body,
      metadata: { name, email, phone: phone ?? null, listingTitle: listing.title },
      created_at: now,
    })
    .select()
    .single();

  if (error) return err("DB_ERROR", error.message);

  await createNotification({
    userId: listing.sellerId,
    type: "message",
    title: t("service.newInquiry", { default: "New inquiry" }),
    message: t("service.newInquiryMessage", {
      default: `${name || "Someone"} sent an inquiry about "${listing.title}".`,
      name: name || "Someone",
      title: listing.title,
    }),
    metadata: { listingId, fromUserId, messageId: data.id },
  });

  emit("messages:changed", { userId: listing.sellerId });
  return ok(keysToCamel(data));
}

/** Send a direct message (used for replies inside a conversation). */
export async function sendMessage(fromUserId, toUserId, listingId, body) {
  const content = String(body ?? "").trim();
  if (content.length < 1) return err("VALIDATION_FAILED", t("service.messageEmpty", { default: "Message cannot be empty." }));
  if (content.length > 1000) return err("VALIDATION_FAILED", t("service.messageTooLong", { default: "Message is too long (max 1000)." }));
  if (fromUserId === toUserId) return err("FORBIDDEN", t("service.noSelfMessage", { default: "You cannot message yourself." }));

  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("messages")
    .insert({
      sender_id: fromUserId,
      recipient_id: toUserId,
      listing_id: listingId ?? null,
      content,
      created_at: now,
    })
    .select()
    .single();

  if (error) return err("DB_ERROR", error.message);

  await createNotification({
    userId: toUserId,
    type: "message",
    title: t("service.newMessage", { default: "New message" }),
    message: content.length > 80 ? `${content.slice(0, 77)}...` : content,
    metadata: { listingId: listingId ?? null, fromUserId, messageId: data.id },
  });

  emit("messages:changed", { userId: toUserId });
  return ok(keysToCamel(data));
}

/** All messages where the user is sender or recipient, newest first. */
async function fetchUserMessages(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  if (error) return { error };
  return { rows: (data ?? []).map(keysToCamel) };
}

/**
 * Group the user's messages into conversations keyed by (listing + other user).
 * Returns one summary per conversation with the latest message + unread count.
 */
export async function listConversations(userId) {
  const { rows, error } = await fetchUserMessages(userId);
  if (error) return err("DB_ERROR", error.message);

  const byKey = new Map();
  for (const m of rows) {
    const otherId = m.senderId === userId ? m.recipientId : m.senderId;
    const key = conversationKey(m.listingId, userId, otherId);
    let convo = byKey.get(key);
    if (!convo) {
      convo = {
        key,
        otherUserId: otherId,
        listingId: m.listingId ?? null,
        listingTitle: m.metadata?.listingTitle ?? null,
        lastMessage: m.content,
        lastAt: m.createdAt,
        unread: 0,
      };
      byKey.set(key, convo);
    }
    // Unread = messages addressed to me that I haven't read yet.
    if (m.recipientId === userId && !m.readAt) convo.unread += 1;
  }

  const conversations = [...byKey.values()];

  // Resolve display names for the other participants.
  const otherIds = [...new Set(conversations.map((c) => c.otherUserId))];
  if (otherIds.length) {
    const supabase = getSupabase();
    const { data: users } = await supabase.from("users").select("id,name").in("id", otherIds);
    const map = Object.fromEntries((users ?? []).map((u) => [u.id, u]));
    for (const c of conversations) {
      c.otherUserName = map[c.otherUserId]?.name ?? t("common.unknownUser");
    }
  }

  conversations.sort((a, b) => new Date(b.lastAt) - new Date(a.lastAt));
  return ok(conversations);
}

/** Full thread between the user and another participant for a given listing. */
export async function getConversation(userId, otherUserId, listingId) {
  const supabase = getSupabase();
  let query = supabase
    .from("messages")
    .select("*")
    .or(
      `and(sender_id.eq.${userId},recipient_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},recipient_id.eq.${userId})`
    )
    .order("created_at", { ascending: true });

  if (listingId) query = query.eq("listing_id", listingId);
  else query = query.is("listing_id", null);

  const { data, error } = await query;
  if (error) return err("DB_ERROR", error.message);
  return ok((data ?? []).map(keysToCamel));
}

/** Mark every message in a thread that's addressed to the user as read. */
export async function markConversationRead(userId, otherUserId, listingId) {
  const supabase = getSupabase();
  let query = supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .eq("sender_id", otherUserId)
    .is("read_at", null);

  if (listingId) query = query.eq("listing_id", listingId);

  const { error } = await query;
  if (error) return err("DB_ERROR", error.message);

  emit("messages:changed", { userId });
  return ok(null);
}

export async function listInquiriesForSeller(sellerId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("recipient_id", sellerId)
    .order("created_at", { ascending: false });

  if (error) return err("DB_ERROR", error.message);
  return ok((data ?? []).map(keysToCamel));
}
