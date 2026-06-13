import { boot } from "../app/boot.js";
import { ROLES } from "../app/config.js";
import { guardRole } from "../app/router-guards.js";
import { escapeHtml, renderStateBlock } from "../app/ui.js";
import { getUserListings } from "../services/listings.service.js";
import { listInquiriesForSeller } from "../services/messages.service.js";
import { renderListingCard } from "../components/listing-card.js";
import { t, onLanguageChange } from "../app/i18n.js";

boot();

const root = document.getElementById("fd-root");
if (!root) throw new Error("Missing #fd-root");

const pageTitle = document.getElementById("fd-page-title");
const pageSub = document.getElementById("fd-page-sub");

function getSections() {
  return {
    overview: { title: t("farmer.overview"), sub: t("farmer.overviewSub") },
    listings: { title: t("farmer.myListings"), sub: t("nav.link.marketplace") },
    messages: { title: t("farmer.messages"), sub: t("messages.conversations") },
    profile: { title: t("farmer.profile"), sub: t("account.signedInAs") },
  };
}

let user = null;
let listings = [];
let messages = [];
let activeSection = "overview";

function translateStaticLabels() {
  const sidebarTitle = document.querySelector(".fd-sidebar-title");
  if (sidebarTitle) sidebarTitle.textContent = t("farmer.dashboardTitle");
  const badge = document.querySelector(".fd-sidebar-badge");
  if (badge) badge.textContent = t("nav.role.farmer");

  document.querySelectorAll(".fd-nav-item").forEach((btn) => {
    const section = btn.dataset.section;
    if (section === "overview") btn.innerHTML = `<span class="fd-nav-icon">◈</span> ${t("farmer.overview")}`;
    if (section === "listings") btn.innerHTML = `<span class="fd-nav-icon">📦</span> ${t("farmer.myListings")}`;
    if (section === "messages") btn.innerHTML = `<span class="fd-nav-icon">✉</span> ${t("farmer.messages")}`;
    if (section === "profile") btn.innerHTML = `<span class="fd-nav-icon">👤</span> ${t("farmer.profile")}`;
  });
}

function showSection(id) {
  activeSection = id;
  document.querySelectorAll(".fd-section").forEach((s) => s.classList.remove("active"));
  document.getElementById(`fd-section-${id}`)?.classList.add("active");
  document.querySelectorAll(".fd-nav-item").forEach((b) => b.classList.toggle("active", b.dataset.section === id));

  const meta = getSections()[id] ?? getSections().overview;
  if (pageTitle) pageTitle.textContent = meta.title;
  if (pageSub) pageSub.textContent = meta.sub;
}

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t("admin.dash");
  return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function messageSenderLabel(m) {
  if (m.metadata?.name) return m.metadata.name;
  if (m.senderId === user.id) return t("common.you");
  return t("common.buyer");
}

