import { boot } from "../app/boot.js";
import { guardRole } from "../app/router-guards.js";
import { loadDb } from "../data/db.js";
import { CATEGORIES } from "../data/seed.js";
import { qs, setText, toast, renderStateBlock } from "../app/ui.js";
import {
  mountDashboardShell, renderWelcomeBanner, renderStatGrid, renderComingSoon,
  ICONS, svg,
} from "../components/dashboard-shell.js";
import { renderListingCard } from "../components/listing-card.js";
import {
  listSellerListings, createListing, updateListing,
  archiveListingAsOwnerOrAdmin, deleteListingById,
} from "../services/listings.service.js";
import { listInquiriesForSeller, markMessageRead, archiveMessage } from "../services/messages.service.js";
import { ORDER_STATUS } from "../app/config.js";
import { getOrdersForSeller, updateOrderStatus } from "../services/orders.service.js";
import { on } from "../app/events.js";

boot();

const user = guardRole(["farmer", "admin"]);
if (!user) throw new Error("Auth redirect");

// ─── Nav config ────────────────────────────────────────────────────
const NAV = [
  { id: "overview",  label: "Overview",         icon: ICONS.grid    },
  { id: "products",  label: "My Products",       icon: ICONS.tag     },
  { id: "orders",    label: "Orders Received",   icon: ICONS.inbox   },
  { id: "analytics", label: "Sales Analytics",   icon: ICONS.chart   },
];

const { sections } = mountDashboardShell({
  mountEl : document.getElementById("dash-mount"),
  user,
  navLinks: NAV,
});

// ════════════════════════════════════════════════════════════════════
//  OVERVIEW
// ════════════════════════════════════════════════════════════════════
(function renderOverview() {
  const db        = loadDb();
  const myActive  = db.listings.filter((l) => l.sellerId === user.id && l.status === "active");
  const allMine   = db.listings.filter((l) => l.sellerId === user.id);
  const newMsgs   = (db.messages ?? []).filter((m) => m.sellerId === user.id && m.status === "new");
  const totalViews = myActive.reduce((s, l) => s + (l.views ?? 0), 0);

  const stats = [
    { icon: ICONS.tag,      value: myActive.length,  label: "Active listings",  badge: allMine.length > myActive.length ? `${allMine.length} total` : null, badgeType: "neutral" },
    { icon: ICONS.trending, value: totalViews,        label: "Total views",      badge: totalViews > 0 ? "All time" : null, badgeType: "neutral" },
    { icon: ICONS.inbox,    value: newMsgs.length,    label: "New inquiries",    badge: newMsgs.length > 0 ? "Unread" : null, badgeType: "success" },
    { icon: ICONS.chart,    value: "$0",              label: "Revenue tracked",  badge: "Coming soon", badgeType: "neutral" },
  ];

  sections.overview.innerHTML =
    renderWelcomeBanner({
      name    : user.name,
      subtitle: "Here's what's happening with your farm today.",
      actions : `
        <a class="btn btn-primary" href="/pages/add-listing.html">${svg(ICONS.tag, 15)} Add listing</a>
        <a class="btn btn-ghost"   href="/pages/marketplace.html">${svg(ICONS.store, 15)} Browse market</a>
      `,
    }) +
    `<h3 class="dash-section-title">At a glance</h3>` +
    renderStatGrid(stats) +
    `<h3 class="dash-section-title">Recent listings</h3>` +
    buildRecentListings(myActive.slice(0, 3));
})();

function buildRecentListings(items) {
  if (!items.length) {
    return renderStateBlock({
      title      : "No active listings yet",
      description: "Create your first listing and start selling.",
      actionsHtml: `<a class="btn btn-primary" href="/pages/add-listing.html">Add listing</a>`,
    });
  }
  return `<div class="stack">` +
    items.map((l) => `
      <div class="card" style="padding:0.85rem; display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
        <div>
          <div style="font-weight:760; letter-spacing:-0.01em;">${l.title}</div>
          <div class="muted" style="font-size:var(--text-sm); margin-top:0.2rem;">
            $${Number(l.price).toFixed(2)} / ${l.unit} &nbsp;·&nbsp; ${l.location}
          </div>
        </div>
        <div style="display:flex; gap:0.5rem; flex-shrink:0;">
          <a class="btn btn-ghost" href="/pages/product.html?id=${encodeURIComponent(l.id)}">View</a>
        </div>
      </div>
    `).join("") +
  `</div>`;
}

