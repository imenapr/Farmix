import { boot } from "../app/boot.js";
import { requestPasswordReset } from "../app/auth-state.js";
import { qs, setText } from "../app/ui.js";
import { t, onLanguageChange } from "../app/i18n.js";

boot();

const root = document.getElementById("forgot-password-root");
if (!root) throw new Error("Missing #forgot-password-root");

let sent = false;
let savedEmail = "";

function mount() {
  if (sent) {
    root.innerHTML = `
      <div class="auth-page">
        <div class="auth-card">
          <a class="auth-brand" href="/index.html">
            <img src="/img/logo.png" alt="FARMIX logo" />
            <span class="auth-brand-name">FARMIX</span>
          </a>
          <h1 class="auth-heading">${t("auth.forgot.sentTitle")}</h1>
          <p class="auth-subheading">${t("auth.forgot.sentDesc")}</p>
          <a class="btn btn-primary btn-full" href="/pages/login.html">${t("auth.forgot.backToLogin")}</a>
        </div>
      </div>
    `;
    return;
  }

  root.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <a class="auth-brand" href="/index.html">
          <img src="/img/logo.png" alt="FARMIX logo" />
          <span class="auth-brand-name">FARMIX</span>
        </a>

        <h1 class="auth-heading">${t("auth.forgot.title")}</h1>
        <p class="auth-subheading">${t("auth.forgot.subtitle")}</p>

        <p class="form-error-banner" id="err-banner" role="alert"></p>

        <form id="forgot-form" novalidate>
          <div class="form-field">
            <label class="form-label" for="fp-email">${t("auth.forgot.email")}</label>
            <input class="input" id="fp-email" name="email" type="email"
                   autocomplete="email" placeholder="${t("auth.signup.emailPlaceholder")}" required />
            <span class="form-error" data-err="email"></span>
          </div>

          <button class="btn btn-primary btn-full" type="submit" data-submit>${t("auth.forgot.button")}</button>
        </form>

        <p class="auth-footer">
          <a href="/pages/login.html">${t("auth.forgot.backToLogin")}</a>
        </p>
      </div>
    </div>
  `;

  const form = qs(root, "#forgot-form");
  const submitBtn = qs(root, "[data-submit]");
  const banner = qs(root, "#err-banner");
  const emailInput = qs(root, "#fp-email");
  if (savedEmail) emailInput.value = savedEmail;

  function clearErrors() {
    setText(banner, "");
    setText(root.querySelector("[data-err='email']"), "");
  }

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.textContent = on ? t("auth.forgot.sending") : t("auth.forgot.button");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    setLoading(true);

    const fd = new FormData(form);
    const res = await requestPasswordReset({ email: fd.get("email") });

    if (!res.ok) {
      setLoading(false);
      const fe = res.error.fieldErrors ?? {};
      setText(root.querySelector("[data-err='email']"), fe.email ?? "");
      setText(banner, res.error.message ?? t("auth.forgot.failed"));
      return;
    }

    savedEmail = String(fd.get("email") ?? "");
    sent = true;
    mount();
  });
}

mount();
onLanguageChange(mount);
