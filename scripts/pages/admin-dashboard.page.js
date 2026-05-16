import { initAuthSession, getCurrentUser, logout } from "../services/auth.service.js";
import { loadDb } from "../data/db.js";
import { ROLES } from "../app/config.js";
import { initToasts } from "../components/toast.js";
import { emit } from "../app/events.js";
import { getTheme, toggleTheme, initTheme } from "../app/theme.js";
import {
  getSystemStats,
  listUsers,
  listListings,
  suspendUser,
  activateUser,
  changeUserRole,
  verifyFarmer,
  takeDownListing,
} from "../services/admin.service.js";

// ─── Gate ──────────────────────────────────────────────────────────────
function redirectToLogin() {
  location.replace("/pages/admin-control-center.html");
}

initTheme();
initAuthSession();
const verified = sessionStorage.getItem("farmix.admin.verified");
if (!verified) { redirectToLogin(); throw new Error(""); }

const user = getCurrentUser();
if (!user || user.role !== ROLES.admin) { redirectToLogin(); throw new Error(""); }

initToasts();

// ─── DOM refs ──────────────────────────────────────────────────────────
const navItems       = document.querySelectorAll(".adm-nav-item[data-section]");
const sections       = { overview: "section-overview", users: "section-users", listings: "section-listings", analytics: "section-analytics" };
const pageTitleEl    = document.getElementById("adm-page-title");
const pageSubEl      = document.getElementById("adm-page-sub");
const userNameEl     = document.getElementById("adm-user-name");
const logoutBtn      = document.getElementById("adm-logout-btn");
const themeBtn       = document.getElementById("adm-theme-toggle");
const statsGrid      = document.getElementById("adm-stats-grid");
const overviewDetail = document.getElementById("adm-overview-detail");
const usersMount     = document.getElementById("adm-users-mount");
const listingsMount  = document.getElementById("adm-listings-mount");
const usersCount     = document.getElementById("users-count");
const listingsCount  = document.getElementById("listings-count");

userNameEl.textContent = user.name ?? user.email;

function renderThemeToggle() {
  const theme = getTheme();
  if (!themeBtn) return;
  themeBtn.setAttribute("aria-label", `Toggle ${theme === "dark" ? "light" : "dark"} mode`);
  themeBtn.setAttribute("title", `Switch to ${theme === "dark" ? "light" : "dark"} mode`);
  themeBtn.innerHTML = theme === "dark"
    ? "☾"
    : "☀";
}
renderThemeToggle();
themeBtn?.addEventListener("click", () => {
  toggleTheme();
  renderThemeToggle();
});

// ─── Helpers ───────────────────────────────────────────────────────────
function admToast(type, message) {
  emit("toast", { type, message });
}

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function statusBadge(u) {
  if (u.suspended) return `<span class="adm-badge adm-badge-suspended">Suspended</span>`;
  return `<span class="adm-badge adm-badge-active">Active</span>`;
}

function listingStatusBadge(status) {
  if (status === "active")   return `<span class="adm-badge adm-badge-active">Active</span>`;
  if (status === "archived") return `<span class="adm-badge adm-badge-archived">Archived</span>`;
  return `<span class="adm-badge adm-badge-warning">${esc(status)}</span>`;
}

// ─── Section Nav ───────────────────────────────────────────────────────
const sectionMeta = {
  overview:  { title: "Overview",               sub: "System status and summary" },
  users:     { title: "User Management",        sub: "Manage accounts, roles, and access" },
  listings:  { title: "Marketplace Moderation", sub: "Review and moderate all listings" },
  analytics: { title: "Platform Analytics",     sub: "Revenue, registrations, and marketplace trends" },
};

let currentSection = "overview";

