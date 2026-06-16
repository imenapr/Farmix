import { getSupabase } from "../lib/supabase.js";
import { getCache, setCache, invalidateCache } from "../lib/cache.js";
import { listingFromDb, listingToDb } from "../lib/transform.js";
import { validateListingInput, validateMarketplaceFilters } from "../data/validators.js";
import { ROLES } from "../app/config.js";
import { emit } from "../app/events.js";
import { getRatingsForListings } from "./reviews.service.js";

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

function quotePostgrestFilterValue(value) {
  const escaped = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
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

async function attachRatings(listings) {
  if (!listings.length) return listings;
  const res = await getRatingsForListings(listings.map((l) => l.id));
  if (!res.ok) return listings;
  return listings.map((l) => ({
    ...l,
    ratings: res.data[l.id] ?? undefined,
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
  [listing] = await attachRatings([listing]);
  setCache(cacheKey, listing, LISTING_TTL);
  return ok(listing);
}

export async function incrementListingView(listingId) {
  const supabase = getSupabase();
  const { error: rpcError } = await supabase.rpc("increment_listing_view", { listing_id: listingId });
  if (!rpcError) {
    emit("listing:view", { listingId });
    return ok(null);
  }

  const { data, error } = await supabase.from("listings").select("view_count").eq("id", listingId).maybeSingle();
  if (error || !data) return err("NOT_FOUND", "Listing not found");

  const newViews = (data.view_count ?? 0) + 1;
  const { error: updateError } = await supabase
    .from("listings")
    .update({ view_count: newViews, updated_at: new Date().toISOString() })
    .eq("id", listingId);

  if (updateError) return err("DB_ERROR", updateError.message);

  emit("listing:view", { listingId, views: newViews });
  return ok({ views: newViews });
}

const LISTING_CARD_COLUMNS =
  "id,seller_id,title,description,category_id,price,unit,quantity_available,location,images,status,view_count,created_at,updated_at";

export async function getTrendingListings(limit = 6) {
  const safeLimit = clamp(Number(limit) || 6, 1, 24);
  const cacheKey = `${LISTINGS_CACHE_PREFIX}trending:${safeLimit}`;
  const cached = getCache(cacheKey);
  if (cached) return ok(cached);

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("listings")
    .select(LISTING_CARD_COLUMNS)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (error) return err("DB_ERROR", error.message);

  let items = (data ?? []).map(listingFromDb);
  items = await attachRatings(items);
  items.forEach((l) => setCache(`${LISTINGS_CACHE_PREFIX}id:${l.id}`, l, LISTING_TTL));
  setCache(cacheKey, items, SEARCH_TTL);
  return ok(items);
}

export async function searchListings(filters = new URLSearchParams()) {
  const cacheKey = `${LISTINGS_CACHE_PREFIX}search:${filters.toString()}`;
  const cached = getCache(cacheKey);
  if (cached) return ok(cached);

  const parsed = validateMarketplaceFilters(filters);
  if (!parsed.ok) return err("VALIDATION_FAILED", "Invalid filters", parsed.fieldErrors);

  const f = parsed.value;
  const pageSize = 9;
  const page = clamp(Number(f.page || 1), 1, 999);
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  const supabase = getSupabase();
  let query = supabase.from("listings").select(LISTING_CARD_COLUMNS, { count: "exact" }).eq("status", "active");

  if (f.q) {
    const searchPattern = quotePostgrestFilterValue(`%${f.q}%`);
    query = query.or(`title.ilike.${searchPattern},description.ilike.${searchPattern}`);
  }
  if (f.cat) query = query.eq("category_id", f.cat);
  if (f.loc) query = query.ilike("location", `%${f.loc}%`);
  if (f.min != null) query = query.gte("price", Number(f.min));
  if (f.max != null) query = query.lte("price", Number(f.max));

  switch (f.sort) {
    case "price_asc":
      query = query.order("price", { ascending: true });
      break;
    case "price_desc":
      query = query.order("price", { ascending: false });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  const { data, error, count } = await query.range(start, end);
  if (error) return err("DB_ERROR", error.message);

  let paginated = (data ?? []).map(listingFromDb);
  paginated = await attachRatings(paginated);
  paginated.forEach((l) => setCache(`${LISTINGS_CACHE_PREFIX}id:${l.id}`, l, LISTING_TTL));

  const result = {
    items: paginated,
    total: count ?? paginated.length,
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
  const withRatings = await attachRatings(items);
  setCache(cacheKey, withRatings, LISTING_TTL);
  return ok(withRatings);
}

export async function createListing(input, sellerId, userRole = ROLES.farmer) {
  if (userRole !== ROLES.farmer && userRole !== ROLES.admin) {
    return err("FORBIDDEN", "Only farmers can create listings.");
  }

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
