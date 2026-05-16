import { LISTING_STATUS } from "../app/config.js";
import { loadDb, withDb } from "../data/db.js";
import { validateListingInput, validateMarketplaceFilters } from "../data/validators.js";
import { emit } from "../app/events.js";

function now() {
  return Date.now();
}

function includesText(haystack, needle) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function ensureRatings(ratings) {
  const delivery = Array.isArray(ratings?.delivery) ? ratings.delivery.filter((x) => Number.isFinite(Number(x))).map(Number) : [];
  const quality = Array.isArray(ratings?.quality) ? ratings.quality.filter((x) => Number.isFinite(Number(x))).map(Number) : [];
  return { delivery, quality };
}

function normalizeListing(listing) {
  const loc = listing.location != null ? String(listing.location).trim() : "";
  return {
    ...listing,
    categoryId: listing.categoryId || "vegetables",
    unit: listing.unit || "kg",
    location: loc || "—",
    images: Array.isArray(listing.images) && listing.images.length ? listing.images : ["/img/logo.png"],
    ratings: ensureRatings(listing.ratings),
  };
}

/**
 * @typedef {{ ok: true, data: any } | { ok: false, error: { code: string, message: string, fieldErrors?: Record<string,string> } }} Result
 */

export function getListingById(listingId, opts = {}) {
  const db = loadDb();
  const l = db.listings.find((x) => x.id === listingId);
  if (!l) return { ok: false, error: { code: "NOT_FOUND", message: "Listing not found." } };
  if (l.status === LISTING_STATUS.archived && !opts.includeArchived) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Listing not found." } };
  }
  return { ok: true, data: normalizeListing(l) };
}

export function incrementListingView(listingId) {
  withDb((db) => {
    const l = db.listings.find((x) => x.id === listingId);
    if (!l) return db;
    l.views = (l.views ?? 0) + 1;
    l.updatedAt = now();
    return db;
  });
}

export function searchListings(filters) {
  // Supports being called with either an object or URLSearchParams.
  const params = filters instanceof URLSearchParams ? filters : new URLSearchParams(filters ?? {});
  const v = validateMarketplaceFilters(params);
  if (!v.ok) {
    return { ok: false, error: { code: "VALIDATION_FAILED", message: "Invalid filter parameters.", fieldErrors: v.fieldErrors } };
  }

  const f = v.value;
  const db = loadDb();
  const suspendedIds = new Set(db.users.filter((u) => u.suspended).map((u) => u.id));

  let items = db.listings.filter(
    (l) => l.status === LISTING_STATUS.active && !suspendedIds.has(l.sellerId)
  );

  if (f.q) {
    items = items.filter((l) => includesText(l.title, f.q) || includesText(l.description, f.q));
  }
  if (f.cat) items = items.filter((l) => (l.categoryId || "vegetables") === f.cat);
  if (f.loc) items = items.filter((l) => includesText(l.location || "", f.loc));
  if (f.min !== null) items = items.filter((l) => l.price >= f.min);
  if (f.max !== null) items = items.filter((l) => l.price <= f.max);

  switch (f.sort) {
    case "price_asc":
      items.sort((a, b) => a.price - b.price);
      break;
    case "price_desc":
      items.sort((a, b) => b.price - a.price);
      break;
    default:
      items.sort((a, b) => b.createdAt - a.createdAt);
      break;
  }

  const pageSize = 9;
  const page = clamp(f.page, 1, 999);
  const total = items.length;
  const start = (page - 1) * pageSize;
  const paged = items.slice(start, start + pageSize).map(normalizeListing);

  return { ok: true, data: { items: paged, total, page, pageSize, filters: f } };
}

export function archiveListingAsOwnerOrAdmin(listingId) {
  const updated = { listing: null };
  withDb((db) => {
    const l = db.listings.find((x) => x.id === listingId);
    if (!l) return db;
    l.status = LISTING_STATUS.archived;
    l.updatedAt = now();
    updated.listing = l;
    return db;
  });

  if (!updated.listing) return { ok: false, error: { code: "NOT_FOUND", message: "Listing not found." } };
  emit("listings:changed", { reason: "archived" });
  return { ok: true, data: updated.listing };
}

export function listSellerListings(sellerId, opts = {}) {
  const db = loadDb();
  const items = db.listings
    .filter((l) => l.sellerId === sellerId)
    .filter((l) => (opts.includeArchived ? true : l.status !== LISTING_STATUS.archived))
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
  return { ok: true, data: items.map(normalizeListing) };
}

export function createListing(sellerId, input) {
  const dbPre = loadDb();
  const seller = dbPre.users.find((u) => u.id === sellerId);
  const merged = {
    ...input,
    categoryId: String(input?.categoryId ?? "").trim(),
    unit: String(input?.unit ?? "").trim() || "kg",
    location: String(input?.location ?? "").trim() || String(seller?.location ?? "").trim(),
  };
  const v = validateListingInput(merged);
  if (!v.ok) {
    return {
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Fix the highlighted fields.", fieldErrors: v.fieldErrors },
    };
  }

  const created = { listing: null };
  withDb((db) => {
    const t = now();
    const listing = {
      id: `lst_${crypto.randomUUID?.() ?? `${t}_${Math.random().toString(16).slice(2)}`}`,
      sellerId,
      ...v.value,
      ratings: { delivery: [], quality: [] },
      status: LISTING_STATUS.active,
      views: 0,
      createdAt: t,
      updatedAt: t,
    };
    db.listings.push(listing);
    created.listing = listing;
    return db;
  });

  emit("listings:changed", { reason: "created" });
  return { ok: true, data: normalizeListing(created.listing) };
}

export function updateListing(listingId, input) {
  const dbPre = loadDb();
  const existing = dbPre.listings.find((x) => x.id === listingId);
  const seller = existing ? dbPre.users.find((u) => u.id === existing.sellerId) : null;
  const locFromForm = String(input?.location ?? "").trim();
  const merged = {
    ...input,
    categoryId: String(input?.categoryId ?? "").trim(),
    unit: String(input?.unit ?? "").trim() || existing?.unit || "kg",
    location: locFromForm || String(seller?.location ?? "").trim() || String(existing?.location ?? "").trim(),
  };
  const v = validateListingInput(merged);
  if (!v.ok) {
    return {
      ok: false,
      error: { code: "VALIDATION_FAILED", message: "Fix the highlighted fields.", fieldErrors: v.fieldErrors },
    };
  }

  const updated = { listing: null };
  withDb((db) => {
    const l = db.listings.find((x) => x.id === listingId);
    if (!l) return db;
    Object.assign(l, v.value, { updatedAt: now() });
    updated.listing = l;
    return db;
  });

  if (!updated.listing) return { ok: false, error: { code: "NOT_FOUND", message: "Listing not found." } };
  emit("listings:changed", { reason: "updated" });
  return { ok: true, data: normalizeListing(updated.listing) };
}

export function deleteListingById(listingId) {
  let deleted = false;
  withDb((db) => {
    const before = db.listings.length;
    db.listings = db.listings.filter((x) => x.id !== listingId);
    deleted = db.listings.length !== before;
    return db;
  });

  if (!deleted) return { ok: false, error: { code: "NOT_FOUND", message: "Listing not found." } };
  emit("listings:changed", { reason: "deleted" });
  return { ok: true, data: null };
}

