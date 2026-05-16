/**
 * Dashboard Shell — self-contained layout component.
 *
 * Usage:
 *   const { sections, activate } = mountDashboardShell({
 *     mountEl : document.getElementById("dash-mount"),
 *     user    : guardRole([...]),
 *     navLinks: FARMER_NAV,          // [{ id, label, icon }]
 *   });
 *   // Then render content into sections[id] elements
 */

import { logout } from "../app/auth-state.js";
import { getTheme, toggleTheme } from "../app/theme.js";

// ─── Inline SVG icons (Heroicons Outline) ────────────────────────
const P = {
  grid:     `<path stroke-linecap="round" stroke-linejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>`,
  tag:      `<path stroke-linecap="round" stroke-linejoin="round" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"/>`,
  inbox:    `<path stroke-linecap="round" stroke-linejoin="round" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"/>`,
  chart:    `<path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>`,
  store:    `<path stroke-linecap="round" stroke-linejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/>`,
  clock:    `<path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>`,
  heart:    `<path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>`,
  trending: `<path stroke-linecap="round" stroke-linejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>`,
  menu:     `<path stroke-linecap="round" stroke-linejoin="round" d="M4 6h16M4 12h16M4 18h16"/>`,
  x:        `<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>`,
  chevron:  `<path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>`,
  settings: `<path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z"/>`,
  signout:  `<path stroke-linecap="round" stroke-linejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>`,
  home:     `<path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>`,
};

export const ICONS = P;

export function svg(path, size = 18) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" class="dash-icon">${path}</svg>`;
}

