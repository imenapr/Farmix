import { boot } from "../app/boot.js";
import { renderSkeletonCards, renderStateBlock, mountListingCardLinks } from "../app/ui.js";
import { renderListingCard } from "../components/listing-card.js";
import { getTrendingListings } from "../app/state.js";
import { getCurrentUser } from "../app/auth-state.js";
import { t, onLanguageChange } from "../app/i18n.js";

boot();

const mount = document.getElementById("home-latest");
let latestItems = null;

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

  const actions = document.querySelector(".hero-actions");
  if (actions) {
    const links = actions.querySelectorAll("a");
    if (links[0]) links[0].textContent = t("common.browseMarketplace");
    if (links[1]) links[1].textContent = t("auth.signup.button");
    if (links[2]) {
      links[2].textContent = t("home.sellAsFarmer");
      links[2].setAttribute("data-guest-gate-title", t("home.guestGateTitle"));
    }
  }

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
onLanguageChange(() => {
  renderHero();
  renderLatest();
});
