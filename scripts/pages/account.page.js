import { boot } from "../app/boot.js";
import { guardAuth } from "../app/router-guards.js";
import { toast, qs, setText, escapeHtml, productListingUrl } from "../app/ui.js";
import { logout as doLogout } from "../app/auth-state.js";
import { initAppState } from "../app/state.js";
import { formatAuthIdentifier } from "../lib/auth-email.js";
import { formatPrice, getDisplayCurrency } from "../lib/currency.js";
import { updateProfile } from "../services/users.service.js";
import { listOrdersForBuyer } from "../services/orders.service.js";
import { t, onLanguageChange, translatePageHead } from "../app/i18n.js";

boot();
translatePageHead("account.pageTitle", "account.pageSubtitle");

const root = document.getElementById("account-root");
let accountUser = null;
let accountRecord = null;
let buyerOrders = [];
let savedFormState = null;

function isBuyerRole(role) {
  return role === "consumer" || role === "business";
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

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return t("admin.dash");
  return d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function orderStatusLabel(status) {
  return t(`orders.status.${status}`, { default: status });
}

function sellerLabel(order) {
  if (order.sellerName) return order.sellerName;
  if (order.sellerEmail) return order.sellerEmail;
  return t("common.seller");
}

function sellerProfileUrl(sellerId) {
  return `/pages/profile.html?id=${encodeURIComponent(sellerId)}`;
}

function renderBuyerOrdersSection() {
  if (!accountRecord || !isBuyerRole(accountRecord.role)) return "";

  const currency = getDisplayCurrency();

  return `
    <section class="card pad acct-orders" aria-labelledby="acct-orders-title">
      <div class="acct-orders-head">
        <div>
          <h2 class="acct-orders-title" id="acct-orders-title">${t("account.myOrders")}</h2>
          <p class="acct-orders-sub">${t("account.myOrdersSub")}</p>
        </div>
        <span class="acct-orders-count">${buyerOrders.length}</span>
      </div>
      ${
        buyerOrders.length
          ? `
        <div class="acct-table-wrap">
          <table class="acct-table">
            <thead>
              <tr>
                <th>${t("common.listing")}</th>
                <th>${t("account.orderSeller")}</th>
                <th>${t("common.quantity")}</th>
                <th>${t("common.total")}</th>
                <th>${t("common.status")}</th>
                <th>${t("account.orderPlaced")}</th>
              </tr>
            </thead>
            <tbody>
              ${buyerOrders
                .map(
                  (o) => `
                <tr>
                  <td>
                    <a class="acct-row-link" href="${escapeHtml(productListingUrl(o.listingId))}">
                      ${escapeHtml(o.listingTitle ?? t("common.listing"))}
                    </a>
                  </td>
                  <td>
                    <a class="acct-row-link" href="${escapeHtml(sellerProfileUrl(o.sellerId))}">
                      ${escapeHtml(sellerLabel(o))}
                    </a>
                  </td>
                  <td>${Number(o.quantity ?? 0)} ${escapeHtml(o.unit ?? "")}</td>
                  <td>${escapeHtml(formatPrice(o.totalPrice, currency))}</td>
                  <td>
                    <span class="acct-order-status acct-order-status--${escapeHtml(o.status)}">
                      ${escapeHtml(orderStatusLabel(o.status))}
                    </span>
                  </td>
                  <td>${escapeHtml(formatDate(o.createdAt))}</td>
                </tr>`,
                )
                .join("")}
            </tbody>
          </table>
        </div>`
          : `
        <div class="acct-empty">
          <p style="margin:0 0 0.75rem;">${t("account.noOrdersYet")}</p>
          <a class="btn btn-primary btn-sm" href="/pages/marketplace.html">${t("common.goToMarketplace")}</a>
        </div>`
      }
    </section>
  `;
}

function renderAccountForm() {
  if (!accountUser || !accountRecord) return;

  const record = accountRecord;
  const isFarmer = record.role === "farmer";
  const isBusiness = record.role === "business";
  const roleLabel = {
    farmer: t("nav.role.farmer"),
    business: t("nav.role.business"),
    consumer: t("nav.role.consumer"),
    admin: t("nav.role.admin"),
  }[record.role] ?? record.role;

  root.innerHTML = `
    <section class="card pad" style="max-width: 720px;">
      <form id="profile-form" class="stack" novalidate>
        <div class="muted" style="font-size: var(--text-sm);">
          ${t("account.signedInAs")} <strong>${escapeHtml(formatAuthIdentifier(record))}</strong> · ${t("common.role")} <strong>${roleLabel}</strong>
        </div>

        <div class="grid" style="grid-template-columns: 1fr; gap: 0.85rem;">
          <label class="stack" style="gap:0.35rem;">
            <span style="font-weight: 700;">${t("common.name")}</span>
            <input class="input" name="name" required />
            <span class="error-text" data-err="name"></span>
          </label>
          <label class="stack" style="gap:0.35rem;">
            <span style="font-weight: 700;">${t("common.location")}</span>
            <input class="input" name="location" required />
            <span class="error-text" data-err="location"></span>
          </label>
        </div>

        <div class="grid" style="grid-template-columns: 1fr; gap: 0.85rem;">
          <label class="stack" style="gap:0.35rem;">
            <span style="font-weight: 700;">${t("account.phoneOptional")}</span>
            <input class="input" name="phone" />
            <span class="error-text" data-err="phone"></span>
          </label>
          <label class="stack" style="gap:0.35rem;">
            <span style="font-weight: 700;">${t("account.bioOptional")}</span>
            <textarea class="textarea" name="bio" rows="3"></textarea>
            <span class="error-text" data-err="bio"></span>
          </label>
        </div>

        <div class="grid" style="grid-template-columns: 1fr; gap: 0.85rem;">
          ${
            isFarmer
              ? `
          <label class="stack" style="gap:0.35rem;">
            <span style="font-weight: 700;">${t("account.farmNameOptional")}</span>
            <input class="input" name="farmName" />
            <span class="error-text" data-err="farmName"></span>
          </label>`
              : ""
          }
          ${
            isBusiness
              ? `
          <label class="stack" style="gap:0.35rem;">
            <span style="font-weight: 700;">${t("account.companyName")}</span>
            <input class="input" name="companyName" />
            <span class="error-text" data-err="companyName"></span>
          </label>`
              : ""
          }
        </div>

        <p class="error-text" data-err="form" style="margin:0;"></p>

        <div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center;">
          <button class="btn btn-primary" type="submit" data-submit>${t("common.saveChanges")}</button>
          <button class="btn btn-ghost" type="button" data-logout>${t("common.logout")}</button>
        </div>
      </form>
    </section>
    ${renderBuyerOrdersSection()}
  `;

  const form = qs(root, "#profile-form");
  const submitBtn = qs(root, "[data-submit]");
  const logoutBtn = qs(root, "[data-logout]");

  const setVal = (name, value) => {
    const el = form.elements.namedItem(name);
    if (el) el.value = value ?? "";
  };

  setVal("name", record.name);
  setVal("location", record.location);
  setVal("phone", record.phone);
  setVal("bio", record.bio);
  setVal("farmName", record.farmName);
  setVal("companyName", record.companyName);
  restoreFormState(form, savedFormState);

  const err = (k) => qs(root, `[data-err='${k}']`);
  const errForm = err("form");

  function clearErrors() {
    for (const k of ["name", "location", "phone", "bio", "farmName", "companyName", "form"]) setText(err(k), "");
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? t("common.saving") : t("common.saveChanges");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    setLoading(true);

    const fd = new FormData(form);
    const res = await updateProfile(accountUser.id, {
      name: fd.get("name"),
      location: fd.get("location"),
      phone: fd.get("phone"),
      bio: fd.get("bio"),
      farmName: fd.get("farmName"),
      companyName: fd.get("companyName"),
    });

    if (!res.ok) {
      setLoading(false);
      for (const [k, msg] of Object.entries(res.error.fieldErrors ?? {})) {
        const el = root.querySelector(`[data-err='${k}']`);
        if (el) el.textContent = msg;
      }
      setText(errForm, res.error.message ?? t("service.fixHighlighted"));
      return;
    }

    accountRecord = res.data;
    setLoading(false);
    toast("success", t("account.profileUpdated"));
    await initAppState();
  });

  logoutBtn.addEventListener("click", async () => {
    await doLogout();
    toast("success", t("account.loggedOut"));
    location.href = "/index.html";
  });
}

async function loadBuyerOrders(userId) {
  const res = await listOrdersForBuyer(userId);
  buyerOrders = res.ok ? res.data : [];
}

if (root) {
  guardAuth().then(async (user) => {
    if (!user) return;
    accountUser = user;
    accountRecord = user;

    if (isBuyerRole(user.role)) {
      await loadBuyerOrders(user.id);
    }

    renderAccountForm();
    onLanguageChange(() => {
      translatePageHead("account.pageTitle", "account.pageSubtitle");
      savedFormState = captureFormState(qs(root, "#profile-form"));
      renderAccountForm();
    });
  });
}
