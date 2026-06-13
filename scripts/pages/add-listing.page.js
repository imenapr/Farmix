import { boot } from "../app/boot.js";
import { qs, setText, toast } from "../app/ui.js";
import { getCurrentUser } from "../app/auth-state.js";
import { createListing } from "../services/listings.service.js";
import { CATEGORIES } from "../data/seed.js";

boot();

const root = document.getElementById("add-listing-root");
if (!root) throw new Error("Missing #add-listing-root");

// Check authentication
const user = getCurrentUser();
if (!user) {
  root.innerHTML = `
    <div class="state-block">
      <h2>Login required</h2>
      <p>You must be logged in to create a listing.</p>
      <a class="btn btn-primary" href="/pages/login.html?next=/pages/add-listing.html">Log in</a>
    </div>
  `;
  throw new Error("User not authenticated");
}

root.innerHTML = `
  <div class="container" style="max-width: 720px; margin: 2rem auto;">
    <section class="card pad">
      <h1 style="margin-top:0;">Create a new listing</h1>
      <p class="muted" style="margin-bottom: 1.5rem;">List your products for sale on FARMIX marketplace.</p>

      <form id="add-form" novalidate>

        <!-- Title -->
        <div class="form-field">
          <label class="form-label" for="title">Product title</label>
          <input class="input" id="title" name="title" placeholder="e.g., Fresh Organic Tomatoes" required />
          <span class="form-error" data-err="title"></span>
        </div>

        <!-- Category -->
        <div class="form-field">
          <label class="form-label" for="category">Category</label>
          <select class="input" id="category" name="categoryId" required>
            <option value="">Select a category</option>
            ${CATEGORIES.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}
          </select>
          <span class="form-error" data-err="categoryId"></span>
        </div>

        <!-- Price & Unit -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
          <div class="form-field">
            <label class="form-label" for="price">Price</label>
            <input class="input" id="price" name="price" type="number" inputmode="decimal" placeholder="0.00" step="0.01" min="0" required />
            <span class="form-error" data-err="price"></span>
          </div>
          <div class="form-field">
            <label class="form-label" for="unit">Unit</label>
            <select class="input" id="unit" name="unit" required>
              <option value="">Select unit</option>
              <option value="kg">Per kg</option>
              <option value="lb">Per lb</option>
              <option value="box">Per box</option>
              <option value="unit">Per unit</option>
              <option value="piece">Per piece</option>
              <option value="liter">Per liter</option>
              <option value="gallon">Per gallon</option>
            </select>
            <span class="form-error" data-err="unit"></span>
          </div>
        </div>

        <!-- Quantity Available -->
        <div class="form-field">
          <label class="form-label" for="quantity">Quantity available</label>
          <input class="input" id="quantity" name="quantityAvailable" type="number" inputmode="numeric" placeholder="0" min="0" required />
          <span class="form-error" data-err="quantityAvailable"></span>
        </div>

        <!-- Location -->
        <div class="form-field">
          <label class="form-label" for="location">Location</label>
          <input class="input" id="location" name="location" placeholder="City, State" />
          <span class="form-error" data-err="location"></span>
        </div>

        <!-- Description -->
        <div class="form-field">
          <label class="form-label" for="description">Description</label>
          <textarea class="input" id="description" name="description" placeholder="Describe your product, growing methods, certifications, etc." rows="6" required></textarea>
          <span class="form-error" data-err="description"></span>
        </div>

        <!-- Images -->
        <div class="form-field">
          <label class="form-label" for="images">Product images</label>
          <input class="input" id="images" name="images" type="file" accept="image/*" multiple />
          <span class="muted" style="font-size: var(--text-sm);">Upload up to 8 photos. Paste image URLs separated by commas, or upload files.</span>
          <span class="form-error" data-err="images"></span>
        </div>

        <!-- Image URLs (alternative input) -->
        <div class="form-field">
          <label class="form-label" for="imageUrls">Or paste image URLs (comma-separated)</label>
          <textarea class="input" id="imageUrls" name="imageUrls" placeholder="https://example.com/image1.jpg, https://example.com/image2.jpg" rows="3"></textarea>
          <span class="form-error" data-err="imageUrls"></span>
        </div>

        <!-- Error banner -->
        <p class="form-error-banner" id="form-error" role="alert" style="display: none;"></p>

        <!-- Actions -->
        <div style="display: flex; gap: 0.6rem; flex-wrap: wrap; align-items: center; margin-top: 1.5rem;">
          <button class="btn btn-primary" type="submit" data-submit>Create listing</button>
          <a class="btn btn-ghost" href="/pages/marketplace.html">Cancel</a>
        </div>

      </form>
    </section>
  </div>
`;

const form = qs(root, "#add-form");
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
  submitBtn.textContent = isLoading ? "Creating listing…" : "Create listing";
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

    // Check for file uploads
    const files = form.elements.namedItem("images").files;
    if (files && files.length > 0) {
      // In a real app, upload files to Supabase Storage first
      // For now, we'll use file data URLs (not recommended for production)
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
    }

    // Check for image URLs
    const imageUrlsText = fd.get("imageUrls") || "";
    if (imageUrlsText.trim()) {
      const urls = imageUrlsText
        .split(",")
        .map((u) => u.trim())
        .filter((u) => u && u.startsWith("http"));
      images = [...images, ...urls].slice(0, 8);
    }

    // Use placeholder if no images
    if (images.length === 0) {
      images = ["/img/logo.png"];
    }

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
      user.id
    );

    if (!res.ok) {
      setLoading(false);
      const fieldErrors = res.error?.fieldErrors || {};
      for (const [field, msg] of Object.entries(fieldErrors)) {
        showFieldError(field, msg);
      }
      showFormError(res.error?.message || "Failed to create listing");
      return;
    }

    toast("success", "Listing created successfully!");
    setTimeout(() => {
      window.location.href = `/pages/product.html?id=${res.data.id}`;
    }, 500);
  } catch (err) {
    setLoading(false);
    showFormError(err.message || "An error occurred");
  }
});
