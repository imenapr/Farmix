import { ROLES } from "../app/config.js";
import { getCurrentUser } from "./auth.service.js";
import { getSupabase } from "../lib/supabase.js";
import { userFromDb, listingFromDb, keysToCamel } from "../lib/transform.js";
import { archiveListingAsOwnerOrAdmin } from "./listings.service.js";
import { invalidateCache } from "../lib/cache.js";

function err(code, message) {
  return { ok: false, error: { code, message } };
}

function ok(data) {
  return { ok: true, data };
}

export function requireAdmin() {
  const u = getCurrentUser();
  if (!u) return err("AUTH_REQUIRED", "Login required.");
  if (u.role !== ROLES.admin) return err("FORBIDDEN", "Admin access only.");
  return ok({ user: u });
}

export async function getSystemStats() {
  const guard = requireAdmin();
  if (!guard.ok) return guard;

  const supabase = getSupabase();
  const [usersRes, listingsRes, messagesRes] = await Promise.all([
    supabase.from("users").select("id, role, suspended", { count: "exact" }),
    supabase.from("listings").select("id, status", { count: "exact" }),
    supabase.from("messages").select("id", { count: "exact", head: true }),
  ]);

  const users = usersRes.data ?? [];
  const listings = listingsRes.data ?? [];

  return ok({
    totalUsers: users.length,
    activeListings: listings.filter((l) => l.status === "active").length,
    suspendedUsers: users.filter((u) => u.suspended).length,
    farmerCount: users.filter((u) => u.role === ROLES.farmer).length,
    businessCount: users.filter((u) => u.role === ROLES.business).length,
    consumerCount: users.filter((u) => u.role === ROLES.consumer).length,
    totalMessages: messagesRes.count ?? 0,
  });
}

export async function listUsers() {
  const guard = requireAdmin();
  if (!guard.ok) return guard;

  const supabase = getSupabase();
  const { data, error } = await supabase.from("users").select("*").order("created_at", { ascending: false });
  if (error) return err("DB_ERROR", error.message);
  return ok((data ?? []).map(userFromDb));
}

export async function suspendUser(userId) {
  const guard = requireAdmin();
  if (!guard.ok) return guard;
  return updateUserFlag(userId, { suspended: true });
}

export async function activateUser(userId) {
  const guard = requireAdmin();
  if (!guard.ok) return guard;
  return updateUserFlag(userId, { suspended: false });
}

async function updateUserFlag(userId, patch) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("users")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single();

  if (error || !data) return err("NOT_FOUND", "User not found.");
  return ok(userFromDb(data));
}

export async function changeUserRole(userId, newRole) {
  const guard = requireAdmin();
  if (!guard.ok) return guard;
  if (!Object.values(ROLES).includes(newRole)) return err("INVALID_ROLE", "Invalid role.");

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("users")
    .update({ role: newRole, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select()
    .single();

  if (error || !data) return err("NOT_FOUND", "User not found.");
  return ok(userFromDb(data));
}

export async function verifyFarmer(userId) {
  const guard = requireAdmin();
  if (!guard.ok) return guard;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("users")
    .update({ verified: true, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .eq("role", ROLES.farmer)
    .select()
    .single();

  if (error || !data) return err("NOT_FOUND", "Farmer not found.");
  return ok(userFromDb(data));
}

export async function listListings(opts = { includeArchived: true }) {
  const guard = requireAdmin();
  if (!guard.ok) return guard;

  const supabase = getSupabase();
  let query = supabase.from("listings").select("*").order("created_at", { ascending: false });
  if (!opts.includeArchived) query = query.neq("status", "archived");

  const { data, error } = await query;
  if (error) return err("DB_ERROR", error.message);

  const listings = (data ?? []).map(listingFromDb);
  const sellerIds = [...new Set(listings.map((l) => l.sellerId))];
  const { data: sellers } = await supabase.from("users").select("id,name").in("id", sellerIds);
  const nameMap = Object.fromEntries((sellers ?? []).map((s) => [s.id, s.name]));

  return ok(listings.map((l) => ({ ...l, sellerName: nameMap[l.sellerId] ?? "Unknown" })));
}

export async function takeDownListing(listingId, reason = "") {
  const guard = requireAdmin();
  if (!guard.ok) return guard;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("listings")
    .update({
      status: "archived",
      updated_at: new Date().toISOString(),
      metadata: reason ? { takenDownReason: String(reason).slice(0, 500) } : null,
    })
    .eq("id", listingId)
    .select()
    .single();

  if (error || !data) return err("NOT_FOUND", "Listing not found.");
  invalidateCache("listings:");
  return ok(listingFromDb(data));
}

export async function archiveListingAsAdmin(listingId) {
  const guard = requireAdmin();
  if (!guard.ok) return guard;
  const user = guard.data.user;
  return archiveListingAsOwnerOrAdmin(listingId, user.id, user.role);
}

export async function listOrdersSummary() {
  const guard = requireAdmin();
  if (!guard.ok) return guard;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("orders")
    .select("status, total_price, created_at")
    .order("created_at", { ascending: true });

  if (error) return err("DB_ERROR", error.message);
  return ok((data ?? []).map(keysToCamel));
}
