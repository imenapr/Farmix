import { boot } from "../app/boot.js";
import { debounce, renderSkeletonCards, renderStateBlock, toast, qs, mountListingCardLinks } from "../app/ui.js";
import { getCurrentUser } from "../app/auth-state.js";
import { searchListings } from "../app/state.js";
import { getCategories } from "../data/categories.js";
import { REGIONS, getRegionLabel } from "../data/locations.js";
import { ROLES } from "../app/config.js";
import { validateMarketplaceFilters } from "../data/validators.js";
import { renderListingCard } from "../components/listing-card.js";
import { placeOrder } from "../services/orders.service.js";
import { openGuestGate } from "../components/guest-gate.js";
import { t, onLanguageChange, translatePageHead, getCategoryLabel, getCurrentLang } from "../app/i18n.js";
import {
  CURRENCIES,
  formatPrice,
  getCurrencySymbol,
  getDisplayCurrency,
  setDisplayCurrency,
} from "../lib/currency.js";

boot();
translatePageHead("marketplace.pageTitle", "marketplace.pageSubtitle");

const root = document.getElementById("marketplace-root");
if (!root) throw new Error("Missing #marketplace-root");

const form = qs(root, "#filters-form");
const filtersPanel = qs(root, "#market-filters-panel");
const filtersToggle = qs(root, "[data-filters-toggle]");
const filtersToggleLabel = qs(root, "[data-filters-toggle-label]");
const catSelect = qs(form, "select[name='cat']");
const regionSelect = qs(form, "select[name='region']");
const resultsEl = qs(root, "[data-results]");
const countEl = qs(root, "[data-count]");
const pageEl = qs(root, "[data-page]");
const pagerEl = qs(root, "[data-pager]");
const resetBtn = qs(root, "[data-reset]");
const qInput = qs(form, "input[name='q']");
const inStockInput = qs(form, "input[name='inStock']");

const modal = document.getElementById("category-modal");
const categoryList = document.getElementById("category-list");
const addBtn = document.getElementById("add-category");
const saveBtn = document.getElementById("save-categories");
const cancelBtn = document.getElementById("cancel-modal");

const orderModal = document.getElementById("order-modal");
const currencyToggle = qs(root, "[data-currency-toggle]");

let displayCurrency = getDisplayCurrency();

const CATEGORIES = getCategories();
for (const c of CATEGORIES) {
  const opt = document.createElement("option");
  opt.value = c.id;
  opt.textContent = getCategoryLabel(c.id, c.name);
  catSelect.appendChild(opt);
}

function populateRegionFilterOptions() {
  if (!regionSelect) return;
  const selected = regionSelect.value;
  regionSelect.innerHTML = `<option value="">${t("location.allRegions")}</option>`;
  for (const region of REGIONS) {
    const opt = document.createElement("option");
    opt.value = region.id;
    opt.textContent = getRegionLabel(region.id, getCurrentLang());
    regionSelect.appendChild(opt);
  }
  if (selected) regionSelect.value = selected;
}

populateRegionFilterOptions();

const user = getCurrentUser();
if (user && user.role === "admin") {
  const configOpt = document.createElement("option");
  configOpt.value = "config";
  configOpt.textContent = t("marketplace.configCategories");
  catSelect.appendChild(configOpt);
}

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

function createCategoryRow(cat = { id: "", name: "" }) {
  const div = document.createElement("div");
  div.className = "category-modal-row";
  const input = document.createElement("input");
  input.type = "text";
  input.value = cat.name;
  input.className = "input";
  input.dataset.id = cat.id;
  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.textContent = t("common.remove");
  removeBtn.className = "btn btn-ghost";
  removeBtn.addEventListener("click", () => div.remove());
  div.appendChild(input);
  div.appendChild(removeBtn);
  return div;
}

function showCategoryModal() {
  categoryList.innerHTML = "";
  for (const cat of getCategories()) {
    categoryList.appendChild(createCategoryRow(cat));
  }
  modal.hidden = false;
  modal.setAttribute("aria-hidden", "false");
}

function closeCategoryModal() {
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
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
    const row = createCategoryRow({
      id: name.trim().toLowerCase().replace(/\s+/g, "_"),
      name: name.trim(),
    });
    categoryList.appendChild(row);
  }
});

