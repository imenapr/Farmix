import { boot } from "../app/boot.js";
import { renderSkeletonCards, renderStateBlock, mountListingCardLinks, escapeHtml } from "../app/ui.js";
import { renderListingCard } from "../components/listing-card.js";
import { getTrendingListings } from "../app/state.js";
import { getCurrentUser } from "../app/auth-state.js";
import { ROLES } from "../app/config.js";
import { on } from "../app/events.js";
import { t, onLanguageChange } from "../app/i18n.js";

boot();

const mount = document.getElementById("home-latest");
let latestItems = null;

function renderHeroActions() {
  const actions = document.querySelector(".hero-actions");
  if (!actions) return;

  const user = getCurrentUser();
  const canSell = user && (user.role === ROLES.farmer || user.role === ROLES.admin);
  const browse = `<a class="btn btn-primary" href="/pages/marketplace.html">${t("common.browseMarketplace")}</a>`;

  if (!user) {
    actions.innerHTML = `
      ${browse}
      <a class="btn btn-ghost" href="/pages/signup.html">${t("auth.signup.button")}</a>
      <a class="btn btn-ghost" href="/pages/for-farmers.html" data-guest-gate data-guest-gate-title="${escapeHtml(t("home.guestGateTitle"))}">${t("home.sellAsFarmer")}</a>
    `;
    return;
  }

  if (canSell) {
    actions.innerHTML = `
      ${browse}
      <a class="btn btn-ghost" href="/pages/add-listing.html">${t("home.addNewListing")}</a>
    `;
    return;
  }

  actions.innerHTML = browse;
}

function renderHero() {
  const eyebrow = document.querySelector(".hero-eyebrow");
  if (eyebrow) {
    eyebrow.innerHTML = `<span class="hero-eyebrow-dot" aria-hidden="true"></span>${t("home.eyebrow")}`;
  }

  const heading = document.getElementById("hero-heading");
  if (heading) {
    heading.innerHTML = `${t("home.headline1")} <em>${t("home.headlineEm")}</em>`;
  }

  const sub = document.querySelector(".hero-sub");
  if (sub) sub.textContent = t("home.subtitle");

  renderHeroActions();

  const statLabels = document.querySelectorAll(".hero-stat-label");
  if (statLabels[0]) statLabels[0].textContent = t("home.localFarms");
  if (statLabels[1]) statLabels[1].textContent = t("home.middlemen");

  const sectionTitle = document.querySelector(".section-title");
  if (sectionTitle) sectionTitle.textContent = t("home.trendingProducts");
}

function renderLatest() {
  if (!mount) return;

  if (latestItems === null) {
    mount.innerHTML = renderSkeletonCards(3);
    return;
  }

  if (!latestItems.length) {
    mount.innerHTML = renderStateBlock({
      title: t("home.noListings"),
      description: t("home.noListingsDesc"),
      actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">${t("common.browseMarketplace")}</a>`,
    });
    return;
  }

  const user = getCurrentUser();
  const isGuest = !user;
  mount.innerHTML = `
    <div class="grid cols-3">
      ${latestItems.map((l) => renderListingCard(l, { compact: true, maskLocation: isGuest })).join("")}
    </div>
  `;
  mountListingCardLinks(mount);
}

function loadLatest() {
  if (!mount) return;
  mount.innerHTML = renderSkeletonCards(3);

  getTrendingListings(6).then((res) => {
    if (!res.ok) {
      latestItems = [];
      mount.innerHTML = renderStateBlock({
        title: t("home.loadFailed"),
        description: res.error?.message ?? t("home.tryAgainLater"),
        actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">${t("common.browseMarketplace")}</a>`,
      });
      return;
    }

    latestItems = res.data;
    renderLatest();
  });
}

renderHero();
loadLatest();
on("auth:changed", () => {
  renderHeroActions();
  renderLatest();
});
onLanguageChange(() => {
  renderHero();
  renderLatest();
});
