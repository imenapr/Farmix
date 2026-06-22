import { getSupabase } from "../lib/supabase.js";
import { ROLES } from "../app/config.js";
import { t } from "../app/i18n.js";
import { getListingById } from "./listings.service.js";
import { getCurrentUser } from "./auth.service.js";
import { createNotification } from "./notifications.service.js";
import { keysToCamel } from "../lib/transform.js";
import { invalidateCache } from "../lib/cache.js";

const ORDER_STATUSES = ["pending", "accepted", "shipped", "delivered", "cancelled"];

function err(code, message) {
  return { ok: false, error: { code, message } };
}

function ok(data) {
  return { ok: true, data };
}

function enrichOrders(orders, buyers, listings) {
  const buyerMap = new Map((buyers ?? []).map((b) => [b.id, keysToCamel(b)]));
  const listingMap = new Map((listings ?? []).map((l) => [l.id, keysToCamel(l)]));

  return orders.map((row) => {
    const order = keysToCamel(row);
    const buyer = buyerMap.get(order.buyerId);
    const listing = listingMap.get(order.listingId);
    order.buyerName = buyer?.name ?? null;
    order.buyerEmail = buyer?.email ?? null;
    order.listingTitle = listing?.title ?? null;
    order.unit = listing?.unit ?? null;
    return order;
  });
}

function enrichBuyerOrders(orders, sellers, listings) {
  const sellerMap = new Map((sellers ?? []).map((s) => [s.id, keysToCamel(s)]));
  const listingMap = new Map((listings ?? []).map((l) => [l.id, keysToCamel(l)]));

  return orders.map((row) => {
    const order = keysToCamel(row);
    const seller = sellerMap.get(order.sellerId);
    const listing = listingMap.get(order.listingId);
    order.sellerName = seller?.name ?? null;
    order.sellerEmail = seller?.email ?? null;
    order.sellerFarmName = seller?.farmName ?? null;
    order.listingTitle = listing?.title ?? null;
    order.unit = listing?.unit ?? null;
    return order;
  });
}

export async function listOrdersForSeller(sellerId) {
  const user = getCurrentUser();
  if (!user) return err("AUTH_REQUIRED", t("common.loginRequired"));
  if (String(sellerId) !== String(user.id) && user.role !== ROLES.admin) {
    return err("FORBIDDEN", t("service.notAllowed", { default: "Not allowed." }));
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false });

  if (error) return err("DB_ERROR", error.message);
  const orders = data ?? [];
  if (!orders.length) return ok([]);

  const buyerIds = [...new Set(orders.map((o) => o.buyer_id))];
  const listingIds = [...new Set(orders.map((o) => o.listing_id))];

  const [{ data: buyers }, { data: listings }] = await Promise.all([
    supabase.from("users").select("id,name,email").in("id", buyerIds),
    supabase.from("listings").select("id,title,unit").in("id", listingIds),
  ]);

  return ok(enrichOrders(orders, buyers, listings));
}

