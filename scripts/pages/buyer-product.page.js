import { boot } from "../app/boot.js";
import { escapeHtml, qs, renderStateBlock, setText, toast } from "../app/ui.js";

boot();

function ratingText(value) {
  return value === null || value === undefined ? "No ratings" : `${value}/5`;
}

function makeStars(name) {
  // We store a numeric value in a hidden input, and render 5 clickable "star" buttons.
  return `
    <div class="star-row">
      <input type="hidden" name="${escapeHtml(name)}" value="0" />
      <div class="stars" data-stars="${escapeHtml(name)}">
        ${[1, 2, 3, 4, 5]
          .map((n) => `<button type="button" class="star" data-star="${n}" aria-label="${n} stars">★</button>`)
          .join("")}
      </div>
      <span class="muted" style="font-size:var(--text-sm);" data-stars-label="${escapeHtml(name)}">Select 1-5</span>
    </div>
  `;
}

function wireStars(form, key) {
  const host = form.querySelector(`[data-stars='${key}']`);
  const hidden = /** @type {HTMLInputElement | null} */ (form.querySelector(`input[name='${key}']`));
  const label = form.querySelector(`[data-stars-label='${key}']`);
  if (!host || !hidden || !label) return;

  const set = (value) => {
    hidden.value = String(value);
    label.textContent = value ? `${value}/5` : "Select 1-5";
    host.querySelectorAll("[data-star]").forEach((btn) => {
      const n = Number(btn.getAttribute("data-star"));
      btn.setAttribute("data-on", String(n <= value));
    });
  };

  host.addEventListener("click", (e) => {
    const btn = /** @type {HTMLElement | null} */ (e.target?.closest?.("[data-star]"));
    if (!btn) return;
    const n = Number(btn.getAttribute("data-star"));
    set(n);
  });

  set(0);
}

