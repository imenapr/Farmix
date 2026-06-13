import { getSupabase } from "../lib/supabase.js";
import { getCache, setCache, invalidateCache } from "../lib/cache.js";
import { listingFromDb, listingToDb } from "../lib/transform.js";
import { validateListingInput, validateMarketplaceFilters } from "../data/validators.js";
import { emit } from "../app/events.js";

const LISTINGS_CACHE_PREFIX = "listings:";
const LISTING_TTL = 60_000;
const SEARCH_TTL = 45_000;

function err(code, message, fieldErrors) {
  return { ok: false, error: typeof message === "string" ? { code, message, fieldErrors } : message };
}

function ok(data) {
  return { ok: true, data };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

async function attachSellerNames(listings) {
  if (!listings.length) return listings;
  const supabase = getSupabase();
  const sellerIds = [...new Set(listings.map((l) => l.sellerId))];
  const { data: sellers } = await supabase.from("users").select("id,name,location").in("id", sellerIds);
  const map = Object.fromEntries((sellers ?? []).map((s) => [s.id, s]));
  return listings.map((l) => ({
    ...l,
    sellerName: map[l.sellerId]?.name,
    sellerLocation: map[l.sellerId]?.location,
  }));
}

export async function getListingById(listingId) {
  const cacheKey = `${LISTINGS_CACHE_PREFIX}id:${listingId}`;
  const cached = getCache(cacheKey);
  if (cached) return ok(cached);

  const supabase = getSupabase();
  const { data, error } = await supabase.from("listings").select("*").eq("id", listingId).maybeSingle();
  if (error || !data) return err("NOT_FOUND", "Listing not found");

  let listing = listingFromDb(data);
  [listing] = await attachSellerNames([listing]);
  setCache(cacheKey, listing, LISTING_TTL);
  return ok(listing);
}

export async function incrementListingView(listingId) {
  const supabase = getSupabase();
  const { data, error } = await supabase.from("listings").select("view_count").eq("id", listingId).maybeSingle();
  if (error || !data) return err("NOT_FOUND", "Listing not found");

  const newViews = (data.view_count ?? 0) + 1;
  const { error: updateError } = await supabase
    .from("listings")
    .update({ view_count: newViews, updated_at: new Date().toISOString() })
    .eq("id", listingId);

  if (updateError) return err("DB_ERROR", updateError.message);

  invalidateCache(`${LISTINGS_CACHE_PREFIX}id:${listingId}`);
  emit("listing:view", { listingId, views: newViews });
  return ok({ views: newViews });
}

export async function searchListings(filters = new URLSearchParams()) {
  const cacheKey = `${LISTINGS_CACHE_PREFIX}search:${filters.toString()}`;
  const cached = getCache(cacheKey);
  if (cached) return ok(cached);

  const parsed = validateMarketplaceFilters(filters);
  if (!parsed.ok) return err("VALIDATION_FAILED", "Invalid filters", parsed.fieldErrors);

  const f = parsed.value;
  const supabase = getSupabase();
  let query = supabase.from("listings").select("*").eq("status", "active");

  if (f.q) query = query.or(`title.ilike.%${f.q}%,description.ilike.%${f.q}%`);
  if (f.cat) query = query.eq("category_id", f.cat);
  if (f.loc) query = query.ilike("location", `%${f.loc}%`);
  if (f.min != null) query = query.gte("price", Number(f.min));
  if (f.max != null) query = query.lte("price", Number(f.max));

  const { data, error } = await query;
  if (error) return err("DB_ERROR", error.message);

  let items = (data ?? []).map(listingFromDb);

  switch (f.sort) {
    case "price_asc":
      items.sort((a, b) => a.price - b.price);
      break;
    case "price_desc":
      items.sort((a, b) => b.price - a.price);
      break;
    default:
      items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  const pageSize = 9;
  const page = clamp(Number(f.page || 1), 1, 999);
  const start = (page - 1) * pageSize;
  const paginated = items.slice(start, start + pageSize);
  paginated.forEach((l) => setCache(`${LISTINGS_CACHE_PREFIX}id:${l.id}`, l, LISTING_TTL));

  const result = {
    items: paginated,
    total: items.length,
    page,
    pageSize,
    filters: f,
  };

  setCache(cacheKey, result, SEARCH_TTL);
  return ok(result);
}

export async function getUserListings(userId) {
  const cacheKey = `${LISTINGS_CACHE_PREFIX}seller:${userId}`;
  const cached = getCache(cacheKey);
  if (cached) return ok(cached);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("listings")
    .select("*")
    .eq("seller_id", userId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  if (error) return err("DB_ERROR", error.message);

  const items = (data ?? []).map(listingFromDb);
  setCache(cacheKey, items, LISTING_TTL);
  return ok(items);
}

/** @deprecated alias */
export const listSellerListings = getUserListings;

export async function createListing(input, sellerId) {
  const v = validateListingInput(input);
  if (!v.ok) return err("VALIDATION_FAILED", "Fix the highlighted fields.", v.fieldErrors);

  const supabase = getSupabase();
  const payload = {
    ...listingToDb(v.value),
    seller_id: sellerId,
    status: "active",
    view_count: 0,
    created_at: new Date().toISOString(),
  };

  const { data, error } = await supabase.from("listings").insert(payload).select().single();
  if (error) return err("DB_ERROR", error.message);

  invalidateCache(LISTINGS_CACHE_PREFIX);
  const listing = listingFromDb(data);
  emit("listing:created", { listing });
  return ok(listing);
}

export async function updateListing(listingId, input, userId, userRole) {
  const supabase = getSupabase();
  const { data: existing, error: fetchError } = await supabase
    .from("listings")
    .select("seller_id")
    .eq("id", listingId)
    .maybeSingle();

  if (fetchError || !existing) return err("NOT_FOUND", "Listing not found");
  if (existing.seller_id !== userId && userRole !== "admin") {
    return err("FORBIDDEN", "You don't have permission to edit this listing");
  }

  const v = validateListingInput(input);
  if (!v.ok) return err("VALIDATION_FAILED", "Fix the highlighted fields.", v.fieldErrors);

  const { data, error } = await supabase
    .from("listings")
    .update(listingToDb(v.value))
    .eq("id", listingId)
    .select()
    .single();

  if (error) return err("DB_ERROR", error.message);

  invalidateCache(LISTINGS_CACHE_PREFIX);
  const listing = listingFromDb(data);
  emit("listing:updated", { listing });
  return ok(listing);
}

export async function archiveListingAsOwnerOrAdmin(listingId, userId, userRole) {
  const supabase = getSupabase();
  const { data: existing, error: fetchError } = await supabase
    .from("listings")
    .select("seller_id")
    .eq("id", listingId)
    .maybeSingle();

  if (fetchError || !existing) return err("NOT_FOUND", "Listing not found");
  if (existing.seller_id !== userId && userRole !== "admin") {
    return err("FORBIDDEN", "You don't have permission to delete this listing");
  }

  const { error } = await supabase
    .from("listings")
    .update({ status: "archived", updated_at: new Date().toISOString() })
    .eq("id", listingId);

  if (error) return err("DB_ERROR", error.message);

  invalidateCache(LISTINGS_CACHE_PREFIX);
  emit("listing:archived", { listingId });
  return ok(null);
}

export async function markListingAsSold(listingId, userId, userRole) {
  const supabase = getSupabase();
  const { data: existing, error: fetchError } = await supabase
    .from("listings")
    .select("seller_id")
    .eq("id", listingId)
    .maybeSingle();

  if (fetchError || !existing) return err("NOT_FOUND", "Listing not found");
  if (existing.seller_id !== userId && userRole !== "admin") {
    return err("FORBIDDEN", "You don't have permission");
  }

  const { error } = await supabase
    .from("listings")
    .update({ status: "sold", updated_at: new Date().toISOString() })
    .eq("id", listingId);

  if (error) return err("DB_ERROR", error.message);

  invalidateCache(LISTINGS_CACHE_PREFIX);
  emit("listing:sold", { listingId });
  return ok(null);
}
