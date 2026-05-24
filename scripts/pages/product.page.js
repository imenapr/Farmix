import { boot } from "../app/boot.js";
import { getCurrentUser, initAuthSession } from "../services/auth.service.js";
import { escapeHtml, renderStateBlock, toast, qs, setText } from "../app/ui.js";
import { getListingById, incrementListingView, archiveListingAsOwnerOrAdmin } from "../services/listings.service.js";
import { createInquiry } from "../services/messages.service.js";

boot();

function avg(values) {
  if (!Array.isArray(values) || !values.length) return null;
  const n = values.reduce((sum, x) => sum + Number(x || 0), 0) / values.length;
  return Math.round(n * 10) / 10;
}

function ratingText(value) {
  return value === null ? "No ratings" : `${value}/5`;
}

const root = document.getElementById("product-root");
if (!root) throw new Error("Missing #product-root");

async function initPage() {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    root.innerHTML = renderStateBlock({
      title: "Missing listing ID",
      description: "Return to the marketplace and open a listing.",
      actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">Back to marketplace</a>`,
    });
    return;
  }

  const res = await getListingById(id);
  if (!res.ok) {
    root.innerHTML = renderStateBlock({
      title: "Listing not found",
      description: "This listing may have been archived or removed.",
      actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">Back to marketplace</a>`,
    });
    return;
  }

  const listing = res.data;
  incrementListingView(listing.id);

  const user = getCurrentUser();
  const isOwner = user && user.id === listing.seller_id;
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
              <button type="button" class="thumb-btn ${idx === 0 ? "is-active" : ""}" data-thumb="${idx}" aria-label="Preview image ${idx + 1}">
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
            <span class="pill">${escapeHtml(listing.category_id)}</span>
            <span class="pill">${escapeHtml(listing.location || "")}</span>
            <span class="pill">${escapeHtml(String(listing.quantity_available))} available</span>
            <span class="pill" style="color: #666;">${listing.status === "active" ? "Available" : listing.status === "sold" ? "Sold" : "Archived"}</span>
          </div>

          <div class="rating-grid" style="margin-top:0.8rem;">
            <div class="rating-item"><span class="muted">Delivery</span><strong>${escapeHtml(ratingText(delivery))}</strong></div>
            <div class="rating-item"><span class="muted">Food quality</span><strong>${escapeHtml(ratingText(quality))}</strong></div>
            <div class="rating-item"><span class="muted">Overall</span><strong>${escapeHtml(ratingText(overall))}</strong></div>
          </div>

          <div class="desc-wrap">
            <p class="product-desc is-collapsed" data-desc>${escapeHtml(listing.description || "")}</p>
            <button class="btn btn-ghost" type="button" data-desc-toggle>Read more</button>
          </div>

          ${
            canManage
              ? `
            <div style="display: flex; gap: 0.6rem; flex-wrap: wrap; margin-top: 1rem;">
              <a class="btn btn-ghost" href="/pages/edit-listing.html?id=${id}">Edit</a>
              <button class="btn btn-ghost" type="button" data-delete style="color: #d32f2f;">Delete</button>
            </div>
          `
              : ""
          }
        </div>
      </section>

      <aside class="stack">
        <section class="card pad seller-box">
          <div class="pill">Seller</div>
          <div style="font-weight:850; letter-spacing:-0.01em;">${escapeHtml(listing.seller_name || "Unknown Seller")}</div>
          <div class="muted" style="font-size:var(--text-sm);">${escapeHtml(listing.seller_location || listing.location || "")}</div>
          <div style="display:flex; gap:0.6rem; flex-wrap:wrap; margin-top:0.35rem;">
            ${
              !user
                ? `<div class="muted" style="font-size:var(--text-sm); margin-top:0.25rem;">Login to send inquiries and view seller profile.</div>`
                : ""
            }
          </div>
        </section>

        ${
          user && !isOwner
            ? `
        <section class="card pad">
          <h2 style="margin:0 0 0.6rem; letter-spacing:-0.01em;">Send inquiry</h2>
          <form id="inquiry-form" class="stack" novalidate>
            <label class="stack" style="gap:0.35rem;">
              <span style="font-weight:800;">Name</span>
              <input class="input" name="name" value="${escapeHtml(user.name || "")}" required />
              <span class="error-text" data-err="name"></span>
            </label>
            <label class="stack" style="gap:0.35rem;">
              <span style="font-weight:800;">Email</span>
              <input class="input" name="email" type="email" value="${escapeHtml(user.email || "")}" required />
              <span class="error-text" data-err="email"></span>
            </label>
            <label class="stack" style="gap:0.35rem;">
              <span style="font-weight:800;">Phone (optional)</span>
              <input class="input" name="phone" />
              <span class="error-text" data-err="phone"></span>
            </label>
            <label class="stack" style="gap:0.35rem;">
              <span style="font-weight:800;">Message</span>
              <textarea class="input" name="body" rows="5" required placeholder="What quantity do you need? Pickup or delivery?"></textarea>
              <span class="error-text" data-err="body"></span>
            </label>
            <p class="error-text" data-err="form" style="margin:0;"></p>
            <button class="btn btn-primary" type="submit" data-submit>Send inquiry</button>
          </form>
        </section>
      `
            : ""
        }
      </aside>
    </div>
  `;

  // Image gallery
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

  // Description expand/collapse
  const desc = qs(root, "[data-desc]");
  const descToggle = qs(root, "[data-desc-toggle]");
  if (String(listing.description ?? "").length <= 180) {
    desc.classList.remove("is-collapsed");
    descToggle.style.display = "none";
  }
  descToggle.addEventListener("click", () => {
    const expanded = !desc.classList.contains("is-collapsed");
    if (expanded) {
      desc.classList.add("is-collapsed");
      descToggle.textContent = "Read more";
    } else {
      desc.classList.remove("is-collapsed");
      descToggle.textContent = "Show less";
    }
  });

  // Delete button
  const deleteBtn = root.querySelector("[data-delete]");
  if (deleteBtn && canManage) {
    deleteBtn.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to delete this listing? This action cannot be undone.")) {
        return;
      }

      deleteBtn.disabled = true;
      deleteBtn.textContent = "Deleting...";

      const res = await archiveListingAsOwnerOrAdmin(id, user.id, user.role);
      if (!res.ok) {
        deleteBtn.disabled = false;
        deleteBtn.textContent = "Delete";
        toast("error", res.error || "Failed to delete listing");
        return;
      }

      toast("success", "Listing deleted successfully");
      setTimeout(() => {
        window.location.href = "/pages/marketplace.html";
      }, 1000);
    });
  }

  // Inquiry form
  const form = root.querySelector("#inquiry-form");
  if (form) {
    const submitBtn = qs(form, "[data-submit]");
    const err = (k) => qs(form, `[data-err='${k}']`);

    function clearErrors() {
      for (const k of ["name", "email", "phone", "body", "form"]) setText(err(k), "");
    }

    function setLoading(isLoading) {
      submitBtn.disabled = isLoading;
      submitBtn.textContent = isLoading ? "Sending..." : "Send inquiry";
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      clearErrors();
      setLoading(true);

      const fd = new FormData(form);
      const r = createInquiry(user.id, listing.id, {
        name: fd.get("name"),
        email: fd.get("email"),
        phone: fd.get("phone"),
        body: fd.get("body"),
      });

      if (!r.ok) {
        setLoading(false);
        const fe = r.error.fieldErrors ?? {};
        for (const [k, msg] of Object.entries(fe)) {
          const el = form.querySelector(`[data-err='${k}']`);
          if (el) el.textContent = msg;
        }
        setText(err("form"), r.error.message ?? "Failed to send inquiry.");
        return;
      }

      setLoading(false);
      toast("success", "Inquiry sent successfully!");
      form.reset();
      form.elements.namedItem("name").value = user.name ?? "";
      form.elements.namedItem("email").value = user.email ?? "";
    });
  }
}

initAuthSession();
initPage();
