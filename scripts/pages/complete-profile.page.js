import { boot } from "../app/boot.js";
import { completeOAuthRole, userNeedsRoleSelection, getCurrentUser, initAppState } from "../app/auth-state.js";
import { toast, qs, setText } from "../app/ui.js";
import { t, onLanguageChange } from "../app/i18n.js";

boot();

const root = document.getElementById("complete-profile-root");
if (!root) throw new Error("Missing #complete-profile-root");

let savedFormState = null;

function optionalFieldLabel(forId, labelKey) {
  return `
    <label class="form-label form-label-row" for="${forId}">
      <span>${t(labelKey)}</span>
      <span class="form-label-optional">(${t("common.optional")})</span>
    </label>
  `;
}

function captureFormState() {
  const form = qs(root, "#complete-profile-form");
  if (!form) return null;
  const fd = new FormData(form);
  return {
    ...Object.fromEntries(fd.entries()),
    role: qs(root, "#role-hidden")?.value || "",
  };
}

function restoreFormState(state) {
  if (!state) return;
  const form = qs(root, "#complete-profile-form");
  if (!form) return;

  for (const [name, value] of Object.entries(state)) {
    if (name === "role") continue;
    const el = form.elements.namedItem(name);
    if (el) el.value = value ?? "";
  }

  if (state.role) {
    const roleInput = qs(root, "#role-hidden");
    const card = root.querySelector(`.role-card[data-role='${state.role}']`);
    if (roleInput && card) {
      roleInput.value = state.role;
      root.querySelectorAll(".role-card[data-role]").forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      syncConditionalFields(state.role);
    }
  }
}

async function ensureAccess() {
  await initAppState();
  const user = getCurrentUser();
  if (!user) {
    location.href = "/pages/login.html?next=%2Fpages%2Fcomplete-profile.html";
    return false;
  }

  const pending = await userNeedsRoleSelection();
  if (!pending) {
    location.href = "/index.html";
    return false;
  }

  return true;
}