saveBtn.addEventListener("click", () => {
  const inputs = categoryList.querySelectorAll("input");
  const newCats = Array.from(inputs)
    .map((input) => ({
      id: input.dataset.id || input.value.toLowerCase().replace(/\s+/g, "_"),
      name: input.value.trim(),
    }))
    .filter((cat) => cat.name);
  localStorage.setItem("farmix_categories", JSON.stringify(newCats));
  closeCategoryModal();
  toast("success", t("marketplace.categoriesUpdated"));
  location.reload();
});

cancelBtn.addEventListener("click", closeCategoryModal);

mountListingCardLinks(resultsEl);

const listingsById = new Map();
let orderDelegationMounted = false;
let cachedResults = null;
let omListingId = null;
let omPricePerUnit = 0;
let omMaxQty = 0;
let omUnit = "";
let lastOrderTrigger = null;

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

function updateCurrencyToggleUI() {
  if (!currencyToggle) return;
  currencyToggle.querySelectorAll("[data-currency]").forEach((btn) => {
    const code = btn.dataset.currency === CURRENCIES.USD ? CURRENCIES.USD : CURRENCIES.GEL;
    const active = code === displayCurrency;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", active ? "true" : "false");
    btn.textContent = getCurrencySymbol(code);
    btn.setAttribute("aria-label", code === CURRENCIES.USD ? t("currency.usd") : t("currency.gel"));
  });
  currencyToggle.setAttribute("aria-label", t("currency.label"));
}

function wireCurrencyToggle() {
  if (!currencyToggle) return;
  updateCurrencyToggleUI();
  currencyToggle.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-currency]");
    if (!btn) return;
    const next = btn.dataset.currency === CURRENCIES.USD ? CURRENCIES.USD : CURRENCIES.GEL;
    if (next === displayCurrency) return;
    displayCurrency = next;
    setDisplayCurrency(displayCurrency);
    updateCurrencyToggleUI();
    if (cachedResults) renderResultsBlock(cachedResults);
    if (!orderModal.hidden) updateOrderTotal();
  });
}

wireCurrencyToggle();

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

  resultsEl.innerHTML = `<div class="grid cols-3">${items.map((l) => renderListingCard(l, { currency: displayCurrency })).join("")}</div>`;
  injectOrderButtons(items);
  renderPager({
    page,
    pageSize,
    total,
    currentParams: {
      q: filters.q,
      cat: filters.cat,
      region: filters.region,
      min: filters.min,
      max: filters.max,
      sort: filters.sort,
      stock: filters.inStockOnly ? "in_stock" : null,
    },
  });
}

function translateOrderModal() {
  const title = document.getElementById("om-title");
  if (title) title.textContent = t("marketplace.orderProduct");
  const qtyLabel = document.querySelector('label[for="om-qty"]');
  if (qtyLabel) qtyLabel.textContent = t("marketplace.quantity");
  const availLabel = document.querySelector('label[for="om-avail"]');
  if (availLabel) availLabel.textContent = t("marketplace.availableLabel");
  const totalLabel = document.querySelector(".order-modal-total-label");
  if (totalLabel) totalLabel.textContent = t("common.total");
  const cancelBtnEl = document.getElementById("om-cancel");
  if (cancelBtnEl) cancelBtnEl.textContent = t("common.cancel");
  const confirmBtn = document.getElementById("om-confirm");
  if (confirmBtn && !confirmBtn.disabled) confirmBtn.textContent = t("marketplace.confirmOrder");
}

