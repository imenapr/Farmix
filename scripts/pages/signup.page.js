import { boot } from "../app/boot.js";
import { signup } from "../app/auth-state.js";
import { toast, qs, setText } from "../app/ui.js";
import { t, onLanguageChange } from "../app/i18n.js";
import { wirePasswordRuleFeedback } from "../data/validators.js";

boot();

const root = document.getElementById("signup-root");
if (!root) throw new Error("Missing #signup-root");

let savedSignupState = null;

function optionalFieldLabel(forId, labelKey) {
  return `
    <label class="form-label form-label-row" for="${forId}">
      <span>${t(labelKey)}</span>
      <span class="form-label-optional">(${t("common.optional")})</span>
    </label>
  `;
}

function captureSignupState() {
  const form = qs(root, "#signup-form");
  if (!form) return null;
  const fd = new FormData(form);
  return {
    ...Object.fromEntries(fd.entries()),
    role: qs(root, "#role-hidden")?.value || "",
  };
}

function restoreSignupState(state) {
  if (!state) return;
  const form = qs(root, "#signup-form");
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
      const farmWrap = qs(root, "[data-cond='farmName']");
      const compWrap = qs(root, "[data-cond='companyName']");
      if (farmWrap) farmWrap.classList.toggle("visible", state.role === "farmer");
      if (compWrap) compWrap.classList.toggle("visible", state.role === "business");
    }
  }
}