function renderOverview() {
  const totalViews = listings.reduce((sum, l) => sum + Number(l.views ?? 0), 0);
  const totalInquiries = messages.length;
  const recentListings = listings.slice(0, 5);
  const recentMessages = messages.slice(0, 5);

  return `
    <section class="fd-section active" id="fd-section-overview">
      <div class="fd-stats-grid">
        <article class="fd-stat-card">
          <div class="fd-stat-value">${listings.length}</div>
          <div class="fd-stat-label">${t("farmer.totalListings")}</div>
        </article>
        <article class="fd-stat-card">
          <div class="fd-stat-value">${totalViews}</div>
          <div class="fd-stat-label">${t("farmer.totalViews")}</div>
        </article>
        <article class="fd-stat-card">
          <div class="fd-stat-value">${totalInquiries}</div>
          <div class="fd-stat-label">${t("farmer.totalInquiries")}</div>
        </article>
      </div>

      <div class="fd-section-head">
        <h2 class="fd-section-title">${t("farmer.recentListings")}</h2>
        <span class="fd-section-spacer"></span>
        <a class="btn btn-ghost btn-sm" href="/pages/add-listing.html">${t("nav.link.addListing")}</a>
      </div>
      ${
        recentListings.length
          ? `
        <div class="fd-table-wrap">
          <table class="fd-table">
            <thead>
              <tr><th>${t("common.title")}</th><th>${t("common.status")}</th><th>${t("common.views")}</th><th>${t("common.price")}</th><th>${t("common.updated")}</th></tr>
            </thead>
            <tbody>
              ${recentListings
                .map(
                  (l) => `
                <tr>
                  <td><a class="fd-row-link" href="/pages/product.html?id=${encodeURIComponent(l.id)}">${escapeHtml(l.title)}</a></td>
                  <td>${escapeHtml(l.status)}</td>
                  <td>${Number(l.views ?? 0)}</td>
                  <td>$${Number(l.price ?? 0).toFixed(2)}</td>
                  <td>${escapeHtml(formatDate(l.updatedAt))}</td>
                </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>`
          : `<div class="fd-empty">${t("farmer.noListingsYet")}</div>`
      }

      <div class="fd-section-head">
        <h2 class="fd-section-title">${t("farmer.recentInquiries")}</h2>
        <span class="fd-section-spacer"></span>
        <a class="btn btn-ghost btn-sm" href="/pages/messages.html">${t("farmer.openInbox")}</a>
      </div>
      ${
        recentMessages.length
          ? `
        <div class="fd-message-list">
          ${recentMessages
            .map(
              (m) => `
            <article class="fd-message-item">
              <div class="fd-message-top">
                <strong>${escapeHtml(messageSenderLabel(m))}</strong>
                <span class="fd-message-time">${escapeHtml(formatDate(m.createdAt))}</span>
              </div>
              <div class="fd-message-sub">${escapeHtml(m.metadata?.listingTitle ?? t("common.inquiry"))}</div>
              <p class="fd-message-body">${escapeHtml(m.content ?? "")}</p>
            </article>`,
            )
            .join("")}
        </div>`
          : `<div class="fd-empty">${t("farmer.noInquiriesYet")}</div>`
      }
    </section>
  `;
}

function renderListingsSection() {
  return `
    <section class="fd-section" id="fd-section-listings">
      <div class="fd-section-head">
        <h2 class="fd-section-title">${t("farmer.myListings")}</h2>
        <span class="fd-section-count">${listings.length}</span>
      </div>
      ${
        listings.length
          ? `<div class="grid cols-3">${listings.map((l) => renderListingCard(l, { compact: true })).join("")}</div>`
          : `<div class="fd-empty">${t("farmer.noListingsFound")}</div>`
      }
    </section>
  `;
}

function renderMessagesSection() {
  return `
    <section class="fd-section" id="fd-section-messages">
      <div class="fd-section-head">
        <h2 class="fd-section-title">${t("farmer.messagesInboxPreview")}</h2>
        <span class="fd-section-count">${messages.length}</span>
        <span class="fd-section-spacer"></span>
        <a class="btn btn-ghost btn-sm" href="/pages/messages.html">${t("farmer.openFullInbox")}</a>
      </div>
      ${
        messages.length
          ? `
        <div class="fd-table-wrap">
          <table class="fd-table">
            <thead>
              <tr><th>${t("common.from")}</th><th>${t("common.listing")}</th><th>${t("common.message")}</th><th>${t("common.received")}</th></tr>
            </thead>
            <tbody>
              ${messages
                .slice(0, 15)
                .map(
                  (m) => `
                <tr>
                  <td>${escapeHtml(messageSenderLabel(m))}</td>
                  <td>${escapeHtml(m.metadata?.listingTitle ?? t("admin.dash"))}</td>
                  <td>${escapeHtml(String(m.content ?? "").slice(0, 120))}</td>
                  <td>${escapeHtml(formatDate(m.createdAt))}</td>
                </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>`
          : `<div class="fd-empty">${t("messages.noMessages")}</div>`
      }
    </section>
  `;
}

function renderProfileSection() {
  return `
    <section class="fd-section" id="fd-section-profile">
      <div class="fd-profile-card card pad">
        <h2 class="fd-section-title">${t("farmer.profile")}</h2>
        <p class="fd-profile-line"><strong>${escapeHtml(user.name ?? t("nav.role.farmer"))}</strong></p>
        <p class="fd-profile-line">${escapeHtml(user.email ?? "")}</p>
        <p class="fd-profile-line">${escapeHtml(user.location ?? "")}</p>
        <div class="fd-profile-actions">
          <a class="btn btn-primary" href="/pages/account.html">${t("farmer.editProfile")}</a>
          <a class="btn btn-ghost" href="/pages/add-listing.html">${t("nav.link.addListing")}</a>
          <a class="btn btn-ghost" href="/pages/marketplace.html">${t("farmer.viewMarketplace")}</a>
        </div>
      </div>
    </section>
  `;
}

function renderDashboard() {
  root.innerHTML = `
    ${renderOverview()}
    ${renderListingsSection()}
    ${renderMessagesSection()}
    ${renderProfileSection()}
  `;

  document.querySelectorAll(".fd-nav-item").forEach((btn) => {
    btn.addEventListener("click", () => showSection(btn.dataset.section));
  });
  showSection(activeSection);
}

async function loadData() {
  const [listingsRes, messagesRes] = await Promise.all([getUserListings(user.id), listInquiriesForSeller(user.id)]);
  listings = listingsRes.ok ? listingsRes.data : [];
  messages = messagesRes.ok ? messagesRes.data : [];
}

async function init() {
  const authed = await guardRole([ROLES.farmer]);
  if (!authed) return;
  user = authed;

  root.innerHTML = `<div class="fd-empty">${t("farmer.loadingDashboard")}</div>`;
  await loadData();
  translateStaticLabels();
  renderDashboard();
}

init().catch(() => {
  root.innerHTML = renderStateBlock({
    title: t("farmer.unavailable"),
    description: t("farmer.unavailableDesc"),
    actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">${t("common.goToMarketplace")}</a>`,
  });
});

onLanguageChange(() => {
  if (!user) return;
  translateStaticLabels();
  renderDashboard();
});
