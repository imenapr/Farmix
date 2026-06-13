import { initAppState, login, getCurrentUser } from "../app/auth-state.js";
import { ADMIN_ACCESS_KEY, ROLES } from "../app/config.js";
import { initToasts } from "../components/toast.js";
import { emit } from "../app/events.js";
import { initTheme } from "../app/theme.js";

initTheme();
initToasts();

function admToast(type, message) {
  emit("toast", { type, message });
}

initAppState().then(() => {
  const verified = sessionStorage.getItem("farmix.admin.verified");
  const user = getCurrentUser();
  if (verified && user?.role === ROLES.admin && !user.suspended) {
    location.replace("/pages/admin-panel.html");
  }
});

const form = document.getElementById("admin-login-form");
const emailInput = document.getElementById("email");
const passInput = document.getElementById("password");
const keyInput = document.getElementById("access-key");
const errBanner = document.getElementById("login-err");
const submitBtn = document.getElementById("login-btn");

function showBanner(msg) {
  errBanner.textContent = msg;
  errBanner.classList.add("show");
}
function hideBanner() {
  errBanner.classList.remove("show");
}
function fieldErr(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  const input = el.previousElementSibling;
  if (input) input.classList.toggle("error", !!msg);
}
function clearErrors() {
  hideBanner();
  fieldErr("email-err", "");
  fieldErr("password-err", "");
  fieldErr("access-key-err", "");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();

  const email = emailInput.value.trim();
  const password = passInput.value;
  const key = keyInput.value.trim();

  let hasErr = false;
  if (!email) { fieldErr("email-err", "Email is required."); hasErr = true; }
  if (!password) { fieldErr("password-err", "Password is required."); hasErr = true; }
  if (!key) { fieldErr("access-key-err", "Access key is required."); hasErr = true; }
  if (hasErr) return;

  if (key !== ADMIN_ACCESS_KEY) {
    fieldErr("access-key-err", "Invalid access key.");
    admToast("error", "Invalid Admin Access Key. Access denied.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Signing in…";

  const result = await login({ email, password });

  if (!result.ok) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Sign in to Admin";
    const code = result.error?.code;
    if (code === "ACCOUNT_SUSPENDED") {
      showBanner(result.error.message);
    } else if (result.error?.fieldErrors) {
      if (result.error.fieldErrors.email) fieldErr("email-err", result.error.fieldErrors.email);
      if (result.error.fieldErrors.password) fieldErr("password-err", result.error.fieldErrors.password);
    } else {
      showBanner(result.error?.message ?? "Login failed. Check your credentials.");
    }
    return;
  }

  if (result.data.user.role !== ROLES.admin) {
    submitBtn.disabled = false;
    submitBtn.textContent = "Sign in to Admin";
    showBanner("This account does not have admin privileges.");
    return;
  }

  sessionStorage.setItem("farmix.admin.verified", "1");
  location.replace("/pages/admin-panel.html");
});
