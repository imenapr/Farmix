import { escapeHtml } from "../app/ui.js";

export function userInitials(name) {
  return String(name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function renderUserAvatar(user, { size = "sm", className = "" } = {}) {
  const initials = userInitials(user?.name);
  const sizeClass = `user-avatar--${size}`;
  const extra = className ? ` ${className}` : "";

  if (user?.avatarUrl) {
    return `<span class="user-avatar ${sizeClass} user-avatar--photo${extra}" data-user-avatar>
      <img src="${escapeHtml(user.avatarUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" decoding="async" data-avatar-img />
      <span class="user-avatar-fallback" aria-hidden="true">${initials}</span>
    </span>`;
  }

  return `<span class="user-avatar ${sizeClass} user-avatar--initials${extra}" aria-hidden="true">${initials}</span>`;
}

export function wireUserAvatarFallbacks(root = document) {
  root.querySelectorAll("[data-user-avatar] img[data-avatar-img]").forEach((img) => {
    img.addEventListener(
      "error",
      () => {
        img.classList.add("is-hidden");
        img.parentElement?.classList.add("user-avatar--fallback");
      },
      { once: true },
    );
  });
}