// ════════════════════════════════════════════════════════════════════
//  MY PRODUCTS — card grid + slide-over form + live preview
// ════════════════════════════════════════════════════════════════════
(function renderProducts() {
  const root            = sections.products;
  const db              = loadDb();
  const accountLocation = String(db.users?.find((u) => u.id === user.id)?.location ?? user.location ?? "").trim();

  // ── Inline SVGs used by this section ──────────────────────────────
  const UPLOAD_SVG = svg(
    `<path stroke-linecap="round" stroke-linejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>`,
    22,
  );
  const PIN_SVG = `<svg width="11" height="13" viewBox="0 0 24 28" fill="currentColor" aria-hidden="true"><path d="M12 0C7.58 0 4 3.58 4 8c0 6 8 16 8 16s8-10 8-16c0-4.42-3.58-8-8-8zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/></svg>`;

  // ── Category <option> markup ───────────────────────────────────────
  const catOptions = CATEGORIES.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");

  // ── Section skeleton ───────────────────────────────────────────────
  root.innerHTML = `
    <div class="products-section-head">
      <h3 class="dash-section-title" style="margin:0;">My Products</h3>
      <button class="btn btn-primary" id="add-product-btn" type="button">
        ${svg(ICONS.tag, 15)} Add product
      </button>
    </div>

    <div class="products-grid" id="products-grid"></div>

    <h3 class="dash-section-title" style="margin-top:2.25rem;">Inquiries</h3>
    <div id="inquiries-block"></div>

    <!-- ── Slide-over backdrop ────────────────────────────────────── -->
    <div class="slide-over-backdrop" id="so-backdrop"></div>

    <!-- ── Slide-over panel ───────────────────────────────────────── -->
    <div class="slide-over" id="slide-over" role="dialog" aria-modal="true" aria-labelledby="slide-over-title">

      <div class="slide-over-header">
        <h2 class="slide-over-title" id="slide-over-title">Add product</h2>
        <button class="slide-over-close" id="so-close-btn" aria-label="Close">
          ${svg(ICONS.x, 16)}
        </button>
      </div>

      <div class="slide-over-body">

        <!-- Form column -->
        <div class="slide-form-col">
          <form id="product-form" novalidate>
            <input type="hidden" name="listingId" />

            <div class="form-field">
              <label class="form-label" for="pf-title">Product name</label>
              <input class="input" id="pf-title" name="title" placeholder="e.g. Roma Tomatoes" required />
              <span class="error-text" data-err="title"></span>
            </div>

            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label" for="pf-cat">Category</label>
                <select class="select" id="pf-cat" name="categoryId" required>
                  <option value="">Select…</option>
                  ${catOptions}
                </select>
                <span class="error-text" data-err="categoryId"></span>
              </div>
              <div class="form-field">
                <label class="form-label" for="pf-loc">Location</label>
                <input class="input" id="pf-loc" name="location" placeholder="e.g. Kakheti" />
                <span class="error-text" data-err="location"></span>
              </div>
            </div>

            <div class="form-row-2">
              <div class="form-field">
                <label class="form-label" for="pf-price">Price per unit</label>
                <input class="input" id="pf-price" name="price" inputmode="decimal" placeholder="2.50" required />
                <span class="error-text" data-err="price"></span>
              </div>
              <div class="form-field">
                <label class="form-label" for="pf-unit">Unit</label>
                <select class="select" id="pf-unit" name="unit">
                  <option value="kg">kg</option>
                  <option value="liter">liter</option>
                  <option value="piece">piece</option>
                  <option value="box">box</option>
                  <option value="bunch">bunch</option>
                  <option value="other">other</option>
                </select>
              </div>
            </div>

            <div class="form-field">
              <label class="form-label" for="pf-qty">Stock amount</label>
              <input class="input" id="pf-qty" name="quantityAvailable" inputmode="decimal" placeholder="e.g. 100" required />
              <span class="error-text" data-err="quantityAvailable"></span>
            </div>

            <div class="form-field">
              <label class="form-label" for="pf-desc">Description</label>
              <textarea class="textarea" id="pf-desc" name="description" rows="3" placeholder="Describe your product, quality, and availability…" required></textarea>
              <span class="error-text" data-err="description"></span>
            </div>

            <div class="form-field">
              <span class="form-label">Product photo</span>
              <div class="img-upload-zone" id="upload-zone">
                <input type="file" id="pf-img-file" name="imageFile" accept="image/*" tabindex="-1" />
                <div class="img-upload-icon" id="upload-icon">${UPLOAD_SVG}</div>
                <span class="img-upload-text" id="upload-text">Click or drag &amp; drop</span>
                <span class="img-upload-sub" id="upload-sub">PNG, JPG, WEBP · max 5 MB</span>
                <img class="img-upload-preview-img" id="upload-preview" src="" alt="" style="display:none;" />
                <div class="img-upload-preview-label" id="upload-change-label" style="display:none;">Change photo</div>
              </div>
            </div>

            <p class="error-text" data-err="form" style="margin:0;"></p>
          </form>
        </div>

        <!-- Preview column -->
        <div class="slide-preview-col">
          <p class="slide-preview-label">Live Preview</p>
          <div id="preview-card-wrap"></div>
          <p style="font-size:0.74rem; color:var(--color-subtle); margin:0; line-height:1.55;">
            Updates as you type — this is how buyers will see your listing in the marketplace.
          </p>
        </div>

      </div>

      <div class="slide-over-footer">
        <button class="btn btn-ghost" id="so-cancel-btn" type="button">Cancel</button>
        <button class="btn btn-primary" id="so-submit-btn" type="button">
          ${svg(ICONS.tag, 15)} Create product
        </button>
      </div>
    </div>
  `;

  // ── DOM refs ───────────────────────────────────────────────────────
  const grid           = root.querySelector("#products-grid");
  const inquiriesBlock = root.querySelector("#inquiries-block");
  const backdrop       = root.querySelector("#so-backdrop");
  const slideOver      = root.querySelector("#slide-over");
  const slideTitle     = root.querySelector("#slide-over-title");
  const closeBtn       = root.querySelector("#so-close-btn");
  const cancelBtn      = root.querySelector("#so-cancel-btn");
  const submitBtn      = root.querySelector("#so-submit-btn");
  const form           = root.querySelector("#product-form");
  const previewWrap    = root.querySelector("#preview-card-wrap");
  const uploadZone     = root.querySelector("#upload-zone");
  const uploadFile     = root.querySelector("#pf-img-file");
  const uploadPreview  = root.querySelector("#upload-preview");
  const uploadIcon     = root.querySelector("#upload-icon");
  const uploadText     = root.querySelector("#upload-text");
  const uploadSub      = root.querySelector("#upload-sub");
  const uploadChange   = root.querySelector("#upload-change-label");

  // ── Local state ────────────────────────────────────────────────────
  let editingId       = null;
  let previewImageUrl = null;

  // ── Error helpers ──────────────────────────────────────────────────
  const err = (k) => form.querySelector(`[data-err="${k}"]`);
  function clearErrors() {
    ["title","description","categoryId","location","price","quantityAvailable","form"]
      .forEach((k) => { const el = err(k); if (el) el.textContent = ""; });
  }

  // ── Panel open / close ─────────────────────────────────────────────
  function openPanel(listing = null) {
    editingId       = listing?.id ?? null;
    previewImageUrl = null;
    clearErrors();
    populateForm(listing);
    resetUploadZone();
    if (listing?.images?.[0] && listing.images[0] !== "/img/logo.png") {
      previewImageUrl = listing.images[0];
      showImagePreview(listing.images[0]);
    }
    slideTitle.textContent = listing ? "Edit product" : "Add product";
    submitBtn.innerHTML    = listing
      ? `${svg(ICONS.tag, 15)} Save changes`
      : `${svg(ICONS.tag, 15)} Create product`;
    updatePreview();
    slideOver.classList.add("open");
    backdrop.classList.add("open");
    document.body.style.overflow = "hidden";
    window.setTimeout(() => root.querySelector("#pf-title")?.focus(), 60);
  }

  function closePanel() {
    slideOver.classList.remove("open");
    backdrop.classList.remove("open");
    document.body.style.overflow = "";
    editingId       = null;
    previewImageUrl = null;
  }

  // ── Form population ────────────────────────────────────────────────
  function populateForm(listing) {
    const set = (n, v) => { const el = form.elements.namedItem(n); if (el) el.value = v ?? ""; };
    set("listingId", ""); set("title", ""); set("description", "");
    set("categoryId", ""); set("location", accountLocation);
    set("price", ""); set("unit", "kg"); set("quantityAvailable", "");
    if (!listing) return;
    set("listingId",         listing.id);
    set("title",             listing.title);
    set("description",       listing.description);
    set("categoryId",        listing.categoryId);
    set("location",          listing.location);
    set("price",             listing.price);
    set("unit",              listing.unit);
    set("quantityAvailable", listing.quantityAvailable);
  }

  // ── Image upload zone ──────────────────────────────────────────────
  function resetUploadZone() {
    uploadPreview.style.display     = "none";
    uploadPreview.src               = "";
    uploadChange.style.display      = "none";
    uploadIcon.style.display        = "";
    uploadText.style.display        = "";
    uploadSub.style.display         = "";
    if (uploadFile) uploadFile.value = "";
  }

  function showImagePreview(url) {
    uploadPreview.src           = url;
    uploadPreview.style.display = "block";
    uploadChange.style.display  = "flex";
    uploadIcon.style.display    = "none";
    uploadText.style.display    = "none";
    uploadSub.style.display     = "none";
  }

  uploadFile?.addEventListener("change", () => {
    const file = uploadFile.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      previewImageUrl = String(reader.result ?? "");
      showImagePreview(previewImageUrl);
      updatePreview();
    };
    reader.readAsDataURL(file);
  });

  uploadZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadZone.classList.add("drag-over");
  });
  uploadZone.addEventListener("dragleave", () => uploadZone.classList.remove("drag-over"));
  uploadZone.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadZone.classList.remove("drag-over");
    const file = e.dataTransfer?.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      previewImageUrl = String(reader.result ?? "");
      showImagePreview(previewImageUrl);
      updatePreview();
    };
    reader.readAsDataURL(file);
  });

  // ── Live preview ───────────────────────────────────────────────────
  function buildPreviewCard({ title, categoryId, price, unit, location, qty, imageUrl }) {
    const cat      = CATEGORIES.find((c) => c.id === categoryId);
    const catName  = cat?.name ?? "Category";
    const priceNum = parseFloat(price);
    const priceStr = Number.isFinite(priceNum) ? `$${priceNum.toFixed(2).replace(/\.00$/, "")}` : "$—";
    const img      = imageUrl || "/img/logo.png";
    const qtyN     = Number(qty) || 0;
    return `
      <article class="listing-card glass-card" style="pointer-events:none; user-select:none;">
        <div style="position:relative; height:216px; overflow:hidden; background:rgba(20,106,75,0.06);">
          <img src="${img}" alt="Preview" style="width:100%;height:100%;object-fit:cover;" />
          <div class="listing-media-overlay">
            <span class="listing-badge-cat">${catName}</span>
          </div>
        </div>
        <div class="listing-body">
          <div class="listing-header">
            <h3 class="listing-title">
              <span style="color:var(--color-text);">${title || `<span style="color:var(--color-subtle);">Product name…</span>`}</span>
            </h3>
            <div class="listing-meta-row">
              <span class="listing-location">
                ${PIN_SVG}
                ${location || `<span style="color:var(--color-subtle);">Location…</span>`}
              </span>
              ${qtyN > 0 ? `<span class="listing-avail">${qtyN} avail.</span>` : ""}
            </div>
          </div>
          <div class="listing-footer-row">
            <div class="listing-price-group">
              <span class="listing-price-main">${priceStr}</span>
              <span class="listing-price-unit">/ ${unit || "unit"}</span>
            </div>
            <div class="listing-rating"><span class="rating-no-data">No ratings yet</span></div>
          </div>
        </div>
      </article>
    `;
  }

  function updatePreview() {
    const fd = new FormData(form);
    previewWrap.innerHTML = buildPreviewCard({
      title:      String(fd.get("title") ?? ""),
      categoryId: String(fd.get("categoryId") ?? ""),
      price:      String(fd.get("price") ?? ""),
      unit:       String(fd.get("unit") ?? "kg"),
      location:   String(fd.get("location") ?? ""),
      qty:        Number(fd.get("quantityAvailable") ?? 0),
      imageUrl:   previewImageUrl ?? "",
    });
  }

  form.addEventListener("input",  updatePreview);
  form.addEventListener("change", updatePreview);

  // ── Product grid ───────────────────────────────────────────────────
  function renderGrid() {
    grid.innerHTML = `
      <div class="products-grid" style="display:contents;">
        ${[1,2,3].map(() => `<div class="skeleton" style="height:320px;border-radius:24px;"></div>`).join("")}
      </div>`;

    window.setTimeout(() => {
      const res = listSellerListings(user.id, { includeArchived: true });
      if (!res.ok) {
        grid.innerHTML = renderStateBlock({ title: "Couldn't load", description: res.error.message });
        return;
      }
      const items = res.data;
      if (!items.length) {
        grid.innerHTML = `
          <div class="products-empty">
            <div class="products-empty-icon">${svg(ICONS.tag, 28)}</div>
            <h3 class="products-empty-title">No products yet</h3>
            <p class="products-empty-sub">Add your first product and start selling on the FARMIX marketplace.</p>
            <button class="btn btn-primary" id="empty-add-btn" style="margin-top:0.75rem;">
              ${svg(ICONS.tag, 15)} Add your first product
            </button>
          </div>`;
        grid.querySelector("#empty-add-btn")?.addEventListener("click", () => openPanel(null));
        return;
      }
      grid.innerHTML = items.map((l) => {
        const nonActive = l.status !== "active"
          ? `<span class="product-status-badge ${l.status}">${l.status}</span>` : "";
        return `
          <div class="product-card-wrap">
            ${renderListingCard(l)}
            ${nonActive}
            <div class="product-card-actions">
              <button class="btn-card-action edit" data-edit="${l.id}" ${l.status === "archived" ? "disabled" : ""}>
                ${svg(ICONS.settings, 12)} Edit
              </button>
              <button class="btn-card-action delete" data-delete="${l.id}">Delete</button>
            </div>
          </div>`;
      }).join("");

      grid.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const item = items.find((x) => x.id === btn.dataset.edit);
          if (item) openPanel(item);
        });
      });
      grid.querySelectorAll("[data-delete]").forEach((btn) => {
        btn.addEventListener("click", () => {
          if (!confirm("Permanently delete this listing?")) return;
          const r = deleteListingById(btn.dataset.delete);
          if (!r.ok) toast("error", r.error.message);
          else { toast("success", "Listing deleted."); renderGrid(); }
        });
      });
    }, 180);
  }

  // ── Form submit ────────────────────────────────────────────────────
  submitBtn.addEventListener("click", () => {
    clearErrors();
    const isEdit         = Boolean(editingId);
    submitBtn.disabled   = true;
    submitBtn.innerHTML  = `${svg(ICONS.tag, 15)} Saving…`;

    const fd        = new FormData(form);
    const listingId = String(fd.get("listingId") ?? "").trim();
    const images    = previewImageUrl ? [previewImageUrl] : [];

    const payload = {
      title:             fd.get("title"),
      description:       fd.get("description"),
      categoryId:        fd.get("categoryId"),
      location:          String(fd.get("location") ?? "").trim() || accountLocation,
      price:             fd.get("price"),
      unit:              fd.get("unit"),
      quantityAvailable: fd.get("quantityAvailable"),
      images,
    };

    const res = listingId ? updateListing(listingId, payload) : createListing(user.id, payload);

    submitBtn.disabled  = false;
    submitBtn.innerHTML = isEdit
      ? `${svg(ICONS.tag, 15)} Save changes`
      : `${svg(ICONS.tag, 15)} Create product`;

    if (!res.ok) {
      const fe = res.error.fieldErrors ?? {};
      for (const [k, msg] of Object.entries(fe)) {
        const el = err(k); if (el) el.textContent = msg;
      }
      setText(err("form"), res.error.message ?? "Failed.");
      return;
    }
    toast("success", listingId ? "Product updated!" : "Product created!");
    closePanel();
    renderGrid();
  });

  // ── Panel event bindings ───────────────────────────────────────────
  root.querySelector("#add-product-btn").addEventListener("click", () => openPanel(null));
  closeBtn.addEventListener("click",   closePanel);
  cancelBtn.addEventListener("click",  closePanel);
  backdrop.addEventListener("click",   closePanel);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && slideOver.classList.contains("open")) closePanel();
  });

  // ── Inquiries ──────────────────────────────────────────────────────
  function renderInquiries() {
    inquiriesBlock.innerHTML = `<div class="stack">${[1,2].map(() =>
      `<div class="skeleton" style="height:72px;border-radius:14px;"></div>`).join("")}</div>`;
    window.setTimeout(() => {
      const res = listInquiriesForSeller(user.id, { includeArchived: false });
      if (!res.ok) { inquiriesBlock.innerHTML = renderStateBlock({ title: "Couldn't load", description: res.error.message }); return; }
      const items = res.data;
      if (!items.length) {
        inquiriesBlock.innerHTML = renderStateBlock({ title: "No inquiries yet", description: "Buyers will appear here when they contact you about your listings." });
        return;
      }
      inquiriesBlock.innerHTML = `<div class="stack">${items.map((m) => {
        const isNew = m.status === "new";
        return `<div class="card" style="padding:0.75rem 1rem; display:grid; gap:0.45rem;">
          <div style="display:flex; justify-content:space-between; gap:0.75rem; flex-wrap:wrap; align-items:flex-start;">
            <div>
              <div style="font-weight:760; display:flex; align-items:center; gap:0.45rem;">
                ${m.name}${isNew ? `<span class="pill" style="font-size:0.68rem;">new</span>` : ""}
              </div>
              <div class="muted" style="font-size:var(--text-sm);">${m.email}${m.phone ? " · " + m.phone : ""}</div>
            </div>
            <div style="display:flex; gap:0.45rem; flex-wrap:wrap;">
              <a class="btn btn-ghost" href="/pages/product.html?id=${encodeURIComponent(m.listingId)}">Listing</a>
              <button class="btn btn-ghost" data-read="${m.id}" ${isNew ? "" : "disabled"}>Mark read</button>
              <button class="btn btn-ghost" data-arch="${m.id}">Archive</button>
            </div>
          </div>
          <div class="muted" style="font-size:var(--text-sm); white-space:pre-wrap;">${m.body}</div>
        </div>`;
      }).join("")}</div>`;
      inquiriesBlock.querySelectorAll("[data-read]").forEach((btn) => {
        btn.addEventListener("click", () => { const r = markMessageRead(btn.dataset.read); if (!r.ok) toast("error", r.error.message); else toast("success", "Marked read."); renderInquiries(); });
      });
      inquiriesBlock.querySelectorAll("[data-arch]").forEach((btn) => {
        btn.addEventListener("click", () => { const r = archiveMessage(btn.dataset.arch); if (!r.ok) toast("error", r.error.message); else toast("success", "Archived."); renderInquiries(); });
      });
    }, 200);
  }

  renderGrid();
  renderInquiries();
})();