function mountSignup() {
  root.innerHTML = `
    <div class="auth-page">
      <div class="auth-card wide">

      <!-- Brand -->
      <a class="auth-brand" href="/index.html">
        <img src="/img/logo.png" alt="FARMIX logo" />
        <span class="auth-brand-name">FARMIX</span>
      </a>

      <!-- Heading -->
      <h1 class="auth-heading">${t("auth.signup.createAccount")}</h1>
      <p class="auth-subheading">${t("auth.signup.subtitle")}</p>

      <!-- Error banner -->
      <p class="form-error-banner" id="err-banner" role="alert"></p>

      <form id="signup-form" novalidate>

        <!-- ── Role picker ── -->
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
        <!-- Hidden radio backing the visual selection -->
        <input type="hidden" name="role" id="role-hidden" value="" />
        <span class="form-error" data-err="role" style="display:block; margin-bottom:0.75rem;"></span>

        <!-- ── Full name ── -->
        <div class="form-field">
          <label class="form-label" for="sf-name">${t("auth.signup.fullName")}</label>
          <input class="input" id="sf-name" name="name"
                 autocomplete="name" placeholder="${t("auth.signup.namePlaceholder")}" required />
          <span class="form-error" data-err="name"></span>
        </div>

        <!-- ── Conditional: Farm name (farmer only, optional) ── -->
        <div class="conditional-field" data-cond="farmName">
          <div class="form-field">
            ${optionalFieldLabel("sf-farmName", "auth.signup.farmName")}
            <input class="input" id="sf-farmName" name="farmName"
                   placeholder="${t("auth.signup.farmNamePlaceholder")}" />
            <span class="form-error" data-err="farmName"></span>
          </div>
        </div>

        <!-- ── Conditional: Company name (business only) ── -->
        <div class="conditional-field" data-cond="companyName">
          <div class="form-field">
          <label class="form-label" for="sf-companyName">${t("auth.signup.companyName")}</label>
            <input class="input" id="sf-companyName" name="companyName"
                   placeholder="${t("auth.signup.companyNamePlaceholder")}" />
            <span class="form-error" data-err="companyName"></span>
          </div>
        </div>

        <!-- ── Location ── -->
        <div class="form-field">
          <label class="form-label" for="sf-location">${t("auth.signup.location")}</label>
          <input class="input" id="sf-location" name="location"
                 autocomplete="address-level2" placeholder="${t("auth.signup.locationPlaceholder")}" required />
          <span class="form-error" data-err="location"></span>
        </div>

        <!-- ── Phone ── -->
        <div class="form-field">
          <label class="form-label" for="sf-phone">${t("auth.signup.phone")}</label>
          <input class="input" id="sf-phone" name="phone"
                 type="tel" autocomplete="tel" inputmode="tel" placeholder="${t("auth.signup.phonePlaceholder")}" required />
          <span class="form-error" data-err="phone"></span>
        </div>

        <!-- ── Email ── -->
        <div class="form-field">
          ${optionalFieldLabel("sf-email", "auth.signup.email")}
          <input class="input" id="sf-email" name="email"
                 type="email" autocomplete="email" placeholder="${t("auth.signup.emailPlaceholder")}" />
          <span class="form-error" data-err="email"></span>
        </div>

        <!-- ── Password ── -->
        <div class="form-field">
          <label class="form-label" for="sf-password">${t("auth.password")}</label>
          <input class="input" id="sf-password" name="password"
                 type="password" autocomplete="new-password" placeholder="${t("auth.signup.passwordPlaceholder")}" required />
          <span class="form-error form-error-multiline" data-err="password"></span>
        </div>

        <button class="btn btn-primary btn-full" type="submit" data-submit>
          ${t("auth.signup.button")}
        </button>

      </form>

      <p class="auth-footer">
        ${t("auth.signup.hasAccount")}
        <a id="login-link" href="/pages/login.html">${t("common.login")}</a>
      </p>

      </div>
    </div>
  `;

  const form = qs(root, "#signup-form");
  restoreSignupState(savedSignupState);
  const submitBtn = qs(root, "[data-submit]");
  const banner = qs(root, "#err-banner");
  const roleInput = qs(root, "#role-hidden");
  const loginLink = qs(root, "#login-link");
  const farmWrap = qs(root, "[data-cond='farmName']");
  const compWrap = qs(root, "[data-cond='companyName']");
  const farmInput = form.elements.namedItem("farmName");
  const compInput = form.elements.namedItem("companyName");
  const passwordInput = form.elements.namedItem("password");
  const passwordError = root.querySelector("[data-err='password']");
  wirePasswordRuleFeedback(passwordInput, passwordError);

// ─── Role picker ─────────────────────────────────────────────────
  const roleCards = root.querySelectorAll(".role-card[data-role]");

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

  const next = new URLSearchParams(location.search).get("next");
  if (next) loginLink.href = `/pages/login.html?next=${encodeURIComponent(next)}`;

// ─── Error helpers ────────────────────────────────────────────────
  const FIELD_KEYS = ["name", "farmName", "companyName", "location", "phone", "email", "password", "role", "form"];

  function clearErrors() {
  setText(banner, "");
  for (const k of FIELD_KEYS) {
    const el = root.querySelector(`[data-err='${k}']`);
    if (el) setText(el, "");
  }
  }

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.textContent = on ? t("auth.signup.loading") : t("auth.signup.button");
  }

// ─── Submit ───────────────────────────────────────────────────────
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    setLoading(true);

    const fd = new FormData(form);
    const res = await signup({
      name: fd.get("name"),
      farmName: fd.get("farmName"),
      companyName: fd.get("companyName"),
      location: fd.get("location"),
      phone: fd.get("phone"),
      email: fd.get("email"),
      password: fd.get("password"),
      role: fd.get("role"),
    });

    if (!res.ok) {
      setLoading(false);
      const fe = res.error.fieldErrors ?? {};
      for (const [k, msg] of Object.entries(fe)) {
        const el = root.querySelector(`[data-err='${k}']`);
        if (el) setText(el, msg);
      }
      setText(banner, res.error.message ?? t("auth.signup.failed"));
      return;
    }

    toast("success", t("auth.signup.toast", { name: res.data.user.name }));
    const role = res.data.user?.role;
    const defaultNext = role === "consumer" ? "/pages/marketplace.html" : "/index.html";
    location.href = next || defaultNext;
  });
}

mountSignup();
onLanguageChange(() => {
  savedSignupState = captureSignupState();
  mountSignup();
});
