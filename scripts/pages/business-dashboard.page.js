import { boot } from "../app/boot.js";
import { guardRole } from "../app/router-guards.js";
import { loadDb } from "../data/db.js";
import { toast, renderStateBlock } from "../app/ui.js";
import {
  mountDashboardShell, renderWelcomeBanner, renderStatGrid, renderComingSoon,
  ICONS, svg,
} from "../components/dashboard-shell.js";
import { listFavorites } from "../services/favorites.service.js";
import { renderListingCard } from "../components/listing-card.js";
import { getOrdersForBuyer } from "../services/orders.service.js";
import { ORDER_STATUS } from "../app/config.js";
import { on } from "../app/events.js";

boot();

const user = guardRole(["business", "admin"]);
if (!user) throw new Error("Auth redirect");

// ─── Nav config ────────────────────────────────────────────────────
const NAV = [
  { id: "overview",   label: "Overview",          icon: ICONS.grid     },
  { id: "marketplace",label: "Marketplace",        icon: ICONS.store    },
  { id: "orders",     label: "Order History",      icon: ICONS.clock    },
  { id: "saved",      label: "Saved Farmers",      icon: ICONS.heart    },
  { id: "insights",   label: "Spending Insights",  icon: ICONS.trending },
];

const { sections } = mountDashboardShell({
  mountEl : document.getElementById("dash-mount"),
  user,
  navLinks: NAV,
});

// ════════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════════
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// ════════════════════════════════════════════════════════════════════
//  OVERVIEW
// ════════════════════════════════════════════════════════════════════
(function renderOverview() {
  const db         = loadDb();
  const savedCount = (db.favorites ?? []).filter((f) => f.userId === user.id).length;
  const sentMsgs   = (db.messages  ?? []).filter((m) => m.fromUserId === user.id).length;
  const allListings = db.listings.filter((l) => l.status === "active").length;
  const myOrders   = (db.orders ?? []).filter((o) => o.buyerId === user.id);
  const activeOrders = myOrders.filter((o) =>
    o.status !== ORDER_STATUS.delivered && o.status !== ORDER_STATUS.cancelled
  ).length;

  const stats = [
    { icon: ICONS.heart,    value: savedCount,    label: "Saved listings",    badge: savedCount > 0 ? "Saved" : null,        badgeType: "success" },
    { icon: ICONS.inbox,    value: sentMsgs,      label: "Inquiries sent",    badge: sentMsgs > 0 ? "Total" : null,          badgeType: "neutral" },
    { icon: ICONS.clock,    value: myOrders.length, label: "Orders placed",   badge: activeOrders > 0 ? `${activeOrders} active` : null, badgeType: "success" },
    { icon: ICONS.store,    value: allListings,   label: "Listings available", badge: "On marketplace",                      badgeType: "neutral" },
  ];

  sections.overview.innerHTML =
    renderWelcomeBanner({
      name    : user.name,
      subtitle: "Discover fresh produce and manage your sourcing here.",
      actions : `
        <a class="btn btn-primary" href="/pages/marketplace.html">${svg(ICONS.store, 15)} Browse marketplace</a>
      `,
    }) +
    `<h3 class="dash-section-title">At a glance</h3>` +
    renderStatGrid(stats) +
    renderSavedPreview();
})();

function renderSavedPreview() {
  const res = listFavorites(user.id);
  if (!res.ok || !res.data.length) return "";
  const items = res.data.slice(0, 3);
  return `
    <h3 class="dash-section-title">Recently saved</h3>
    <div class="grid cols-3">
      ${items.map((l) => renderListingCard(l, { compact: true })).join("")}
    </div>
  `;
}

// ════════════════════════════════════════════════════════════════════
//  MARKETPLACE (quick link section)
// ════════════════════════════════════════════════════════════════════
sections.marketplace.innerHTML = `
  <h3 class="dash-section-title">Marketplace</h3>
  <div class="dash-welcome" style="text-align:center;">
    <div class="dash-welcome-inner" style="justify-content:center; flex-direction:column; align-items:center; gap:1.25rem;">
      <div>
        <h2 class="dash-welcome-greeting" style="font-size:1.35rem;">Browse the FARMIX Marketplace</h2>
        <p class="dash-welcome-sub" style="max-width:50ch; margin:0.4rem auto 0;">
          Discover thousands of fresh listings from local farmers.
          Filter by category, location, and price to find the perfect supplier.
        </p>
      </div>
      <a class="btn btn-primary" href="/pages/marketplace.html">${svg(ICONS.store, 16)} Open Marketplace</a>
    </div>
  </div>
`;