function showSection(name) {
  currentSection = name;
  navItems.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.section === name);
  });
  Object.entries(sections).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle("active", key === name);
  });
  const meta = sectionMeta[name] ?? { title: name, sub: "" };
  pageTitleEl.textContent = meta.title;
  pageSubEl.textContent   = meta.sub;

  if (name === "users")     renderUsers();
  if (name === "listings")  renderListings();
  if (name === "analytics") renderAnalytics();
}

navItems.forEach((btn) => {
  btn.addEventListener("click", () => showSection(btn.dataset.section));
});

// ─── Logout ────────────────────────────────────────────────────────────
logoutBtn.addEventListener("click", () => {
  logout();
  sessionStorage.removeItem("farmix.admin.verified");
  redirectToLogin();
});

// ─── Overview ──────────────────────────────────────────────────────────
function renderOverview() {
  const res = getSystemStats();
  if (!res.ok) {
    statsGrid.innerHTML = `<div class="adm-empty">${esc(res.error.message)}</div>`;
    return;
  }
  const s = res.data;
  statsGrid.innerHTML = `
    <div class="adm-stat-card">
      <div class="adm-stat-label">Total Users</div>
      <div class="adm-stat-value">${s.totalUsers}</div>
      <div class="adm-stat-sub">${s.farmerCount} farmers · ${s.businessCount} businesses</div>
    </div>
    <div class="adm-stat-card">
      <div class="adm-stat-label">Active Listings</div>
      <div class="adm-stat-value lime">${s.activeListings}</div>
      <div class="adm-stat-sub">Live on marketplace</div>
    </div>
    <div class="adm-stat-card">
      <div class="adm-stat-label">Suspended</div>
      <div class="adm-stat-value ${s.suspendedUsers > 0 ? "red" : ""}">${s.suspendedUsers}</div>
      <div class="adm-stat-sub">Blocked accounts</div>
    </div>
    <div class="adm-stat-card">
      <div class="adm-stat-label">Consumers</div>
      <div class="adm-stat-value">${s.consumerCount}</div>
      <div class="adm-stat-sub">Registered buyers</div>
    </div>
    <div class="adm-stat-card">
      <div class="adm-stat-label">Messages</div>
      <div class="adm-stat-value">${s.totalMessages}</div>
      <div class="adm-stat-sub">Total in system</div>
    </div>
  `;

  overviewDetail.innerHTML = `
    <div class="adm-table-wrap">
      <table class="adm-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>Total registered users</td><td>${s.totalUsers}</td></tr>
          <tr><td>Farmer accounts</td><td>${s.farmerCount}</td></tr>
          <tr><td>Business accounts</td><td>${s.businessCount}</td></tr>
          <tr><td>Consumer accounts</td><td>${s.consumerCount}</td></tr>
          <tr><td>Suspended accounts</td><td>${s.suspendedUsers}</td></tr>
          <tr><td>Active marketplace listings</td><td>${s.activeListings}</td></tr>
          <tr><td>Total messages</td><td>${s.totalMessages}</td></tr>
        </tbody>
      </table>
    </div>
  `;
}

