import { boot } from "../app/boot.js";
import { debounce, renderSkeletonCards, renderStateBlock, toast, qs } from "../app/ui.js";
import { getCurrentUser } from "../services/auth.service.js";
import { CATEGORIES as SEED_CATEGORIES } from "../data/seed.js";
import { ROLES } from "../app/config.js";
import { validateMarketplaceFilters } from "../data/validators.js";
import { searchListings } from "../services/listings.service.js";
import { renderListingCard } from "../components/listing-card.js";
import { placeOrder } from "../services/orders.service.js";
import { openGuestGate } from "../components/guest-gate.js";

boot();

/** Seed categories always appear; optional admin overrides in localStorage are merged by id. */
function getCategories() {
  const byId = new Map(SEED_CATEGORIES.map((c) => [c.id, c]));
  const stored = localStorage.getItem("farmix_categories");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        for (const c of parsed) {
          if (c && c.id && c.name) byId.set(String(c.id), { id: String(c.id), name: String(c.name) });
        }
      }
    } catch {
      /* ignore bad JSON */
    }
  }
  return Array.from(byId.values());
}

const root = document.getElementById("marketplace-root");
if (root) {
  root.innerHTML = `
    <div class="market-layout">
      <aside class="filters">
        <section class="card pad">
          <form id="filters-form" class="filters-grid" novalidate>
            <label class="stack" style="gap:0.35rem;">
              <span style="font-weight: 800;">Search</span>
              <input class="input" name="q" placeholder="Tomatoes, honey, milk..." />
              <span class="muted" style="font-size: var(--text-sm);">Updates after a short pause.</span>
            </label>

            <div class="filters-row">
              <label class="stack" style="gap:0.35rem;">
                <span style="font-weight: 800;">Category</span>
                <select class="select" name="cat">
                  <option value="">All categories</option>
                </select>
              </label>
              <label class="stack" style="gap:0.35rem;">
                <span style="font-weight: 800;">Location</span>
                <input class="input" name="loc" placeholder="City / region" />
              </label>
            </div>

            <div class="filters-row">
              <label class="stack" style="gap:0.35rem;">
                <span style="font-weight: 800;">Min price</span>
                <input class="input" name="min" inputmode="decimal" placeholder="0" />
              </label>
              <label class="stack" style="gap:0.35rem;">
                <span style="font-weight: 800;">Max price</span>
                <input class="input" name="max" inputmode="decimal" placeholder="100" />
              </label>
            </div>

            <label class="stack" style="gap:0.35rem;">
              <span style="font-weight: 800;">Sort</span>
              <select class="select" name="sort">
                <option value="newest" selected>Newest</option>
                <option value="price_asc">Price: low to high</option>
                <option value="price_desc">Price: high to low</option>
              </select>
            </label>

            <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
              <button class="btn btn-primary" type="submit">Apply</button>
              <button class="btn btn-ghost" type="button" data-reset>Reset</button>
            </div>
          </form>
        </section>
      </aside>

      <div id="category-modal" class="modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center;">
        <div style="background:white; padding:20px; border-radius:8px; max-width:500px; width:90%;">
          <h3>Edit Categories (Admin)</h3>
          <div id="category-list" style="margin:10px 0;"></div>
          <button id="add-category" class="btn btn-primary">Add Category</button>
          <div style="margin-top:10px;">
            <button id="save-categories" class="btn btn-primary">Save</button>
            <button id="cancel-modal" class="btn btn-ghost">Cancel</button>
          </div>
        </div>
      </div>

      <section>
        <div class="market-topbar">
          <div class="market-count" data-count></div>
          <div class="market-count" data-page></div>
        </div>
        <div data-results></div>
        <div class="pager" data-pager></div>
      </section>
    </div>
  `;

  const form = qs(root, "#filters-form");
  const catSelect = qs(form, "select[name='cat']");
  const CATEGORIES = getCategories();
  for (const c of CATEGORIES) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = c.name;
    catSelect.appendChild(opt);
  }

  const user = getCurrentUser();
  if (user && user.role === 'admin') {
    const configOpt = document.createElement("option");
    configOpt.value = "config";
    configOpt.textContent = "Config Categories";
    catSelect.appendChild(configOpt);
  }

  // Modal elements
  const modal = qs(root, "#category-modal");
  const categoryList = qs(modal, "#category-list");
  const addBtn = qs(modal, "#add-category");
  const saveBtn = qs(modal, "#save-categories");
  const cancelBtn = qs(modal, "#cancel-modal");

  function showCategoryModal() {
    categoryList.innerHTML = "";
    const cats = getCategories();
    cats.forEach((cat) => {
      const div = document.createElement("div");
      div.style.display = "flex";
      div.style.alignItems = "center";
      div.style.marginBottom = "5px";
      const input = document.createElement("input");
      input.type = "text";
      input.value = cat.name;
      input.className = "input";
      input.dataset.id = cat.id;
      input.style.flex = "1";
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Remove";
      removeBtn.className = "btn btn-ghost";
      removeBtn.style.marginLeft = "10px";
      removeBtn.addEventListener("click", () => {
        div.remove();
      });
      div.appendChild(input);
      div.appendChild(removeBtn);
      categoryList.appendChild(div);
    });
    modal.style.display = "flex";
  }

  catSelect.addEventListener("change", (e) => {
    if (e.target.value === "config") {
      showCategoryModal();
      e.target.value = "";
    }
  });

  addBtn.addEventListener("click", () => {
    const name = prompt("Enter new category name:");
    if (name && name.trim()) {
      const div = document.createElement("div");
      div.style.display = "flex";
      div.style.alignItems = "center";
      div.style.marginBottom = "5px";
      const input = document.createElement("input");
      input.type = "text";
      input.value = name.trim();
      input.className = "input";
      input.style.flex = "1";
      input.dataset.id = name.trim().toLowerCase().replace(/\s+/g, '_');
      const removeBtn = document.createElement("button");
      removeBtn.textContent = "Remove";
      removeBtn.className = "btn btn-ghost";
      removeBtn.style.marginLeft = "10px";
      removeBtn.addEventListener("click", () => {
        div.remove();
      });
      div.appendChild(input);
      div.appendChild(removeBtn);
      categoryList.appendChild(div);
    }
  });

  saveBtn.addEventListener("click", () => {
    const inputs = categoryList.querySelectorAll("input");
    const newCats = Array.from(inputs).map(input => ({
      id: input.dataset.id || input.value.toLowerCase().replace(/\s+/g, '_'),
      name: input.value.trim()
    })).filter(cat => cat.name);
    localStorage.setItem('farmix_categories', JSON.stringify(newCats));
    modal.style.display = "none";
    toast("success", "Categories updated.");
    // Reload to apply changes
    location.reload();
  });

  cancelBtn.addEventListener("click", () => {
    modal.style.display = "none";
  });

  const resultsEl = qs(root, "[data-results]");
  const countEl = qs(root, "[data-count]");
  const pageEl = qs(root, "[data-page]");
  const pagerEl = qs(root, "[data-pager]");
  const resetBtn = qs(root, "[data-reset]");
  const qInput = qs(form, "input[name='q']");

  function setQueryParams(next) {
    const url = new URL(location.href);
    const params = url.searchParams;

    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === undefined || v === "" || (k === "page" && String(v) === "1")) params.delete(k);
      else params.set(k, String(v));
    }

    // Remove unknown/empty params.
    for (const k of [...params.keys()]) {
      if (!["q", "cat", "loc", "min", "max", "sort", "page"].includes(k)) params.delete(k);
      if (params.get(k) === "") params.delete(k);
    }

    history.replaceState(null, "", `${url.pathname}?${params.toString()}`);
  }

  function readFiltersFromUrl() {
    const params = new URLSearchParams(location.search);
    const v = validateMarketplaceFilters(params);
    if (!v.ok) return { ok: false, fieldErrors: v.fieldErrors };
    return { ok: true, filters: v.value };
  }

  function syncForm(filters) {
    form.elements.namedItem("q").value = filters.q ?? "";
    form.elements.namedItem("cat").value = filters.cat ?? "";
    form.elements.namedItem("loc").value = filters.loc ?? "";
    form.elements.namedItem("min").value = filters.min ?? "";
    form.elements.namedItem("max").value = filters.max ?? "";
    form.elements.namedItem("sort").value = filters.sort ?? "newest";
  }

  function renderPager({ page, pageSize, total, currentParams }) {
    pagerEl.innerHTML = "";
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const prevDisabled = page <= 1;
    const nextDisabled = page >= totalPages;

    const prev = document.createElement("a");
    prev.className = `btn btn-ghost`;
    prev.textContent = "Prev";
    prev.href = "#";
    prev.setAttribute("aria-disabled", String(prevDisabled));
    prev.addEventListener("click", (e) => {
      e.preventDefault();
      if (prevDisabled) return;
      setQueryParams({ ...currentParams, page: page - 1 });
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    const next = document.createElement("a");
    next.className = `btn btn-ghost`;
    next.textContent = "Next";
    next.href = "#";
    next.setAttribute("aria-disabled", String(nextDisabled));
    next.addEventListener("click", (e) => {
      e.preventDefault();
      if (nextDisabled) return;
      setQueryParams({ ...currentParams, page: page + 1 });
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

    const label = document.createElement("div");
    label.className = "muted";
    label.style.fontWeight = "650";
    label.textContent = `Page ${page} of ${totalPages}`;

    pagerEl.appendChild(prev);
    pagerEl.appendChild(label);
    pagerEl.appendChild(next);
  }

  // ── Order modal (injected once) ─────────────────────────────────────
  const orderModal = document.createElement("div");
  orderModal.className = "order-modal-backdrop";
  orderModal.style.display = "none";
  orderModal.innerHTML = `
    <div class="order-modal-card">
      <h3 class="order-modal-title" id="om-title">Order product</h3>
      <p class="order-modal-meta" id="om-meta"></p>
      <div class="order-modal-row">
        <div class="order-modal-field">
          <label for="om-qty">Quantity</label>
          <input class="order-qty-input" id="om-qty" type="number" min="1" value="1" />
        </div>
        <div class="order-modal-field">
          <label>Available</label>
          <div id="om-avail" style="font-size:1rem;font-weight:700;padding-top:0.4rem;color:var(--color-navy);">—</div>
        </div>
      </div>
      <div class="order-modal-total-label">Total</div>
      <div class="order-modal-total-val" id="om-total">$0.00</div>
      <div class="order-modal-actions">
        <button class="btn btn-ghost" id="om-cancel">Cancel</button>
        <button class="btn btn-primary" id="om-confirm">Confirm Order</button>
      </div>
    </div>
  `;
  document.body.appendChild(orderModal);

  let omListingId = null, omPricePerUnit = 0, omMaxQty = 0, omUnit = "";

  function updateOrderTotal() {
    const qty = Math.max(1, Math.min(omMaxQty, parseInt(document.getElementById("om-qty").value) || 1));
    const total = (qty * omPricePerUnit).toFixed(2);
    document.getElementById("om-total").textContent = `$${total}`;
  }

  function openOrderModal(listing) {
    omListingId   = listing.id;
    omPricePerUnit = listing.price;
    omMaxQty      = listing.quantityAvailable;
    omUnit        = listing.unit;
    document.getElementById("om-title").textContent = listing.title;
    document.getElementById("om-meta").textContent  = `$${Number(listing.price).toFixed(2)} / ${listing.unit}`;
    document.getElementById("om-avail").textContent = `${listing.quantityAvailable} ${listing.unit}`;
    const qtyInput = document.getElementById("om-qty");
    qtyInput.max   = listing.quantityAvailable;
    qtyInput.value = 1;
    updateOrderTotal();
    orderModal.style.display = "flex";
    setTimeout(() => qtyInput.focus(), 60);
  }

  document.getElementById("om-qty").addEventListener("input", updateOrderTotal);
  document.getElementById("om-cancel").addEventListener("click", () => { orderModal.style.display = "none"; });
  orderModal.addEventListener("click", (e) => { if (e.target === orderModal) orderModal.style.display = "none"; });

  document.getElementById("om-confirm").addEventListener("click", () => {
    const qty = parseInt(document.getElementById("om-qty").value) || 1;
    const curUser = getCurrentUser();
    if (!curUser) {
      openGuestGate();
      return;
    }

    const btn = document.getElementById("om-confirm");
    btn.disabled = true;
    btn.textContent = "Placing…";

    const result = placeOrder(curUser.id, omListingId, qty);
    btn.disabled = false;
    btn.textContent = "Confirm Order";

    if (!result.ok) {
      toast("error", result.error.message);
      return;
    }

    orderModal.style.display = "none";
    toast("success", `Order placed — ${qty} ${omUnit} of "${result.data.title}"!`);

    // Update the card in-place: refresh stock display and disable button if exhausted
    const card = resultsEl.querySelector(`[data-listing-id="${CSS.escape(omListingId)}"]`);
    if (card) {
      const newQty = omMaxQty - qty;
      card.setAttribute("data-qty", newQty);
      const availEl = card.querySelector(".listing-avail");
      if (availEl) availEl.textContent = newQty > 0 ? `${newQty} avail.` : "Out of stock";
      const orderBtn = card.querySelector(".btn-order");
      if (orderBtn && newQty <= 0) {
        orderBtn.disabled = true;
        orderBtn.textContent = "Out of stock";
      }
      if (newQty <= 0 && qty > 0) {
        toast("error", "Inventory low — this listing is now sold out!");
      }
    }
  });

  function injectOrderButtons(items) {
    const curUser = getCurrentUser();
    if (curUser?.role === ROLES.farmer || curUser?.role === ROLES.admin) return;

    items.forEach((listing) => {
      const card = resultsEl.querySelector(`[data-listing-id="${CSS.escape(listing.id)}"]`);
      if (!card) return;
      if (card.style.position !== "relative") card.style.position = "relative";

      const wrap = document.createElement("div");
      wrap.className = "listing-order-wrap";

      const qty = listing.quantityAvailable ?? 0;
      const btn = document.createElement("button");
      btn.className = "btn-order";
      btn.type = "button";
      btn.textContent = qty > 0 ? "Add to Order" : "Out of stock";
      btn.disabled = qty <= 0;
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        if (!curUser) {
          openGuestGate();
          return;
        }
        openOrderModal(listing);
      });
      wrap.appendChild(btn);
      card.appendChild(wrap);
    });
  }

  function render() {
    const parsed = readFiltersFromUrl();
    if (!parsed.ok) {
      resultsEl.innerHTML = renderStateBlock({
        title: "Invalid filters",
        description: "Some filter values in the URL are invalid. Reset filters to continue.",
        actionsHtml: `<button class="btn btn-primary" type="button" id="fix-filters">Reset filters</button>`,
      });
      const btn = resultsEl.querySelector("#fix-filters");
      if (btn) {
        btn.addEventListener("click", () => {
          history.replaceState(null, "", "/pages/marketplace.html");
          render();
        });
      }
      return;
    }

    const f = parsed.filters;
    syncForm(f);

    countEl.textContent = "Loading listings…";
    pageEl.textContent = "";
    pagerEl.innerHTML = "";
    resultsEl.innerHTML = renderSkeletonCards(9);

    // Simulated load delay to make skeleton meaningful.
    window.setTimeout(() => {
      const res = searchListings(new URLSearchParams(location.search));
      if (!res.ok) {
        resultsEl.innerHTML = renderStateBlock({
          title: "Couldn’t load listings",
          description: res.error.message ?? "Please try again.",
          actionsHtml: `<button class="btn btn-primary" type="button" id="retry">Retry</button>`,
        });
        const retry = resultsEl.querySelector("#retry");
        if (retry) retry.addEventListener("click", render);
        toast("error", "Failed to load marketplace.");
        return;
      }

      const { items, total, page, pageSize, filters } = res.data;
      countEl.textContent = `${total} result${total === 1 ? "" : "s"}`;
      pageEl.textContent = filters.q ? `Searching “${filters.q}”` : "";

      if (!items.length) {
        resultsEl.innerHTML = renderStateBlock({
          title: "No listings match your filters",
          description: "Try broadening your search, removing the price range, or clearing the category.",
          actionsHtml: `<button class="btn btn-primary" type="button" id="clear">Clear filters</button>`,
        });
        const clear = resultsEl.querySelector("#clear");
        if (clear) clear.addEventListener("click", () => (location.href = "/pages/marketplace.html"));
        return;
      }

      resultsEl.innerHTML = `<div class="grid cols-3">${items.map((l) => renderListingCard(l)).join("")}</div>`;
      injectOrderButtons(items);
      renderPager({
        page,
        pageSize,
        total,
        currentParams: {
          q: filters.q,
          cat: filters.cat,
          loc: filters.loc,
          min: filters.min,
          max: filters.max,
          sort: filters.sort,
        },
      });
    }, 260);
  }

  // Debounced function to apply all filters automatically
  const applyFiltersDebounced = debounce(() => {
    const fd = new FormData(form);
    setQueryParams({
      q: String(fd.get("q") ?? "").trim(),
      cat: String(fd.get("cat") ?? "").trim(),
      loc: String(fd.get("loc") ?? "").trim(),
      min: String(fd.get("min") ?? "").trim(),
      max: String(fd.get("max") ?? "").trim(),
      sort: String(fd.get("sort") ?? "newest").trim(),
      page: 1,  // Reset to page 1 on filter change
    });
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, 300);  // 300ms delay before applying

  // Attach debounced listeners to all filter inputs
  const filterInputs = form.querySelectorAll("input, select");
  filterInputs.forEach((input) => {
    if (input.type === "text" || input.type === "email" || input.inputMode === "decimal") {
      input.addEventListener("input", applyFiltersDebounced);
    } else if (input.tagName === "SELECT") {
      input.addEventListener("change", applyFiltersDebounced);
    }
  });

  // Optional: Keep the submit button for manual apply (if desired), but make it less prominent
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    applyFiltersDebounced();  // Trigger immediately on submit
  });

  resetBtn.addEventListener("click", () => {
    location.href = "/pages/marketplace.html";
  });

  render();
}

