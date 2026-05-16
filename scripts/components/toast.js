import { on, off } from "../app/events.js";
import { escapeHtml } from "../app/ui.js";

function ensureHost() {
  let host = document.querySelector("[data-toast-host]");
  if (host) return host;
  host = document.createElement("div");
  host.className = "toast-host";
  host.setAttribute("data-toast-host", "true");
  document.body.appendChild(host);
  return host;
}

function titleFor(type) {
  switch (type) {
    case "success":
      return "Success";
    case "error":
      return "Something went wrong";
    default:
      return "FYI";
  }
}

export function initToasts() {
  const host = ensureHost();

  const handler = ({ type = "info", message = "" } = {}) => {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.dataset.type = type;
    toast.innerHTML = `
      <p class="toast-title">${escapeHtml(titleFor(type))}</p>
      <p class="toast-body">${escapeHtml(message)}</p>
    `;

    host.appendChild(toast);

    window.setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(6px)";
      toast.style.transition = "opacity 180ms var(--ease-out), transform 180ms var(--ease-out)";
      window.setTimeout(() => toast.remove(), 210);
    }, 3200);
  };

  on("toast", handler);

  return () => off("toast", handler);
}

