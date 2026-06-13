import { boot } from "../app/boot.js";
import { initAppState, logout, getCurrentUser } from "../app/auth-state.js";
import { ROLES } from "../app/config.js";
import { escapeHtml } from "../app/ui.js";
import {
  getSystemStats,
  listUsers,
  listListings,
  suspendUser,
  activateUser,
  takeDownListing,
} from "../services/admin.service.js";
import { getTheme, toggleTheme } from "../app/theme.js";

boot();

const SECTIONS = {
  overview: { title: "Overview", sub: "System status and summary" },
  users: { title: "Users", sub: "Manage accounts and roles" },
  listings: { title: "Listings", sub: "Moderate marketplace content" },
  analytics: { title: "Analytics", sub: "Platform activity" },
};

const navButtons = document.querySelectorAll(".adm-nav-item");
const pageTitle = document.getElementById("adm-page-title");
const pageSub = document.getElementById("adm-page-sub");
const statsGrid = document.getElementById("adm-stats-grid");
const overviewDetail = document.getElementById("adm-overview-detail");
const usersMount = document.getElementById("adm-users-mount");
const listingsMount = document.getElementById("adm-listings-mount");
const usersCount = document.getElementById("users-count");
const listingsCount = document.getElementById("listings-count");
const userName = document.getElementById("adm-user-name");
const logoutBtn = document.getElementById("adm-logout-btn");
const themeToggle = document.getElementById("adm-theme-toggle");
const refreshUsersBtn = document.getElementById("refresh-users-btn");
const refreshListingsBtn = document.getElementById("refresh-listings-btn");

function showSection(id) {
  document.querySelectorAll(".adm-section").forEach((s) => s.classList.remove("active"));
  document.getElementById(`section-${id}`)?.classList.add("active");
  navButtons.forEach((b) => b.classList.toggle("active", b.dataset.section === id));
  const meta = SECTIONS[id] ?? SECTIONS.overview;
  if (pageTitle) pageTitle.textContent = meta.title;
  if (pageSub) pageSub.textContent = meta.sub;
}

navButtons.forEach((btn) => {
  btn.addEventListener("click", () => showSection(btn.dataset.section));
});

function themeIcon(theme) {
  return theme === "dark" ? "☀" : "🌙";
}

if (themeToggle) {
  themeToggle.textContent = themeIcon(getTheme());
  themeToggle.addEventListener("click", () => {
    const next = toggleTheme();
    themeToggle.textContent = themeIcon(next);
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    sessionStorage.removeItem("farmix.admin.verified");
    await logout();
    location.href = "/pages/admin-login.html";
  });
}

async function ensureAdmin() {
  await initAppState();
  const verified = sessionStorage.getItem("farmix.admin.verified");
  const user = getCurrentUser();
  if (!verified || !user || user.role !== ROLES.admin) {
    location.replace("/pages/admin-login.html");
    return null;
  }
  if (userName) userName.textContent = `${user.name} · Administrator`;
  return user;
}

async function renderStats() {
  const res = await getSystemStats();
  if (!res.ok || !statsGrid) return;

  const s = res.data;
  const cards = [
    { label: "Total users", value: s.totalUsers },
    { label: "Active listings", value: s.activeListings },
    { label: "Farmers", value: s.farmerCount },
    { label: "Businesses", value: s.businessCount },
    { label: "Suspended", value: s.suspendedUsers },
    { label: "Messages", value: s.totalMessages },
  ];

  statsGrid.innerHTML = cards
    .map(
      (c) => `
    <div class="adm-stat-card">
      <div class="adm-stat-value">${c.value}</div>
      <div class="adm-stat-label">${escapeHtml(c.label)}</div>
    </div>`,
    )
    .join("");

  if (overviewDetail) {
    overviewDetail.innerHTML = `<p class="muted">Last refreshed ${new Date().toLocaleTimeString()}.</p>`;
  }
}

async function renderUsers() {
  if (!usersMount) return;
  usersMount.innerHTML = `<div class="adm-empty">Loading users…</div>`;
  const res = await listUsers();
  if (!res.ok) {
    usersMount.innerHTML = `<div class="adm-empty">${escapeHtml(res.error.message)}</div>`;
    return;
  }

  if (usersCount) usersCount.textContent = String(res.data.length);

  usersMount.innerHTML = `
    <div class="adm-table-wrap">
      <table class="adm-table">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${res.data
            .map(
              (u) => `
            <tr>
              <td>${escapeHtml(u.name)}</td>
              <td>${escapeHtml(u.email)}</td>
              <td>${escapeHtml(u.role)}</td>
              <td>${u.suspended ? "Suspended" : "Active"}</td>
              <td>
                ${
                  u.suspended
                    ? `<button class="adm-btn adm-btn-ghost" data-action="activate" data-id="${u.id}">Activate</button>`
                    : `<button class="adm-btn adm-btn-ghost" data-action="suspend" data-id="${u.id}">Suspend</button>`
                }
              </td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;

  usersMount.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      const r = action === "suspend" ? await suspendUser(id) : await activateUser(id);
      if (!r.ok) return;
      renderUsers();
      renderStats();
    });
  });
}

async function renderListings() {
  if (!listingsMount) return;
  listingsMount.innerHTML = `<div class="adm-empty">Loading listings…</div>`;
  const res = await listListings({ includeArchived: true });
  if (!res.ok) {
    listingsMount.innerHTML = `<div class="adm-empty">${escapeHtml(res.error.message)}</div>`;
    return;
  }

  if (listingsCount) listingsCount.textContent = String(res.data.length);

  listingsMount.innerHTML = `
    <div class="adm-table-wrap">
      <table class="adm-table">
        <thead>
          <tr><th>Title</th><th>Seller</th><th>Status</th><th>Price</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${res.data
            .map(
              (l) => `
            <tr>
              <td>${escapeHtml(l.title)}</td>
              <td>${escapeHtml(l.sellerName ?? "—")}</td>
              <td>${escapeHtml(l.status)}</td>
              <td>$${Number(l.price).toFixed(2)}</td>
              <td>
                ${
                  l.status !== "archived"
                    ? `<button class="adm-btn adm-btn-ghost" data-takedown="${l.id}">Take down</button>`
                    : "—"
                }
              </td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;

  listingsMount.querySelectorAll("[data-takedown]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const reason = prompt("Reason for takedown (optional):") ?? "";
      const r = await takeDownListing(btn.dataset.takedown, reason);
      if (!r.ok) return;
      renderListings();
      renderStats();
    });
  });
}

refreshUsersBtn?.addEventListener("click", renderUsers);
refreshListingsBtn?.addEventListener("click", renderListings);

ensureAdmin().then((user) => {
  if (!user) return;
  renderStats();
  renderUsers();
  renderListings();
  showSection("overview");
});
