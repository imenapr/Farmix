import { boot } from "../app/boot.js";
import { debounce, renderSkeletonCards, renderStateBlock, toast, qs, mountListingCardLinks } from "../app/ui.js";
import { getCurrentUser } from "../app/auth-state.js";
import { searchListings } from "../app/state.js";
import { getCategories } from "../data/categories.js";
import { ROLES } from "../app/config.js";
import { validateMarketplaceFilters } from "../data/validators.js";
import { renderListingCard } from "../components/listing-card.js";
import { placeOrder } from "../services/orders.service.js";
import { openGuestGate } from "../components/guest-gate.js";
import { t, onLanguageChange, translatePageHead, getCategoryLabel } from "../app/i18n.js";

boot();
translatePageHead("marketplace.pageTitle", "marketplace.pageSubtitle");

const root = document.getElementById("marketplace-root");
if (root) {
  root.innerHTML = `
    <div class="market-layout">
      <aside class="filters" id="market-filters">
        <button
          type="button"
          class="filters-toggle btn btn-ghost"
          data-filters-toggle
          aria-expanded="false"
          aria-controls="market-filters-panel"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" stroke-linecap="round"/>
          </svg>
          <span data-filters-toggle-label>${t("marketplace.showFilters")}</span>
        </button>
        <div class="filters-panel" id="market-filters-panel">
        <section class="card pad">
          <form id="filters-form" class="filters-grid" novalidate>
            <label class="stack" style="gap:0.35rem;">
              <span style="font-weight: 800;">${t("marketplace.search")}</span>
              <input class="input" name="q" placeholder="${t("marketplace.searchPlaceholder")}" />
              <span class="muted" style="font-size: var(--text-sm);">${t("marketplace.searchHint")}</span>
            </label>

            <div class="filters-row">
              <label class="stack" style="gap:0.35rem;">
                <span style="font-weight: 800;">${t("common.category")}</span>
                <select class="select" name="cat">
                  <option value="">${t("marketplace.allCategories")}</option>
                </select>
              </label>
              <label class="stack" style="gap:0.35rem;">
                <span style="font-weight: 800;">${t("common.location")}</span>
                <input class="input" name="loc" placeholder="${t("marketplace.locationPlaceholder")}" />
              </label>
            </div>

            <div class="filters-row">
              <label class="stack" style="gap:0.35rem;">
                <span style="font-weight: 800;">${t("marketplace.minPrice")}</span>
                <input class="input" name="min" inputmode="decimal" placeholder="0" />
              </label>
              <label class="stack" style="gap:0.35rem;">
                <span style="font-weight: 800;">${t("marketplace.maxPrice")}</span>
                <input class="input" name="max" inputmode="decimal" placeholder="100" />
              </label>
            </div>

            <label class="stack" style="gap:0.35rem;">
              <span style="font-weight: 800;">${t("marketplace.sort")}</span>
              <select class="select" name="sort">
                <option value="newest" selected>${t("marketplace.sortNewest")}</option>
                <option value="price_asc">${t("marketplace.sortPriceAsc")}</option>
                <option value="price_desc">${t("marketplace.sortPriceDesc")}</option>
              </select>
            </label>

            <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
              <button class="btn btn-primary" type="submit">${t("common.apply")}</button>
              <button class="btn btn-ghost" type="button" data-reset>${t("common.reset")}</button>
            </div>
          </form>
        </section>
        </div>
      </aside>

      <div id="category-modal" class="modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center;">
        <div style="background:white; padding:20px; border-radius:8px; max-width:500px; width:90%;">
          <h3>${t("marketplace.editCategoriesAdmin")}</h3>
          <div id="category-list" style="margin:10px 0;"></div>
          <button id="add-category" class="btn btn-primary">${t("marketplace.addCategory")}</button>
          <div style="margin-top:10px;">
            <button id="save-categories" class="btn btn-primary">${t("common.save")}</button>
            <button id="cancel-modal" class="btn btn-ghost">${t("common.cancel")}</button>
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
  const filtersPanel = qs(root, "#market-filters-panel");
  const filtersToggle = qs(root, "[data-filters-toggle]");
  const filtersToggleLabel = qs(root, "[data-filters-toggle-label]");

  function setFiltersOpen(open) {
    if (!filtersPanel || !filtersToggle) return;
    filtersPanel.classList.toggle("is-open", open);
    filtersToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (filtersToggleLabel) {
      filtersToggleLabel.textContent = open ? t("marketplace.hideFilters") : t("marketplace.showFilters");
    }
  }

  if (filtersToggle) {
    filtersToggle.addEventListener("click", () => {
      setFiltersOpen(!filtersPanel?.classList.contains("is-open"));
    });
  }

  onLanguageChange(() => {
    const isOpen = filtersPanel?.classList.contains("is-open");
    if (filtersToggleLabel) {
      filtersToggleLabel.textContent = isOpen ? t("marketplace.hideFilters") : t("marketplace.showFilters");
    }
  });

  const catSelect = qs(form, "select[name='cat']");
  const CATEGORIES = getCategories();
  for (const c of CATEGORIES) {
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = getCategoryLabel(c.id, c.name);
    catSelect.appendChild(opt);
  }

  const user = getCurrentUser();
  if (user && user.role === 'admin') {
    const configOpt = document.createElement("option");
    configOpt.value = "config";
    configOpt.textContent = t("marketplace.configCategories");
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
      removeBtn.textContent = t("common.remove");
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
    const name = prompt(t("marketplace.enterCategoryName"));
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
      removeBtn.textContent = t("common.remove");
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
    toast("success", t("marketplace.categoriesUpdated"));
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

  mountListingCardLinks(resultsEl);

  const listingsById = new Map();
  let orderDelegationMounted = false;

  function mountOrderDelegation() {
    if (orderDelegationMounted) return;
    orderDelegationMounted = true;
    resultsEl.addEventListener("click", (event) => {
      const btn = event.target.closest(".btn-order");
      if (!btn) return;
      event.preventDefault();
      event.stopPropagation();
      const card = btn.closest("[data-listing-id]");
      const id = card?.dataset?.listingId;
      const listing = id ? listingsById.get(id) : null;
      if (!listing) return;
      const curUser = getCurrentUser();
      if (!curUser) {
        openGuestGate();
        return;
      }
      openOrderModal(listing, btn);
    });
  }

  mountOrderDelegation();

  let cachedResults = null;

  function renderResultsBlock({ items, total, page, pageSize, filters }) {
    cachedResults = { items, total, page, pageSize, filters };
    for (const listing of items) listingsById.set(listing.id, listing);
    countEl.textContent = total === 1 ? t("marketplace.result", { n: total }) : t("marketplace.results", { n: total });
    pageEl.textContent = filters.q ? t("marketplace.searching", { q: filters.q }) : "";

    if (!items.length) {
      resultsEl.innerHTML = renderStateBlock({
        title: t("marketplace.noMatch"),
        description: t("marketplace.noMatchDesc"),
        actionsHtml: `<button class="btn btn-primary" type="button" id="clear">${t("marketplace.clearFilters")}</button>`,
      });
      const clear = resultsEl.querySelector("#clear");
      if (clear) clear.addEventListener("click", () => (location.href = "/pages/marketplace.html"));
      pagerEl.innerHTML = "";
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
  }

  function translateOrderModal() {
    const title = document.getElementById("om-title");
    if (title) title.textContent = t("marketplace.orderProduct");
    const qtyLabel = document.querySelector('label[for="om-qty"]');
    if (qtyLabel) qtyLabel.textContent = t("marketplace.quantity");
    const availLabels = document.querySelectorAll(".order-modal-field label");
    if (availLabels[1]) availLabels[1].textContent = t("marketplace.availableLabel");
    const totalLabel = document.querySelector(".order-modal-total-label");
    if (totalLabel) totalLabel.textContent = t("common.total");
    const cancelBtn = document.getElementById("om-cancel");
    if (cancelBtn) cancelBtn.textContent = t("common.cancel");
    const confirmBtn = document.getElementById("om-confirm");
    if (confirmBtn && !confirmBtn.disabled) confirmBtn.textContent = t("marketplace.confirmOrder");
  }

  function restoreFormState(formEl, state) {
    if (!formEl || !state) return;
    formEl.elements.namedItem("q").value = state.q;
    formEl.elements.namedItem("cat").value = state.cat;
    formEl.elements.namedItem("loc").value = state.loc;
    formEl.elements.namedItem("min").value = state.min;
    formEl.elements.namedItem("max").value = state.max;
    formEl.elements.namedItem("sort").value = state.sort;
  }

  function translateFilterLabels() {
    const labels = form.querySelectorAll("label.stack > span, label.stack span[style]");
    const texts = [
      t("marketplace.search"),
      t("common.category"),
      t("common.location"),
      t("marketplace.minPrice"),
      t("marketplace.maxPrice"),
      t("marketplace.sort"),
    ];
    labels.forEach((el, i) => { if (texts[i]) el.textContent = texts[i]; });

    const qInputEl = form.elements.namedItem("q");
    if (qInputEl) qInputEl.placeholder = t("marketplace.searchPlaceholder");
    const locInputEl = form.elements.namedItem("loc");
    if (locInputEl) locInputEl.placeholder = t("marketplace.locationPlaceholder");

    const hint = form.querySelector(".muted");
    if (hint) hint.textContent = t("marketplace.searchHint");

    const catOpt = catSelect.querySelector('option[value=""]');
    if (catOpt) catOpt.textContent = t("marketplace.allCategories");

    Array.from(catSelect.options).forEach((opt) => {
      if (!opt.value || opt.value === "config") return;
      const cat = CATEGORIES.find((c) => c.id === opt.value);
      opt.textContent = getCategoryLabel(opt.value, cat?.name);
    });

    const configOpt = catSelect.querySelector('option[value="config"]');
    if (configOpt) configOpt.textContent = t("marketplace.configCategories");

    const sortSelect = form.elements.namedItem("sort");
    if (sortSelect) {
      const opts = sortSelect.options;
      if (opts[0]) opts[0].textContent = t("marketplace.sortNewest");
      if (opts[1]) opts[1].textContent = t("marketplace.sortPriceAsc");
      if (opts[2]) opts[2].textContent = t("marketplace.sortPriceDesc");
    }

    const applyBtn = form.querySelector('button[type="submit"]');
    if (applyBtn) applyBtn.textContent = t("common.apply");
    if (resetBtn) resetBtn.textContent = t("common.reset");

    const modalTitle = modal.querySelector("h3");
    if (modalTitle) modalTitle.textContent = t("marketplace.editCategoriesAdmin");
    if (addBtn) addBtn.textContent = t("marketplace.addCategory");
    if (saveBtn) saveBtn.textContent = t("common.save");
    if (cancelBtn) cancelBtn.textContent = t("common.cancel");
  }

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
    prev.textContent = t("common.prev");
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
    next.textContent = t("common.next");
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
    label.textContent = t("marketplace.pageOf", { page, total: totalPages });

    pagerEl.appendChild(prev);
    pagerEl.appendChild(label);
    pagerEl.appendChild(next);
  }

  // ── Render function (now async) ───────────────────────────────────────
  async function render() {
    const parsed = readFiltersFromUrl();
    if (!parsed.ok) {
      resultsEl.innerHTML = renderStateBlock({
        title: t("marketplace.invalidFilters"),
        description: t("marketplace.invalidFiltersDesc"),
        actionsHtml: `<button class="btn btn-primary" type="button" id="fix-filters">${t("marketplace.resetFilters")}</button>`,
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

    countEl.textContent = t("marketplace.loadingListings");
    pageEl.textContent = "";
    pagerEl.innerHTML = "";
    resultsEl.innerHTML = renderSkeletonCards(9);

    try {
      const res = await searchListings(new URLSearchParams(location.search));
      if (!res.ok) {
        resultsEl.innerHTML = renderStateBlock({
          title: t("marketplace.couldntLoad"),
          description: res.error?.message ?? t("marketplace.tryAgain"),
          actionsHtml: `<button class="btn btn-primary" type="button" id="retry">${t("common.retry")}</button>`,
        });
        const retry = resultsEl.querySelector("#retry");
        if (retry) retry.addEventListener("click", () => render());
        toast("error", t("marketplace.loadFailed"));
        return;
      }

      const { items, total, page, pageSize, filters } = res.data;
      renderResultsBlock({ items, total, page, pageSize, filters });
    } catch (err) {
      resultsEl.innerHTML = renderStateBlock({
        title: t("marketplace.errorLoading"),
        description: err.message || t("marketplace.unexpectedError"),
        actionsHtml: `<button class="btn btn-primary" type="button" id="retry">${t("common.retry")}</button>`,
      });
      const retry = resultsEl.querySelector("#retry");
      if (retry) retry.addEventListener("click", () => render());
    }
  }

  // ── Order modal (injected once) ─────────────────────────────────────
  const orderModal = document.createElement("div");
  orderModal.className = "order-modal-backdrop";
  orderModal.setAttribute("aria-hidden", "true");
  orderModal.style.display = "none";
  orderModal.innerHTML = `
    <div class="order-modal-card" role="dialog" aria-modal="true" aria-labelledby="om-title" aria-describedby="om-meta" tabindex="-1">
      <h3 class="order-modal-title" id="om-title">${t("marketplace.orderProduct")}</h3>
      <p class="order-modal-meta" id="om-meta"></p>
      <div class="order-modal-row">
        <div class="order-modal-field">
          <label for="om-qty">${t("marketplace.quantity")}</label>
          <input class="order-qty-input" id="om-qty" type="number" min="1" step="1" value="1" aria-describedby="om-avail" />
        </div>
        <div class="order-modal-field">
          <label>${t("marketplace.availableLabel")}</label>
          <div id="om-avail" style="font-size:1rem;font-weight:700;padding-top:0.4rem;color:var(--color-navy);">—</div>
        </div>
      </div>
      <div class="order-modal-total-label">${t("common.total")}</div>
      <div class="order-modal-total-val" id="om-total">$0.00</div>
      <div class="order-modal-actions">
        <button class="btn btn-ghost" id="om-cancel" type="button">${t("common.cancel")}</button>
        <button class="btn btn-primary" id="om-confirm" type="button">${t("marketplace.confirmOrder")}</button>
      </div>
    </div>
  `;
  document.body.appendChild(orderModal);

  let omListingId = null, omPricePerUnit = 0, omMaxQty = 0, omUnit = "";
  let lastOrderTrigger = null;

  function closeOrderModal() {
    orderModal.style.display = "none";
    orderModal.setAttribute("aria-hidden", "true");
    if (lastOrderTrigger && document.contains(lastOrderTrigger)) lastOrderTrigger.focus();
    lastOrderTrigger = null;
  }

  function updateOrderTotal() {
    const qty = Math.max(1, Math.min(omMaxQty, parseInt(document.getElementById("om-qty").value) || 1));
    const total = (qty * omPricePerUnit).toFixed(2);
    document.getElementById("om-total").textContent = `$${total}`;
  }

  function openOrderModal(listing, triggerEl = null) {
    lastOrderTrigger = triggerEl;
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
    orderModal.setAttribute("aria-hidden", "false");
    setTimeout(() => qtyInput.focus(), 60);
  }

  document.getElementById("om-qty").addEventListener("input", updateOrderTotal);
  document.getElementById("om-cancel").addEventListener("click", closeOrderModal);
  orderModal.addEventListener("click", (e) => { if (e.target === orderModal) closeOrderModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && orderModal.style.display !== "none") closeOrderModal();
  });

  document.getElementById("om-confirm").addEventListener("click", async () => {
    const qty = parseInt(document.getElementById("om-qty").value) || 1;
    const curUser = getCurrentUser();
    if (!curUser) {
      openGuestGate();
      return;
    }

    const btn = document.getElementById("om-confirm");
    btn.disabled = true;
    btn.textContent = t("marketplace.placing");

    const result = await placeOrder(curUser.id, omListingId, qty);
    btn.disabled = false;
    btn.textContent = t("marketplace.confirmOrder");

    if (!result.ok) {
      toast("error", result.error.message);
      return;
    }

    closeOrderModal();
    toast("success", t("marketplace.orderPlaced", { qty, unit: omUnit, title: result.data.title }));

    // Update the card in-place: refresh stock display and disable button if exhausted
    const card = resultsEl.querySelector(`[data-listing-id="${CSS.escape(omListingId)}"]`);
    if (card) {
      const newQty = omMaxQty - qty;
      card.setAttribute("data-qty", newQty);
      const availEl = card.querySelector(".listing-avail");
      if (availEl) availEl.textContent = newQty > 0 ? t("listing.availableShort", { n: newQty }) : t("marketplace.outOfStock");
      const orderBtn = card.querySelector(".btn-order");
      if (orderBtn && newQty <= 0) {
        orderBtn.disabled = true;
        orderBtn.textContent = t("marketplace.outOfStock");
      }
      if (newQty <= 0 && qty > 0) {
        toast("error", t("marketplace.inventoryLow"));
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
      btn.textContent = qty > 0 ? t("marketplace.addToOrder") : t("marketplace.outOfStock");
      btn.setAttribute(
        "aria-label",
        qty > 0
          ? `${t("marketplace.addToOrder")}: ${listing.title}`
          : `${listing.title} — ${t("marketplace.outOfStock")}`,
      );
      btn.disabled = qty <= 0;
      wrap.appendChild(btn);
      card.appendChild(wrap);
    });
  }

  function applyFiltersFromForm() {
    const fd = new FormData(form);
    setQueryParams({
      q: fd.get("q"),
      cat: fd.get("cat"),
      loc: fd.get("loc"),
      min: fd.get("min"),
      max: fd.get("max"),
      sort: fd.get("sort"),
      page: 1,
    });
    render();
  }

  const applyFiltersDebounced = debounce(applyFiltersFromForm, 400);
  qInput.addEventListener("input", applyFiltersDebounced);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    applyFiltersFromForm();
  });

  resetBtn.addEventListener("click", () => {
    location.href = "/pages/marketplace.html";
  });

  render();

  onLanguageChange(() => {
    translatePageHead("marketplace.pageTitle", "marketplace.pageSubtitle");
    translateFilterLabels();
    translateOrderModal();
    if (cachedResults) renderResultsBlock(cachedResults);
  });
}