function themeIcon(theme) {
  if (theme === "dark") {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.64 13a1 1 0 0 0-1.05-.26A8 8 0 1 1 11.3 3.41a1 1 0 0 0-1.31-1.31A10 10 0 1 0 22 14.05a1 1 0 0 0-.36-1.05z"/></svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 4a1 1 0 0 1 1-1h0a1 1 0 0 1 0 2h0a1 1 0 0 1-1-1zm0 16a1 1 0 0 1 1-1h0a1 1 0 0 1 0 2h0a1 1 0 0 1-1-1zm8-8a1 1 0 0 1 1-1h0a1 1 0 0 1 0 2h0a1 1 0 0 1-1-1zM4 12a1 1 0 0 1 1-1h0a1 1 0 0 1 0 2h0a1 1 0 0 1-1-1zm13.66-5.66a1 1 0 0 1 1.41 0h0a1 1 0 0 1-1.41 1.41h0a1 1 0 0 1 0-1.41zM5.34 18.66a1 1 0 0 1 1.41 0h0a1 1 0 0 1-1.41 1.41h0a1 1 0 0 1 0-1.41zm12.32 1.41a1 1 0 0 1 0-1.41h0a1 1 0 0 1 1.41 1.41h0a1 1 0 0 1-1.41 0zM5.34 7.75a1 1 0 0 1 0-1.41h0a1 1 0 0 1 1.41 1.41h0a1 1 0 0 1-1.41 0zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/></svg>`;
}

function initials(name) {
  return String(name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function formatDate() {
  return new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month:   "short",
    day:     "numeric",
  });
}

// ─── Main export ──────────────────────────────────────────────────
/**
 * @param {{ mountEl: HTMLElement, user: object, navLinks: Array<{id:string,label:string,icon:string}> }} config
 * @returns {{ sections: Record<string, HTMLElement>, activate: (id:string)=>void }}
 */
export function mountDashboardShell({ mountEl, user, navLinks }) {
  const role       = user?.role ?? "guest";
  const userInit   = initials(user?.name);
  const roleBadge  = role === "farmer" ? "farmer" : "business";
  const currentTheme = getTheme();

  // ─── Sidebar nav HTML ──────────────────────────────────────────
  const navHtml = navLinks.map((link) => `
    <a class="dash-nav-link" data-section="${link.id}" role="button" tabindex="0">
      ${svg(link.icon)}
      ${link.label}
    </a>
  `).join("");

  // ─── Shell HTML ────────────────────────────────────────────────
  mountEl.innerHTML = `
    <div class="dash-shell">

      <!-- Mobile overlay -->
      <div class="dash-overlay" id="dash-overlay"></div>

      <!-- Sidebar -->
      <aside class="dash-aside" id="dash-aside" role="navigation" aria-label="Dashboard navigation">

        <!-- Brand -->
        <a class="dash-brand" href="/index.html">
          <img src="/img/logo.png" alt="FARMIX logo" />
          <span class="dash-brand-name">FARMIX</span>
        </a>

        <!-- Role label -->
        <div class="dash-nav-section-label">
          ${role === "farmer" ? "Farm management" : role === "business" ? "Business tools" : "Navigation"}
        </div>

        <!-- Nav links -->
        <nav class="dash-nav" id="dash-nav">
          ${navHtml}
        </nav>

        <!-- Sidebar footer -->
        <div class="dash-sidebar-footer">
          <a class="dash-nav-link" href="/pages/marketplace.html">
            ${svg(P.store)}
            Marketplace
          </a>
          <a class="dash-nav-link" href="/index.html">
            ${svg(P.home)}
            Back to Home
          </a>
        </div>

      </aside>

      <!-- Main column -->
      <div class="dash-main">

        <!-- Top bar -->
        <header class="dash-topbar">
          <div class="dash-topbar-left">
            <button class="dash-hamburger" id="dash-hamburger" aria-label="Toggle menu">
              ${svg(P.menu, 20)}
            </button>
            <h1 class="dash-page-title" id="dash-page-title">${navLinks[0]?.label ?? "Dashboard"}</h1>
          </div>

          <button
            class="dash-theme-toggle"
            id="dash-theme-toggle"
            type="button"
            aria-label="Toggle ${currentTheme === "dark" ? "light" : "dark"} mode"
            title="Switch to ${currentTheme === "dark" ? "light" : "dark"} mode"
          >
            ${themeIcon(currentTheme)}
          </button>

          <!-- Profile dropdown -->
          <div class="dash-profile" id="dash-profile">
            <button class="dash-profile-btn" id="dash-profile-btn" aria-haspopup="true" aria-expanded="false">
              <span class="dash-profile-avatar">${userInit}</span>
              <span class="dash-profile-name">${user?.name ?? ""}</span>
              ${svg(P.chevron, 14)}
            </button>

            <div class="dash-profile-menu" id="dash-profile-menu" role="menu">
              <!-- User info -->
              <div class="dash-profile-header">
                <div class="dash-profile-full-name">${user?.name ?? ""}</div>
                <span class="dash-profile-role-badge ${roleBadge}">
                  ${role === "farmer" ? "Farmer" : role === "business" ? "Business" : role}
                </span>
              </div>

              <!-- Items -->
              <a class="dash-menu-item" href="/pages/account.html" role="menuitem">
                ${svg(P.settings, 16)}
                Account Settings
              </a>
              <div class="dash-menu-divider"></div>
              <button class="dash-menu-item danger" id="dash-logout-btn" role="menuitem">
                ${svg(P.signout, 16)}
                Log out
              </button>
            </div>
          </div>
        </header>

        <!-- Content area -->
        <div class="dash-content" id="dash-content">
          ${navLinks.map((l) => `<div class="dash-section" id="dash-sec-${l.id}" data-section-id="${l.id}"></div>`).join("")}
        </div>

      </div>
    </div>
  `;

  // ─── Grab elements ─────────────────────────────────────────────
  const aside      = mountEl.querySelector("#dash-aside");
  const overlay    = mountEl.querySelector("#dash-overlay");
  const hamburger  = mountEl.querySelector("#dash-hamburger");
  const profileWrap = mountEl.querySelector("#dash-profile");
  const profileBtn = mountEl.querySelector("#dash-profile-btn");
  const themeBtn   = mountEl.querySelector("#dash-theme-toggle");
  const pageTitle  = mountEl.querySelector("#dash-page-title");
  const logoutBtn  = mountEl.querySelector("#dash-logout-btn");
  const navEl      = mountEl.querySelector("#dash-nav");

  // Build sections map
  /** @type {Record<string, HTMLElement>} */
  const sections = {};
  for (const link of navLinks) {
    sections[link.id] = mountEl.querySelector(`#dash-sec-${link.id}`);
  }

  // ─── Section activation ─────────────────────────────────────────
  function activate(id) {
    // Validate id
    if (!sections[id]) id = navLinks[0]?.id;

    // Show target section, hide others
    for (const [k, el] of Object.entries(sections)) {
      el.classList.toggle("active", k === id);
    }

    // Update nav link active states
    navEl.querySelectorAll(".dash-nav-link[data-section]").forEach((link) => {
      link.classList.toggle("active", link.dataset.section === id);
    });

    // Update topbar title
    const active = navLinks.find((l) => l.id === id);
    if (pageTitle && active) pageTitle.textContent = active.label;

    // Persist to URL hash (without scroll jump)
    history.replaceState(null, "", `#${id}`);

    // Close mobile sidebar
    closeSidebar();
  }

  // ─── Sidebar toggle (mobile) ────────────────────────────────────
  function openSidebar() {
    aside.classList.add("open");
    overlay.classList.add("visible");
    document.body.style.overflow = "hidden";
  }

  function closeSidebar() {
    aside.classList.remove("open");
    overlay.classList.remove("visible");
    document.body.style.overflow = "";
  }

  hamburger.addEventListener("click", () => {
    aside.classList.contains("open") ? closeSidebar() : openSidebar();
  });

  overlay.addEventListener("click", closeSidebar);

  // Keyboard accessibility for sidebar
  aside.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSidebar();
  });

  // ─── Nav link clicks ─────────────────────────────────────────────
  navEl.addEventListener("click", (e) => {
    const link = e.target.closest(".dash-nav-link[data-section]");
    if (!link) return;
    e.preventDefault();
    activate(link.dataset.section);
  });

  navEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const link = e.target.closest(".dash-nav-link[data-section]");
      if (link) { e.preventDefault(); activate(link.dataset.section); }
    }
  });

  // ─── Profile dropdown ────────────────────────────────────────────
  profileBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = profileWrap.classList.toggle("open");
    profileBtn.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("click", (e) => {
    if (!profileWrap.contains(e.target)) {
      profileWrap.classList.remove("open");
      profileBtn.setAttribute("aria-expanded", "false");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      profileWrap.classList.remove("open");
      profileBtn.setAttribute("aria-expanded", "false");
    }
  });

  themeBtn?.addEventListener("click", () => {
    const next = toggleTheme();
    themeBtn.innerHTML = themeIcon(next);
    themeBtn.setAttribute("aria-label", `Toggle ${next === "dark" ? "light" : "dark"} mode`);
    themeBtn.setAttribute("title", `Switch to ${next === "dark" ? "light" : "dark"} mode`);
  });

  // ─── Logout ──────────────────────────────────────────────────────
  logoutBtn.addEventListener("click", () => {
    logout();
    location.href = "/index.html";
  });

  // ─── Initial activation from URL hash ────────────────────────────
  const initialId = location.hash.slice(1) || navLinks[0]?.id;
  activate(initialId);

  return { sections, activate };
}