// ════════════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════════════
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

// ════════════════════════════════════════════════════════════════════
//  ORDERS — incoming orders with inline status update
// ════════════════════════════════════════════════════════════════════
(function renderFarmerOrders() {
  const root = sections.orders;

  // Track previously-seen order count so we can show a toast on new arrivals
  let _prevOrderCount = -1;

  function refresh() {
    const res    = getOrdersForSeller(user.id);
    const orders = res.ok ? res.data : [];

    // Toast when a new order arrives while the farmer has the dashboard open
    if (_prevOrderCount >= 0 && orders.length > _prevOrderCount) {
      const diff = orders.length - _prevOrderCount;
      toast("success", `${diff} new order${diff > 1 ? "s" : ""} received!`);
    }
    _prevOrderCount = orders.length;

    if (!orders.length) {
      root.innerHTML =
        `<h3 class="dash-section-title">Orders Received</h3>` +
        renderStateBlock({
          title      : "No orders yet",
          description: "When buyers place orders for your products, they will appear here.",
        });
      return;
    }

    const rows = orders.map((o) => {
      const total   = `$${Number(o.totalPrice).toFixed(2)}`;
      const date    = new Date(o.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      const done    = o.status === ORDER_STATUS.delivered || o.status === ORDER_STATUS.cancelled;

      // Status-to-label mapping for display
      const statusLabel = {
        [ORDER_STATUS.pending]:    "Pending",
        [ORDER_STATUS.processing]: "Processing",
        [ORDER_STATUS.shipped]:    "Shipped",
        [ORDER_STATUS.delivered]:  "Delivered",
        [ORDER_STATUS.cancelled]:  "Cancelled",
      };

      const options = Object.values(ORDER_STATUS).map((s) =>
        `<option value="${s}" ${o.status === s ? "selected" : ""}>${statusLabel[s] ?? s}</option>`
      ).join("");

      return `
        <tr>
          <td><span style="font-family:monospace;font-size:0.76rem;color:var(--color-muted);">#${esc(o.id.slice(-6))}</span></td>
          <td style="font-weight:680;">${esc(o.title)}</td>
          <td>${esc(o.buyerName ?? "—")}</td>
          <td>${esc(String(o.quantity))} ${esc(o.unit)}</td>
          <td style="font-weight:760;">${total}</td>
          <td><span class="order-badge order-badge-${esc(o.status)}">${esc(statusLabel[o.status] ?? o.status)}</span></td>
          <td>
            <select class="order-status-select" data-order-id="${esc(o.id)}" ${done ? "disabled" : ""}>
              ${options}
            </select>
          </td>
          <td style="color:var(--color-muted);font-size:0.8rem;">${date}</td>
        </tr>
      `;
    }).join("");

    root.innerHTML = `
      <h3 class="dash-section-title">Orders Received</h3>
      <div class="orders-table-wrap">
        <table class="orders-table">
          <thead>
            <tr>
              <th>Order ID</th><th>Product</th><th>Buyer</th>
              <th>Qty</th><th>Total</th><th>Status</th>
              <th>Update Status</th><th>Date</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    root.querySelectorAll(".order-status-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const r = updateOrderStatus(sel.getAttribute("data-order-id"), sel.value);
        if (!r.ok) { toast("error", r.error.message); refresh(); return; }
        toast("success", `Order marked as ${sel.value}.`);
        refresh();
      });
    });
  }

  refresh();

  // Live-refresh whenever any order is placed or updated in the same session
  on("orders:changed", () => refresh());
})();

// ════════════════════════════════════════════════════════════════════
//  ANALYTICS — Sales Growth (line) + Category Distribution (doughnut)
// ════════════════════════════════════════════════════════════════════
(function renderFarmerAnalytics() {
  const root = sections.analytics;

  const res     = getOrdersForSeller(user.id);
  const orders  = res.ok ? res.data : [];
  const db      = loadDb();
  const listMap = Object.fromEntries(db.listings.map((l) => [l.id, l]));

  const DAY  = 86400000;
  const now  = Date.now();
  const days = 7;
  const labels      = [];
  const revenueData = new Array(days).fill(0);

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * DAY);
    labels.push(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
  }
  orders.forEach((o) => {
    const daysAgo = Math.floor((now - o.createdAt) / DAY);
    if (daysAgo >= 0 && daysAgo < days) revenueData[days - 1 - daysAgo] += Number(o.totalPrice ?? 0);
  });

  const catRevenue = {};
  orders.forEach((o) => {
    const listing = listMap[o.listingId];
    const catId   = listing?.categoryId ?? "other";
    const cat     = CATEGORIES.find((c) => c.id === catId);
    const name    = cat?.name ?? catId;
    catRevenue[name] = (catRevenue[name] ?? 0) + Number(o.totalPrice ?? 0);
  });
  const catLabels = Object.keys(catRevenue);
  const catData   = Object.values(catRevenue).map((v) => Math.round(v * 100) / 100);

  root.innerHTML = `
    <h3 class="dash-section-title">Sales Analytics</h3>
    <div class="chart-row">
      <div class="chart-widget">
        <p class="chart-widget-title">Sales Growth</p>
        <span class="chart-widget-sub">Revenue ($) — last 7 days</span>
        <div class="chart-widget-body">
          <canvas id="farmer-chart-revenue"></canvas>
        </div>
      </div>
      <div class="chart-widget">
        <p class="chart-widget-title">Category Distribution</p>
        <span class="chart-widget-sub">Revenue share by product category</span>
        <div class="chart-widget-body">
          <canvas id="farmer-chart-cat"></canvas>
        </div>
      </div>
    </div>
  `;

  const commonTooltip = {
    backgroundColor: "rgba(26,31,54,0.92)",
    titleColor     : "#73d700",
    bodyColor      : "#e8eaf0",
    borderColor    : "rgba(115,215,0,0.28)",
    borderWidth    : 1,
  };

  const salesCtx = document.getElementById("farmer-chart-revenue")?.getContext("2d");
  if (salesCtx && window.Chart) {
    new window.Chart(salesCtx, {
      type: "line",
      data: {
        labels,
        datasets: [{
          data               : revenueData.map((v) => Math.round(v * 100) / 100),
          borderColor        : "#73d700",
          backgroundColor    : "rgba(115,215,0,0.10)",
          borderWidth        : 2,
          tension            : 0.4,
          fill               : true,
          pointBackgroundColor: "#73d700",
          pointRadius        : 4,
          pointHoverRadius   : 6,
        }],
      },
      options: {
        responsive         : true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: commonTooltip },
        scales: {
          x: { grid: { color: "rgba(26,31,54,0.06)" }, ticks: { color: "rgba(26,31,54,0.50)", font: { size: 11 } } },
          y: { grid: { color: "rgba(26,31,54,0.06)" }, ticks: { color: "rgba(26,31,54,0.50)", font: { size: 11 } }, beginAtZero: true },
        },
      },
    });
  }

  const catCtx = document.getElementById("farmer-chart-cat")?.getContext("2d");
  if (catCtx && window.Chart) {
    if (!catLabels.length) {
      catCtx.canvas.insertAdjacentHTML(
        "afterend",
        `<p style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--color-muted);font-size:0.84rem;margin:0;">No sales data yet</p>`
      );
    } else {
      new window.Chart(catCtx, {
        type: "doughnut",
        data: {
          labels: catLabels,
          datasets: [{
            data           : catData,
            backgroundColor: ["rgba(115,215,0,0.80)","rgba(26,31,54,0.55)","rgba(6,118,71,0.65)","rgba(99,102,241,0.60)","rgba(251,191,36,0.70)","rgba(248,113,113,0.65)"],
            borderColor    : "rgba(255,255,255,0.85)",
            borderWidth    : 2,
          }],
        },
        options: {
          responsive         : true,
          maintainAspectRatio: false,
          plugins: {
            legend : { position: "bottom", labels: { color: "rgba(26,31,54,0.70)", font: { size: 11 }, padding: 12, boxWidth: 10 } },
            tooltip: { ...commonTooltip, callbacks: { label: (ctx) => ` $${ctx.raw.toFixed(2)}` } },
          },
        },
      });
    }
  }
})();
