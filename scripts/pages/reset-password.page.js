import { boot } from "../app/boot.js";
import { completePasswordReset, waitForRecoverySession } from "../app/auth-state.js";
import { toast, qs, setText } from "../app/ui.js";
import { initLanguageFromUrl, getCurrentLang, t, onLanguageChange } from "../app/i18n.js";
import { wirePasswordRuleFeedback, wirePasswordConfirmFeedback } from "../data/validators.js";

initLanguageFromUrl();
boot();

const root = document.getElementById("reset-password-root");
if (!root) throw new Error("Missing #reset-password-root");

let ready = false;
let checked = false;

function renderInvalid() {
  root.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <a class="auth-brand" href="/index.html">
          <img src="/img/logo.png" alt="FARMIX logo" />
          <span class="auth-brand-name">FARMIX</span>
        </a>
        <h1 class="auth-heading">${t("auth.reset.invalidLink")}</h1>
        <p class="auth-subheading">${t("auth.reset.invalidLinkDesc")}</p>
        <div style="display:grid; gap:0.6rem;">
          <a class="btn btn-primary btn-full" href="/pages/forgot-password.html">${t("auth.reset.requestAgain")}</a>
          <a class="btn btn-ghost btn-full" href="/pages/login.html">${t("auth.forgot.backToLogin")}</a>
        </div>
      </div>
    </div>
  `;
}

function mountForm() {
  root.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <a class="auth-brand" href="/index.html">
          <img src="/img/logo.png" alt="FARMIX logo" />
          <span class="auth-brand-name">FARMIX</span>
        </a>

        <h1 class="auth-heading">${t("auth.reset.title")}</h1>
        <p class="auth-subheading">${t("auth.reset.subtitle")}</p>

        <p class="form-error-banner" id="err-banner" role="alert"></p>

        <form id="reset-form" novalidate>
          <div class="form-field">
            <label class="form-label" for="rp-password">${t("auth.reset.newPassword")}</label>
            <input class="input" id="rp-password" name="password" type="password"
                   autocomplete="new-password" placeholder="${t("auth.signup.passwordPlaceholder")}" required />
            <span class="form-error form-error-multiline" data-err="password"></span>
          </div>

          <div class="form-field">
            <label class="form-label" for="rp-confirm">${t("auth.reset.confirmPassword")}</label>
            <input class="input" id="rp-confirm" name="confirmPassword" type="password"
                   autocomplete="new-password" placeholder="${t("auth.signup.passwordPlaceholder")}" required />
            <span class="form-error" data-err="confirmPassword"></span>
          </div>

          <button class="btn btn-primary btn-full" type="submit" data-submit>${t("auth.reset.button")}</button>
        </form>
      </div>
    </div>
  `;

  const form = qs(root, "#reset-form");
  const submitBtn = qs(root, "[data-submit]");
  const banner = qs(root, "#err-banner");
  const fieldKeys = ["password", "confirmPassword"];
  wirePasswordRuleFeedback(form.elements.namedItem("password"), root.querySelector("[data-err='password']"));
  wirePasswordConfirmFeedback(
    form.elements.namedItem("password"),
    form.elements.namedItem("confirmPassword"),
    root.querySelector("[data-err='confirmPassword']"),
  );

  function clearErrors() {
    setText(banner, "");
    for (const key of fieldKeys) {
      setText(root.querySelector(`[data-err='${key}']`), "");
    }
  }

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.textContent = on ? t("auth.reset.saving") : t("auth.reset.button");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    setLoading(true);

    const fd = new FormData(form);
    const res = await completePasswordReset({
      password: fd.get("password"),
      confirmPassword: fd.get("confirmPassword"),
    });

    if (!res.ok) {
      setLoading(false);
      const fe = res.error.fieldErrors ?? {};
      for (const key of fieldKeys) {
        setText(root.querySelector(`[data-err='${key}']`), fe[key] ?? "");
      }
      setText(banner, res.error.message ?? t("auth.reset.failed"));
      return;
    }

    toast("success", t("auth.reset.success"));
    window.location.href = `/pages/login.html?lang=${getCurrentLang()}`;
  });
}

async function init() {
  if (checked) {
    if (ready) mountForm();
    else renderInvalid();
    return;
  }

  root.innerHTML = `<div class="auth-page"><div class="auth-card"><p class="muted">${t("common.loading")}</p></div></div>`;

  const res = await waitForRecoverySession();
  checked = true;
  ready = res.ok;
  if (ready) mountForm();
  else renderInvalid();
}

init();
onLanguageChange(init);
