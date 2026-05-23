import { ROLES } from "../app/config.js";
import { getCurrentUser } from "./auth.service.js";
import { getDb, updateDb } from "../services/db.provider.js";
import { archiveListingAsOwnerOrAdmin } from "./listings.service.js";

function now() {
  return Date.now();
}

function toUserPublic(u) {
  const { passwordHash, ...rest } = u;
  return rest;
}

/* ─────────────────────────────
   AUTH GUARD
───────────────────────────── */
export function requireAdmin() {
  const u = getCurrentUser();

  if (!u) {
    return { ok: false, error: { code: "AUTH_REQUIRED", message: "Login required." } };
  }

  if (u.role !== ROLES.admin) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Admin access only." } };
  }

  return { ok: true, data: { user: u } };
}

/* ─────────────────────────────
   SYSTEM STATS
───────────────────────────── */
export function getSystemStats() {
  const guard = requireAdmin();
  if (!guard.ok) return guard;

  const db = getDb();

  const totalUsers = db.users.length;
  const activeListings = db.listings.filter((l) => l.status === "active").length;
  const suspendedUsers = db.users.filter((u) => u.suspended).length;

  const farmerCount = db.users.filter((u) => u.role === ROLES.farmer).length;
  const businessCount = db.users.filter((u) => u.role === ROLES.business).length;
  const consumerCount = db.users.filter((u) => u.role === ROLES.consumer).length;

  const totalMessages = db.messages?.length ?? 0;

  return {
    ok: true,
    data: {
      totalUsers,
      activeListings,
      suspendedUsers,
      farmerCount,
      businessCount,
      consumerCount,
      totalMessages,
    },
  };
}

/* ─────────────────────────────
   USERS
───────────────────────────── */
export function listUsers() {
  const guard = requireAdmin();
  if (!guard.ok) return guard;

  const db = getDb();
  return { ok: true, data: db.users.map(toUserPublic) };
}

export function suspendUser(userId) {
  const guard = requireAdmin();
  if (!guard.ok) return guard;

  let updatedUser = null;

  updateDb((db) => {
    const u = db.users.find((x) => x.id === userId);
    if (!u) return db;

    u.suspended = true;
    u.updatedAt = now();

    updatedUser = toUserPublic(u);
    return db;
  });

  if (!updatedUser) {
    return { ok: false, error: { code: "NOT_FOUND", message: "User not found." } };
  }

  return { ok: true, data: updatedUser };
}

export function activateUser(userId) {
  const guard = requireAdmin();
  if (!guard.ok) return guard;

  let updatedUser = null;

  updateDb((db) => {
    const u = db.users.find((x) => x.id === userId);
    if (!u) return db;

    u.suspended = false;
    u.updatedAt = now();

    updatedUser = toUserPublic(u);
    return db;
  });

  if (!updatedUser) {
    return { ok: false, error: { code: "NOT_FOUND", message: "User not found." } };
  }

  return { ok: true, data: updatedUser };
}

export function changeUserRole(userId, newRole) {
  const guard = requireAdmin();
  if (!guard.ok) return guard;

  if (!Object.values(ROLES).includes(newRole)) {
    return { ok: false, error: { code: "INVALID_ROLE", message: "Invalid role." } };
  }

  let updatedUser = null;

  updateDb((db) => {
    const u = db.users.find((x) => x.id === userId);
    if (!u) return db;

    u.role = newRole;
    u.updatedAt = now();

    updatedUser = toUserPublic(u);
    return db;
  });

  if (!updatedUser) {
    return { ok: false, error: { code: "NOT_FOUND", message: "User not found." } };
  }

  return { ok: true, data: updatedUser };
}

export function verifyFarmer(userId) {
  const guard = requireAdmin();
  if (!guard.ok) return guard;

  let updatedUser = null;

  updateDb((db) => {
    const u = db.users.find((x) => x.id === userId);

    if (!u || u.role !== ROLES.farmer) return db;

    u.verified = true;
    u.updatedAt = now();

    updatedUser = toUserPublic(u);
    return db;
  });

  if (!updatedUser) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Farmer not found." } };
  }

  return { ok: true, data: updatedUser };
}

/* ─────────────────────────────
   LISTINGS (ADMIN VIEW)
───────────────────────────── */
export function listListings(opts = { includeArchived: true }) {
  const guard = requireAdmin();
  if (!guard.ok) return guard;

  const db = getDb();

  const userMap = Object.fromEntries(
    db.users.map((u) => [u.id, u.name ?? u.email])
  );

  const items = db.listings
    .filter((l) => (opts.includeArchived ? true : l.status !== "archived"))
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((l) => ({
      ...l,
      sellerName: userMap[l.sellerId] ?? "Unknown",
    }));

  return { ok: true, data: items };
}

export function takeDownListing(listingId, reason = "") {
  const guard = requireAdmin();
  if (!guard.ok) return guard;

  let result = null;

  updateDb((db) => {
    const l = db.listings.find((x) => x.id === listingId);
    if (!l) return db;

    l.status = "archived";
    l.takenDownAt = now();
    if (reason) l.takenDownReason = String(reason).slice(0, 500);
    l.updatedAt = now();

    result = l;
    return db;
  });

  if (!result) {
    return { ok: false, error: { code: "NOT_FOUND", message: "Listing not found." } };
  }

  return { ok: true, data: result };
}

export function archiveListingAsAdmin(listingId) {
  const guard = requireAdmin();
  if (!guard.ok) return guard;

  return archiveListingAsOwnerOrAdmin(listingId);
}