// ─── Users Table ───────────────────────────────────────────────────────
function renderUsers() {
  usersMount.innerHTML = `<div class="adm-empty">Loading…</div>`;

  setTimeout(() => {
    const res = listUsers();
    if (!res.ok) {
      usersMount.innerHTML = `<div class="adm-empty">${esc(res.error.message)}</div>`;
      return;
    }

    const users = res.data;
    usersCount.textContent = users.length;

    if (!users.length) {
      usersMount.innerHTML = `<div class="adm-empty">No users found.</div>`;
      return;
    }

    const rows = users.map((u) => {
      const isCurrentAdmin = u.id === user.id;
      const verifiedBadge = u.verified
        ? `<span class="adm-verified-badge">✓ Verified</span>`
        : (u.role === ROLES.farmer
          ? `<button class="adm-btn adm-btn-verify" data-verify="${esc(u.id)}" type="button">Verify</button>`
          : `<span style="color:var(--adm-muted);font-size:0.78rem;">—</span>`);

      return `
        <tr data-user-row="${esc(u.id)}">
          <td>
            <div class="adm-cell-stack">
              <span class="adm-cell-primary">${esc(u.name ?? "—")}</span>
              <span class="adm-cell-secondary">${esc(u.email)}</span>
            </div>
          </td>
          <td>
            ${isCurrentAdmin
              ? `<span class="adm-badge adm-badge-warning">admin (you)</span>`
              : `<select class="adm-role-select" data-role-change="${esc(u.id)}" ${isCurrentAdmin ? "disabled" : ""}>
                  ${Object.values(ROLES).map((r) =>
                    `<option value="${r}" ${u.role === r ? "selected" : ""}>${r}</option>`
                  ).join("")}
                </select>`}
          </td>
          <td>${statusBadge(u)}</td>
          <td>${verifiedBadge}</td>
          <td>${fmtDate(u.createdAt)}</td>
          <td>
            <div style="display:flex;gap:0.4rem;flex-wrap:wrap;">
              ${isCurrentAdmin ? `<span style="color:var(--adm-muted);font-size:0.78rem;">—</span>` : `
                ${u.suspended
                  ? `<button class="adm-btn adm-btn-activate" data-activate="${esc(u.id)}" type="button">Activate</button>`
                  : `<button class="adm-btn adm-btn-suspend" data-suspend="${esc(u.id)}" type="button">Suspend</button>`}
              `}
            </div>
          </td>
        </tr>
      `;
    }).join("");

    usersMount.innerHTML = `
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead>
            <tr>
              <th>Name / Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Verified</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    // Wire up role selects
    usersMount.querySelectorAll("[data-role-change]").forEach((sel) => {
      sel.addEventListener("change", () => {
        const uid = sel.getAttribute("data-role-change");
        const r   = changeUserRole(uid, sel.value);
        if (!r.ok) { admToast("error", r.error.message); renderUsers(); return; }
        admToast("success", `Role updated to ${sel.value}.`);
        renderUsers();
        renderOverview();
      });
    });

    // Suspend
    usersMount.querySelectorAll("[data-suspend]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const uid  = btn.getAttribute("data-suspend");
        const name = btn.closest("[data-user-row]")?.querySelector(".adm-cell-primary")?.textContent?.trim() ?? "User";
        const r    = suspendUser(uid);
        if (!r.ok) { admToast("error", r.error.message); return; }
        admToast("success", `${name} has been suspended.`);
        renderUsers();
        renderOverview();
      });
    });

    // Activate
    usersMount.querySelectorAll("[data-activate]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const uid  = btn.getAttribute("data-activate");
        const name = btn.closest("[data-user-row]")?.querySelector(".adm-cell-primary")?.textContent?.trim() ?? "User";
        const r    = activateUser(uid);
        if (!r.ok) { admToast("error", r.error.message); return; }
        admToast("success", `${name} has been reactivated.`);
        renderUsers();
        renderOverview();
      });
    });

    // Verify
    usersMount.querySelectorAll("[data-verify]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const uid  = btn.getAttribute("data-verify");
        const name = btn.closest("[data-user-row]")?.querySelector(".adm-cell-primary")?.textContent?.trim() ?? "Farmer";
        const r    = verifyFarmer(uid);
        if (!r.ok) { admToast("error", r.error.message); return; }
        admToast("success", `${name} is now verified.`);
        renderUsers();
      });
    });
  }, 160);
}

document.getElementById("refresh-users-btn")
  .addEventListener("click", renderUsers);

// ─── Listings Table ────────────────────────────────────────────────────
function renderListings() {
  listingsMount.innerHTML = `<div class="adm-empty">Loading…</div>`;

  setTimeout(() => {
    const res = listListings({ includeArchived: true });
    if (!res.ok) {
      listingsMount.innerHTML = `<div class="adm-empty">${esc(res.error.message)}</div>`;
      return;
    }

    const items = res.data;
    listingsCount.textContent = items.length;

    if (!items.length) {
      listingsMount.innerHTML = `<div class="adm-empty">No listings found.</div>`;
      return;
    }

    const rows = items.map((l) => {
      const price = Number(l.price).toFixed(2).replace(/\.00$/, "");
      return `
        <tr data-listing-row="${esc(l.id)}">
          <td>
            <div class="adm-cell-stack">
              <span class="adm-cell-primary">${esc(l.title)}</span>
              <span class="adm-cell-secondary">${esc(l.location ?? "—")}</span>
            </div>
          </td>
          <td>${esc(l.categoryId ?? "—")}</td>
          <td>${esc(l.sellerName ?? "—")}</td>
          <td>$${esc(price)} / ${esc(l.unit ?? "unit")}</td>
          <td>${listingStatusBadge(l.status)}</td>
          <td>${esc(String(l.views ?? 0))}</td>
          <td>${fmtDate(l.createdAt)}</td>
          <td>
            <div style="display:flex;gap:0.4rem;flex-wrap:wrap;align-items:center;">
              <a class="adm-btn adm-btn-ghost"
                href="/pages/product.html?id=${encodeURIComponent(l.id)}"
                target="_blank" rel="noopener">View</a>
              ${l.status !== "archived"
                ? `<button class="adm-btn adm-btn-takedown"
                    data-takedown-toggle="${esc(l.id)}"
                    type="button">Take Down</button>`
                : `<span style="color:var(--adm-muted);font-size:0.78rem;">Taken down</span>`}
            </div>
          </td>
        </tr>
        <tr class="adm-takedown-row" id="takedown-row-${esc(l.id)}" data-takedown-row="${esc(l.id)}">
          <td colspan="8" class="adm-takedown-inner" style="padding:0.85rem 1.1rem;">
            <label for="takedown-reason-${esc(l.id)}">Reason (optional)</label>
            <textarea class="adm-takedown-textarea"
              id="takedown-reason-${esc(l.id)}"
              placeholder="Describe why this listing is being removed…"
              rows="2"></textarea>
            <div class="adm-takedown-actions">
              <button class="adm-btn adm-btn-suspend"
                data-takedown-confirm="${esc(l.id)}" type="button">Confirm Take Down</button>
              <button class="adm-btn adm-btn-ghost"
                data-takedown-cancel="${esc(l.id)}" type="button">Cancel</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    listingsMount.innerHTML = `
      <div class="adm-table-wrap">
        <table class="adm-table">
          <thead>
            <tr>
              <th>Title / Location</th>
              <th>Category</th>
              <th>Seller</th>
              <th>Price</th>
              <th>Status</th>
              <th>Views</th>
              <th>Posted</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    // Toggle take-down row
    listingsMount.querySelectorAll("[data-takedown-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id  = btn.getAttribute("data-takedown-toggle");
        const row = listingsMount.querySelector(`[data-takedown-row="${id}"]`);
        if (row) row.classList.toggle("show");
      });
    });

    // Cancel
    listingsMount.querySelectorAll("[data-takedown-cancel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id  = btn.getAttribute("data-takedown-cancel");
        const row = listingsMount.querySelector(`[data-takedown-row="${id}"]`);
        if (row) row.classList.remove("show");
      });
    });

    // Confirm take-down
    listingsMount.querySelectorAll("[data-takedown-confirm]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id       = btn.getAttribute("data-takedown-confirm");
        const textarea = listingsMount.querySelector(`#takedown-reason-${CSS.escape(id)}`);
        const reason   = textarea ? textarea.value.trim() : "";
        const r        = takeDownListing(id, reason);
        if (!r.ok) { admToast("error", r.error.message); return; }
        admToast("success", "Listing has been taken down.");
        renderListings();
        renderOverview();
      });
    });
  }, 160);
}

