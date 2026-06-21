import { boot } from "../app/boot.js";
import { initAppState, getCurrentUser } from "../app/auth-state.js";
import { ROLES } from "../app/config.js";
import { on } from "../app/events.js";
import { getListingById } from "../app/state.js";
import {
  escapeHtml,
  renderStateBlock,
  toast,
  qs,
  setText,
  readListingIdFromUrl,
  productListingUrl,
} from "../app/ui.js";
import { incrementListingView, archiveListingAsOwnerOrAdmin } from "../services/listings.service.js";
import { getUserReviewForListing, submitListingReview } from "../services/reviews.service.js";
import { createInquiry } from "../services/messages.service.js";
import { reportListing } from "../services/reports.service.js";
import { getUserById } from "../services/users.service.js";
import { placeOrder } from "../services/orders.service.js";
import { isListingFavorited, toggleFavorite } from "../services/favorites.service.js";
import { openGuestGate } from "../components/guest-gate.js";
import { t, onLanguageChange, translatePageHead, getCategoryLabel, getCurrentLang } from "../app/i18n.js";
import { getCategoryById } from "../data/categories.js";
import { formatListingLocation } from "../data/locations.js";
import { renderAvailabilityBadge } from "../components/listing-card.js";

boot();
translatePageHead("product.pageTitle");

function avg(values) {
  if (!Array.isArray(values) || !values.length) return null;
  const n = values.reduce((sum, x) => sum + Number(x || 0), 0) / values.length;
  return Math.round(n * 10) / 10;
}

function ratingText(value) {
  return value === null ? t("common.noRatings") : `${value}/5`;
}

function starsDisplay(value) {
  const n = Math.max(0, Math.min(5, Number(value) || 0));
  return `${"★".repeat(n)}${"☆".repeat(5 - n)}`;
}

function renderStarPicker(name, labelKey, selected = 0) {
  return `
    <div class="review-field">
      <span class="review-label">${t(labelKey)}</span>
      <div class="star-picker" data-star-picker="${name}">
        ${[1, 2, 3, 4, 5]
          .map(
            (n) => `
          <button type="button" class="star-picker-btn ${selected >= n ? "is-active" : ""}"
                  data-star-value="${n}" aria-label="${n}">
            ★
          </button>
        `,
          )
          .join("")}
        <input type="hidden" name="${name}" value="${selected || ""}" />
      </div>
      <span class="form-error" data-err="${name}"></span>
    </div>
  `;
}

function wireStarPickers(scope) {
  scope.querySelectorAll("[data-star-picker]").forEach((picker) => {
    const hidden = picker.querySelector('input[type="hidden"]');
    picker.querySelectorAll("[data-star-value]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = Number(btn.dataset.starValue);
        hidden.value = String(value);
        picker.querySelectorAll("[data-star-value]").forEach((starBtn) => {
          starBtn.classList.toggle("is-active", Number(starBtn.dataset.starValue) <= value);
        });
      });
    });
  });
}

const root = document.getElementById("product-root");
if (!root) throw new Error("Missing #product-root");

let listing = null;
let listingId = null;
let phoneRevealed = false;
let phoneValue = null;
let descExpanded = false;
let viewsCounted = false;
let inquiryDraft = "";
let userReview = null;
let isFavorited = false;
let favoriteBusy = false;
let reportSubmitted = false;
let reportModalEl = null;

function syncReportModalCopy() {
  if (!reportModalEl) return;
  const title = reportModalEl.querySelector("#report-modal-title");
  const desc = reportModalEl.querySelector("#report-modal-desc");
  const reasonLabel = reportModalEl.querySelector("#report-reason-label");
  const reasonInput = reportModalEl.querySelector("#report-reason");
  const submitBtn = reportModalEl.querySelector("[data-report-submit]");
  const cancelBtn = reportModalEl.querySelector("[data-report-cancel]");
  if (title) title.textContent = t("product.reportListingTitle");
  if (desc) desc.textContent = t("product.reportListingDesc");
  if (reasonLabel) reasonLabel.textContent = t("product.reportReason");
  if (reasonInput) reasonInput.placeholder = t("product.reportReasonPlaceholder");
  if (submitBtn && !submitBtn.disabled) submitBtn.textContent = t("product.reportSubmit");
  if (cancelBtn) cancelBtn.textContent = t("common.cancel");
}

