import { getSupabase } from "../lib/supabase.js";
import { ROLES } from "../app/config.js";
import { t } from "../app/i18n.js";
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

function mapUpdateOrderStatusRpcError(error) {
  const raw = String(error?.message ?? error?.details ?? "");
  const code = raw.match(/\b(AUTH_REQUIRED|FORBIDDEN|NOT_FOUND|VALIDATION_FAILED)\b/)?.[1];

  if (code === "AUTH_REQUIRED") return err("AUTH_REQUIRED", t("common.loginRequired"));
  if (code === "FORBIDDEN") return err("FORBIDDEN", t("service.notAllowed", { default: "Not allowed." }));
  if (code === "NOT_FOUND") return err("NOT_FOUND", t("orders.notFound", { default: "Order not found." }));
  if (code === "VALIDATION_FAILED") {
    return err("VALIDATION_FAILED", t("orders.invalidStatus", { default: "Invalid order status." }));
  }
  return err("DB_ERROR", raw || t("common.unknown"));
}

export async function updateOrderStatus(orderId, status) {
  const user = getCurrentUser();
  if (!user) return err("AUTH_REQUIRED", t("common.loginRequired"));
  if (!ORDER_STATUSES.includes(status)) {
    return err("VALIDATION_FAILED", t("orders.invalidStatus", { default: "Invalid order status." }));
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("update_order_status_atomic", {
    p_order_id: orderId,
    p_status: status,
  });

  if (error) return mapUpdateOrderStatusRpcError(error);
  if (!data?.order) return err("DB_ERROR", t("common.unknown"));

  if (data.inventory_restored) {
    invalidateCache("listings:");
  }

  const order = keysToCamel(data.order);
  const listingTitle = data.listing_title || t("common.listing");

  if (!data.status_changed) {
    return ok({ ...order, listingTitle });
  }

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

  const updated = { ...order, listingTitle };
  return ok(updated);
}

function mapPlaceOrderRpcError(error) {
  const raw = String(error?.message ?? error?.details ?? "");
  const code = raw.match(/\b(AUTH_REQUIRED|FORBIDDEN|NOT_FOUND|CONFLICT|VALIDATION_FAILED)\b/)?.[1];
  const stockMatch = raw.match(/INSUFFICIENT_STOCK:(\d+)/);

  if (code === "AUTH_REQUIRED") return err("AUTH_REQUIRED", t("common.loginRequired"));
  if (code === "FORBIDDEN") return err("FORBIDDEN", t("service.notAllowed", { default: "Not allowed." }));
  if (code === "NOT_FOUND") return err("NOT_FOUND", t("orders.listingNotFound", { default: "Listing not found." }));
  if (code === "CONFLICT") {
    return err("CONFLICT", t("orders.listingUnavailable", { default: "This listing is no longer available." }));
  }
  if (code === "VALIDATION_FAILED") {
    return err("VALIDATION_FAILED", t("orders.invalidQuantity", { default: "Invalid quantity." }));
  }
  if (stockMatch) {
    const available = Number(stockMatch[1]);
    return err(
      "VALIDATION_FAILED",
      t("orders.insufficientStock", {
        default: `Only ${available} available.`,
        count: available,
      }),
    );
  }
  return err("DB_ERROR", raw || t("common.unknown"));
}

export async function placeOrder(buyerId, listingId, quantity) {
  const user = getCurrentUser();
  if (!user) return err("AUTH_REQUIRED", t("common.loginRequired"));
  if (String(buyerId ?? "") !== String(user.id)) {
    return err("FORBIDDEN", t("orders.buyerOnly", { default: "You can only place orders for your own account." }));
  }
  if (user.role === ROLES.farmer || user.role === ROLES.admin) {
    return err("FORBIDDEN", t("orders.buyersOnly", { default: "Only buyers can place orders." }));
  }

  const qty = Math.max(1, Math.floor(Number(quantity)));
  if (!Number.isFinite(qty)) {
    return err("VALIDATION_FAILED", t("orders.invalidQuantity", { default: "Invalid quantity." }));
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("place_order_atomic", {
    p_listing_id: listingId,
    p_quantity: qty,
  });

  if (error) return mapPlaceOrderRpcError(error);
  if (!data?.order) return err("DB_ERROR", t("common.unknown"));

  invalidateCache("listings:");

  const order = keysToCamel(data.order);
  order.title = data.listing_title;
  order.unit = data.listing_unit;

  const buyerName = user.name || user.email?.split("@")[0] || t("service.orderAnonymousBuyer", { default: "A buyer" });
  await createNotification({
    userId: data.seller_id,
    type: "order",
    title: t("service.newOrder", { default: "New order" }),
    message: t("service.newOrderMessage", {
      default: `${buyerName} placed an order for ${qty} ${order.unit} of "${order.title}".`,
      name: buyerName,
      qty,
      unit: order.unit,
      title: order.title,
    }),
    metadata: {
      orderId: order.id,
      listingId,
      buyerId: user.id,
      quantity: qty,
      totalPrice: order.totalPrice,
    },
  });

  return ok(order);
}
