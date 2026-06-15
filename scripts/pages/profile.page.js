import { boot } from "../app/boot.js";
import { escapeHtml, renderSkeletonCards, renderStateBlock, qs, mountListingCardLinks } from "../app/ui.js";
import { getUserById } from "../services/users.service.js";
import { getUserListings } from "../app/state.js";
import { renderListingCard } from "../components/listing-card.js";
import { t, onLanguageChange, translatePageHead } from "../app/i18n.js";

boot();
translatePageHead("profile.pageTitle", "profile.pageSubtitle");

const root = document.getElementById("profile-root");
let profileUser = null;
let profileListings = null;
let profileId = null;
let loadError = null;

function renderMissingId() {
  root.innerHTML = renderStateBlock({
    title: t("profile.missingId"),
    description: t("profile.missingIdDesc"),
    actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">${t("product.backToMarketplace")}</a>`,
  });
}

function renderNotFound() {
  root.innerHTML = renderStateBlock({
    title: t("profile.notFound"),
    description: t("profile.notFoundDesc"),
    actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">${t("product.backToMarketplace")}</a>`,
  });
}

function renderProfile() {
  if (!profileUser) return;

  root.innerHTML = `
    <section class="card pad">
      <div id="profile-head"></div>
    </section>
    <div style="height: 0.9rem;"></div>
    <section class="card pad">
      <h2 style="margin:0 0 0.6rem; letter-spacing:-0.01em;">${t("profile.activeListings")}</h2>
      <div id="profile-listings"></div>
    </section>
  `;

  const head = qs(root, "#profile-head");
  const listingsMount = qs(root, "#profile-listings");
  const user = profileUser;

  head.innerHTML = `
    <div class="pill">${escapeHtml(user.role)}</div>
    <h2 style="margin:0.5rem 0 0; letter-spacing:-0.01em;">${escapeHtml(user.name)}</h2>
    <div class="muted">${escapeHtml(user.location)}</div>
    ${user.farmName ? `<div class="muted">${t("profile.farm")}: <strong>${escapeHtml(user.farmName)}</strong></div>` : ""}
    ${user.companyName ? `<div class="muted">${t("profile.business")}: <strong>${escapeHtml(user.companyName)}</strong></div>` : ""}
    ${user.phone ? `<div class="muted">${t("common.phone")}: <strong>${escapeHtml(user.phone)}</strong></div>` : ""}
    ${user.bio ? `<p class="muted" style="margin:0.6rem 0 0; white-space:pre-wrap;">${escapeHtml(user.bio)}</p>` : ""}
  `;

  if (loadError) {
    listingsMount.innerHTML = renderStateBlock({
      title: t("profile.couldntLoadListings"),
      description: loadError,
      actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">${t("common.back")}</a>`,
    });
    return;
  }

  if (!profileListings?.length) {
    listingsMount.innerHTML = renderStateBlock({
      title: t("profile.noActiveListings"),
      description: t("profile.noActiveListingsDesc"),
    });
    return;
  }

  listingsMount.innerHTML = `<div class="grid cols-3">${profileListings.map((x) => renderListingCard(x)).join("")}</div>`;
  mountListingCardLinks(listingsMount);
}

async function loadProfile(id) {
  profileId = id;
  root.innerHTML = `
    <section class="card pad">
      <div id="profile-head">${renderStateBlock({ title: t("profile.loading"), description: t("common.pleaseWait") })}</div>
    </section>
    <div style="height: 0.9rem;"></div>
    <section class="card pad">
      <h2 style="margin:0 0 0.6rem; letter-spacing:-0.01em;">${t("profile.activeListings")}</h2>
      <div id="profile-listings">${renderSkeletonCards(6)}</div>
    </section>
  `;

  const [u, l] = await Promise.all([getUserById(id), getUserListings(id)]);
  if (!u.ok) {
    profileUser = null;
    renderNotFound();
    return;
  }

  profileUser = u.data;
  document.title = `${profileUser.name} · FARMIX`;

  if (!l.ok) {
    profileListings = [];
    loadError = l.error?.message ?? t("marketplace.tryAgain");
  } else {
    profileListings = l.data;
    loadError = null;
  }

  renderProfile();
}

if (root) {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    renderMissingId();
  } else {
    loadProfile(id);
    onLanguageChange(() => {
      translatePageHead("profile.pageTitle", "profile.pageSubtitle");
      if (profileUser) renderProfile();
      else if (!profileId) renderMissingId();
    });
  }
}
