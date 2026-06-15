import { boot } from "../app/boot.js";
import { qs, toast, productListingUrl } from "../app/ui.js";
import { initAppState, getCurrentUser } from "../app/auth-state.js";
import { getListingById, updateListing } from "../services/listings.service.js";
import { getCategories } from "../data/categories.js";
import { t, onLanguageChange, getCategoryLabel } from "../app/i18n.js";

boot();

const root = document.getElementById("edit-listing-root");
if (!root) throw new Error("Missing #edit-listing-root");

await initAppState();

const user = getCurrentUser();
const listingId = new URLSearchParams(location.search).get("id");
let listing = null;
let savedFormState = null;

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
    if (el && name !== "images") el.value = value ?? "";
  }
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

  const imagesPreview =
    Array.isArray(listing.images) && listing.images.length
      ? `
      <div class="form-field">
        <label class="form-label">${t("listingForm.currentImages")}</label>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 0.5rem;">
          ${listing.images
            .slice(0, 8)
            .map((img) => `<img src="${img}" alt="${escapeHtml(t("listingForm.productImages"))}" style="width: 100%; height: 100px; object-fit: cover; border-radius: 4px;" />`)
            .join("")}
        </div>
      </div>`
      : "";

  root.innerHTML = `
    <div class="container" style="max-width: 720px; margin: 2rem auto;">
      <section class="card pad">
        <h1 style="margin-top:0;">${t("listingForm.editTitle")}</h1>
        <p class="muted" style="margin-bottom: 1.5rem;">${t("listingForm.editDesc")}</p>

        <form id="edit-form" novalidate>
          <div class="form-field">
            <label class="form-label" for="title">${t("listingForm.productTitle")}</label>
            <input class="input" id="title" name="title" value="${listing.title || ""}" required />
            <span class="form-error" data-err="title"></span>
          </div>

          <div class="form-field">
            <label class="form-label" for="category">${t("common.category")}</label>
            <select class="input" id="category" name="categoryId" required>
              <option value="">${t("listingForm.selectCategory")}</option>
              ${getCategories().map((c) => `<option value="${c.id}" ${c.id === listing.categoryId ? "selected" : ""}>${getCategoryLabel(c.id, c.name)}</option>`).join("")}
            </select>
            <span class="form-error" data-err="categoryId"></span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-field">
              <label class="form-label" for="price">${t("common.price")}</label>
              <input class="input" id="price" name="price" type="number" inputmode="decimal" step="0.01" min="0" value="${listing.price || ""}" required />
              <span class="form-error" data-err="price"></span>
            </div>
            <div class="form-field">
              <label class="form-label" for="unit">${t("common.unit")}</label>
              <select class="input" id="unit" name="unit" required>
                <option value="">${t("listingForm.selectUnit")}</option>
                ${unitOptions(listing.unit)}
              </select>
              <span class="form-error" data-err="unit"></span>
            </div>
          </div>

          <div class="form-field">
            <label class="form-label" for="quantity">${t("listingForm.quantityAvailable")}</label>
            <input class="input" id="quantity" name="quantityAvailable" type="number" inputmode="numeric" min="0" value="${listing.quantityAvailable || ""}" required />
            <span class="form-error" data-err="quantityAvailable"></span>
          </div>

          <div class="form-field">
            <label class="form-label" for="location">${t("common.location")}</label>
            <input class="input" id="location" name="location" value="${listing.location || ""}" />
            <span class="form-error" data-err="location"></span>
          </div>

          <div class="form-field">
            <label class="form-label" for="description">${t("common.description")}</label>
            <textarea class="input" id="description" name="description" rows="6" required>${listing.description || ""}</textarea>
            <span class="form-error" data-err="description"></span>
          </div>

          <div class="form-field">
            <label class="form-label" for="images">${t("listingForm.productImages")}</label>
            <input class="input" id="images" name="images" type="file" accept="image/*" multiple />
            <span class="muted" style="font-size: var(--text-sm);">${t("listingForm.imagesHintEdit")}</span>
            <span class="form-error" data-err="images"></span>
          </div>

          ${imagesPreview}

          <div class="form-field">
            <label class="form-label" for="imageUrls">${t("listingForm.imageUrls")}</label>
            <textarea class="input" id="imageUrls" name="imageUrls" placeholder="${t("listingForm.imageUrlsPlaceholder")}" rows="3"></textarea>
            <span class="form-error" data-err="imageUrls"></span>
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
  restoreFormState(form, savedFormState);
  wireForm(form);
}

function wireForm(form) {
  const submitBtn = qs(root, "[data-submit]");
  const formError = qs(root, "#form-error");
  const fieldKeys = ["title", "categoryId", "price", "unit", "quantityAvailable", "location", "description", "images", "imageUrls"];

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
      let images = listing.images || [];
      const files = form.elements.namedItem("images").files;

      if (files && files.length > 0) {
        const readers = [];
        for (let i = 0; i < Math.min(files.length, 8); i++) {
          readers.push(
            new Promise((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.readAsDataURL(files[i]);
            }),
          );
        }
        images = await Promise.all(readers);
      } else {
        const imageUrlsText = fd.get("imageUrls") || "";
        if (String(imageUrlsText).trim()) {
          const urls = String(imageUrlsText)
            .split(",")
            .map((u) => u.trim())
            .filter((u) => u && u.startsWith("http"));
          if (urls.length > 0) images = urls.slice(0, 8);
        }
      }

      const res = await updateListing(
        listingId,
        {
          title: fd.get("title"),
          categoryId: fd.get("categoryId"),
          price: fd.get("price"),
          unit: fd.get("unit"),
          quantityAvailable: fd.get("quantityAvailable"),
          location: fd.get("location"),
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
    renderBlocked("common.loginRequired", "listingForm.editLoginRequiredDesc", `<a class="btn btn-primary" href="/pages/login.html">${t("common.login")}</a>`);
    return;
  }

  if (!listingId) {
    renderBlocked("listingForm.missingListingId", "listingForm.missingListingIdDesc", `<a class="btn btn-primary" href="/pages/marketplace.html">${t("product.backToMarketplace")}</a>`);
    return;
  }

  try {
    const res = await getListingById(listingId);
    if (!res.ok) {
      renderBlocked("product.notFoundTitle", "product.notFoundDesc", `<a class="btn btn-primary" href="/pages/marketplace.html">${t("product.backToMarketplace")}</a>`);
      return;
    }

    listing = res.data;

    if (user.id !== listing.sellerId && user.role !== "admin") {
      renderBlocked("common.permissionDenied", "listingForm.editDeniedDesc", `<a class="btn btn-primary" href="/pages/marketplace.html">${t("product.backToMarketplace")}</a>`);
      return;
    }

    mountForm();
    onLanguageChange(() => {
      savedFormState = captureFormState(qs(root, "#edit-form"));
      mountForm();
    });
  } catch (err) {
    renderBlocked("listingForm.errorLoading", err.message, `<a class="btn btn-primary" href="/pages/marketplace.html">${t("product.backToMarketplace")}</a>`);
  }
}

initPage();
