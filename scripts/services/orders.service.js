import { ORDER_STATUS, ROLES } from "../app/config.js";
import { loadDb, withDb } from "../data/db.js";
import { emit } from "../app/events.js";
import { getCurrentUser, requireAuth } from "./auth.service.js";
import { requireAdmin } from "./admin.service.js";
import { createNotification } from "./notifications.service.js";

function now() { return Date.now(); }

export function placeOrder(buyerId, listingId, quantity) {
  const guard = requireAuth();
  if (!guard.ok) return guard;

  const buyer = guard.data.user;
  if (String(buyerId ?? "") !== String(buyer.id)) {
    return {
      ok: false,
      error: { code: "FORBIDDEN", message: "You can only place orders for your own account." },
    };
  }
  if (buyer.role === ROLES.farmer || buyer.role === ROLES.admin) {
    return { ok: false, error: { code: "FORBIDDEN", message: "Only buyers can place orders." } };
  }

  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty < 1 || !Number.isInteger(qty)) {
    return { ok: false, error: { code: "INVALID_QTY", message: "Quantity must be a whole number ≥ 1." } };
  }

  const created = { order: null, stockError: null };
  withDb((db) => {
    const l = db.listings.find((x) => x.id === listingId);
    if (!l || l.status !== "active") {
      created.stockError = "This listing is no longer available.";
      return db;
    }
    if (l.sellerId === buyer.id) {
      created.stockError = "You can't place an order on your own listing.";
      return db;
    }
    if (qty > l.quantityAvailable) {
      created.stockError = `Only ${l.quantityAvailable} ${l.unit} available.`;
      return db;
    }

    l.quantityAvailable -= qty;
    l.updatedAt = now();

    // Mark listing as sold when stock reaches zero
    if (l.quantityAvailable <= 0) {
      l.status = "sold";
    }

    const t = now();
    const order = {
      id: `ord_${t.toString(16)}_${Math.random().toString(16).slice(2)}`,
      listingId,
      buyerId: buyer.id,
      sellerId: l.sellerId,
      title: l.title,
      quantity: qty,
      pricePerUnit: l.price,
      unit: l.unit,
      totalPrice: Math.round(qty * l.price * 100) / 100,
      status: ORDER_STATUS.pending,
      createdAt: t,
      updatedAt: t,
    };

    if (!Array.isArray(db.orders)) db.orders = [];
    db.orders.push(order);
    created.order = order;
    return db;
  });

  if (created.stockError) {
    return { ok: false, error: { code: "INSUFFICIENT_STOCK", message: created.stockError } };
  }
  if (!created.order) {
    return { ok: false, error: { code: "ERROR", message: "Could not place order." } };
  }

  emit("orders:changed", { reason: "placed", orderId: created.order.id });

  // Notify the farmer (seller) about the new order
  createNotification({
    userId: created.order.sellerId,
    type: "new_order",
    message: `New order: ${qty} ${created.order.unit} of "${created.order.title}" from ${buyer.name ?? buyer.email}`,
    metadata: { orderId: created.order.id, listingId },
  });

  return { ok: true, data: created.order };
}

export function updateOrderStatus(orderId, newStatus) {
  if (!Object.values(ORDER_STATUS).includes(newStatus)) {
    return { ok: false, error: { code: "INVALID_STATUS", message: "Invalid status." } };
  }

  const actor = getCurrentUser();
  if (!actor) return { ok: false, error: { code: "AUTH_REQUIRED", message: "Login required." } };

  const updated = { order: null, forbidden: false };
  withDb((db) => {
    const o = (db.orders ?? []).find((x) => x.id === orderId);
    if (!o) return db;

    // Farmers can only update their own orders; admins can update any
    if (actor.role !== ROLES.admin && o.sellerId !== actor.id) {
      updated.forbidden = true;
      return db;
    }

    o.status = newStatus;
    o.updatedAt = now();
    updated.order = { ...o };
    return db;
  });

  if (updated.forbidden) return { ok: false, error: { code: "FORBIDDEN", message: "Not your order." } };
  if (!updated.order)    return { ok: false, error: { code: "NOT_FOUND",  message: "Order not found." } };

  emit("orders:changed", { reason: "status_updated", orderId });

  // Notify the buyer about the status change
  createNotification({
    userId: updated.order.buyerId,
    type: "order_status_changed",
    message: `Your order for "${updated.order.title}" is now ${newStatus}`,
    metadata: { orderId, status: newStatus },
  });

  return { ok: true, data: updated.order };
}

export function getOrdersForSeller(sellerId) {
  const db = loadDb();
  const orders = (db.orders ?? [])
    .filter((o) => o.sellerId === sellerId)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
  const userMap = Object.fromEntries(db.users.map((u) => [u.id, u.name ?? u.email]));
  return {
    ok: true,
    data: orders.map((o) => ({ ...o, buyerName: userMap[o.buyerId] ?? "Unknown" })),
  };
}

export function getOrdersForBuyer(buyerId) {
  const db = loadDb();
  const orders = (db.orders ?? [])
    .filter((o) => o.buyerId === buyerId)
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
  const userMap = Object.fromEntries(db.users.map((u) => [u.id, u.name ?? u.email]));
  return {
    ok: true,
    data: orders.map((o) => ({ ...o, sellerName: userMap[o.sellerId] ?? "Unknown" })),
  };
}

export function getAllOrders() {
  const guard = requireAdmin();
  if (!guard.ok) return guard;
  const db = loadDb();
  const userMap = Object.fromEntries(db.users.map((u) => [u.id, u.name ?? u.email]));
  const orders = (db.orders ?? [])
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((o) => ({
      ...o,
      buyerName:  userMap[o.buyerId]  ?? "Unknown",
      sellerName: userMap[o.sellerId] ?? "Unknown",
    }));
  return { ok: true, data: orders };
}
