import { boot } from "../app/boot.js";
import { qs, setText, toast } from "../app/ui.js";
import { getCurrentUser } from "../app/auth-state.js";
import { getListingById, updateListing } from "../services/listings.service.js";
import { CATEGORIES } from "../data/seed.js";

boot();

const root = document.getElementById("edit-listing-root");
if (!root) throw new Error("Missing #edit-listing-root");

const user = getCurrentUser();
if (!user) {
  root.innerHTML = `
    <div class="state-block">
      <h2>Login required</h2>
      <p>You must be logged in to edit listings.</p>
      <a class="btn btn-primary" href="/pages/login.html">Log in</a>
    </div>
  `;
  throw new Error("User not authenticated");
}

const listingId = new URLSearchParams(location.search).get("id");
if (!listingId) {
  root.innerHTML = `
    <div class="state-block">
      <h2>Missing listing ID</h2>
      <p>Unable to load listing for editing.</p>
      <a class="btn btn-primary" href="/pages/marketplace.html">Back to marketplace</a>
    </div>
  `;
  throw new Error("Missing listing ID");
}

async function initPage() {
  try {
    const res = await getListingById(listingId);
    if (!res.ok) {
      root.innerHTML = `
        <div class="state-block">
          <h2>Listing not found</h2>
          <p>This listing may have been archived or removed.</p>
          <a class="btn btn-primary" href="/pages/marketplace.html">Back to marketplace</a>
        </div>
      `;
      return;
    }

    const listing = res.data;

    // Check permissions
    if (user.id !== listing.sellerId && user.role !== "admin") {
      root.innerHTML = `
        <div class="state-block">
          <h2>Permission denied</h2>
          <p>You can only edit your own listings.</p>
          <a class="btn btn-primary" href="/pages/marketplace.html">Back to marketplace</a>
        </div>
      `;
      return;
    }

    root.innerHTML = `
      <div class="container" style="max-width: 720px; margin: 2rem auto;">
        <section class="card pad">
          <h1 style="margin-top:0;">Edit listing</h1>
          <p class="muted" style="margin-bottom: 1.5rem;">Update your product information.</p>

          <form id="edit-form" novalidate>

            <!-- Title -->
            <div class="form-field">
              <label class="form-label" for="title">Product title</label>
              <input class="input" id="title" name="title" value="${listing.title || ""}" required />
              <span class="form-error" data-err="title"></span>
            </div>

            <!-- Category -->
            <div class="form-field">
              <label class="form-label" for="category">Category</label>
              <select class="input" id="category" name="categoryId" required>
                <option value="">Select a category</option>
                ${CATEGORIES.map((c) => `<option value="${c.id}" ${c.id === listing.categoryId ? "selected" : ""}>${c.name}</option>`).join("")}
              </select>
              <span class="form-error" data-err="categoryId"></span>
            </div>

            <!-- Price & Unit -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
              <div class="form-field">
                <label class="form-label" for="price">Price</label>
                <input class="input" id="price" name="price" type="number" inputmode="decimal" step="0.01" min="0" value="${listing.price || ""}" required />
                <span class="form-error" data-err="price"></span>
              </div>
              <div class="form-field">
                <label class="form-label" for="unit">Unit</label>
                <select class="input" id="unit" name="unit" required>
                  <option value="">Select unit</option>
                  <option value="kg" ${listing.unit === "kg" ? "selected" : ""}>Per kg</option>
                  <option value="lb" ${listing.unit === "lb" ? "selected" : ""}>Per lb</option>
                  <option value="box" ${listing.unit === "box" ? "selected" : ""}>Per box</option>
                  <option value="unit" ${listing.unit === "unit" ? "selected" : ""}>Per unit</option>
                  <option value="piece" ${listing.unit === "piece" ? "selected" : ""}>Per piece</option>
                  <option value="liter" ${listing.unit === "liter" ? "selected" : ""}>Per liter</option>
                  <option value="gallon" ${listing.unit === "gallon" ? "selected" : ""}>Per gallon</option>
                </select>
                <span class="form-error" data-err="unit"></span>
              </div>
            </div>

            <!-- Quantity Available -->
            <div class="form-field">
              <label class="form-label" for="quantity">Quantity available</label>
              <input class="input" id="quantity" name="quantityAvailable" type="number" inputmode="numeric" min="0" value="${listing.quantityAvailable || ""}" required />
              <span class="form-error" data-err="quantityAvailable"></span>
            </div>

            <!-- Location -->
            <div class="form-field">
              <label class="form-label" for="location">Location</label>
              <input class="input" id="location" name="location" value="${listing.location || ""}" />
              <span class="form-error" data-err="location"></span>
            </div>

            <!-- Description -->
            <div class="form-field">
              <label class="form-label" for="description">Description</label>
              <textarea class="input" id="description" name="description" rows="6" required>${listing.description || ""}</textarea>
              <span class="form-error" data-err="description"></span>
            </div>

            <!-- Images -->
            <div class="form-field">
              <label class="form-label" for="images">Product images</label>
              <input class="input" id="images" name="images" type="file" accept="image/*" multiple />
              <span class="muted" style="font-size: var(--text-sm);">Upload new images to replace current ones.</span>
              <span class="form-error" data-err="images"></span>
            </div>

            <!-- Current Images Preview -->
            ${
              Array.isArray(listing.images) && listing.images.length
                ? `
              <div class="form-field">
                <label class="form-label">Current images</label>
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 0.5rem;">
                  ${listing.images
                    .slice(0, 8)
                    .map((img) => `<img src="${img}" alt="Product" style="width: 100%; height: 100px; object-fit: cover; border-radius: 4px;" />`)
                    .join("")}
                </div>
              </div>
            `
                : ""
            }

            <!-- Image URLs -->
            <div class="form-field">
              <label class="form-label" for="imageUrls">Or paste image URLs (comma-separated)</label>
              <textarea class="input" id="imageUrls" name="imageUrls" placeholder="https://example.com/image1.jpg, https://example.com/image2.jpg" rows="3"></textarea>
              <span class="form-error" data-err="imageUrls"></span>
            </div>

            <!-- Error banner -->
            <p class="form-error-banner" id="form-error" role="alert" style="display: none;"></p>

            <!-- Actions -->
            <div style="display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; margin-top: 1.5rem;">
              <button class="btn btn-primary" type="submit" data-submit>Save changes</button>
              <a class="btn btn-ghost" href="/pages/product.html?id=${listingId}">Cancel</a>
            </div>

          </form>
        </section>
      </div>
    `;

    const form = qs(root, "#edit-form");
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
      submitBtn.textContent = isLoading ? "Saving…" : "Save changes";
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

        // Check for file uploads
        const files = form.elements.namedItem("images").files;
        if (files && files.length > 0) {
          const readers = [];
          for (let i = 0; i < Math.min(files.length, 8); i++) {
            readers.push(
              new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(files[i]);
              })
            );
          }
          images = await Promise.all(readers);
        } else {
          // Check for image URLs
          const imageUrlsText = fd.get("imageUrls") || "";
          if (imageUrlsText.trim()) {
            const urls = imageUrlsText
              .split(",")
              .map((u) => u.trim())
              .filter((u) => u && u.startsWith("http"));
            if (urls.length > 0) {
              images = urls.slice(0, 8);
            }
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
          user.role
        );

        if (!res.ok) {
          setLoading(false);
          const fieldErrors = res.error?.fieldErrors || {};
          for (const [field, msg] of Object.entries(fieldErrors)) {
            showFieldError(field, msg);
          }
          showFormError(res.error?.message || res.error || "Failed to update listing");
          return;
        }

        toast("success", "Listing updated successfully!");
        setTimeout(() => {
          window.location.href = `/pages/product.html?id=${listingId}`;
        }, 500);
      } catch (err) {
        setLoading(false);
        showFormError(err.message || "An error occurred");
      }
    });
  } catch (err) {
    root.innerHTML = `
      <div class="state-block">
        <h2>Error loading listing</h2>
        <p>${err.message}</p>
        <a class="btn btn-primary" href="/pages/marketplace.html">Back to marketplace</a>
      </div>
    `;
  }
}

initPage();
