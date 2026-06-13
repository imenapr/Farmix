import { getCurrentUser } from "../app/auth-state.js";

let mounted = false;
let backdropEl = null;
let titleEl = null;
let loginEl = null;
let signupEl = null;
let closeBtnEl = null;

function currentPathWithQuery() {
  return `${location.pathname}${location.search}${location.hash}`;
}

function nextUrl(path = currentPathWithQuery()) {
  return `/pages/login.html?next=${encodeURIComponent(path)}`;
}

function signupUrl(path = currentPathWithQuery()) {
  return `/pages/signup.html?next=${encodeURIComponent(path)}`;
}

function ensureModal() {
  if (mounted) return;
  const host = document.createElement("div");
  host.className = "guest-gate-backdrop";
  host.setAttribute("aria-hidden", "true");
  host.innerHTML = `
    <div class="guest-gate-modal" role="dialog" aria-modal="true" aria-labelledby="guest-gate-title">
      <button class="guest-gate-close" type="button" aria-label="Close">×</button>
      <div class="guest-gate-eyebrow">Guest Preview</div>
      <h3 class="guest-gate-title" id="guest-gate-title">Join the FARMIX community to start trading!</h3>
      <p class="guest-gate-sub">Create your free account or log in to continue this action.</p>
      <div class="guest-gate-actions">
        <a class="btn btn-ghost guest-gate-login" href="/pages/login.html">Login</a>
        <a class="btn btn-primary guest-gate-signup" href="/pages/signup.html">Create Free Account</a>
      </div>
    </div>
  `;
  document.body.appendChild(host);
  mounted = true;

  backdropEl = host;
  titleEl = host.querySelector("#guest-gate-title");
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
}

export function openGuestGate({
  title = "Join the FARMIX community to start trading!",
  next = currentPathWithQuery(),
} = {}) {
  ensureModal();
  if (!backdropEl || !titleEl || !loginEl || !signupEl) return;
  titleEl.textContent = title;
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