document.getElementById("refresh-listings-btn")
  .addEventListener("click", renderListings);

// ─── Analytics ────────────────────────────────────────────────────────
let analyticsCharts = [];

function renderAnalytics() {
  analyticsCharts.forEach((c) => { try { c.destroy(); } catch (_) {} });
  analyticsCharts = [];

  const analyticsMount = document.getElementById("adm-analytics-mount");
  if (!analyticsMount) return;

  const db  = loadDb();
  const DAY = 86400000;
  const now = Date.now();
  const days = 7;
  const labels      = [];
  const revenueData = new Array(days).fill(0);
  const regData     = new Array(days).fill(0);

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * DAY);
    labels.push(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  }
  (db.orders ?? []).forEach((o) => {
    const daysAgo = Math.floor((now - o.createdAt) / DAY);
    if (daysAgo >= 0 && daysAgo < days) revenueData[days - 1 - daysAgo] += Number(o.totalPrice ?? 0);
  });
  db.users.forEach((u) => {
    if (!u.createdAt) return;
    const daysAgo = Math.floor((now - u.createdAt) / DAY);
    if (daysAgo >= 0 && daysAgo < days) regData[days - 1 - daysAgo]++;
  });

  const isDark    = document.documentElement.getAttribute("data-theme") === "dark";
  const gridColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(26,31,54,0.07)";
  const tickColor = isDark ? "rgba(232,234,240,0.55)" : "rgba(26,31,54,0.50)";

  const baseOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend : { display: false },
      tooltip: {
        backgroundColor: "rgba(26,31,54,0.95)",
        titleColor     : "#73d700",
        bodyColor      : "#e8eaf0",
        borderColor    : "rgba(115,215,0,0.30)",
        borderWidth    : 1,
      },
    },
    scales: {
      x: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } } },
      y: { grid: { color: gridColor }, ticks: { color: tickColor, font: { size: 11 } }, beginAtZero: true },
    },
  };

  analyticsMount.innerHTML = `
    <div class="adm-chart-row">
      <div class="adm-chart-widget">
        <div class="adm-chart-widget-head">
          <p class="adm-chart-widget-title">Platform Revenue</p>
          <p class="adm-chart-widget-sub">Total order value ($) — last 7 days</p>
        </div>
        <div class="adm-chart-widget-body">
          <canvas id="adm-chart-revenue"></canvas>
        </div>
      </div>
      <div class="adm-chart-widget">
        <div class="adm-chart-widget-head">
          <p class="adm-chart-widget-title">User Registrations</p>
          <p class="adm-chart-widget-sub">New accounts per day — last 7 days</p>
        </div>
        <div class="adm-chart-widget-body">
          <canvas id="adm-chart-reg"></canvas>
        </div>
      </div>
    </div>
  `;

  const revenueCtx = document.getElementById("adm-chart-revenue")?.getContext("2d");
  if (revenueCtx && window.Chart) {
    analyticsCharts.push(new window.Chart(revenueCtx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          data           : revenueData.map((v) => Math.round(v * 100) / 100),
          backgroundColor: "rgba(115,215,0,0.55)",
          borderColor    : "#73d700",
          borderWidth    : 1.5,
          borderRadius   : 5,
          borderSkipped  : false,
        }],
      },
      options: baseOpts,
    }));
  }

  const regCtx = document.getElementById("adm-chart-reg")?.getContext("2d");
  if (regCtx && window.Chart) {
    analyticsCharts.push(new window.Chart(regCtx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          data               : regData,
          borderColor        : "#73d700",
          backgroundColor    : "rgba(115,215,0,0.12)",
          borderWidth        : 2,
          tension            : 0.4,
          fill               : true,
          pointBackgroundColor: "#73d700",
          pointRadius        : 4,
          pointHoverRadius   : 6,
        }],
      },
      options: baseOpts,
    }));
  }
}

// ─── Boot ──────────────────────────────────────────────────────────────
renderOverview();
