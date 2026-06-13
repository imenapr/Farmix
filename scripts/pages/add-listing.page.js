import { boot } from "../app/boot.js";
import { qs, toast } from "../app/ui.js";
import { initAppState, getCurrentUser } from "../app/auth-state.js";
import { createListing } from "../services/listings.service.js";
import { CATEGORIES } from "../data/seed.js";
import { t, onLanguageChange, translatePageHead } from "../app/i18n.js";

boot();
translatePageHead("listingForm.addPageTitle", "listingForm.addPageSubtitle");

const root = document.getElementById("add-listing-root");
if (!root) throw new Error("Missing #add-listing-root");

await initAppState();

const user = getCurrentUser();
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
    if (el) el.value = value ?? "";
  }
}

function mountPage() {
  if (!user) {
    root.innerHTML = `
      <div class="state-block">
        <h2>${t("common.loginRequired")}</h2>
        <p>${t("listingForm.loginRequiredDesc")}</p>
        <a class="btn btn-primary" href="/pages/login.html?next=/pages/add-listing.html">${t("common.login")}</a>
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="container" style="max-width: 720px; margin: 2rem auto;">
      <section class="card pad">
        <h1 style="margin-top:0;">${t("listingForm.createTitle")}</h1>
        <p class="muted" style="margin-bottom: 1.5rem;">${t("listingForm.createDesc")}</p>

        <form id="add-form" novalidate>
          <div class="form-field">
            <label class="form-label" for="title">${t("listingForm.productTitle")}</label>
            <input class="input" id="title" name="title" placeholder="${t("listingForm.productTitlePlaceholder")}" required />
            <span class="form-error" data-err="title"></span>
          </div>

          <div class="form-field">
            <label class="form-label" for="category">${t("common.category")}</label>
            <select class="input" id="category" name="categoryId" required>
              <option value="">${t("listingForm.selectCategory")}</option>
              ${CATEGORIES.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}
            </select>
            <span class="form-error" data-err="categoryId"></span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <div class="form-field">
              <label class="form-label" for="price">${t("common.price")}</label>
              <input class="input" id="price" name="price" type="number" inputmode="decimal" placeholder="0.00" step="0.01" min="0" required />
              <span class="form-error" data-err="price"></span>
            </div>
            <div class="form-field">
              <label class="form-label" for="unit">${t("common.unit")}</label>
              <select class="input" id="unit" name="unit" required>
                <option value="">${t("listingForm.selectUnit")}</option>
                ${unitOptions()}
              </select>
              <span class="form-error" data-err="unit"></span>
            </div>
          </div>

          <div class="form-field">
            <label class="form-label" for="quantity">${t("listingForm.quantityAvailable")}</label>
            <input class="input" id="quantity" name="quantityAvailable" type="number" inputmode="numeric" placeholder="0" min="0" required />
            <span class="form-error" data-err="quantityAvailable"></span>
          </div>

          <div class="form-field">
            <label class="form-label" for="location">${t("common.location")}</label>
            <input class="input" id="location" name="location" placeholder="${t("listingForm.locationPlaceholder")}" />
            <span class="form-error" data-err="location"></span>
          </div>

          <div class="form-field">
            <label class="form-label" for="description">${t("common.description")}</label>
            <textarea class="input" id="description" name="description" placeholder="${t("listingForm.descriptionPlaceholder")}" rows="6" required></textarea>
            <span class="form-error" data-err="description"></span>
          </div>

          <div class="form-field">
            <label class="form-label" for="images">${t("listingForm.productImages")}</label>
            <input class="input" id="images" name="images" type="file" accept="image/*" multiple />
            <span class="muted" style="font-size: var(--text-sm);">${t("listingForm.imagesHint")}</span>
            <span class="form-error" data-err="images"></span>

            
          <p class="form-error-banner" id="form-error" role="alert" style="display: none;"></p>

          <div style="display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; margin-top: 1.5rem;">
            <button class="btn btn-primary" type="submit" data-submit>${t("listingForm.createListing")}</button>
            <a class="btn btn-ghost" href="/pages/marketplace.html">${t("common.cancel")}</a>
          </div>
        </form>
      </section>
    </div>
  `;

  const form = qs(root, "#add-form");
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
    submitBtn.textContent = isLoading ? t("listingForm.creating") : t("listingForm.createListing");
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
      let images = [];
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
      }

      const imageUrlsText = fd.get("imageUrls") || "";
      if (String(imageUrlsText).trim()) {
        const urls = String(imageUrlsText)
          .split(",")
          .map((u) => u.trim())
          .filter((u) => u && u.startsWith("http"));
        images = [...images, ...urls].slice(0, 8);
      }

      if (images.length === 0) images = ["/img/logo.png"];

      const res = await createListing(
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
      );

      if (!res.ok) {
        setLoading(false);
        for (const [field, msg] of Object.entries(res.error?.fieldErrors || {})) {
          showFieldError(field, msg);
        }
        showFormError(res.error?.message || t("listingForm.createFailed"));
        return;
      }

      toast("success", t("listingForm.created"));
      setTimeout(() => {
        window.location.href = `/pages/product.html?id=${res.data.id}`;
      }, 500);
    } catch (err) {
      setLoading(false);
      showFormError(err.message || t("listingForm.errorOccurred"));
    }
  });
}

if (!user) {
  mountPage();
} else {
  mountPage();
  onLanguageChange(() => {
    translatePageHead("listingForm.addPageTitle", "listingForm.addPageSubtitle");
    savedFormState = captureFormState(qs(root, "#add-form"));
    mountPage();
  });
}
