import { getCurrentUser } from "../app/auth-state.js";
import { t, onLanguageChange } from "../app/i18n.js";

let mounted = false;
let backdropEl = null;
let titleEl = null;
let loginEl = null;
let signupEl = null;
let closeBtnEl = null;
let eyebrowEl = null;
let subEl = null;
let customTitle = null;

function currentPathWithQuery() {
  return `${location.pathname}${location.search}${location.hash}`;
}

function nextUrl(path = currentPathWithQuery()) {
  return `/pages/login.html?next=${encodeURIComponent(path)}`;
}

function signupUrl(path = currentPathWithQuery()) {
  return `/pages/signup.html?next=${encodeURIComponent(path)}`;
}

function applyStaticText() {
  if (!backdropEl) return;
  if (eyebrowEl) eyebrowEl.textContent = t("guestGate.eyebrow");
  if (subEl) subEl.textContent = t("guestGate.sub");
  if (loginEl) loginEl.textContent = t("guestGate.login");
  if (signupEl) signupEl.textContent = t("guestGate.signup");
  if (closeBtnEl) closeBtnEl.setAttribute("aria-label", t("guestGate.close"));
  if (titleEl) titleEl.textContent = customTitle || t("guestGate.title");
}

function ensureModal() {
  if (mounted) return;
  const host = document.createElement("div");
  host.className = "guest-gate-backdrop";
  host.setAttribute("aria-hidden", "true");
  host.innerHTML = `
    <div class="guest-gate-modal" role="dialog" aria-modal="true" aria-labelledby="guest-gate-title">
      <button class="guest-gate-close" type="button" aria-label="${t("guestGate.close")}">×</button>
      <div class="guest-gate-eyebrow">${t("guestGate.eyebrow")}</div>
      <h3 class="guest-gate-title" id="guest-gate-title">${t("guestGate.title")}</h3>
      <p class="guest-gate-sub">${t("guestGate.sub")}</p>
      <div class="guest-gate-actions">
        <a class="btn btn-ghost guest-gate-login" href="/pages/login.html">${t("guestGate.login")}</a>
        <a class="btn btn-primary guest-gate-signup" href="/pages/signup.html">${t("guestGate.signup")}</a>
      </div>
    </div>
  `;
  document.body.appendChild(host);
  mounted = true;

  backdropEl = host;
  titleEl = host.querySelector("#guest-gate-title");
  eyebrowEl = host.querySelector(".guest-gate-eyebrow");
  subEl = host.querySelector(".guest-gate-sub");
  loginEl = host.querySelector(".guest-gate-login");
  signupEl = host.querySelector(".guest-gate-signup");
  closeBtnEl = host.querySelector(".guest-gate-close");

  closeBtnEl?.addEventListener("click", closeGuestGate);
  host.addEventListener("click", (e) => {
    if (e.target === host) closeGuestGate();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeGuestGate();
  });

  onLanguageChange(applyStaticText);
}

export function openGuestGate({
  title,
  next = currentPathWithQuery(),
} = {}) {
  ensureModal();
  if (!backdropEl || !titleEl || !loginEl || !signupEl) return;
  customTitle = title || null;
  applyStaticText();
  loginEl.href = nextUrl(next);
  signupEl.href = signupUrl(next);
  backdropEl.classList.add("open");
  backdropEl.setAttribute("aria-hidden", "false");
}

export function closeGuestGate() {
  if (!backdropEl) return;
  backdropEl.classList.remove("open");
  backdropEl.setAttribute("aria-hidden", "true");
}

export function mountGuestActionGates() {
  ensureModal();
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-guest-gate]");
    if (!trigger) return;
    if (getCurrentUser()) return;
    e.preventDefault();
    openGuestGate({
      title: trigger.getAttribute("data-guest-gate-title") || undefined,
      next: trigger.getAttribute("data-guest-next") || currentPathWithQuery(),
    });
  });
}
