import { getSupabase } from "../lib/supabase.js";
import { invalidateCache } from "../lib/cache.js";
import { validateReviewInput } from "../data/validators.js";
import { t } from "../app/i18n.js";

const LISTINGS_CACHE_PREFIX = "listings:";

function err(code, message, fieldErrors) {
  return { ok: false, error: { code, message, fieldErrors } };
}

function ok(data) {
  return { ok: true, data };
}

function reviewFromDb(row) {
  if (!row) return null;
  return {
    id: row.id,
    listingId: row.listing_id,
    userId: row.user_id,
    deliveryRating: Number(row.delivery_rating),
    qualityRating: Number(row.quality_rating),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getRatingsForListings(listingIds) {
  if (!listingIds.length) return ok({});

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("listing_reviews")
    .select("listing_id, delivery_rating, quality_rating")
    .in("listing_id", listingIds);

  if (error) return err("DB_ERROR", error.message);

  /** @type {Record<string, { delivery: number[], quality: number[] }>} */
  const map = {};
  for (const row of data ?? []) {
    const id = row.listing_id;
    if (!map[id]) map[id] = { delivery: [], quality: [] };
    map[id].delivery.push(Number(row.delivery_rating));
    map[id].quality.push(Number(row.quality_rating));
  }

  return ok(map);
}

export async function getUserReviewForListing(listingId, userId) {
  if (!listingId || !userId) return ok(null);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("listing_reviews")
    .select("*")
    .eq("listing_id", listingId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return err("DB_ERROR", error.message);
  return ok(reviewFromDb(data));
}

export async function submitListingReview(input, userId) {
  const v = validateReviewInput(input);
  if (!v.ok) {
    return err(
      "VALIDATION_FAILED",
      t("service.fixHighlighted", { default: "Fix the highlighted fields." }),
      v.fieldErrors,
    );
  }

  const { listingId, deliveryRating, qualityRating } = v.value;
  const supabase = getSupabase();

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .select("id, seller_id, status")
    .eq("id", listingId)
    .maybeSingle();

  if (listingError || !listing) return err("NOT_FOUND", t("product.notFoundDesc"));
  if (listing.seller_id === userId) {
    return err("FORBIDDEN", t("review.cannotReviewOwn"));
  }
  if (listing.status !== "active") {
    return err("FORBIDDEN", t("review.listingNotActive"));
  }

  const { data: existing } = await supabase
    .from("listing_reviews")
    .select("id")
    .eq("listing_id", listingId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    return err("CONFLICT", t("review.alreadyReviewed"));
  }

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("listing_reviews")
    .insert({
      listing_id: listingId,
      user_id: userId,
      delivery_rating: deliveryRating,
      quality_rating: qualityRating,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return err("CONFLICT", t("review.alreadyReviewed"));
    }
    return err("DB_ERROR", error.message);
  }

  invalidateCache(LISTINGS_CACHE_PREFIX);
  return ok(reviewFromDb(data));
}