// ─── Welcome banner helper ────────────────────────────────────────
/**
 * Builds the glassmorphism welcome banner HTML.
 * @param {{ name: string, subtitle: string, actions?: string }} opts
 */
export function renderWelcomeBanner({ name, subtitle, actions = "" }) {
  return `
    <div class="dash-welcome">
      <div class="dash-welcome-inner">
        <div>
          <h2 class="dash-welcome-greeting">Welcome back, ${name}!</h2>
          <p class="dash-welcome-sub">${subtitle}</p>
        </div>
        <span class="dash-welcome-date">
          ${svg(P.clock, 14)}
          ${formatDate()}
        </span>
      </div>
      ${actions ? `<div class="dash-quick-actions">${actions}</div>` : ""}
    </div>
  `;
}

// ─── Stat card helper ─────────────────────────────────────────────
/**
 * @param {Array<{icon:string, value:string|number, label:string, badge?:string, badgeType?:'success'|'neutral'}>} stats
 */
export function renderStatGrid(stats) {
  const cards = stats.map(({ icon, value, label, badge, badgeType = "neutral" }) => `
    <div class="dash-stat-card">
      <div class="dash-stat-icon-wrap">${svg(icon, 18)}</div>
      <div class="dash-stat-value">${value}</div>
      <div class="dash-stat-label">${label}</div>
      ${badge ? `<div class="dash-stat-badge ${badgeType}">${badge}</div>` : ""}
    </div>
  `).join("");
  return `<div class="dash-stat-grid">${cards}</div>`;
}

// ─── Coming soon placeholder helper ──────────────────────────────
/**
 * @param {{ icon: string, title: string, desc: string }} opts
 */
export function renderComingSoon({ icon, title, desc }) {
  return `
    <div class="dash-coming-soon">
      <div class="dash-coming-icon">${svg(icon, 26)}</div>
      <span class="dash-coming-label">Coming soon</span>
      <h3 class="dash-coming-title">${title}</h3>
      <p class="dash-coming-desc">${desc}</p>
    </div>
  `;
}