const root = document.getElementById("buyer-product-root");
if (root) {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    root.innerHTML = renderStateBlock({
      title: "Missing product id",
      description: "Open a product using `?id=...`.",
      actionsHtml: `<a class="btn btn-primary" href="/pages/add-listing.html">Add a listing</a>`,
    });
    return;
  }

  root.innerHTML = renderStateBlock({
    title: "Loading…",
    description: "Fetching from SQLite.",
  });

  async function load() {
    console.log('Fetching listing with ID:', id);
    const r = await fetch(`/api/listings/${encodeURIComponent(id)}`);
    console.log('Server response status:', r.status);
    const data = await r.json().catch(() => null);
    console.log('Server response data:', data);
    if (!r.ok || !data?.ok) throw new Error(data?.error || `Failed to load. Server returned: ${r.status}`);
    return data;
  }

  load()
    .then((data) => {
      console.log('Loaded listing data:', data);
      const listing = data.listing;
      const ratings = data.ratings;
      
      // Handle images: parse if it's a string, or use as array
      let images = [];
      if (listing.images) {
        if (typeof listing.images === 'string') {
          try {
            images = JSON.parse(listing.images);
          } catch (e) {
            console.warn('Could not parse images:', listing.images);
            images = [];
          }
        } else if (Array.isArray(listing.images)) {
          images = listing.images;
        }
      }
      if (!Array.isArray(images) || !images.length) {
        images = ["/img/logo.png"];
      }
      console.log('Parsed images:', images);
      const price = Number(listing.price).toFixed(2).replace(/\.00$/, "");

      document.title = `${listing.title} · FARMIX`;

      root.innerHTML = `
        <div class="bp-layout">
          <section class="card pad bp-hero">
            <div>
              <div class="bp-media">
                <img src="${escapeHtml(images[0])}" alt="${escapeHtml(listing.title)}" data-main />
              </div>
              <div class="bp-thumbs">
                ${images
                  .map(
                    (img, idx) => `
                  <button type="button" class="bp-thumb ${idx === 0 ? "is-active" : ""}" data-thumb="${idx}" aria-label="Preview image ${idx + 1}">
                    <img src="${escapeHtml(img)}" alt="${escapeHtml(listing.title)} image ${idx + 1}" />
                  </button>
                `,
                  )
                  .join("")}
              </div>
            </div>

            <div>
              <h1 class="bp-title">${escapeHtml(listing.title)}</h1>
              <div class="bp-price">${escapeHtml(price)}</div>

              <div class="bp-ratings">
                <div class="bp-rating"><span class="muted">Transport</span><strong>${escapeHtml(ratingText(ratings.transport))}</strong></div>
                <div class="bp-rating"><span class="muted">Quality</span><strong>${escapeHtml(ratingText(ratings.quality))}</strong></div>
                <div class="bp-rating"><span class="muted">Reviews</span><strong>${escapeHtml(String(ratings.count || 0))}</strong></div>
              </div>

              <p class="bp-desc">${escapeHtml(listing.description)}</p>
            </div>
          </section>

          <aside class="stack">
            <section class="card pad">
              <h2 style="margin:0 0 0.6rem; letter-spacing:-0.01em;">Actions</h2>
              <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
                <button class="btn btn-primary" type="button" data-contact>Contact</button>
                <a class="btn btn-ghost" href="/pages/coming-soon.html">Buy now</a>
              </div>
              <div class="muted" style="font-size:var(--text-sm); margin-top:0.5rem;">Contact shows seller email/phone from SQLite.</div>
            </section>

            <section class="card pad">
              <h2 style="margin:0 0 0.6rem; letter-spacing:-0.01em;">Leave a review</h2>
              <form id="review-form" class="stack" novalidate>
                <div class="stack" style="gap:0.4rem;">
                  <div style="font-weight:800;">Transport rating</div>
                  ${makeStars("transport_rating")}
                  <span class="error-text" data-err="transport_rating"></span>
                </div>

                <div class="stack" style="gap:0.4rem;">
                  <div style="font-weight:800;">Quality rating</div>
                  ${makeStars("quality_rating")}
                  <span class="error-text" data-err="quality_rating"></span>
                </div>

                <label class="stack" style="gap:0.35rem;">
                  <span style="font-weight:800;">Comment (optional)</span>
                  <textarea class="textarea" name="comment" rows="4" placeholder="What did you like?"></textarea>
                </label>

                <p class="error-text" data-err="form" style="margin:0;"></p>

                <div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center;">
                  <button class="btn btn-primary" type="submit" data-submit>Submit review</button>
                  <a class="btn btn-ghost" href="/pages/marketplace.html">Back</a>
                </div>
              </form>
            </section>
          </aside>
        </div>

        <div class="modal-backdrop" data-modal>
          <div class="modal" role="dialog" aria-modal="true" aria-label="Seller contact">
            <div style="display:flex; justify-content:space-between; gap:0.75rem; align-items:flex-start;">
              <div>
                <h2 class="modal-title">Seller contact</h2>
                <div class="muted" style="font-size:var(--text-sm);">From the `listing` table.</div>
              </div>
              <button class="btn btn-ghost" type="button" data-close>Close</button>
            </div>
            <div style="margin-top:0.85rem; display:grid; gap:0.6rem;">
              <div class="card" style="padding:0.85rem;">
                <div class="muted" style="font-size:var(--text-sm);">Email</div>
                <div style="font-weight:850;">${escapeHtml(listing.seller_email || "Not provided")}</div>
              </div>
              <div class="card" style="padding:0.85rem;">
                <div class="muted" style="font-size:var(--text-sm);">Phone</div>
                <div style="font-weight:850;">${escapeHtml(listing.seller_phone || "Not provided")}</div>
              </div>
            </div>
          </div>
        </div>
      `;

      const main = qs(root, "[data-main]");
      const thumbs = root.querySelectorAll("[data-thumb]");
      thumbs.forEach((btn) => {
        btn.addEventListener("click", () => {
          const idx = Number(btn.getAttribute("data-thumb"));
          main.src = images[idx] || images[0];
          thumbs.forEach((x) => x.classList.remove("is-active"));
          btn.classList.add("is-active");
        });
      });

      const modal = qs(root, "[data-modal]");
      const openBtn = qs(root, "[data-contact]");
      const closeBtn = qs(root, "[data-close]");

      const setModal = (open) => {
        modal.setAttribute("data-open", String(Boolean(open)));
      };
      openBtn.addEventListener("click", () => setModal(true));
      closeBtn.addEventListener("click", () => setModal(false));
      modal.addEventListener("click", (e) => {
        if (e.target === modal) setModal(false);
      });

      const form = qs(root, "#review-form");
      const submitBtn = qs(form, "[data-submit]");
      const err = (k) => qs(form, `[data-err='${k}']`);

      wireStars(form, "transport_rating");
      wireStars(form, "quality_rating");

      function clearErrors() {
        for (const k of ["transport_rating", "quality_rating", "form"]) setText(err(k), "");
      }

      function setLoading(isLoading) {
        submitBtn.disabled = isLoading;
        submitBtn.textContent = isLoading ? "Submitting..." : "Submit review";
      }

      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearErrors();

        const fd = new FormData(form);
        const transport_rating = Number(fd.get("transport_rating"));
        const quality_rating = Number(fd.get("quality_rating"));
        const comment = String(fd.get("comment") || "").trim();

        if (!transport_rating) {
          setText(err("transport_rating"), "Pick a transport rating (1-5).");
          return;
        }
        if (!quality_rating) {
          setText(err("quality_rating"), "Pick a quality rating (1-5).");
          return;
        }

        setLoading(true);
        try {
          const r2 = await fetch("/api/reviews", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ listing_id: Number(id), transport_rating, quality_rating, comment }),
          });
          const data2 = await r2.json().catch(() => null);
          if (!r2.ok || !data2?.ok) {
            setLoading(false);
            setText(err("form"), data2?.error || "Failed to submit review.");
            return;
          }

          toast("success", "Review submitted.");
          setLoading(false);
          // Reload page to refresh averages (simple + transparent).
          location.reload();
        } catch {
          setLoading(false);
          setText(err("form"), "Could not reach the server. Start it with `npm start`.");
        }
      });
    })
    .catch((e) => {
      console.error('Error loading listing:', e);
      root.innerHTML = renderStateBlock({
        title: "Couldn't load product",
        description: String(e?.message || "Please try again. Make sure the server is running at localhost:3000"),
        actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">Back to marketplace</a>`,
      });
    });
}