function translateFilterLabels() {
  const labelTexts = [
    t("marketplace.search"),
    t("common.category"),
    t("location.region"),
    t("marketplace.minPrice"),
    t("marketplace.maxPrice"),
    t("marketplace.sort"),
  ];
  form.querySelectorAll(".filters-label").forEach((el, i) => {
    if (labelTexts[i]) el.textContent = labelTexts[i];
  });

  const qInputEl = form.elements.namedItem("q");
  if (qInputEl) qInputEl.placeholder = t("marketplace.searchPlaceholder");
  const regionSelectEl = form.elements.namedItem("region");
  if (regionSelectEl) populateRegionFilterOptions();

  const hint = form.querySelector(".filters-hint");
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

  const inStockLabel = form.querySelector("[data-in-stock-label]");
  if (inStockLabel) inStockLabel.textContent = t("marketplace.inStockOnly");

  const modalTitle = document.getElementById("category-modal-title");
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

  for (const k of [...params.keys()]) {
    if (!["q", "cat", "region", "min", "max", "sort", "stock", "page"].includes(k)) params.delete(k);
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
  const regionEl = form.elements.namedItem("region");
  if (regionEl) regionEl.value = filters.region ?? "";
  form.elements.namedItem("min").value = filters.min ?? "";
  form.elements.namedItem("max").value = filters.max ?? "";
  form.elements.namedItem("sort").value = filters.sort ?? "newest";
  const inStockEl = form.elements.namedItem("inStock");
  if (inStockEl) inStockEl.checked = Boolean(filters.inStockOnly);
}

function renderPager({ page, pageSize, total, currentParams }) {
  pagerEl.innerHTML = "";
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  const prev = document.createElement("a");
  prev.className = "btn btn-ghost";
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
  next.className = "btn btn-ghost";
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

function closeOrderModal() {
  orderModal.hidden = true;
  orderModal.setAttribute("aria-hidden", "true");
  if (lastOrderTrigger && document.contains(lastOrderTrigger)) lastOrderTrigger.focus();
  lastOrderTrigger = null;
}

function updateOrderTotal() {
  const qty = Math.max(1, Math.min(omMaxQty, parseInt(document.getElementById("om-qty").value, 10) || 1));
  document.getElementById("om-total").textContent = formatPrice(qty * omPricePerUnit, displayCurrency);
}

function openOrderModal(listing, triggerEl = null) {
  lastOrderTrigger = triggerEl;
  omListingId = listing.id;
  omPricePerUnit = listing.price;
  omMaxQty = listing.quantityAvailable;
  omUnit = listing.unit;
  document.getElementById("om-title").textContent = listing.title;
  document.getElementById("om-meta").textContent = `${formatPrice(listing.price, displayCurrency)} / ${listing.unit}`;
  document.getElementById("om-avail").textContent = `${listing.quantityAvailable} ${listing.unit}`;
  const qtyInput = document.getElementById("om-qty");
  qtyInput.max = listing.quantityAvailable;
  qtyInput.value = 1;
  updateOrderTotal();
  orderModal.hidden = false;
  orderModal.setAttribute("aria-hidden", "false");
  setTimeout(() => qtyInput.focus(), 60);
}

document.getElementById("om-qty").addEventListener("input", updateOrderTotal);
document.getElementById("om-cancel").addEventListener("click", closeOrderModal);
orderModal.addEventListener("click", (e) => {
  if (e.target === orderModal) closeOrderModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !orderModal.hidden) closeOrderModal();
});

document.getElementById("om-confirm").addEventListener("click", async () => {
  const qty = parseInt(document.getElementById("om-qty").value, 10) || 1;
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

  const card = resultsEl.querySelector(`[data-listing-id="${CSS.escape(omListingId)}"]`);
  if (card) {
    const newQty = omMaxQty - qty;
    card.setAttribute("data-qty", newQty);
    const availEl = card.querySelector(".listing-avail");
    if (availEl) {
      if (newQty > 0) {
        availEl.classList.remove("listing-avail--unavailable");
        availEl.textContent = t("listing.availableShort", { n: newQty });
      } else {
        availEl.classList.add("listing-avail--unavailable");
        availEl.textContent = t("listing.notAvailable");
      }
    }
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
    region: fd.get("region"),
    min: fd.get("min"),
    max: fd.get("max"),
    sort: fd.get("sort"),
    stock: fd.get("inStock") === "1" ? "in_stock" : null,
    page: 1,
  });
  render();
}

const applyFiltersDebounced = debounce(applyFiltersFromForm, 400);
qInput.addEventListener("input", applyFiltersDebounced);
if (inStockInput) inStockInput.addEventListener("change", applyFiltersFromForm);

form.addEventListener("submit", (e) => {
  e.preventDefault();
  applyFiltersFromForm();
});

resetBtn.addEventListener("click", () => {
  location.href = "/pages/marketplace.html";
});

translateFilterLabels();
translateOrderModal();
render();

onLanguageChange(() => {
  translatePageHead("marketplace.pageTitle", "marketplace.pageSubtitle");
  translateFilterLabels();
  populateRegionFilterOptions();
  translateOrderModal();
  updateCurrencyToggleUI();
  const isOpen = filtersPanel?.classList.contains("is-open");
  if (filtersToggleLabel) {
    filtersToggleLabel.textContent = isOpen ? t("marketplace.hideFilters") : t("marketplace.showFilters");
  }
  if (cachedResults) renderResultsBlock(cachedResults);
});
