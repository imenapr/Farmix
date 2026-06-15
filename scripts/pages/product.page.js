import { boot } from "../app/boot.js";
import { getCurrentUser } from "../app/auth-state.js";
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
import { getUserById } from "../services/users.service.js";
import { t, onLanguageChange, translatePageHead, getCategoryLabel } from "../app/i18n.js";
import { getCategoryById } from "../data/categories.js";

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

  const res = await getListingById(listingId);
  if (!res.ok) {
    root.innerHTML = renderStateBlock({
      title: t("product.notFoundTitle"),
      description: t("product.notFoundDesc"),
      actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">${t("product.backToMarketplace")}</a>`,
    });
    return;
  }

  listing = res.data;
  const user = getCurrentUser();
  userReview = null;
  if (user && user.id !== listing.sellerId) {
    const reviewRes = await getUserReviewForListing(listingId, user.id);
    if (reviewRes.ok) userReview = reviewRes.data;
  }

  if (!viewsCounted) {
    incrementListingView(listing.id);
    viewsCounted = true;
  }
  renderPage();
}

function renderPage() {
  if (!listing || !listingId) return;

  const user = getCurrentUser();
  const isOwner = user && user.id === listing.sellerId;
  const isAdmin = user && user.role === "admin";
  const canManage = isOwner || isAdmin;

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
          <h1 class="product-title">${escapeHtml(listing.title)}</h1>
          <div class="product-price">${escapeHtml(price)} / ${escapeHtml(listing.unit)}</div>

          <div class="listing-meta" style="margin-top:0.6rem;">
            <span class="pill">${escapeHtml(getCategoryLabel(listing.categoryId, getCategoryById(listing.categoryId)?.name))}</span>
            <span class="pill">${escapeHtml(listing.location || "")}</span>
            <span class="pill">${escapeHtml(String(listing.quantityAvailable))} ${t("product.available")}</span>
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
          <div class="muted" style="font-size:var(--text-sm);">${escapeHtml(listing.sellerLocation || listing.location || "")}</div>
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

  const deleteBtn = root.querySelector("[data-delete]");
  if (deleteBtn && canManage) {
    deleteBtn.addEventListener("click", async () => {
      if (!confirm(t("product.deleteConfirm"))) return;

      deleteBtn.disabled = true;
      deleteBtn.textContent = t("product.deleting");

      const delRes = await archiveListingAsOwnerOrAdmin(listingId, user.id, user.role);
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
      if (!user) {
        const next = encodeURIComponent(location.pathname + location.search);
        location.href = `/pages/login.html?next=${next}`;
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
      phoneRevealed = true;
      phoneValue = phone || null;
      renderPage();
    });
  }

  const reviewForm = root.querySelector("#review-form");
  if (reviewForm && user && !isOwner && !userReview) {
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
        user.id,
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

  const form = root.querySelector("#inquiry-form");
  if (form) {
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
      const r = await createInquiry(user.id, listing.id, {
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

loadListing();
onLanguageChange(() => {
  translatePageHead("product.pageTitle");
  if (listing) renderPage();
});