function ensureReportModal() {
  if (reportModalEl) {
    syncReportModalCopy();
    return reportModalEl;
  }

  reportModalEl = document.createElement("div");
  reportModalEl.className = "report-modal-backdrop";
  reportModalEl.hidden = true;
  reportModalEl.innerHTML = `
    <div class="report-modal-card" role="dialog" aria-modal="true" aria-labelledby="report-modal-title" tabindex="-1">
      <h3 class="report-modal-title" id="report-modal-title"></h3>
      <p class="muted report-modal-desc" id="report-modal-desc"></p>
      <form id="report-form" class="stack" novalidate>
        <label class="stack" style="gap:0.35rem;">
          <span id="report-reason-label" style="font-weight:800;"></span>
          <textarea class="input" id="report-reason" name="reason" rows="4"></textarea>
          <span class="form-error" data-err="reason"></span>
        </label>
        <p class="form-error-banner" id="report-error" role="alert" hidden></p>
        <div class="report-modal-actions">
          <button class="btn btn-ghost" type="button" data-report-cancel></button>
          <button class="btn btn-primary" type="submit" data-report-submit></button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(reportModalEl);
  syncReportModalCopy();

  const dialog = reportModalEl.querySelector(".report-modal-card");
  const form = reportModalEl.querySelector("#report-form");
  const cancelBtn = reportModalEl.querySelector("[data-report-cancel]");
  const submitBtn = reportModalEl.querySelector("[data-report-submit]");
  const reasonInput = reportModalEl.querySelector("#report-reason");
  const errorBanner = reportModalEl.querySelector("#report-error");

  function closeReportModal() {
    reportModalEl.hidden = true;
    document.body.classList.remove("nav-open");
  }

  function clearReportErrors() {
    errorBanner.hidden = true;
    errorBanner.textContent = "";
    const reasonErr = form.querySelector("[data-err='reason']");
    if (reasonErr) reasonErr.textContent = "";
  }

  reportModalEl.addEventListener("click", (event) => {
    if (event.target === reportModalEl) closeReportModal();
  });

  cancelBtn.addEventListener("click", closeReportModal);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearReportErrors();

    const user = getCurrentUser();
    if (!user || !listingId) {
      closeReportModal();
      const next = encodeURIComponent(location.pathname + location.search);
      location.href = `/pages/login.html?next=${next}`;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = t("product.reportSubmitting");

    const res = await reportListing(listingId, user.id, {
      reason: reasonInput.value,
    });

    if (!res.ok) {
      submitBtn.disabled = false;
      submitBtn.textContent = t("product.reportSubmit");
      for (const [key, msg] of Object.entries(res.error.fieldErrors ?? {})) {
        const el = form.querySelector(`[data-err='${key}']`);
        if (el) el.textContent = msg;
      }
      errorBanner.textContent = res.error.message ?? t("product.reportFailed");
      errorBanner.hidden = false;
      return;
    }

    reportSubmitted = true;
    closeReportModal();
    toast("success", t("product.reportSubmitted"));
    renderPage();
  });

  reportModalEl._open = () => {
    clearReportErrors();
    reasonInput.value = "";
    syncReportModalCopy();
    submitBtn.disabled = false;
    reportModalEl.hidden = false;
    document.body.classList.add("nav-open");
    dialog.focus();
    reasonInput.focus();
  };

  return reportModalEl;
}

// ── Order modal (buyers can place orders from product detail) ─────────
let orderModalEl = null;
let omListingId = null;
let omPricePerUnit = 0;
let omMaxQty = 0;
let omUnit = "";
let lastOrderTrigger = null;

function translateOrderModal() {
  if (!orderModalEl) return;
  const title = orderModalEl.querySelector("#om-title");
  if (title) title.textContent = t("marketplace.orderProduct");
  const qtyLabel = orderModalEl.querySelector('label[for="om-qty"]');
  if (qtyLabel) qtyLabel.textContent = t("marketplace.quantity");
  const availLabels = orderModalEl.querySelectorAll(".order-modal-field label");
  if (availLabels[1]) availLabels[1].textContent = t("marketplace.availableLabel");
  const totalLabel = orderModalEl.querySelector(".order-modal-total-label");
  if (totalLabel) totalLabel.textContent = t("common.total");
  const cancelBtn = orderModalEl.querySelector("#om-cancel");
  if (cancelBtn) cancelBtn.textContent = t("common.cancel");
  const confirmBtn = orderModalEl.querySelector("#om-confirm");
  if (confirmBtn && !confirmBtn.disabled) confirmBtn.textContent = t("marketplace.confirmOrder");
}

function ensureOrderModal() {
  if (orderModalEl) {
    translateOrderModal();
    return orderModalEl;
  }

  orderModalEl = document.createElement("div");
  orderModalEl.className = "order-modal-backdrop";
  orderModalEl.setAttribute("aria-hidden", "true");
  orderModalEl.style.display = "none";
  orderModalEl.innerHTML = `
    <div class="order-modal-card" role="dialog" aria-modal="true" aria-labelledby="om-title" aria-describedby="om-meta" tabindex="-1">
      <h3 class="order-modal-title" id="om-title">${t("marketplace.orderProduct")}</h3>
      <p class="order-modal-meta" id="om-meta"></p>
      <div class="order-modal-row">
        <div class="order-modal-field">
          <label for="om-qty">${t("marketplace.quantity")}</label>
          <input class="order-qty-input" id="om-qty" type="number" min="1" step="1" value="1" aria-describedby="om-avail" />
        </div>
        <div class="order-modal-field">
          <label>${t("marketplace.availableLabel")}</label>
          <div id="om-avail" style="font-size:1rem;font-weight:700;padding-top:0.4rem;color:var(--color-navy);">—</div>
        </div>
      </div>
      <div class="order-modal-total-label">${t("common.total")}</div>
      <div class="order-modal-total-val" id="om-total">$0.00</div>
      <div class="order-modal-actions">
        <button class="btn btn-ghost" id="om-cancel" type="button">${t("common.cancel")}</button>
        <button class="btn btn-primary" id="om-confirm" type="button">${t("marketplace.confirmOrder")}</button>
      </div>
    </div>
  `;
  document.body.appendChild(orderModalEl);
  translateOrderModal();

  function closeOrderModal() {
    orderModalEl.style.display = "none";
    orderModalEl.setAttribute("aria-hidden", "true");
    if (lastOrderTrigger && document.contains(lastOrderTrigger)) lastOrderTrigger.focus();
    lastOrderTrigger = null;
  }

  function updateOrderTotal() {
    const qty = Math.max(1, Math.min(omMaxQty, parseInt(orderModalEl.querySelector("#om-qty").value, 10) || 1));
    const total = (qty * omPricePerUnit).toFixed(2);
    orderModalEl.querySelector("#om-total").textContent = `$${total}`;
  }

  orderModalEl.querySelector("#om-qty").addEventListener("input", updateOrderTotal);
  orderModalEl.querySelector("#om-cancel").addEventListener("click", closeOrderModal);
  orderModalEl.addEventListener("click", (e) => {
    if (e.target === orderModalEl) closeOrderModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && orderModalEl.style.display !== "none") closeOrderModal();
  });

  orderModalEl.querySelector("#om-confirm").addEventListener("click", async () => {
    const qty = parseInt(orderModalEl.querySelector("#om-qty").value, 10) || 1;
    const curUser = getCurrentUser();
    if (!curUser) {
      openGuestGate();
      return;
    }

    const btn = orderModalEl.querySelector("#om-confirm");
    btn.disabled = true;
    btn.textContent = t("marketplace.placing");

    const result = await placeOrder(curUser.id, omListingId, qty);
    btn.disabled = false;
    btn.textContent = t("marketplace.confirmOrder");

    if (!result.ok) {
      toast("error", result.error.message);
      return;
    }

    closeOrderModal();
    toast("success", t("marketplace.orderPlaced", { qty, unit: omUnit, title: result.data.title }));

    if (listing && listing.id === omListingId) {
      const newQty = omMaxQty - qty;
      listing.quantityAvailable = newQty;
      if (newQty <= 0) listing.status = "sold";
      omMaxQty = newQty;
      renderPage();
    }
  });

  orderModalEl._open = (targetListing, triggerEl = null) => {
    lastOrderTrigger = triggerEl;
    omListingId = targetListing.id;
    omPricePerUnit = targetListing.price;
    omMaxQty = targetListing.quantityAvailable;
    omUnit = targetListing.unit;
    orderModalEl.querySelector("#om-title").textContent = targetListing.title;
    orderModalEl.querySelector("#om-meta").textContent = `$${Number(targetListing.price).toFixed(2)} / ${targetListing.unit}`;
    orderModalEl.querySelector("#om-avail").textContent = `${targetListing.quantityAvailable} ${targetListing.unit}`;
    const qtyInput = orderModalEl.querySelector("#om-qty");
    qtyInput.max = targetListing.quantityAvailable;
    qtyInput.value = 1;
    const total = (1 * omPricePerUnit).toFixed(2);
    orderModalEl.querySelector("#om-total").textContent = `$${total}`;
    orderModalEl.style.display = "flex";
    orderModalEl.setAttribute("aria-hidden", "false");
    setTimeout(() => qtyInput.focus(), 60);
  };

  return orderModalEl;
}

function isListingOwner(user, targetListing) {
  if (!user?.id || !targetListing?.sellerId) return false;
  return String(user.id) === String(targetListing.sellerId);
}

function isListingAdmin(user) {
  return user?.role === ROLES.admin;
}

function canShowOrderCta(user, isOwner, isAdmin) {
  if (isOwner || isAdmin) return false;
  if (user?.role === ROLES.farmer || user?.role === ROLES.admin) return false;
  return true;
}

function openReportModal() {
  const user = getCurrentUser();
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = `/pages/login.html?next=${next}`;
    return;
  }

  ensureReportModal()._open();
}

async function loadListing() {
  listingId = readListingIdFromUrl();
  if (!listingId) {
    root.innerHTML = renderStateBlock({
      title: t("product.missingIdTitle"),
      description: t("product.missingIdDesc"),
      actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">${t("product.backToMarketplace")}</a>`,
    });
    return;
  }

  if (!new URLSearchParams(location.search).get("id")) {
    try {
      history.replaceState(null, "", productListingUrl(listingId));
    } catch {
      /* ignore */
    }
  }

  const user = getCurrentUser();
  const [listingRes, reviewRes, favoriteRes] = await Promise.all([
    getListingById(listingId),
    user ? getUserReviewForListing(listingId, user.id) : Promise.resolve({ ok: true, data: null }),
    user ? isListingFavorited(listingId, user.id) : Promise.resolve({ ok: true, data: false }),
  ]);

  if (!listingRes.ok) {
    root.innerHTML = renderStateBlock({
      title: t("product.notFoundTitle"),
      description: t("product.notFoundDesc"),
      actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">${t("product.backToMarketplace")}</a>`,
    });
    return;
  }

  listing = listingRes.data;
  userReview = null;
  isFavorited = favoriteRes.ok ? Boolean(favoriteRes.data) : false;
  if (user && !isListingOwner(user, listing) && reviewRes.ok) {
    userReview = reviewRes.data;
  }

  if (!viewsCounted) {
    incrementListingView(listing.id);
    viewsCounted = true;
  }
  renderPage();
}

