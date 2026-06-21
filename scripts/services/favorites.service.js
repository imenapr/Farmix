import { getSupabase } from "../lib/supabase.js";
import { listingFromDb } from "../lib/transform.js";
import { getRatingsForListings } from "./reviews.service.js";
import { t } from "../app/i18n.js";

function err(code, message) {
  return { ok: false, error: { code, message } };
}

function ok(data) {
  return { ok: true, data };
}

function favoriteFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    listingId: row.listing_id,
    createdAt: row.created_at,
  };
}

async function attachSellerNames(listings) {
  if (!listings.length) return listings;
  const supabase = getSupabase();
  const sellerIds = [...new Set(listings.map((l) => l.sellerId))];
  const { data: sellers } = await supabase.from("users").select("id,name").in("id", sellerIds);
  const map = Object.fromEntries((sellers ?? []).map((s) => [s.id, s]));
  return listings.map((l) => ({
    ...l,
    sellerName: map[l.sellerId]?.name,
  }));
}

async function attachRatings(listings) {
  if (!listings.length) return listings;
  const res = await getRatingsForListings(listings.map((l) => l.id));
  if (!res.ok) return listings;
  return listings.map((l) => ({
    ...l,
    ratings: res.data[l.id] ?? undefined,
  }));
}

export async function isListingFavorited(listingId, userId) {
  if (!listingId || !userId) return ok(false);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("favorites")
    .select("id")
    .eq("user_id", userId)
    .eq("listing_id", listingId)
    .maybeSingle();

  if (error) return err("DB_ERROR", error.message);
  return ok(Boolean(data));
}

export async function addFavorite(userId, listingId) {
  if (!userId || !listingId) {
    return err("VALIDATION_FAILED", t("favorites.failed"));
  }

  const supabase = getSupabase();
  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id")
    .eq("id", listingId)
    .maybeSingle();

  if (listingError || !listing) return err("NOT_FOUND", t("product.notFoundDesc"));

  const { data, error } = await supabase
    .from("favorites")
    .insert({ user_id: userId, listing_id: listingId })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return ok(favoriteFromDb({ id: "existing", user_id: userId, listing_id: listingId }));
    return err("DB_ERROR", error.message);
  }

  return ok(favoriteFromDb(data));
}

export async function removeFavorite(userId, listingId) {
  if (!userId || !listingId) {
    return err("VALIDATION_FAILED", t("favorites.failed"));
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", userId)
    .eq("listing_id", listingId);

  if (error) return err("DB_ERROR", error.message);
  return ok(null);
}

export async function toggleFavorite(userId, listingId, currentlyFavorited) {
  if (currentlyFavorited) {
    const res = await removeFavorite(userId, listingId);
    if (!res.ok) return res;
    return ok({ favorited: false });
  }

  const res = await addFavorite(userId, listingId);
  if (!res.ok) return res;
  return ok({ favorited: true });
}

export async function listFavoritesForUser(userId) {
  if (!userId) return err("AUTH_REQUIRED", t("common.loginRequired"));

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("favorites")
    .select("id, listing_id, created_at, listings(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) return err("DB_ERROR", error.message);

  let listings = (data ?? [])
    .map((row) => listingFromDb(row.listings))
    .filter(Boolean);

  if (listings.length) {
    listings = await attachSellerNames(listings);
    listings = await attachRatings(listings);
  }

  return ok(listings);
}
