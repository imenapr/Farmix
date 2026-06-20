import { t } from "../app/i18n.js";

const EYE_OPEN_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
  <circle cx="12" cy="12" r="3"/>
</svg>`;

const EYE_CLOSED_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
  <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
  <line x1="1" y1="1" x2="23" y2="23"/>
</svg>`;

export function renderPasswordToggleButton() {
  return `
    <button type="button" class="password-toggle" aria-label="${t("auth.showPassword")}" aria-pressed="false">
      <span class="password-toggle-icon password-toggle-icon--show" aria-hidden="true">${EYE_OPEN_SVG}</span>
      <span class="password-toggle-icon password-toggle-icon--hide" aria-hidden="true" hidden>${EYE_CLOSED_SVG}</span>
    </button>
  `;
}

function syncToggleState(input, btn) {
  const visible = input.type === "text";
  btn.setAttribute("aria-pressed", visible ? "true" : "false");
  btn.setAttribute("aria-label", visible ? t("auth.hidePassword") : t("auth.showPassword"));

  const showIcon = btn.querySelector(".password-toggle-icon--show");
  const hideIcon = btn.querySelector(".password-toggle-icon--hide");
  if (showIcon) showIcon.hidden = visible;
  if (hideIcon) hideIcon.hidden = !visible;
}

/** Wire show/hide toggles for all `.password-input-wrap` fields under `root`. */
export function mountPasswordToggles(root = document) {
  const wraps = root.querySelectorAll(".password-input-wrap");
  const cleanups = [];

  wraps.forEach((wrap) => {
    const input = wrap.querySelector("input");
    const btn = wrap.querySelector(".password-toggle");
    if (!input || !btn) return;

    syncToggleState(input, btn);

    const onClick = () => {
      input.type = input.type === "password" ? "text" : "password";
      syncToggleState(input, btn);
    };

    btn.addEventListener("click", onClick);
    cleanups.push(() => btn.removeEventListener("click", onClick));
  });

  return () => {
    cleanups.forEach((fn) => fn());
  };
}