function revealSellerPhone(phone) {
  phoneRevealed = true;
  phoneValue = phone || null;
  const revealBtn = root.querySelector("[data-reveal-phone]");
  const area = root.querySelector("[data-seller-phone-area]");
  if (!area) return;

  area.hidden = false;
  area.innerHTML = phoneValue
    ? `<span class="muted" style="font-size:var(--text-sm);">${t("common.phone")}</span>
       <a class="seller-phone-value" href="tel:${escapeHtml(phoneValue.replace(/\D/g, ""))}">${escapeHtml(phoneValue)}</a>`
    : `<span class="muted" style="font-size:var(--text-sm);">${t("product.phoneMissing")}</span>`;
  revealBtn?.remove();
}

function renderFavoriteButton(user, isOwner) {
  if (isOwner) return "";

  const label = isFavorited ? t("product.savedListing") : t("product.saveListing");
  const ariaLabel = isFavorited ? t("product.savedListingAria") : t("product.saveListingAria");

  return `
    <button
      type="button"
      class="favorite-btn ${isFavorited ? "is-active" : ""}"
      data-toggle-favorite
      aria-pressed="${isFavorited ? "true" : "false"}"
      aria-label="${escapeHtml(ariaLabel)}"
      ${favoriteBusy ? "disabled" : ""}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
      </svg>
      <span class="favorite-btn-label">${escapeHtml(label)}</span>
    </button>
  `;
}

