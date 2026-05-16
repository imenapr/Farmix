import { loadDb, withDb } from "../data/db.js";
import { LISTING_STATUS } from "../app/config.js";

export function toggleFavorite(userId, listingId) {
  const updated = { favorited: false };
  withDb((db) => {
    const listing = db.listings.find((l) => l.id === listingId);
    if (!listing || listing.status !== LISTING_STATUS.active) return db;

    const list = db.favorites[userId] ?? [];
    const idx = list.indexOf(listingId);
    if (idx >= 0) {
      list.splice(idx, 1);
      updated.favorited = false;
    } else {
      list.unshift(listingId);
      updated.favorited = true;
    }
    db.favorites[userId] = Array.from(new Set(list));
    return db;
  });

  return { ok: true, data: { favorited: updated.favorited } };
}

export function listFavorites(userId) {
  const db = loadDb();
  const ids = db.favorites[userId] ?? [];
  const map = new Map(db.listings.map((l) => [l.id, l]));
  const items = ids
    .map((id) => map.get(id))
    .filter(Boolean)
    .filter((l) => l.status === LISTING_STATUS.active);
  return { ok: true, data: items };
}

export function isFavorited(userId, listingId) {
  const db = loadDb();
  const ids = db.favorites[userId] ?? [];
  return ids.includes(listingId);
}

