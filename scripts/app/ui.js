import { emit } from "./events.js";

export function debounce(fn, ms) {
  /** @type {number | undefined} */
  let t;
  return (...args) => {
    window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), ms);
  };
}

export function toast(type, message) {
  emit("toast", { type, message });
}

/** Toast order success, then navigate to the buyer account page with order highlight. */
export function confirmBuyerOrderPlacement(orderId, message, delayMs = 1400) {
  toast("success", message);
  window.setTimeout(() => {
    const url = new URL("/pages/account.html", location.origin);
    if (orderId) url.searchParams.set("orderId", String(orderId));
    location.href = `${url.pathname}${url.search}`;
  }, delayMs);
}

export function qs(root, selector) {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

export function setText(el, text) {
  el.textContent = text;
}

export function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const LISTING_ID_STORAGE_KEY = "farmix.nav.listingId";

/** Site root prefix when hosted in a subdirectory (e.g. GitHub Pages /Farmix/). */
export function getAppBasePath() {
  const path = location.pathname.replace(/\\/g, "/");
  const pagesIdx = path.indexOf("/pages/");
  if (pagesIdx > 0) return path.slice(0, pagesIdx);
  return "";
}

export function isInPagesDir() {
  return /\/pages\//i.test(location.pathname.replace(/\\/g, "/"));
}

/** Build an absolute app URL for a page under /pages (keeps query/hash in `page`). */
export function pageUrl(page) {
  const base = getAppBasePath();
  const normalized = String(page ?? "").replace(/^\//, "");
  if (normalized.startsWith("pages/")) return `${base}/${normalized}`;
  return `${base}/pages/${normalized}`;
}

export function productListingUrl(listingId) {
  const id = String(listingId ?? "").trim();
  if (!id) return isInPagesDir() ? "marketplace.html" : pageUrl("marketplace.html");
  const qs = `id=${encodeURIComponent(id)}`;
  // Relative link when already under /pages/ (subdir deploys). Duplicate id in hash
  // so it survives hosts that strip query strings on redirect.
  if (isInPagesDir()) return `product.html?${qs}#${qs}`;
  return `${pageUrl(`product.html?${qs}`)}#${qs}`;
}

export function rememberListingId(listingId) {
  const id = String(listingId ?? "").trim();
  if (!id) return;
  try {
    sessionStorage.setItem(LISTING_ID_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function consumeRememberedListingId() {
  try {
    const id = sessionStorage.getItem(LISTING_ID_STORAGE_KEY);
    if (id) {
      sessionStorage.removeItem(LISTING_ID_STORAGE_KEY);
      return id.trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Resolve listing id from query, hash, or last card click. */
export function readListingIdFromUrl() {
  const fromSearch = new URLSearchParams(location.search).get("id")?.trim();
  if (fromSearch) return fromSearch;

  const hash = location.hash.replace(/^#/, "").trim();
  if (hash) {
    const fromHash = new URLSearchParams(hash).get("id")?.trim();
    if (fromHash) return fromHash;
  }

  return consumeRememberedListingId();
}

export function initListingNavigation() {
  if (initListingNavigation._done) return;
  initListingNavigation._done = true;

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target.closest("a[href*='product.html']");
      if (link?.href) {
        try {
          const id = new URL(link.href, location.href).searchParams.get("id")?.trim();
          if (id) rememberListingId(id);
        } catch {
          /* ignore */
        }
      }

      const card = event.target.closest(".listing-card[data-listing-id]");
      const cardId = card?.dataset?.listingId?.trim();
      if (cardId) rememberListingId(cardId);
    },
    true,
  );
}

export function mountListingCardLinks(container) {
  if (!container) return;
  container.addEventListener("click", (event) => {
    if (event.defaultPrevented) return;
    if (event.target.closest("button, .btn-order, a[href]")) return;

    const card = event.target.closest(".listing-card[data-listing-id]");
    if (!card) return;

    const id = card.dataset.listingId?.trim();
    if (!id) return;

    rememberListingId(id);
    const url = productListingUrl(id);
    if (event.metaKey || event.ctrlKey) {
      window.open(url, "_blank", "noopener");
      return;
    }
    location.assign(url);
  });
}

export function renderStateBlock({ title, description, actionsHtml = "" }) {
  return `
    <section class="state-block">
      <h2 class="state-title">${escapeHtml(title)}</h2>
      <p class="state-desc">${escapeHtml(description)}</p>
      ${actionsHtml ? `<div style="margin-top:0.85rem; display:flex; gap:0.6rem; flex-wrap:wrap; justify-content:center;">${actionsHtml}</div>` : ""}
    </section>
  `;
}

export function renderSkeletonCards(count = 6) {
  const items = Array.from({ length: count }, () => {
    return `
      <div class="card" style="padding: 0.85rem;">
        <div class="skeleton" style="height: 140px;"></div>
        <div style="height: 12px;"></div>
        <div class="skeleton" style="height: 14px; width: 72%;"></div>
        <div style="height: 10px;"></div>
        <div class="skeleton" style="height: 14px; width: 46%;"></div>
      </div>
    `;
  }).join("");
  return `<div class="grid cols-3">${items}</div>`;
}

