import { LISTING_STATUS } from "../app/config.js";
import { getDb } from "../services/db.provider.js";
import { validateListingInput, validateMarketplaceFilters } from "../data/validators.js";
import { emit } from "../app/events.js";

/* ───────────────────────── helpers ───────────────────────── */

function now() {
  return Date.now();
}

function includesText(haystack = "", needle = "") {
  return haystack.toLowerCase().includes(String(needle).toLowerCase());
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function ensureRatings(ratings) {
  return {
    delivery: Array.isArray(ratings?.delivery) ? ratings.delivery : [],
    quality: Array.isArray(ratings?.quality) ? ratings.quality : [],
  };
}

function normalizeListing(listing) {
  return {
    ...listing,
    ratings: ensureRatings(listing.ratings),
    quantityAvailable: Number(listing.quantityAvailable ?? 0),
    price: Number(listing.price ?? 0),
    createdAt: listing.createdAt ?? now(),
    updatedAt: listing.updatedAt ?? now(),
  };
}

/* ───────────────────────── core API ───────────────────────── */

export function getListingById(listingId, opts = {}) {
  const db = getDb();
  const listing = db.listings.find((l) => l.id === listingId);

  if (!listing) return null;

  const normalized = normalizeListing(listing);

  if (opts.incrementView) {
    normalized.views = (normalized.views || 0) + 1;
  }

  return normalized;
}

export function incrementListingView(listingId) {
  const db = getDb();
  const listing = db.listings.find((l) => l.id === listingId);

  if (!listing) return { ok: false, error: "Listing not found" };

  listing.views = (listing.views || 0) + 1;
  listing.updatedAt = now();

  emit("listing:view", { listingId });

  return { ok: true };
}

export function searchListings(filters = new URLSearchParams()) {
  const parsed = validateMarketplaceFilters(filters);
  if (!parsed.ok) {
    return { ok: false, error: parsed.fieldErrors };
  }

  const f = parsed.value;
  const db = getDb();

  let items = db.listings
    .map(normalizeListing)
    .filter((l) => l.status !== LISTING_STATUS.deleted);

  // search text
  if (f.q) {
    items = items.filter((l) =>
      includesText(l.title, f.q) || includesText(l.description, f.q)
    );
  }

  // category
  if (f.cat) {
    items = items.filter((l) => l.categoryId === f.cat);
  }

  // location
  if (f.loc) {
    items = items.filter((l) => includesText(l.location, f.loc));
  }

  // price range
  if (f.min != null) {
    items = items.filter((l) => l.price >= Number(f.min));
  }

  if (f.max != null) {
    items = items.filter((l) => l.price <= Number(f.max));
  }

  // sorting
  switch (f.sort) {
    case "price_asc":
      items.sort((a, b) => a.price - b.price);
      break;
    case "price_desc":
      items.sort((a, b) => b.price - a.price);
      break;
    default:
      items.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }

  const pageSize = 9;
  const page = clamp(Number(f.page || 1), 1, 999);

  const start = (page - 1) * pageSize;
  const paginated = items.slice(start, start + pageSize);

  return {
    ok: true,
    data: {
      items: paginated,
      total: items.length,
      page,
      pageSize,
      filters: f,
    },
  };
}

export function archiveListingAsOwnerOrAdmin(listingId, user) {
  const db = getDb();
  const listing = db.listings.find((l) => l.id === listingId);

  if (!listing) return { ok: false, error: "Not found" };

  if (user.role !== "admin" && listing.sellerId !== user.id) {
    return { ok: false, error: "Not allowed" };
  }

  listing.status = LISTING_STATUS.archived;
  listing.updatedAt = now();

  emit("listing:archived", { listingId });

  return { ok: true };
}

export function listSellerListings(sellerId, opts = {}) {
  const db = getDb();

  let items = db.listings
    .filter((l) => l.sellerId === sellerId)
    .map(normalizeListing);

  if (opts.status) {
    items = items.filter((l) => l.status === opts.status);
  }

  return items;
}

export function createListing(sellerId, input) {
  const parsed = validateListingInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.fieldErrors };

  const db = getDb();

  const listing = normalizeListing({
    id: `lst_${now()}_${Math.random().toString(16).slice(2)}`,
    sellerId,
    ...parsed.value,
    status: LISTING_STATUS.active,
    views: 0,
    createdAt: now(),
    updatedAt: now(),
  });

  db.listings.unshift(listing);

  emit("listing:created", { listing });

  return { ok: true, data: listing };
}

export function updateListing(listingId, input) {
  const parsed = validateListingInput(input);
  if (!parsed.ok) return { ok: false, error: parsed.fieldErrors };

  const db = getDb();
  const listing = db.listings.find((l) => l.id === listingId);

  if (!listing) return { ok: false, error: "Not found" };

  Object.assign(listing, parsed.value);
  listing.updatedAt = now();

  emit("listing:updated", { listingId });

  return { ok: true, data: normalizeListing(listing) };
}

export function deleteListingById(listingId) {
  const db = getDb();
  const index = db.listings.findIndex((l) => l.id === listingId);

  if (index === -1) return { ok: false, error: "Not found" };

  db.listings.splice(index, 1);

  emit("listing:deleted", { listingId });

  return { ok: true };
}