// ════════════════════════════════════════════════════════════════════
//  ORDER HISTORY — real orders with live status
// ════════════════════════════════════════════════════════════════════
(function renderBuyerOrders() {
  const root = sections.orders;

  function statusBadge(status) {
    return `<span class="order-badge order-badge-${esc(status)}">${esc(status)}</span>`;
  }

  function refresh() {
    const res    = getOrdersForBuyer(user.id);
    const orders = res.ok ? res.data : [];

    if (!orders.length) {
      root.innerHTML =
        `<h3 class="dash-section-title">Order History</h3>` +
        renderStateBlock({
          title      : "No orders yet",
          description: "When you place orders on the marketplace, they'll appear here with live status updates.",
          actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">${svg(ICONS.store, 15)} Browse marketplace</a>`,
        });
      return;
    }

    // Summary counts
    const pendingCount   = orders.filter((o) => o.status === ORDER_STATUS.pending).length;
    const activeCount    = orders.filter((o) =>
      o.status !== ORDER_STATUS.delivered && o.status !== ORDER_STATUS.cancelled
    ).length;
    const deliveredCount = orders.filter((o) => o.status === ORDER_STATUS.delivered).length;
    const totalSpent     = orders
      .filter((o) => o.status !== ORDER_STATUS.cancelled)
      .reduce((s, o) => s + Number(o.totalPrice ?? 0), 0);

    const rows = orders.map((o) => {
      const date  = new Date(o.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      const total = `$${Number(o.totalPrice).toFixed(2)}`;
      return `
        <tr>
          <td><span style="font-family:monospace;font-size:0.76rem;color:var(--color-muted);">#${esc(o.id.slice(-6))}</span></td>
          <td style="font-weight:680;">${esc(o.title)}</td>
          <td class="muted">${esc(o.sellerName ?? "—")}</td>
          <td>${esc(String(o.quantity))} ${esc(o.unit)}</td>
          <td style="font-weight:760;">${total}</td>
          <td>${statusBadge(o.status)}</td>
          <td class="muted" style="font-size:0.8rem;">${date}</td>
        </tr>
      `;
    }).join("");

    root.innerHTML = `
      <h3 class="dash-section-title">Order History</h3>

      <div class="order-summary-row">
        <div class="order-summary-chip">
          <span class="order-summary-val">${orders.length}</span>
          <span class="order-summary-lbl">Total orders</span>
        </div>
        <div class="order-summary-chip">
          <span class="order-summary-val">${activeCount}</span>
          <span class="order-summary-lbl">Active</span>
        </div>
        <div class="order-summary-chip">
          <span class="order-summary-val">${deliveredCount}</span>
          <span class="order-summary-lbl">Delivered</span>
        </div>
        <div class="order-summary-chip">
          <span class="order-summary-val">$${totalSpent.toFixed(2)}</span>
          <span class="order-summary-lbl">Total spent</span>
        </div>
      </div>

      <div class="orders-table-wrap">
        <table class="orders-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Product</th>
              <th>Seller</th>
              <th>Qty</th>
              <th>Total</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  refresh();

  // Auto-refresh when any order changes (e.g., farmer updates status)
  on("orders:changed", () => refresh());
})();

// ════════════════════════════════════════════════════════════════════
//  SAVED FARMERS / FAVORITES
// ════════════════════════════════════════════════════════════════════
(function renderSaved() {
  const mount = sections.saved;

  function render() {
    mount.innerHTML = `<h3 class="dash-section-title">Saved Farmers &amp; Listings</h3>`;
    const placeholder = document.createElement("div");
    placeholder.innerHTML = `<div class="stack">${[1,2,3].map(() => `<div class="skeleton" style="height:80px;border-radius:14px;"></div>`).join("")}</div>`;
    mount.appendChild(placeholder);

    window.setTimeout(() => {
      const res = listFavorites(user.id);
      if (!res.ok) {
        placeholder.innerHTML = renderStateBlock({
          title      : "Couldn't load saved listings",
          description: res.error.message ?? "Please try again.",
          actionsHtml: `<button class="btn btn-primary" id="retry-saved">Retry</button>`,
        });
        mount.querySelector("#retry-saved")?.addEventListener("click", render);
        return;
      }
      const items = res.data;
      if (!items.length) {
        placeholder.innerHTML = renderStateBlock({
          title      : "No saved listings yet",
          description: "Open any product page and click Save to keep it here.",
          actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">Find products</a>`,
        });
        return;
      }
      placeholder.innerHTML = `
        <div class="grid cols-3">
          ${items.map((l) => renderListingCard(l)).join("")}
        </div>
        <p class="muted" style="font-size:var(--text-sm); margin-top:0.75rem;">
          Tip: use the product page to save or unsave any listing.
        </p>
      `;
    }, 220);
  }

  render();
})();

// ════════════════════════════════════════════════════════════════════
//  SPENDING INSIGHTS (placeholder)
// ════════════════════════════════════════════════════════════════════
sections.insights.innerHTML =
  `<h3 class="dash-section-title">Spending Insights</h3>` +
  renderComingSoon({
    icon : ICONS.trending,
    title: "Spending insights are coming",
    desc : "Category breakdowns, supplier comparisons, and monthly spend charts will appear here once purchasing is live.",
  });
