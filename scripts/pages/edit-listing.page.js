import { boot } from "../app/boot.js";
import { qs, toast, productListingUrl } from "../app/ui.js";
import { initAppState, getCurrentUser } from "../app/auth-state.js";
import { ROLES } from "../app/config.js";
import { getListingById, updateListing } from "../services/listings.service.js";
import { t, onLanguageChange, translatePageHead, getCategoryLabel, getCurrentLang } from "../app/i18n.js";
import { getCategories } from "../data/categories.js";
import { renderRegionOptionsHtml } from "../data/locations.js";
import { CURRENCIES, getCurrencySymbol, priceToStorageGEL } from "../lib/currency.js";
import { compressImageToDataUrl } from "../lib/image-utils.js";

boot();
translatePageHead("listingForm.editPageTitle", "listingForm.editPageSubtitle");

const root = document.getElementById("edit-listing-root");
if (!root) throw new Error("Missing #edit-listing-root");

await initAppState();

const user = getCurrentUser();
const listingId = new URLSearchParams(location.search).get("id");
let listing = null;
let savedFormState = null;
/** @type {{ id: string, file: File | null, dataUrl: string }[]} */
let pendingImages = [];
let pendingImagesSeeded = false;

function readFileAsDataUrl(file) {
  return compressImageToDataUrl(file);
}

