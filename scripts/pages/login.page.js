import { boot } from "../app/boot.js";
import { login } from "../app/auth-state.js";
import { toast, qs, setText } from "../app/ui.js";
import { initLanguageFromUrl, t, onLanguageChange, getCurrentLang } from "../app/i18n.js";

initLanguageFromUrl();
boot();

const root = document.getElementById("login-root");
if (!root) throw new Error("Missing #login-root");

function redirectAfterLogin() {
  const next = new URLSearchParams(location.search).get("next");
  location.href = next || "/index.html";
}

function render() {
  root.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <a class="auth-brand" href="/index.html">
          <img src="/img/logo.png" alt="FARMIX logo" />
          <span class="auth-brand-name">FARMIX</span>
        </a>

        <h1 class="auth-heading">${t("auth.login.welcomeBack")}</h1>
        <p class="auth-subheading">${t("auth.login.subtitle")}</p>

        <p class="form-error-banner" id="err-banner" role="alert"></p>

        <form id="login-form" novalidate>
          <div class="form-field">
            <label class="form-label" for="lf-email">${t("auth.login.emailOrPhone")}</label>
            <input class="input" id="lf-email" name="email" type="text"
                   autocomplete="username" placeholder="${t("auth.login.emailOrPhonePlaceholder")}" />
            <span class="form-error" data-err="email"></span>
          </div>

          <div class="form-field">
            <label class="form-label" for="lf-password">${t("auth.password")}</label>
            <input class="input" id="lf-password" name="password" type="password"
                   autocomplete="current-password" placeholder="••••••••" required />
            <span class="form-error" data-err="password"></span>
          </div>

          <p class="auth-forgot">
            <a href="/pages/forgot-password.html?lang=${getCurrentLang()}">${t("auth.login.forgotPassword")}</a>
          </p>

          <button class="btn btn-primary btn-full" type="submit" data-submit>${t("auth.login.button")}</button>
        </form>

        <p class="auth-footer">
          ${t("auth.login.noAccount")}
          <a id="signup-link" href="/pages/signup.html">${t("common.signUp")}</a>
        </p>
      </div>
    </div>
  `;

  const form = qs(root, "#login-form");
  const submitBtn = qs(root, "[data-submit]");
  const banner = qs(root, "#err-banner");
  const errEmail = qs(root, "[data-err='email']");
  const errPass = qs(root, "[data-err='password']");
  const signupLink = qs(root, "#signup-link");

  function clearErrors() {
    setText(banner, "");
    setText(errEmail, "");
    setText(errPass, "");
  }

  function setLoading(on) {
    submitBtn.disabled = on;
    submitBtn.textContent = on ? t("auth.login.loading") : t("auth.login.button");
  }

  const next = new URLSearchParams(location.search).get("next");
  if (next) signupLink.href = `/pages/signup.html?next=${encodeURIComponent(next)}`;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    setLoading(true);

    const fd = new FormData(form);
    const res = await login({ email: fd.get("email"), password: fd.get("password") });

    if (!res.ok) {
      setLoading(false);
      const fe = res.error.fieldErrors ?? {};
      setText(errEmail, fe.email ?? "");
      setText(errPass, fe.password ?? "");
      setText(banner, res.error.message ?? t("auth.login.failed"));
      return;
    }

    toast("success", t("auth.login.toast", { name: res.data.user.name }));
    redirectAfterLogin();
  });
}

render();
onLanguageChange(render);
