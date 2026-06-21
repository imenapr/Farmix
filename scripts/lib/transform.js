/** @typedef {Record<string, unknown>} JsonRecord */

function toCamelKey(key) {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function toSnakeKey(key) {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function keysToCamel(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(keysToCamel);
  if (typeof value !== "object") return value;

  /** @type {JsonRecord} */
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[toCamelKey(k)] = keysToCamel(v);
  }
  return out;
}

export function keysToSnake(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(keysToSnake);
  if (typeof value !== "object") return value;

  /** @type {JsonRecord} */
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[toSnakeKey(k)] = keysToSnake(v);
  }
  return out;
}

/** Normalize a Supabase `users` row to frontend `UserPublic`. */
export function userFromDb(row) {
  if (!row) return null;
  const u = keysToCamel(row);
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    name: u.name,
    phone: u.phone ?? undefined,
    location: u.location,
    bio: u.bio ?? undefined,
    farmName: u.farmName ?? undefined,
    companyName: u.companyName ?? undefined,
    avatarUrl: u.avatarUrl ?? undefined,
    suspended: Boolean(u.suspended),
    verified: Boolean(u.verified),
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

/** Normalize a Supabase `listings` row to frontend `Listing`. */
export function listingFromDb(row) {
  if (!row) return null;
  const l = keysToCamel(row);
  const images = Array.isArray(l.images) ? l.images : [];
  return {
    id: l.id,
    sellerId: l.sellerId,
    title: l.title,
    description: l.description,
    categoryId: l.categoryId ?? "",
    price: Number(l.price),
    unit: l.unit ?? "other",
    quantityAvailable: Number(l.quantityAvailable ?? l.quantity ?? 0),
    regionId: l.regionId ?? l.region_id ?? "other",
    village: l.village ?? undefined,
    images,
    status: l.status,
    views: Number(l.viewCount ?? l.views ?? 0),
    ratings: l.ratings ?? undefined,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
    sellerName: l.sellerName ?? undefined,
  };
}

/** Map frontend listing input to Supabase insert/update payload. */
export function listingToDb(input) {
  return {
    title: input.title,
    description: input.description,
    category_id: input.categoryId,
    price: input.price,
    unit: input.unit,
    quantity_available: input.quantityAvailable,
    region_id: input.regionId,
    village: input.village ?? null,
    images: input.images ?? [],
    updated_at: new Date().toISOString(),
  };
}