function renderPage() {
  if (!listing || !listingId) return;

  const user = getCurrentUser();
  const isOwner = isListingOwner(user, listing);
  const isAdmin = isListingAdmin(user);
  const canManage = isOwner || isAdmin;
  const showOrderCta = canShowOrderCta(user, isOwner, isAdmin) && listing.status === "active";
  const orderQty = Number(listing.quantityAvailable ?? 0);

  const price = Number(listing.price).toFixed(2).replace(/\.00$/, "");
  const images = Array.isArray(listing.images) && listing.images.length ? listing.images : ["/img/logo.png"];

  const delivery = avg(listing.ratings?.delivery);
  const quality = avg(listing.ratings?.quality);
  const overall = delivery !== null && quality !== null ? Math.round(((delivery + quality) / 2) * 10) / 10 : null;

  document.title = `${listing.title} - FARMIX`;

  root.innerHTML = `
    <div class="product-layout">
      <section class="card pad product-hero">
        <div>
          <div class="product-media">
            <img src="${escapeHtml(images[0])}" alt="${escapeHtml(listing.title)}" data-main-image />
          </div>
          <div class="product-thumbs" data-thumbs>
            ${images
              .map(
                (img, idx) => `
              <button type="button" class="thumb-btn ${idx === 0 ? "is-active" : ""}" data-thumb="${idx}" aria-label="${escapeHtml(t("product.previewImage", { n: idx + 1 }))}">
                <img src="${escapeHtml(img)}" alt="${escapeHtml(listing.title)} image ${idx + 1}" />
              </button>
            `,
              )
              .join("")}
          </div>
        </div>

        <div>
          <div class="product-title-row">
            <h1 class="product-title">${escapeHtml(listing.title)}</h1>
            ${renderFavoriteButton(user, isOwner)}
          </div>
          <div class="product-price">${escapeHtml(price)} / ${escapeHtml(listing.unit)}</div>

          <div class="listing-meta" style="margin-top:0.6rem;">
            <span class="pill">${escapeHtml(getCategoryLabel(listing.categoryId, getCategoryById(listing.categoryId)?.name))}</span>
            <span class="pill">${escapeHtml(formatListingLocation(listing.regionId, listing.village, getCurrentLang()))}</span>
            ${renderAvailabilityBadge(listing.quantityAvailable)}
            <span class="pill" style="color: #666;">${listing.status === "active" ? t("product.status.available") : listing.status === "sold" ? t("product.status.sold") : t("product.status.archived")}</span>
          </div>

          <div class="rating-grid" style="margin-top:0.8rem;">
            <div class="rating-item"><span class="muted">${t("product.delivery")}</span><strong>${escapeHtml(ratingText(delivery))}</strong></div>
            <div class="rating-item"><span class="muted">${t("product.foodQuality")}</span><strong>${escapeHtml(ratingText(quality))}</strong></div>
            <div class="rating-item"><span class="muted">${t("product.overall")}</span><strong>${escapeHtml(ratingText(overall))}</strong></div>
          </div>

          ${
            user && !isOwner
              ? userReview
                ? `
          <div class="review-your" style="margin-top:0.9rem;">
            <div class="pill">${t("product.yourReview")}</div>
            <div class="rating-grid" style="margin-top:0.55rem;">
              <div class="rating-item"><span class="muted">${t("product.delivery")}</span><strong>${escapeHtml(starsDisplay(userReview.deliveryRating))}</strong></div>
              <div class="rating-item"><span class="muted">${t("product.foodQuality")}</span><strong>${escapeHtml(starsDisplay(userReview.qualityRating))}</strong></div>
            </div>
          </div>`
                : `
          <section class="review-form-wrap" style="margin-top:0.9rem;">
            <h2 style="margin:0 0 0.25rem; font-size:var(--text-lg); letter-spacing:-0.01em;">${t("product.rateProduct")}</h2>
            <p class="muted" style="font-size:var(--text-sm); margin:0 0 0.75rem;">${t("product.rateProductDesc")}</p>
            <form id="review-form" class="stack" novalidate>
              ${renderStarPicker("deliveryRating", "product.delivery")}
              ${renderStarPicker("qualityRating", "product.foodQuality")}
              <p class="form-error-banner" id="review-error" role="alert" style="display:none;"></p>
              <button class="btn btn-primary" type="submit" data-review-submit>${t("product.submitReview")}</button>
            </form>
          </section>`
              : ""
          }

          <div class="desc-wrap">
            <p class="product-desc is-collapsed" data-desc>${escapeHtml(listing.description || "")}</p>
            <button class="btn btn-ghost" type="button" data-desc-toggle>${t("product.readMore")}</button>
          </div>

          ${
            !canManage
              ? `
            <div class="product-report-row">
              <button class="btn btn-ghost btn-sm product-report-btn" type="button" data-report-listing ${reportSubmitted ? "disabled" : ""}>
                ${reportSubmitted ? t("product.reportSent") : t("product.reportListing")}
              </button>
            </div>
          `
              : ""
          }

          ${
            canManage
              ? `
            <div style="display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: 1rem;">
              <a class="btn btn-ghost" href="/pages/edit-listing.html?id=${listingId}">${t("product.edit")}</a>
              <button class="btn btn-ghost" type="button" data-delete style="color: #d32f2f;">${t("product.delete")}</button>
            </div>
          `
              : ""
          }
        </div>
      </section>

      <aside class="stack">
        <section class="card pad seller-box">
          <div class="pill">${t("product.seller")}</div>
          <div style="font-weight:850; letter-spacing:-0.01em;">${escapeHtml(listing.sellerName || t("product.unknownSeller"))}</div>
          ${
            !isOwner
              ? phoneRevealed
                ? `
          <div class="seller-phone-area" data-seller-phone-area>
            ${
              phoneValue
                ? `<span class="muted" style="font-size:var(--text-sm);">${t("common.phone")}</span>
                   <a class="seller-phone-value" href="tel:${escapeHtml(phoneValue.replace(/\D/g, ""))}">${escapeHtml(phoneValue)}</a>`
                : `<span class="muted" style="font-size:var(--text-sm);">${t("product.phoneMissing")}</span>`
            }
          </div>`
                : `
          <div class="seller-phone-area" data-seller-phone-area hidden></div>
          <button class="btn btn-primary btn-sm" type="button" data-reveal-phone>${t("product.revealPhone")}</button>
          `
              : ""
          }
          <div style="display:flex; gap:0.6rem; flex-wrap:wrap; margin-top:0.35rem;">
            ${
              !user
                ? `<div class="muted" style="font-size:var(--text-sm); margin-top:0.25rem;">${t("product.loginPrompt")}</div>`
                : ""
            }
          </div>
        </section>

        ${
          showOrderCta
            ? `
        <section class="card pad product-order-box">
          <h2 style="margin:0 0 0.35rem; letter-spacing:-0.01em;">${t("marketplace.orderProduct")}</h2>
          <p class="muted" style="font-size:var(--text-sm); margin:0 0 0.75rem;">
            ${orderQty > 0 ? t("marketplace.addToOrder") : t("marketplace.outOfStock")}
          </p>
          <button
            class="btn btn-primary product-order-btn"
            type="button"
            data-place-order
            ${orderQty <= 0 ? "disabled" : ""}
            aria-label="${orderQty > 0 ? `${t("marketplace.addToOrder")}: ${listing.title}` : `${listing.title} — ${t("marketplace.outOfStock")}`}"
          >
            ${orderQty > 0 ? t("marketplace.addToOrder") : t("marketplace.outOfStock")}
          </button>
        </section>
        `
            : ""
        }

        ${
          user && !isOwner
            ? `
        <section class="card pad">
          <h2 style="margin:0 0 0.6rem; letter-spacing:-0.01em;">${t("product.sendInquiry")}</h2>
          <p class="muted" style="font-size:var(--text-sm); margin:0 0 0.75rem;">${t("product.profileShared")}</p>
          <form id="inquiry-form" class="stack" novalidate>
            <label class="stack" style="gap:0.35rem;">
              <span style="font-weight:800;">${t("product.message")}</span>
              <textarea class="input" name="body" rows="5" required placeholder="${t("product.inquiryPlaceholder")}"></textarea>
              <span class="error-text" data-err="body"></span>
            </label>
            <p class="error-text" data-err="form" style="margin:0;"></p>
            <button class="btn btn-primary" type="submit" data-submit>${t("product.sendInquiry")}</button>
          </form>
        </section>
      `
            : ""
        }
      </aside>
    </div>
  `;

  const mainImage = qs(root, "[data-main-image]");
  const thumbButtons = root.querySelectorAll("[data-thumb]");
  thumbButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-thumb"));
      const src = images[idx] ?? images[0];
      mainImage.src = src;
      thumbButtons.forEach((x) => x.classList.remove("is-active"));
      btn.classList.add("is-active");
    });
  });

  const desc = qs(root, "[data-desc]");
  const descToggle = qs(root, "[data-desc-toggle]");
  if (String(listing.description ?? "").length <= 180) {
    desc.classList.remove("is-collapsed");
    descToggle.style.display = "none";
  } else if (descExpanded) {
    desc.classList.remove("is-collapsed");
    descToggle.textContent = t("product.showLess");
  } else {
    desc.classList.add("is-collapsed");
    descToggle.textContent = t("product.readMore");
  }
  descToggle.addEventListener("click", () => {
    const isCollapsed = desc.classList.contains("is-collapsed");
    if (isCollapsed) {
      desc.classList.remove("is-collapsed");
      descExpanded = true;
      descToggle.textContent = t("product.showLess");
    } else {
      desc.classList.add("is-collapsed");
      descExpanded = false;
      descToggle.textContent = t("product.readMore");
    }
  });

  const reportBtn = root.querySelector("[data-report-listing]");
  if (reportBtn && !reportSubmitted) {
    reportBtn.addEventListener("click", openReportModal);
  }

  const favoriteBtn = root.querySelector("[data-toggle-favorite]");
  if (favoriteBtn) {
    favoriteBtn.addEventListener("click", async () => {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        openGuestGate();
        return;
      }
      if (favoriteBusy) return;

      favoriteBusy = true;
      favoriteBtn.disabled = true;

      const res = await toggleFavorite(currentUser.id, listingId, isFavorited);
      favoriteBusy = false;

      if (!res.ok) {
        favoriteBtn.disabled = false;
        toast("error", res.error.message ?? t("favorites.failed"));
        return;
      }

      isFavorited = Boolean(res.data.favorited);
      toast("success", isFavorited ? t("favorites.added") : t("favorites.removed"));
      renderPage();
    });
  }

  const orderBtn = root.querySelector("[data-place-order]");
  if (orderBtn && showOrderCta && orderQty > 0) {
    orderBtn.addEventListener("click", () => {
      const curUser = getCurrentUser();
      if (!curUser) {
        openGuestGate();
        return;
      }
      ensureOrderModal()._open(listing, orderBtn);
    });
  }

  const deleteBtn = root.querySelector("[data-delete]");
  if (deleteBtn && canManage) {
    deleteBtn.addEventListener("click", async () => {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        openGuestGate();
        return;
      }

      if (!confirm(t("product.deleteConfirm"))) return;

      deleteBtn.disabled = true;
      deleteBtn.textContent = t("product.deleting");

      const delRes = await archiveListingAsOwnerOrAdmin(listingId, currentUser.id, currentUser.role);
      if (!delRes.ok) {
        deleteBtn.disabled = false;
        deleteBtn.textContent = t("product.delete");
        toast("error", delRes.error?.message ?? t("product.deleteFailed"));
        return;
      }

      toast("success", t("product.deleteSuccess"));
      setTimeout(() => { window.location.href = "/pages/marketplace.html"; }, 1000);
    });
  }

  const revealBtn = root.querySelector("[data-reveal-phone]");
  if (revealBtn) {
    revealBtn.addEventListener("click", async () => {
      const currentUser = getCurrentUser();
      if (!currentUser) {
        openGuestGate();
        return;
      }

      revealBtn.disabled = true;
      revealBtn.textContent = t("common.loading");

      const sellerRes = await getUserById(listing.sellerId);
      if (!sellerRes.ok) {
        revealBtn.disabled = false;
        revealBtn.textContent = t("product.revealPhone");
        toast("error", sellerRes.error?.message ?? t("product.phoneLoadFailed"));
        return;
      }

      const phone = sellerRes.data.phone;
      revealSellerPhone(phone);
    });
  }

  const reviewForm = root.querySelector("#review-form");
  if (reviewForm) {
    const currentUser = getCurrentUser();
    if (currentUser && !isListingOwner(currentUser, listing) && !userReview) {
      wireStarPickers(reviewForm);
      const reviewSubmit = qs(reviewForm, "[data-review-submit]");
      const reviewError = qs(reviewForm, "#review-error");

      function clearReviewErrors() {
        reviewError.style.display = "none";
        reviewError.textContent = "";
        for (const key of ["deliveryRating", "qualityRating"]) {
          const el = reviewForm.querySelector(`[data-err='${key}']`);
          if (el) el.textContent = "";
        }
      }

      reviewForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearReviewErrors();
        reviewSubmit.disabled = true;
        reviewSubmit.textContent = t("product.submittingReview");

        const fd = new FormData(reviewForm);
        const res = await submitListingReview(
          {
            listingId,
            deliveryRating: fd.get("deliveryRating"),
            qualityRating: fd.get("qualityRating"),
          },
          currentUser.id,
        );

        if (!res.ok) {
          reviewSubmit.disabled = false;
          reviewSubmit.textContent = t("product.submitReview");
          for (const [key, msg] of Object.entries(res.error.fieldErrors ?? {})) {
            const el = reviewForm.querySelector(`[data-err='${key}']`);
            if (el) el.textContent = msg;
          }
          reviewError.textContent = res.error.message ?? t("product.reviewFailed");
          reviewError.style.display = "block";
          return;
        }

        toast("success", t("product.reviewSubmitted"));
        userReview = res.data;
        const refreshed = await getListingById(listingId);
        if (refreshed.ok) listing = refreshed.data;
        renderPage();
      });
    }
  }

  const form = root.querySelector("#inquiry-form");
  if (form) {
    const currentUser = getCurrentUser();
    if (!currentUser) return;

    const bodyInput = form.elements.namedItem("body");
    if (bodyInput && inquiryDraft) bodyInput.value = inquiryDraft;

    const submitBtn = qs(form, "[data-submit]");
    const err = (k) => qs(form, `[data-err='${k}']`);

    function clearErrors() {
      for (const k of ["body", "form"]) setText(err(k), "");
    }

    function setLoading(isLoading) {
      submitBtn.disabled = isLoading;
      submitBtn.textContent = isLoading ? t("product.sending") : t("product.sendInquiry");
    }

    bodyInput?.addEventListener("input", () => {
      inquiryDraft = bodyInput.value;
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearErrors();
      setLoading(true);

      const fd = new FormData(form);
      const r = await createInquiry(currentUser.id, listing.id, {
        body: fd.get("body"),
      });

      if (!r.ok) {
        setLoading(false);
        const fe = r.error.fieldErrors ?? {};
        for (const [k, msg] of Object.entries(fe)) {
          const el = form.querySelector(`[data-err='${k}']`);
          if (el) el.textContent = msg;
        }
        setText(err("form"), r.error.message ?? t("product.inquiryFailed"));
        return;
      }

      setLoading(false);
      toast("success", t("product.inquirySent"));
      form.reset();
      inquiryDraft = "";
    });
  }
}

async function refreshAuthDependentState() {
  if (!listing || !listingId) return;
  const user = getCurrentUser();
  userReview = null;
  isFavorited = false;
  if (user && !isListingOwner(user, listing)) {
    const [reviewRes, favoriteRes] = await Promise.all([
      getUserReviewForListing(listingId, user.id),
      isListingFavorited(listingId, user.id),
    ]);
    if (reviewRes.ok) userReview = reviewRes.data;
    if (favoriteRes.ok) isFavorited = Boolean(favoriteRes.data);
  }
  renderPage();
}

async function initProductPage() {
  await initAppState();
  await loadListing();
}

initProductPage();

on("auth:changed", () => {
  refreshAuthDependentState();
});

onLanguageChange(() => {
  translatePageHead("product.pageTitle");
  syncReportModalCopy();
  translateOrderModal();
  if (listing) renderPage();
});
