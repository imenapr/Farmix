import { boot } from "../app/boot.js";
import { qs, setText, toast } from "../app/ui.js";
import { getCurrentUser } from "../services/auth.service.js";
import { LISTING_STATUS } from "../app/config.js";
import { getDb } from "../services/db.provider.js";

boot();

const root = document.getElementById("add-listing-root");
if (root) {
  root.innerHTML = `
    <section class="card pad" style="max-width: 720px;">
      <form id="add-form" class="stack" novalidate>
        <label class="stack" style="gap:0.35rem;">
          <span style="font-weight:800;">Title</span>
          <input class="input" name="title" required />
          <span class="error-text" data-err="title"></span>
        </label>

        <label class="stack" style="gap:0.35rem;">
          <span style="font-weight:800;">Price</span>
          <input class="input" name="price" inputmode="decimal" placeholder="5.00" required />
          <span class="error-text" data-err="price"></span>
        </label>

        <label class="stack" style="gap:0.35rem;">
          <span style="font-weight:800;">Description</span>
          <textarea class="textarea" name="description" rows="5" required></textarea>
          <span class="error-text" data-err="description"></span>
        </label>

        <label class="stack" style="gap:0.35rem;">
          <span style="font-weight:800;">Photos</span>
          <input class="input" name="images" type="file" accept="image/*" multiple required />
          <span class="muted" style="font-size:var(--text-sm);">These are saved as files in /uploads and their URLs are stored in SQLite.</span>
          <span class="error-text" data-err="images"></span>
        </label>

        <p class="error-text" data-err="form" style="margin:0;"></p>

        <div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center;">
          <button class="btn btn-primary" type="submit" data-submit>Save listing</button>
          <a class="btn btn-ghost" href="/pages/marketplace.html">Cancel</a>
        </div>
      </form>
    </section>
  `;

  const form = qs(root, "#add-form");
  const submitBtn = qs(form, "[data-submit]");
  const err = (k) => qs(form, `[data-err='${k}']`);

  function clearErrors() {
    for (const k of ["title", "price", "description", "images", "form"]) setText(err(k), "");
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? "Saving..." : "Save listing";
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    setLoading(true);

    const fd = new FormData(form);
    const files = /** @type {FileList | null} */ (form.elements.namedItem("images").files);
    if (!files || !files.length) {
      setLoading(false);
      setText(err("images"), "Please upload at least 1 photo.");
      return;
    }

    // Ensure files are attached with the name multer expects: images
    fd.delete("images");
    Array.from(files).slice(0, 8).forEach((f) => fd.append("images", f));

    // Add seller info from current user
    const user = getCurrentUser();
    if (user) {
      fd.append("seller_email", user.email);
      // Note: Phone not stored in user profile yet, so omit or add later
    }

    try {
      const r = await fetch("/api/listings", { method: "POST", body: fd });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data?.ok) {
        setLoading(false);
        setText(err("form"), data?.error || "Failed to save listing.");
        return;
      }

      // Fetch the listing from server and sync to frontend database
      let listingRes = null;
      let retries = 3;
      while (!listingRes?.ok && retries > 0) {
        try {
          const r = await fetch(`/api/listings/${data.id}`);
          listingRes = await r.json();
          console.log(`[Listing Fetch] Attempt ${4 - retries}: status=${r.status}, response=`, listingRes);
        } catch (err) {
          console.log(`[Listing Fetch] Attempt ${4 - retries} failed:`, err.message);
          listingRes = null;
        }
        if (!listingRes?.ok && retries > 1) {
          await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms before retry
        }
        retries--;
      }

      if (listingRes?.ok && listingRes.listing) {
        const serverListing = listingRes.listing;
        console.log("[Sync to Frontend]", serverListing);
        getDb((db) => {
          const newListing = {
            id: serverListing.id,
            title: serverListing.title,
            price: serverListing.price,
            description: serverListing.description,
            category: serverListing.category,
            images: Array.isArray(serverListing.images) ? serverListing.images : [],
            seller_email: serverListing.seller_email,
            seller_phone: serverListing.seller_phone,
            status: LISTING_STATUS.active,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            views: 0,
          };
          db.listings.push(newListing);
          console.log("[Frontend DB] Listing added:", newListing);
          return db;
        });
      } else {
        console.warn("[Listing Sync Failed] Could not fetch listing from server. It may appear in marketplace after refresh.");
      }

      toast("success", "Listing saved.");
      location.href = `/pages/buyer-product.html?id=${encodeURIComponent(String(data.id))}`;
    } catch {
      setLoading(false);
      setText(err("form"), "Could not reach the server. Start it with `npm start`.");
    }
  });
}