function unitOptions(selected = "") {
  const units = [
    ["kg", "listingForm.unitKg"],
    ["lb", "listingForm.unitLb"],
    ["box", "listingForm.unitBox"],
    ["unit", "listingForm.unitUnit"],
    ["piece", "listingForm.unitPiece"],
    ["liter", "listingForm.unitLiter"],
    ["gallon", "listingForm.unitGallon"],
  ];
  return units
    .map(([value, key]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${t(key)}</option>`)
    .join("");
}

function captureFormState(form) {
  if (!form) return null;
  const fd = new FormData(form);
  return Object.fromEntries(fd.entries());
}

function restoreFormState(form, state) {
  if (!form || !state) return;
  for (const [name, value] of Object.entries(state)) {
    const el = form.elements.namedItem(name);
    if (el) el.value = value ?? "";
  }
}

function listingToFormState(l) {
  return {
    title: l.title ?? "",
    categoryId: l.categoryId ?? "",
    price: l.price ?? "",
    unit: l.unit ?? "",
    quantityAvailable: l.quantityAvailable ?? "",
    regionId: l.regionId ?? "",
    village: l.village ?? "",
    description: l.description ?? "",
    priceCurrency: CURRENCIES.GEL,
  };
}

function seedPendingImagesFromListing() {
  if (pendingImagesSeeded || !listing) return;
  pendingImagesSeeded = true;
  pendingImages = (listing.images ?? []).map((dataUrl, index) => ({
    id: `existing-${index}-${Math.random().toString(36).slice(2, 7)}`,
    file: null,
    dataUrl,
  }));
}

function renderBlocked(titleKey, descKey, actionHtml) {
  root.innerHTML = `
    <div class="state-block">
      <h2>${t(titleKey)}</h2>
      <p>${t(descKey)}</p>
      ${actionHtml}
    </div>
  `;
}

function mountForm() {
  if (!listing) return;

  const selectedUnit = savedFormState?.unit ?? listing.unit ?? "";
  const selectedRegion = savedFormState?.regionId ?? listing.regionId ?? "";
  const selectedCategory = savedFormState?.categoryId ?? listing.categoryId ?? "";
  const priceCurrency = savedFormState?.priceCurrency === CURRENCIES.USD ? CURRENCIES.USD : CURRENCIES.GEL;

  root.innerHTML = `
    <div class="container" style="max-width: 720px; margin: 2rem auto;">
      <section class="card pad">
        <h1 style="margin-top:0;">${t("listingForm.editTitle")}</h1>
        <p class="muted" style="margin-bottom: 1.5rem;">${t("listingForm.editDesc")}</p>

        <form id="edit-form" novalidate>
          <div class="form-field">
            <label class="form-label" for="title">${t("listingForm.productTitle")}</label>
            <input class="input" id="title" name="title" placeholder="${t("listingForm.productTitlePlaceholder")}" required />
            <span class="form-error" data-err="title"></span>
          </div>

          <div class="form-field">
            <label class="form-label" for="category">${t("common.category")}</label>
            <select class="input" id="category" name="categoryId" required>
              <option value="">${t("listingForm.selectCategory")}</option>
              ${getCategories()
                .map(
                  (c) =>
                    `<option value="${c.id}" ${c.id === selectedCategory ? "selected" : ""}>${getCategoryLabel(c.id, c.name)}</option>`,
                )
                .join("")}
            </select>
            <span class="form-error" data-err="categoryId"></span>
          </div>

          <div class="listing-price-unit-row">
            <div class="form-field">
              <label class="form-label" for="price">${t("common.price")}</label>
              <input class="input" id="price" name="price" type="number" inputmode="decimal" placeholder="0.00" step="0.01" min="0" required />
              <span class="form-error" data-err="price"></span>
            </div>
            <div class="form-field">
              <label class="form-label" for="unit">${t("common.unit")}</label>
              <div class="unit-currency-row">
                <select class="input" id="unit" name="unit" required>
                  <option value="">${t("listingForm.selectUnit")}</option>
                  ${unitOptions(selectedUnit)}
                </select>
                <div class="currency-selector" role="radiogroup" aria-label="${t("currency.label")}">
                  <label class="currency-option">
                    <input type="radio" name="priceCurrency" value="GEL" ${priceCurrency === CURRENCIES.GEL ? "checked" : ""} />
                    <span aria-hidden="true">${getCurrencySymbol(CURRENCIES.GEL)}</span>
                    <span class="sr-only">${t("currency.gel")}</span>
                  </label>
                  <label class="currency-option">
                    <input type="radio" name="priceCurrency" value="USD" ${priceCurrency === CURRENCIES.USD ? "checked" : ""} />
                    <span aria-hidden="true">${getCurrencySymbol(CURRENCIES.USD)}</span>
                    <span class="sr-only">${t("currency.usd")}</span>
                  </label>
                </div>
              </div>
              <span class="form-error" data-err="unit"></span>
            </div>
          </div>

          <div class="form-field">
            <label class="form-label" for="quantity">${t("listingForm.quantityAvailable")}</label>
            <input class="input" id="quantity" name="quantityAvailable" type="number" inputmode="numeric" placeholder="0" min="0" required />
            <span class="form-error" data-err="quantityAvailable"></span>
          </div>

          <div class="form-field">
            <label class="form-label" for="regionId">${t("location.region")}</label>
            <select class="input" id="regionId" name="regionId" required>
              <option value="">${t("listingForm.selectRegion")}</option>
              ${renderRegionOptionsHtml({ selectedId: selectedRegion, lang: getCurrentLang() })}
            </select>
            <span class="form-error" data-err="regionId"></span>
          </div>

          <div class="form-field">
            <label class="form-label form-label-row" for="village">
              <span>${t("location.village")}</span>
              <span class="form-label-optional">(${t("common.optional")})</span>
            </label>
            <input class="input" id="village" name="village" placeholder="${t("listingForm.villagePlaceholder")}" />
            <span class="form-error" data-err="village"></span>
          </div>

          <div class="form-field">
            <label class="form-label" for="description">${t("common.description")}</label>
            <textarea class="input" id="description" name="description" placeholder="${t("listingForm.descriptionPlaceholder")}" rows="6" required></textarea>
            <span class="form-error" data-err="description"></span>
          </div>

          <div class="form-field">
            <span class="form-label">${t("listingForm.productImages")}</span>
            <div class="listing-image-picker" data-image-picker>
              <div class="listing-image-grid" data-image-preview-grid hidden></div>
              <label class="listing-image-add btn btn-ghost" data-image-add>
                <input
                  class="listing-image-input"
                  id="images"
                  name="images"
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                />
                ${t("listingForm.addImage")}
              </label>
              <span class="muted" style="font-size: var(--text-sm);">${t("listingForm.imagesHint")}</span>
              <span class="form-error" data-err="images"></span>
            </div>
          </div>

          <p class="form-error-banner" id="form-error" role="alert" style="display: none;"></p>

          <div style="display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; margin-top: 1.5rem;">
            <button class="btn btn-primary" type="submit" data-submit>${t("common.saveChanges")}</button>
            <a class="btn btn-ghost" href="${productListingUrl(listingId)}">${t("common.cancel")}</a>
          </div>
        </form>
      </section>
    </div>
  `;

  const form = qs(root, "#edit-form");
  restoreFormState(form, savedFormState ?? listingToFormState(listing));
  seedPendingImagesFromListing();
  wireImagePicker(form);
  wireForm(form);
}

function wireImagePicker(form) {
  const fileInput = qs(form, "#images");
  const grid = qs(form, "[data-image-preview-grid]");
  const addLabel = qs(form, "[data-image-add]");

  function renderPreviews() {
    if (!grid) return;
    if (!pendingImages.length) {
      grid.innerHTML = "";
      grid.hidden = true;
      if (addLabel) addLabel.hidden = false;
      return;
    }

    grid.hidden = false;
    grid.innerHTML = pendingImages
      .map(
        (img) => `
        <div class="listing-image-thumb" data-image-id="${img.id}">
          <img src="${img.dataUrl}" alt="" />
          <button
            type="button"
            class="listing-image-remove"
            data-remove-image="${img.id}"
            aria-label="${t("listingForm.removeImage")}"
          >&times;</button>
        </div>
      `,
      )
      .join("");

    grid.querySelectorAll("[data-remove-image]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-remove-image");
        pendingImages = pendingImages.filter((img) => img.id !== id);
        renderPreviews();
      });
    });

    if (addLabel) addLabel.hidden = pendingImages.length >= 8;
  }

  renderPreviews();

  fileInput?.addEventListener("change", async () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = "";

    if (!files.length) return;

    const slotsLeft = 8 - pendingImages.length;
    if (slotsLeft <= 0) return;

    for (const file of files.slice(0, slotsLeft)) {
      if (!file.type.startsWith("image/")) continue;
      try {
        const dataUrl = await readFileAsDataUrl(file);
        pendingImages.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          file,
          dataUrl,
        });
      } catch {
        toast("error", t("listingForm.imageTooLarge", { default: "Image could not be added. Try a smaller file." }));
      }
    }

    renderPreviews();
  });
}

function wireForm(form) {
  const submitBtn = qs(root, "[data-submit]");
  const formError = qs(root, "#form-error");
  const fieldKeys = ["title", "categoryId", "price", "unit", "quantityAvailable", "regionId", "village", "description", "images"];

  function clearErrors() {
    formError.style.display = "none";
    formError.textContent = "";
    for (const k of fieldKeys) {
      const el = root.querySelector(`[data-err='${k}']`);
      if (el) el.textContent = "";
    }
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? t("common.saving") : t("common.saveChanges");
  }

  function showFormError(message) {
    formError.textContent = message;
    formError.style.display = "block";
  }

  function showFieldError(field, message) {
    const el = root.querySelector(`[data-err='${field}']`);
    if (el) el.textContent = message;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    setLoading(true);

    try {
      const fd = new FormData(form);
      let images = pendingImages.map((img) => img.dataUrl);
      if (images.length === 0) images = ["/img/logo.png"];

      const inputCurrency = fd.get("priceCurrency") === CURRENCIES.USD ? CURRENCIES.USD : CURRENCIES.GEL;
      const priceGel = priceToStorageGEL(fd.get("price"), inputCurrency);

      const res = await updateListing(
        listingId,
        {
          title: fd.get("title"),
          categoryId: fd.get("categoryId"),
          price: priceGel,
          unit: fd.get("unit"),
          quantityAvailable: fd.get("quantityAvailable"),
          regionId: fd.get("regionId"),
          village: fd.get("village"),
          description: fd.get("description"),
          images,
        },
        user.id,
        user.role,
      );

      if (!res.ok) {
        setLoading(false);
        for (const [field, msg] of Object.entries(res.error?.fieldErrors || {})) {
          showFieldError(field, msg);
        }
        showFormError(res.error?.message || t("listingForm.updateFailed"));
        return;
      }

      toast("success", t("listingForm.updated"));
      setTimeout(() => {
        window.location.href = productListingUrl(listingId);
      }, 500);
    } catch (err) {
      setLoading(false);
      showFormError(err.message || t("listingForm.errorOccurred"));
    }
  });
}

async function initPage() {
  if (!user) {
    renderBlocked(
      "common.loginRequired",
      "listingForm.editLoginRequiredDesc",
      `<a class="btn btn-primary" href="/pages/login.html?next=${encodeURIComponent(location.pathname + location.search)}">${t("common.login")}</a>`,
    );
    return;
  }

  const canSell = user.role === ROLES.farmer || user.role === ROLES.admin;
  if (!canSell) {
    renderBlocked(
      "listingForm.sellerOnly",
      "auth.signup.consumerDesc",
      `<a class="btn btn-primary" href="/pages/marketplace.html">${t("nav.link.marketplace")}</a>`,
    );
    return;
  }

  if (!listingId) {
    renderBlocked(
      "listingForm.missingListingId",
      "listingForm.missingListingIdDesc",
      `<a class="btn btn-primary" href="/pages/marketplace.html">${t("product.backToMarketplace")}</a>`,
    );
    return;
  }

  try {
    const res = await getListingById(listingId);
    if (!res.ok) {
      renderBlocked(
        "product.notFoundTitle",
        "product.notFoundDesc",
        `<a class="btn btn-primary" href="/pages/marketplace.html">${t("product.backToMarketplace")}</a>`,
      );
      return;
    }

    listing = res.data;

    if (user.id !== listing.sellerId && user.role !== ROLES.admin) {
      renderBlocked(
        "common.permissionDenied",
        "listingForm.editDeniedDesc",
        `<a class="btn btn-primary" href="/pages/marketplace.html">${t("product.backToMarketplace")}</a>`,
      );
      return;
    }

    mountForm();
    onLanguageChange(() => {
      translatePageHead("listingForm.editPageTitle", "listingForm.editPageSubtitle");
      savedFormState = captureFormState(qs(root, "#edit-form"));
      mountForm();
    });
  } catch (err) {
    renderBlocked(
      "listingForm.errorLoading",
      err.message,
      `<a class="btn btn-primary" href="/pages/marketplace.html">${t("product.backToMarketplace")}</a>`,
    );
  }
}

initPage();
