import { getSupabase } from "../lib/supabase.js";
import { getListingById } from "./listings.service.js";
import { getCurrentUser } from "./auth.service.js";
import { keysToCamel } from "../lib/transform.js";
import { invalidateCache } from "../lib/cache.js";

function err(code, message) {
  return { ok: false, error: { code, message } };
}

function ok(data) {
  return { ok: true, data };
}

export async function placeOrder(buyerId, listingId, quantity) {
  const user = getCurrentUser();
  if (!user || user.id !== buyerId) return err("AUTH_REQUIRED", "Login required.");

  const qty = Math.max(1, Math.floor(Number(quantity)));
  if (!Number.isFinite(qty)) return err("VALIDATION_FAILED", "Invalid quantity.");

  const listingRes = await getListingById(listingId);
  if (!listingRes.ok) return err("NOT_FOUND", "Listing not found.");

  const listing = listingRes.data;
  if (listing.status !== "active") return err("CONFLICT", "This listing is no longer available.");
  if (listing.sellerId === buyerId) return err("FORBIDDEN", "You cannot order your own listing.");
  if (qty > listing.quantityAvailable) {
    return err("VALIDATION_FAILED", `Only ${listing.quantityAvailable} available.`);
  }

  const totalPrice = Math.round(qty * listing.price * 100) / 100;
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("orders")
    .insert({
      listing_id: listingId,
      buyer_id: buyerId,
      seller_id: listing.sellerId,
      quantity: qty,
      price_per_unit: listing.price,
      total_price: totalPrice,
      status: "pending",
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) return err("DB_ERROR", error.message);

  const newQty = listing.quantityAvailable - qty;
  const listingUpdate = {
    quantity_available: newQty,
    updated_at: now,
    ...(newQty <= 0 ? { status: "sold" } : {}),
  };

  await supabase.from("listings").update(listingUpdate).eq("id", listingId);
  invalidateCache("listings:");

  const order = keysToCamel(data);
  order.title = listing.title;
  order.unit = listing.unit;
  return ok(order);
}

export async function listOrdersForUser(userId) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  if (error) return err("DB_ERROR", error.message);
  return ok((data ?? []).map(keysToCamel));
}