export async function listOrdersForBuyer(buyerId) {
  const user = getCurrentUser();
  if (!user) return err("AUTH_REQUIRED", t("common.loginRequired"));
  if (String(buyerId) !== String(user.id) && user.role !== ROLES.admin) {
    return err("FORBIDDEN", t("service.notAllowed", { default: "Not allowed." }));
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("buyer_id", buyerId)
    .order("created_at", { ascending: false });

  if (error) return err("DB_ERROR", error.message);
  const orders = data ?? [];
  if (!orders.length) return ok([]);

  const sellerIds = [...new Set(orders.map((o) => o.seller_id))];
  const listingIds = [...new Set(orders.map((o) => o.listing_id))];

  const [{ data: sellers }, { data: listings }] = await Promise.all([
    supabase.from("users").select("id,name,email,farm_name").in("id", sellerIds),
    supabase.from("listings").select("id,title,unit").in("id", listingIds),
  ]);

  return ok(enrichBuyerOrders(orders, sellers, listings));
}

export async function updateOrderStatus(orderId, status) {
  const user = getCurrentUser();
  if (!user) return err("AUTH_REQUIRED", t("common.loginRequired"));
  if (!ORDER_STATUSES.includes(status)) {
    return err("VALIDATION_FAILED", t("orders.invalidStatus", { default: "Invalid order status." }));
  }

  const supabase = getSupabase();
  const { data: row, error: fetchError } = await supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (fetchError || !row) return err("NOT_FOUND", t("orders.notFound", { default: "Order not found." }));

  const order = keysToCamel(row);
  if (String(order.sellerId) !== String(user.id) && user.role !== ROLES.admin) {
    return err("FORBIDDEN", t("service.notAllowed", { default: "Not allowed." }));
  }
  if (order.status === status) return ok(order);

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("orders")
    .update({ status, updated_at: now })
    .eq("id", orderId)
    .select()
    .single();

  if (error) return err("DB_ERROR", error.message);

  const listingRes = await getListingById(order.listingId);
  const listingTitle = listingRes.ok ? listingRes.data.title : t("common.listing");
  const statusLabel = t(`orders.status.${status}`, { default: status });

  await createNotification({
    userId: order.buyerId,
    type: "order",
    title: t("service.orderStatusUpdated", { default: "Order status updated" }),
    message: t("service.orderStatusUpdatedMessage", {
      default: `Your order for "${listingTitle}" is now ${statusLabel}.`,
      title: listingTitle,
      status: statusLabel,
    }),
    metadata: { orderId, listingId: order.listingId, status },
  });

  const updated = keysToCamel(data);
  updated.listingTitle = listingTitle;
  return ok(updated);
}

export async function placeOrder(buyerId, listingId, quantity) {
  const user = getCurrentUser();
  if (!user) return err("AUTH_REQUIRED", "Login required.");
  if (String(buyerId ?? "") !== String(user.id)) {
    return err("FORBIDDEN", "You can only place orders for your own account.");
  }
  if (user.role === ROLES.farmer || user.role === ROLES.admin) {
    return err("FORBIDDEN", "Only buyers can place orders.");
  }

  const qty = Math.max(1, Math.floor(Number(quantity)));
  if (!Number.isFinite(qty)) return err("VALIDATION_FAILED", "Invalid quantity.");

  const listingRes = await getListingById(listingId);
  if (!listingRes.ok) return err("NOT_FOUND", "Listing not found.");

  const listing = listingRes.data;
  if (listing.status !== "active") return err("CONFLICT", "This listing is no longer available.");
  if (listing.sellerId === user.id) return err("FORBIDDEN", "You cannot order your own listing.");
  if (qty > listing.quantityAvailable) {
    return err("VALIDATION_FAILED", `Only ${listing.quantityAvailable} available.`);
  }

  const totalPrice = Math.round(qty * listing.price * 100) / 100;
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("orders")
    .insert({
      listing_id: listingId,
      buyer_id: user.id,
      seller_id: listing.sellerId,
      quantity: qty,
      price_per_unit: listing.price,
      total_price: totalPrice,
      status: "pending",
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) return err("DB_ERROR", error.message);

  const newQty = listing.quantityAvailable - qty;
  const listingUpdate = {
    quantity_available: newQty,
    updated_at: now,
    ...(newQty <= 0 ? { status: "sold" } : {}),
  };

  await supabase.from("listings").update(listingUpdate).eq("id", listingId);
  invalidateCache("listings:");

  const order = keysToCamel(data);
  order.title = listing.title;
  order.unit = listing.unit;

  const buyerName = user.name || user.email?.split("@")[0] || t("service.orderAnonymousBuyer", { default: "A buyer" });
  await createNotification({
    userId: listing.sellerId,
    type: "order",
    title: t("service.newOrder", { default: "New order" }),
    message: t("service.newOrderMessage", {
      default: `${buyerName} placed an order for ${qty} ${listing.unit} of "${listing.title}".`,
      name: buyerName,
      qty,
      unit: listing.unit,
      title: listing.title,
    }),
    metadata: {
      orderId: order.id,
      listingId,
      buyerId: user.id,
      quantity: qty,
      totalPrice,
    },
  });

  return ok(order);
}
