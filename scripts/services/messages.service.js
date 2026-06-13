import { getSupabase } from "../lib/supabase.js";
import { keysToCamel } from "../lib/transform.js";
import { validateInquiry } from "../data/validators.js";
import { getListingById } from "./listings.service.js";

function err(code, message, fieldErrors) {
  return { ok: false, error: { code, message, fieldErrors } };
}

function ok(data) {
  return { ok: true, data };
}

export async function createInquiry(fromUserId, listingId, input) {
  const v = validateInquiry(input);
  if (!v.ok) return err("VALIDATION_FAILED", "Fix the highlighted fields.", v.fieldErrors);

  const listingRes = await getListingById(listingId);
  if (!listingRes.ok) return err("NOT_FOUND", "Listing not found.");

  const listing = listingRes.data;
  if (listing.sellerId === fromUserId) {
    return err("FORBIDDEN", "You cannot send an inquiry on your own listing.");
  }

  const supabase = getSupabase();
  const now = new Date().toISOString();
  const { name, email, phone, body } = v.value;

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
  return ok(keysToCamel(data));
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

export async function markMessageRead(actorId, messageId) {
  const supabase = getSupabase();
  const { data: msg, error: fetchErr } = await supabase
    .from("messages")
    .select("recipient_id")
    .eq("id", messageId)
    .maybeSingle();

  if (fetchErr || !msg) return err("NOT_FOUND", "Message not found.");
  if (msg.recipient_id !== actorId) return err("FORBIDDEN", "Not allowed.");

  const { data, error } = await supabase
    .from("messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", messageId)
    .select()
    .single();

  if (error) return err("DB_ERROR", error.message);
  return ok(keysToCamel(data));
}
