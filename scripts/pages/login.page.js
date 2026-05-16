import { boot } from "../app/boot.js";
import { login } from "../app/auth-state.js";
import { loginWithGoogle } from "../services/auth.service.js";
import { toast, qs, setText } from "../app/ui.js";

boot();

const root = document.getElementById("login-root");
if (!root) throw new Error("Missing #login-root");

root.innerHTML = `
  <div class="auth-page">
    <div class="auth-card">

      <!-- Brand -->
      <a class="auth-brand" href="/index.html">
        <img src="/img/logo.png" alt="FARMIX logo" />
        <span class="auth-brand-name">FARMIX</span>
      </a>

      <!-- Heading -->
      <h1 class="auth-heading">Welcome back.</h1>
      <p class="auth-subheading">Sign in to your account to continue.</p>

      <!-- Error banner -->
      <p class="form-error-banner" id="err-banner" role="alert"></p>

      <!-- Form -->
      <form id="login-form" novalidate>

        <div class="form-field">
          <label class="form-label" for="lf-email">Email address</label>
          <input class="input" id="lf-email" name="email" type="email"
                 autocomplete="email" placeholder="you@example.com" required />
          <span class="form-error" data-err="email"></span>
        </div>

        <div class="form-field">
          <label class="form-label" for="lf-password">Password</label>
          <input class="input" id="lf-password" name="password" type="password"
                 autocomplete="current-password" placeholder="••••••••" required />
          <span class="form-error" data-err="password"></span>
        </div>

        <button class="btn btn-primary btn-full" type="submit" data-submit>
          Log in
        </button>

      </form>

      <!-- Google divider -->
      <div class="auth-divider">or</div>
      <div class="google-btn-wrap" id="google-signin-btn"></div>

      <!-- Footer -->
      <p class="auth-footer">
        Don't have an account?
        <a id="signup-link" href="/pages/signup.html">Sign up</a>
      </p>

    </div>
  </div>
`;

const form      = qs(root, "#login-form");
const submitBtn = qs(root, "[data-submit]");
const banner    = qs(root, "#err-banner");
const errEmail  = qs(root, "[data-err='email']");
const errPass   = qs(root, "[data-err='password']");
const signupLink = qs(root, "#signup-link");

function clearErrors() {
  setText(banner, "");
  setText(errEmail, "");
  setText(errPass, "");
}

function setLoading(on) {
  submitBtn.disabled = on;
  submitBtn.textContent = on ? "Signing in…" : "Log in";
}

function redirectAfterLogin() {
  const next = new URLSearchParams(location.search).get("next");
  location.href = next || "/pages/dashboard.html";
}

const next = new URLSearchParams(location.search).get("next");
if (next) signupLink.href = `/pages/signup.html?next=${encodeURIComponent(next)}`;

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();
  setLoading(true);

  const fd  = new FormData(form);
  const res = await login({ email: fd.get("email"), password: fd.get("password") });

  if (!res.ok) {
    setLoading(false);
    const fe = res.error.fieldErrors ?? {};
    setText(errEmail, fe.email ?? "");
    setText(errPass,  fe.password ?? "");
    setText(banner,   res.error.message ?? "Login failed.");
    return;
  }

  toast("success", `Welcome back, ${res.data.user.name}!`);
  redirectAfterLogin();
});

// ─── Google Sign-In ───────────────────────────────────────────────
window.handleGoogleSignIn = function (response) {
  try {
    const payload = JSON.parse(atob(response.credential.split(".")[1]));
    const result  = loginWithGoogle({ email: payload.email, name: payload.name, picture: payload.picture });
    if (result.ok) {
      toast("success", `Welcome, ${result.data.user.name}!`);
      redirectAfterLogin();
    } else {
      setText(banner, result.error.message ?? "Google sign-in failed.");
    }
  } catch {
    setText(banner, "Google sign-in encountered an error.");
  }
};

if (window.google?.accounts?.id) {
  google.accounts.id.initialize({
    client_id: "466141415598-t1euipvv0mh43ae9uv116isgdrmjrm37.apps.googleusercontent.com",
    callback: window.handleGoogleSignIn,
  });
  google.accounts.id.renderButton(qs(root, "#google-signin-btn"), { theme: "outline", size: "large" });
}
