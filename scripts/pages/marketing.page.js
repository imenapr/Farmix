import { boot } from "../app/boot.js";
import { t, onLanguageChange } from "../app/i18n.js";

boot();

const PAGE_KEYS = {
  "/pages/for-farmers.html": "forFarmers",
  "/pages/for-businesses.html": "forBusinesses",
};

function renderMarketing() {
  const key = PAGE_KEYS[location.pathname];
  if (!key) return;

  const head = document.querySelector(".page-head");
  const card = document.querySelector(".card.pad.stack");
  if (!head || !card) return;

  head.innerHTML = `
    <h1 class="page-title">${t(`marketing.${key}.title`)}</h1>
    <p class="page-subtitle">${t(`marketing.${key}.subtitle`)}</p>
  `;

  const pills = [
    t(`marketing.${key}.pill1`),
    t(`marketing.${key}.pill2`),
    t(`marketing.${key}.pill3`),
  ];

  card.innerHTML = `
    ${pills.map((pill) => `<div class="pill">${pill}</div>`).join("")}
    <div style="display:flex; gap:0.6rem; flex-wrap:wrap; margin-top:0.4rem;">
      <a class="btn btn-primary" href="/pages/signup.html">${t(`marketing.${key}.signup`)}</a>
      <a class="btn btn-ghost" href="/pages/marketplace.html">${t(`marketing.${key}.viewMarketplace`)}</a>
    </div>
  `;
}

renderMarketing();
onLanguageChange(renderMarketing);
