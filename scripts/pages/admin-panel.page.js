import { boot } from "../app/boot.js";
import { logout } from "../app/auth-state.js";
import { guardAdmin } from "../app/router-guards.js";
import { escapeHtml, toast } from "../app/ui.js";
import {
  getSystemStats,
  listUsers,
  listListings,
  deleteUser,
  takeDownListing,
} from "../services/admin.service.js";
import { getTheme, toggleTheme } from "../app/theme.js";
import { t, onLanguageChange } from "../app/i18n.js";

boot();

const SECTIONS = {
  overview: { title: t("admin.overview"), sub: t("admin.overviewSub") },
  users: { title: t("admin.users"), sub: t("admin.usersSub") },
  listings: { title: t("admin.listings"), sub: t("admin.listingsSub") },
  analytics: { title: t("admin.analytics"), sub: t("admin.analyticsSub") },
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

let adminUser = null;

function showSection(id) {
  document.querySelectorAll(".adm-section").forEach((s) => s.classList.remove("active"));
  document.getElementById(`section-${id}`)?.classList.add("active");
  navButtons.forEach((b) => b.classList.toggle("active", b.dataset.section === id));
  const meta = SECTIONS[id] ?? SECTIONS.overview;
  if (pageTitle) pageTitle.textContent = meta.title;
  if (pageSub) pageSub.textContent = meta.sub;
}

function translateStaticLabels() {
  const navLabels = document.querySelectorAll(".adm-nav-item");
  navLabels.forEach((btn) => {
    if (btn.dataset.section === "overview") btn.innerHTML = `<span class="adm-nav-icon">◈</span> ${t("admin.overview")}`;
    if (btn.dataset.section === "users") btn.innerHTML = `<span class="adm-nav-icon">👥</span> ${t("admin.users")}`;
    if (btn.dataset.section === "listings") btn.innerHTML = `<span class="adm-nav-icon">📦</span> ${t("admin.listings")}`;
    if (btn.dataset.section === "analytics") btn.innerHTML = `<span class="adm-nav-icon">📈</span> ${t("admin.analytics")}`;
  });
  if (logoutBtn) logoutBtn.textContent = t("common.logout");
  if (refreshUsersBtn) refreshUsersBtn.textContent = `↻ ${t("common.refresh")}`;
  if (refreshListingsBtn) refreshListingsBtn.textContent = `↻ ${t("common.refresh")}`;
  const managementLabel = document.querySelector(".adm-nav-label");
  if (managementLabel) managementLabel.textContent = t("admin.management");
  const quickGlance = document.querySelector("#section-overview .adm-section-title");
  if (quickGlance) quickGlance.textContent = t("admin.quickGlance");
  const userHeading = document.querySelector("#section-users .adm-section-title");
  if (userHeading) userHeading.textContent = t("admin.userManagement");
  const listingHeading = document.querySelector("#section-listings .adm-section-title");
  if (listingHeading) listingHeading.textContent = t("admin.marketplaceModeration");
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
    await logout();
    location.href = "/index.html";
  });
}

async function ensureAdmin() {
  // Authoritative, Supabase-backed role check via the shared guard:
  //   not logged in        -> redirected to login (with ?next)
  //   logged in, not admin -> redirected to home
  //   admin                -> allowed through
  const user = await guardAdmin();
  if (!user) return null;
  adminUser = user;
  if (userName) userName.textContent = `${user.name} · ${t("admin.administrator")}`;
  return user;
}

async function renderStats() {
  const res = await getSystemStats();
  if (!res.ok || !statsGrid) return;

  const s = res.data;
  const cards = [
    { label: t("admin.totalUsers"), value: s.totalUsers },
    { label: t("admin.activeListings"), value: s.activeListings },
    { label: t("admin.farmers"), value: s.farmerCount },
    { label: t("admin.businesses"), value: s.businessCount },
    { label: t("admin.consumers"), value: s.consumerCount },
    { label: t("admin.messages"), value: s.totalMessages },
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
    overviewDetail.innerHTML = `<p class="muted">${t("admin.lastRefreshed", { time: new Date().toLocaleTimeString() })}</p>`;
  }
}

async function renderUsers() {
  if (!usersMount) return;
  usersMount.innerHTML = `<div class="adm-empty">${t("admin.loadingUsers")}</div>`;
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
          <tr><th>${t("admin.userName")}</th><th>${t("common.email")}</th><th>${t("common.role")}</th><th>${t("common.actions")}</th></tr>
        </thead>
        <tbody>
          ${res.data
            .map(
              (u) => `
            <tr>
              <td>${escapeHtml(u.name)}</td>
              <td>${escapeHtml(u.email)}</td>
              <td>${escapeHtml(u.role)}</td>
              <td>
                ${
                  u.id !== adminUser?.id && u.role !== "admin"
                    ? `<button class="adm-btn adm-btn-ghost" data-action="delete" data-id="${u.id}">${t("admin.deleteUser")}</button>`
                    : t("admin.dash")
                }
              </td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>
    </div>`;

  const users = res.data;
  usersMount.querySelectorAll("[data-action='delete']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.id;
      const target = users.find((u) => u.id === id);
      const name = target?.name ?? "";
      if (!confirm(t("admin.deleteUserConfirm", { name }))) return;

      const r = await deleteUser(id);
      if (!r.ok) {
        toast("error", r.error.message ?? t("admin.deleteUserFailed"));
        return;
      }
      toast("success", t("admin.deleteUserSuccess", { name }));
      renderUsers();
      renderStats();
    });
  });
}

async function renderListings() {
  if (!listingsMount) return;
  listingsMount.innerHTML = `<div class="adm-empty">${t("admin.loadingListings")}</div>`;
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
          <tr><th>${t("admin.title")}</th><th>${t("admin.seller")}</th><th>${t("common.status")}</th><th>${t("common.price")}</th><th>${t("common.actions")}</th></tr>
        </thead>
        <tbody>
          ${res.data
            .map(
              (l) => `
            <tr>
              <td>${escapeHtml(l.title)}</td>
              <td>${escapeHtml(l.sellerName ?? t("admin.dash"))}</td>
              <td>${escapeHtml(l.status)}</td>
              <td>$${Number(l.price).toFixed(2)}</td>
              <td>
                ${
                  l.status !== "archived"
                    ? `<button class="adm-btn adm-btn-ghost" data-takedown="${l.id}">${t("admin.takeDown")}</button>`
                    : t("admin.dash")
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
      const reason = prompt(t("admin.reasonPrompt")) ?? "";
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
  translateStaticLabels();
  renderStats();
  renderUsers();
  renderListings();
  showSection("overview");
});

onLanguageChange(() => {
  SECTIONS.overview = { title: t("admin.overview"), sub: t("admin.overviewSub") };
  SECTIONS.users = { title: t("admin.users"), sub: t("admin.usersSub") };
  SECTIONS.listings = { title: t("admin.listings"), sub: t("admin.listingsSub") };
  SECTIONS.analytics = { title: t("admin.analytics"), sub: t("admin.analyticsSub") };
  translateStaticLabels();
  renderStats();
  renderUsers();
  renderListings();
  const active = document.querySelector(".adm-nav-item.active")?.dataset.section ?? "overview";
  showSection(active);
});
