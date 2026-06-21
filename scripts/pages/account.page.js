import { boot } from "../app/boot.js";
import { guardAuth } from "../app/router-guards.js";
import { toast, qs, setText, escapeHtml } from "../app/ui.js";
import { logout as doLogout } from "../app/auth-state.js";
import { initAppState } from "../app/state.js";
import { formatAuthIdentifier } from "../lib/auth-email.js";
import { updateProfile } from "../services/users.service.js";
import { t, onLanguageChange, translatePageHead } from "../app/i18n.js";

boot();
translatePageHead("account.pageTitle", "account.pageSubtitle");

const root = document.getElementById("account-root");
let accountUser = null;
let accountRecord = null;
let savedFormState = null;

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
  `;

  const form = qs(root, "#profile-form");
  const submitBtn = qs(root, "[data-submit]");
  const logoutBtn = qs(root, "[data-logout]");

  const setVal = (name, value) => {
    const el = form.elements.namedItem(name);
    if (el) el.value = value ?? "";
  };

  setVal("name", record.name);
  setVal("phone", record.phone);
  setVal("bio", record.bio);
  setVal("farmName", record.farmName);
  setVal("companyName", record.companyName);
  restoreFormState(form, savedFormState);

  const err = (k) => qs(root, `[data-err='${k}']`);
  const errForm = err("form");

  function clearErrors() {
    for (const k of ["name", "phone", "bio", "farmName", "companyName", "form"]) setText(err(k), "");
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

if (root) {
  guardAuth().then(async (user) => {
    if (!user) return;
    accountUser = user;
    accountRecord = user;
    renderAccountForm();
    onLanguageChange(() => {
      translatePageHead("account.pageTitle", "account.pageSubtitle");
      savedFormState = captureFormState(qs(root, "#profile-form"));
      renderAccountForm();
    });
  });
}