function render() {
  root.innerHTML = `
    <div class="auth-page">
      <div class="auth-card wide">
        <a class="auth-brand" href="/index.html">
          <img src="/img/logo.png" alt="FARMIX logo" />
          <span class="auth-brand-name">FARMIX</span>
        </a>

        <h1 class="auth-heading">${t("auth.completeProfile.title")}</h1>
        <p class="auth-subheading">${t("auth.completeProfile.subtitle")}</p>

        <p class="form-error-banner" id="err-banner" role="alert"></p>

        <form id="complete-profile-form" novalidate>
          <span class="role-section-label">${t("auth.signup.iAmA")}</span>
          <div class="role-grid" id="role-grid">
            <button type="button" class="role-card" data-role="farmer">
              <span class="role-card-check" aria-hidden="true">&#10003;</span>
              <span class="role-card-icon">&#127807;</span>
              <span class="role-card-title">${t("auth.signup.farmer")}</span>
              <span class="role-card-desc">${t("auth.signup.farmerDesc")}</span>
            </button>

            <button type="button" class="role-card" data-role="business">
              <span class="role-card-check" aria-hidden="true">&#10003;</span>
              <span class="role-card-icon">&#127978;</span>
              <span class="role-card-title">${t("auth.signup.business")}</span>
              <span class="role-card-desc">${t("auth.signup.businessDesc")}</span>
            </button>

            <button type="button" class="role-card" data-role="consumer">
              <span class="role-card-check" aria-hidden="true">&#10003;</span>
              <span class="role-card-icon">&#128722;</span>
              <span class="role-card-title">${t("auth.signup.consumer")}</span>
              <span class="role-card-desc">${t("auth.signup.consumerDesc")}</span>
            </button>
          </div>

          <input type="hidden" name="role" id="role-hidden" value="" />
          <span class="form-error" data-err="role" style="display:block; margin-bottom:0.75rem;"></span>

          <div class="conditional-field" data-cond="farmName">
            <div class="form-field">
              ${optionalFieldLabel("cp-farmName", "auth.signup.farmName")}
              <input class="input" id="cp-farmName" name="farmName"
                     placeholder="${t("auth.signup.farmNamePlaceholder")}" />
              <span class="form-error" data-err="farmName"></span>
            </div>
          </div>

          <div class="conditional-field" data-cond="companyName">
            <div class="form-field">
              <label class="form-label" for="cp-companyName">${t("auth.signup.companyName")}</label>
              <input class="input" id="cp-companyName" name="companyName"
                     placeholder="${t("auth.signup.companyNamePlaceholder")}" />
              <span class="form-error" data-err="companyName"></span>
            </div>
          </div>

          <div class="form-field">
            <label class="form-label" for="cp-phone">${t("auth.signup.phone")}</label>
            <input class="input" id="cp-phone" name="phone"
                   type="tel" autocomplete="tel" inputmode="tel"
                   placeholder="${t("auth.signup.phonePlaceholder")}" required />
            <span class="form-error" data-err="phone"></span>
          </div>

          <button class="btn btn-primary btn-full" type="submit" data-submit>
            ${t("auth.completeProfile.button")}
          </button>
        </form>
      </div>
    </div>
  `;

  const form = qs(root, "#complete-profile-form");
  restoreFormState(savedFormState);

  const submitBtn = qs(root, "[data-submit]");
  const banner = qs(root, "#err-banner");
  const roleInput = qs(root, "#role-hidden");
  const roleCards = root.querySelectorAll(".role-card[data-role]");
  const farmWrap = qs(root, "[data-cond='farmName']");
  const compWrap = qs(root, "[data-cond='companyName']");
  const farmInput = form.elements.namedItem("farmName");
  const compInput = form.elements.namedItem("companyName");

  function syncConditionalFields(role) {
    const isFarmer = role === "farmer";
    const isBusiness = role === "business";
    farmWrap.classList.toggle("visible", isFarmer);
    compWrap.classList.toggle("visible", isBusiness);
    if (!isFarmer) farmInput.value = "";
    if (!isBusiness) compInput.value = "";
  }

  roleCards.forEach((card) => {
    card.addEventListener("click", () => {
      roleCards.forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      roleInput.value = card.dataset.role;
      syncConditionalFields(card.dataset.role);
      setText(root.querySelector("[data-err='role']"), "");
    });
  });

  if (roleInput.value) syncConditionalFields(roleInput.value);

  const FIELD_KEYS = ["role", "phone", "farmName", "companyName"];

  function clearErrors() {
    setText(banner, "");
    for (const k of FIELD_KEYS) {
      const el = root.querySelector(`[data-err='${k}']`);
      if (el) setText(el, "");
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();

    const fd = new FormData(form);
    submitBtn.disabled = true;
    submitBtn.textContent = t("auth.completeProfile.loading");

    const res = await completeOAuthRole({
      role: fd.get("role"),
      phone: fd.get("phone"),
      farmName: fd.get("farmName"),
      companyName: fd.get("companyName"),
    });

    if (!res.ok) {
      submitBtn.disabled = false;
      submitBtn.textContent = t("auth.completeProfile.button");
      const fe = res.error.fieldErrors ?? {};
      for (const [k, msg] of Object.entries(fe)) {
        const el = root.querySelector(`[data-err='${k}']`);
        if (el) setText(el, msg);
      }
      setText(banner, res.error.message ?? t("auth.completeProfile.failed"));
      toast("error", res.error.message ?? t("auth.completeProfile.failed"));
      return;
    }

    toast("success", t("auth.completeProfile.toast", { name: res.data.user.name }));
    location.href = "/index.html";
  });
}

async function start() {
  const allowed = await ensureAccess();
  if (!allowed) return;
  render();
  onLanguageChange(() => {
    savedFormState = captureFormState();
    render();
  });
}

start();
