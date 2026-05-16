import { emit } from "./events.js";

export function debounce(fn, ms) {
  /** @type {number | undefined} */
  let t;
  return (...args) => {
    window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), ms);
  };
}

export function toast(type, message) {
  emit("toast", { type, message });
}

export function qs(root, selector) {
  const el = root.querySelector(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
}

export function setText(el, text) {
  el.textContent = text;
}

export function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderStateBlock({ title, description, actionsHtml = "" }) {
  return `
    <section class="state-block">
      <h2 class="state-title">${escapeHtml(title)}</h2>
      <p class="state-desc">${escapeHtml(description)}</p>
      ${actionsHtml ? `<div style="margin-top:0.85rem; display:flex; gap:0.6rem; flex-wrap:wrap;">${actionsHtml}</div>` : ""}
    </section>
  `;
}

export function renderSkeletonCards(count = 6) {
  const items = Array.from({ length: count }, () => {
    return `
      <div class="card" style="padding: 0.85rem;">
        <div class="skeleton" style="height: 140px;"></div>
        <div style="height: 12px;"></div>
        <div class="skeleton" style="height: 14px; width: 72%;"></div>
        <div style="height: 10px;"></div>
        <div class="skeleton" style="height: 14px; width: 46%;"></div>
      </div>
    `;
  }).join("");
  return `<div class="grid cols-3">${items}</div>`;
}

