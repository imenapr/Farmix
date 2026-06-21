import { escapeHtml, productListingUrl } from "../app/ui.js";
import { getCategoryById } from "../data/categories.js";
import { formatListingLocation } from "../data/locations.js";
import { t, getCategoryLabel, getCurrentLang } from "../app/i18n.js";
import { CURRENCIES, formatPrice } from "../lib/currency.js";

// Curated photography for seeded products — matched by title keyword at render time
// so already-seeded localStorage data picks up the real images without a reseed.
const PRODUCT_PHOTOS = {
  "roma tomatoes":  "https://images.unsplash.com/photo-1558818498-28c1e002b655?w=600&h=440&fit=crop&auto=format&q=80",
  "cucumbers":      "https://images.unsplash.com/photo-1604977042946-1eecc30f269e?w=600&h=440&fit=crop&auto=format&q=80",
  "fresh milk":     "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=600&h=440&fit=crop&auto=format&q=80",
  "mountain honey": "https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=600&h=440&fit=crop&auto=format&q=80",
  "apples":         "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=600&h=440&fit=crop&auto=format&q=80",
  "cheese":         "https://images.unsplash.com/photo-1552767059-ce182ead6c1b?w=600&h=440&fit=crop&auto=format&q=80",
};

function resolveImage(listing) {
  const title = (listing.title ?? "").toLowerCase();
  for (const [key, url] of Object.entries(PRODUCT_PHOTOS)) {
    if (title.includes(key)) return url;
  }
  return listing.images?.[0] ?? "/img/logo.png";
}

function avg(values) {
  if (!Array.isArray(values) || !values.length) return null;
  const n = values.reduce((sum, x) => sum + Number(x || 0), 0) / values.length;
  return Math.round(n * 10) / 10;
}

function starsHtml(value) {
  if (value === null) return `<span class="rating-no-data">${t("listing.noRatingsYet")}</span>`;
  const filled = Math.round(value);
  const empty = 5 - filled;
  const stars = "★".repeat(Math.max(0, filled)) + "☆".repeat(Math.max(0, empty));
  return `
    <span class="rating-stars" aria-label="${t("listing.starsLabel", { value })}">${stars}</span>
    <span class="rating-val">${value}</span>
  `;
}

// Location pin icon (inline SVG, no user data)
const PIN_SVG = `<svg width="11" height="13" viewBox="0 0 24 28" fill="currentColor" aria-hidden="true">
  <path d="M12 0C7.58 0 4 3.58 4 8c0 6 8 16 8 16s8-10 8-16c0-4.42-3.58-8-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>
</svg>`;

export function renderAvailabilityBadge(qty) {
  const n = Number.isFinite(Number(qty)) ? Number(qty) : 0;
  if (n > 0) {
    return `<span class="listing-avail">${escapeHtml(t("listing.availableShort", { n }))}</span>`;
  }
  return `<span class="listing-avail listing-avail--unavailable">${escapeHtml(t("listing.notAvailable"))}</span>`;
}

export function renderListingCard(
  listing,
  { compact = false, maskLocation = false, currency = CURRENCIES.GEL } = {},
) {
  const img = resolveImage(listing);
  const price = formatPrice(listing.price, currency);
  const qty   = Number.isFinite(listing.quantityAvailable) ? listing.quantityAvailable : 0;

  const delivery = avg(listing.ratings?.delivery);
  const quality  = avg(listing.ratings?.quality);
  const overall  = delivery !== null && quality !== null
    ? Math.round(((delivery + quality) / 2) * 10) / 10
    : null;

  const category = getCategoryById(listing.categoryId);
  const categoryName = getCategoryLabel(listing.categoryId, category?.name);

  const listingId = String(listing.id ?? "").trim();
  const href = listingId ? productListingUrl(listingId) : "";
  const locationText = maskLocation
    ? t("listing.loginToSeeLocation")
    : formatListingLocation(listing.regionId, listing.village, getCurrentLang());

  return `
    <article class="listing-card glass-card"
      data-listing-id="${escapeHtml(listingId)}"
      data-qty="${qty}"
      data-seller-id="${escapeHtml(listing.sellerId ?? "")}"
      ${compact ? 'data-compact="true"' : ""}>

      ${
        href
          ? `<a class="listing-media" href="${href}" aria-label="${escapeHtml(t("listing.viewProduct", { title: listing.title }))}">`
          : `<div class="listing-media">`
      }
        <img src="${escapeHtml(img)}" alt="${escapeHtml(listing.title)}" width="600" height="440" loading="lazy" decoding="async" fetchpriority="low" />
        <div class="listing-media-overlay">
          <span class="listing-badge-cat">${escapeHtml(categoryName)}</span>
        </div>
      ${href ? "</a>" : "</div>"}

      <div class="listing-body">
        <div class="listing-header">
          <h3 class="listing-title">${
            href
              ? `<a href="${href}">${escapeHtml(listing.title)}</a>`
              : escapeHtml(listing.title)
          }</h3>
          <div class="listing-meta-row">
            <span class="listing-location ${maskLocation ? "listing-location-masked" : ""}">
              ${PIN_SVG}
              ${escapeHtml(locationText)}
            </span>
            ${renderAvailabilityBadge(qty)}
          </div>
        </div>

        <div class="listing-footer-row">
          <div class="listing-price-group">
            <span class="listing-price-main">${escapeHtml(price)}</span>
            <span class="listing-price-unit">/ ${escapeHtml(listing.unit ?? "unit")}</span>
          </div>
          <div class="listing-rating">
            ${starsHtml(overall)}
          </div>
        </div>
      </div>

    </article>
  `;
}
