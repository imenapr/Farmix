import { APP } from "../app/config.js";
import { on } from "../app/events.js";
import { logout, getCurrentUser } from "../app/auth-state.js";
import { getTheme, toggleTheme } from "../app/theme.js";
import { t, getCurrentLang, toggleLanguage, onLanguageChange } from "../app/i18n.js";
import {
  getNotificationsForUser,
  getUnreadCount,
  markNotificationRead,
  markAllRead,
  primeNotificationCache,
} from "../services/notifications.service.js";

// ─── Role state ─────────────────────────────────────────────────────────────
let _role = "guest";
export const getRole = () => _role;
export const setRole = (next) => { _role = next ?? "guest"; };

// ─── Helpers ─────────────────────────────────────────────────────────────────
function roleBadgeClass(role) {
  const map = { farmer: "role-farmer", business: "role-business", consumer: "role-consumer", admin: "role-admin" };
  return map[role] ?? "role-guest";
}

function roleBadgeLabel(role) {
  const map = {
    farmer: t("nav.role.farmer"),
    business: t("nav.role.business"),
    consumer: t("nav.role.consumer"),
    admin: t("nav.role.admin"),
  };
  return map[role] ?? t("nav.role.guest");
}

function roleLinks(role) {
  switch (role) {
    case "farmer":
      return `
        <a href="/pages/farmer-dashboard.html">${t("nav.link.farmerTools")}</a>
        <a href="/pages/marketplace.html">${t("nav.link.marketplace")}</a>
        <a href="/pages/add-listing.html">${t("nav.link.addListing")}</a>
      `;
    case "business":
      return `
        <a href="/pages/marketplace.html">${t("nav.link.marketplace")}</a>
        <a href="/pages/for-businesses.html">${t("nav.link.businessSourcing")}</a>
      `;
    case "consumer":
      return `
        <a href="/pages/marketplace.html">${t("nav.link.marketplace")}</a>
        <a href="/pages/account.html">${t("nav.link.account")}</a>
      `;
    case "admin":
      return `
        <a href="/pages/marketplace.html">${t("nav.link.marketplace")}</a>
        <a href="/pages/admin-panel.html">${t("nav.link.adminPanel")}</a>
        <a href="/pages/add-listing.html">${t("nav.link.addListing")}</a>
      `;
    default:
      return `
        <a href="/pages/marketplace.html">${t("nav.link.browse")}</a>
        <a href="/pages/for-farmers.html">${t("nav.link.forFarmers")}</a>
        <a href="/pages/for-businesses.html">${t("nav.link.forBusinesses")}</a>
      `;
  }
}

function initials(name) {
  return String(name ?? "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function esc(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("common.justNow");
  if (m < 60) return t("common.minutesAgo", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("common.hoursAgo", { n: h });
  return t("common.daysAgo", { n: Math.floor(h / 24) });
}

function themeToggleIcon(theme) {
  if (theme === "dark") {
    return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.64 13a1 1 0 0 0-1.05-.26A8 8 0 1 1 11.3 3.41a1 1 0 0 0-1.31-1.31A10 10 0 1 0 22 14.05a1 1 0 0 0-.36-1.05z"></path></svg>`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a1 1 0 0 1 1-1h0a1 1 0 0 1 0 2h0a1 1 0 0 1-1-1zm0 16a1 1 0 0 1 1-1h0a1 1 0 0 1 0 2h0a1 1 0 0 1-1-1zm8-8a1 1 0 0 1 1-1h0a1 1 0 0 1 0 2h0a1 1 0 0 1-1-1zM4 12a1 1 0 0 1 1-1h0a1 1 0 0 1 0 2h0a1 1 0 0 1-1-1zm13.66-5.66a1 1 0 0 1 1.41 0h0a1 1 0 0 1-1.41 1.41h0a1 1 0 0 1 0-1.41zM5.34 18.66a1 1 0 0 1 1.41 0h0a1 1 0 0 1-1.41 1.41h0a1 1 0 0 1 0-1.41zm12.32 1.41a1 1 0 0 1 0-1.41h0a1 1 0 0 1 1.41 1.41h0a1 1 0 0 1-1.41 0zM5.34 7.75a1 1 0 0 1 0-1.41h0a1 1 0 0 1 1.41 1.41h0a1 1 0 0 1-1.41 0zM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"></path></svg>`;
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderNav({ user } = {}) {
  const isAuthed   = Boolean(user);
  const role       = user?.role ?? "guest";
  const theme      = getTheme();
  setRole(role);

  const badgeClass   = roleBadgeClass(role);
  const badgeLabel   = roleBadgeLabel(role);
  const userInitials = isAuthed ? initials(user.name) : "";
  const lang = getCurrentLang();

  const bellHtml = isAuthed ? `
    <div class="notif-bell-wrap" id="notif-bell-wrap">
      <button
        class="notif-bell-btn"
        type="button"
        id="notif-bell-btn"
        aria-label="${t("nav.notifications")}"
        aria-haspopup="true"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        <span class="notif-badge" id="notif-badge" style="display:none;">0</span>
      </button>
      <div class="notif-dropdown" id="notif-dropdown" role="region" aria-label="${t("nav.notifications")}">
        <div class="notif-dropdown-header">
          <span class="notif-dropdown-title">${t("nav.notifications")}</span>
          <button class="notif-mark-all" type="button" id="notif-mark-all">${t("nav.markAllRead")}</button>
        </div>
        <div class="notif-list" id="notif-list">
          <div class="notif-empty">${t("nav.allCaughtUp")}</div>
        </div>
      </div>
    </div>
  ` : "";

  return `
    <header class="nav" role="banner">
      <div class="container nav-inner">

        <!-- Brand -->
        <a class="brand" href="/index.html" aria-label="${APP.name} home">
          <img src="/img/logo.png" alt="${APP.name} logo" />
          <span class="brand-name">${APP.name}</span>
        </a>

        <!-- Nav links (hidden on mobile) -->
        <nav class="nav-links" aria-label="Primary navigation">
          ${roleLinks(role)}
          <span class="nav-role-badge ${badgeClass}" aria-label="${t("nav.viewingAs", { role: badgeLabel })}">
            ${badgeLabel}
          </span>
        </nav>

        <!-- Actions -->
        <div class="nav-actions">
          <button
            class="lang-toggle"
            type="button"
            data-action="lang-toggle"
            aria-label="${lang === "en" ? t("nav.switchToGeorgian") : t("nav.switchToEnglish")}"
            title="${lang === "en" ? t("lang.english") : t("lang.georgian")}"
          >
            <img
              class="lang-toggle-flag"
              src="${lang === "en" ? "/img/ENG.png" : "/img/GEO.png"}"
              alt=""
              aria-hidden="true"
              width="22"
              height="22"
            />
          </button>
          <button
            class="theme-toggle"
            type="button"
            data-action="theme-toggle"
            aria-label="${theme === "dark" ? t("nav.toggleThemeLight") : t("nav.toggleThemeDark")}"
            title="${theme === "dark" ? t("nav.switchToLight") : t("nav.switchToDark")}"
          >
            ${themeToggleIcon(theme)}
          </button>
          ${isAuthed ? `<a class="nav-messages-link" href="/pages/messages.html" aria-label="${t("nav.messages")}" title="${t("nav.messages")}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </a>` : ""}
          ${bellHtml}
          ${isAuthed ? `
            <a class="nav-user" href="../../pages/account.html" aria-label="${t("nav.openAccount")}">
                <span class="nav-avatar" aria-hidden="true">
                ${userInitials}
                </span>

                 ${esc(user.name)}
            </a>
            <button class="btn btn-ghost" type="button" data-action="logout">${t("common.logout")}</button>
          ` : `
            <a class="btn btn-ghost" href="/pages/login.html">${t("common.login")}</a>
            <a class="btn btn-primary" href="/pages/signup.html">${t("common.signUp")}</a>
          `}
        </div>

      </div>
    </header>
  `;
}


// ─── Mount ────────────────────────────────────────────────────────────────────
export function mountNavbar(targetEl) {
  if (!targetEl) return () => {};

  // Track subscriptions to clean up on each re-render
  let _unsubNotif    = null;
  let _docClickOff   = null;
  let _docKeydownOff = null;

  function render(payload) {
    // Clean up previous dynamic subscriptions before re-rendering
    if (_unsubNotif)  { _unsubNotif();  _unsubNotif  = null; }
    if (_docClickOff) { _docClickOff(); _docClickOff = null; }
    if (_docKeydownOff) { _docKeydownOff(); _docKeydownOff = null; }

    targetEl.innerHTML = renderNav(payload);

    // ── Logout ────────────────────────────────────────────────────────
    const logoutBtn = targetEl.querySelector("[data-action='logout']");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        logoutBtn.disabled = true;
        await logout();
        location.href = "/index.html";
      });
    }

    // ── Theme toggle ──────────────────────────────────────────────────
    const themeBtn = targetEl.querySelector("[data-action='theme-toggle']");
    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        toggleTheme();
        render(payload);
      });
    }

    const langBtn = targetEl.querySelector("[data-action='lang-toggle']");
    if (langBtn) {
      langBtn.addEventListener("click", () => {
        toggleLanguage();
      });
    }

    // ── Notification bell ─────────────────────────────────────────────
    if (!payload?.user) return;

    const userId     = payload.user.id;
    const bellBtn    = targetEl.querySelector("#notif-bell-btn");
    const bellWrap   = targetEl.querySelector("#notif-bell-wrap");
    const notifBadge = targetEl.querySelector("#notif-badge");
    const notifList  = targetEl.querySelector("#notif-list");
    const markAllBtn = targetEl.querySelector("#notif-mark-all");

    if (!bellBtn) return;

    function updateBadge() {
      const count = getUnreadCount(userId);
      if (!notifBadge) return;
      if (count > 0) {
        notifBadge.textContent = count > 9 ? "9+" : String(count);
        notifBadge.style.display = "flex";
      } else {
        notifBadge.style.display = "none";
      }
    }

    function renderNotifItems() {
      if (!notifList) return;
      getNotificationsForUser(userId, { limit: 12 }).then((res) => {
        const items = res.ok ? res.data : [];
        if (!items.length) {
          notifList.innerHTML = `<div class="notif-empty">${t("nav.allCaughtUp")}</div>`;
          return;
        }
        notifList.innerHTML = items.map((n) => `
        <div class="notif-item${n.read ? "" : " unread"}" data-notif-id="${esc(n.id)}" role="button" tabindex="0">
          <div class="notif-item-dot"></div>
          <div class="notif-item-body">
            <div class="notif-msg">${esc(n.message)}</div>
            <div class="notif-time">${timeAgo(n.createdAt)}</div>
          </div>
        </div>
      `).join("");

        notifList.querySelectorAll("[data-notif-id]").forEach((item) => {
          const id = item.dataset.notifId;
          const found = items.find((n) => String(n.id) === id);
          const isMessage = found?.type === "message";
          const markRead = () => {
            markNotificationRead(id, userId);
            item.classList.remove("unread");
            item.querySelector(".notif-item-dot")?.classList.add("read");
            updateBadge();
            if (isMessage) {
              const fromUserId = found?.metadata?.fromUserId;
              const listingId = found?.metadata?.listingId;
              const qp = new URLSearchParams();
              if (fromUserId) qp.set("user", fromUserId);
              if (listingId) qp.set("listing", listingId);
              location.href = `/pages/messages.html${qp.toString() ? `?${qp}` : ""}`;
            }
          };
          item.addEventListener("click", markRead);
          item.addEventListener("keydown", (e) => { if (e.key === "Enter") markRead(); });
        });
      });
    }

    // Toggle dropdown on bell click
    bellBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isNowOpen = bellWrap?.classList.toggle("open");
      if (isNowOpen) {
        renderNotifItems();
        updateBadge();
        bellBtn.setAttribute("aria-expanded", "true");
      } else {
        bellBtn.setAttribute("aria-expanded", "false");
      }
    });

    // Close on outside click — tracked so it can be removed on re-render
    const docClickHandler = (e) => {
      if (bellWrap && !bellWrap.contains(e.target)) {
        bellWrap.classList.remove("open");
        bellBtn.setAttribute("aria-expanded", "false");
      }
    };
    document.addEventListener("click", docClickHandler);
    _docClickOff = () => document.removeEventListener("click", docClickHandler);

    // Close on Escape
    const keydownHandler = (e) => {
      if (e.key === "Escape" && bellWrap?.classList.contains("open")) {
        bellWrap.classList.remove("open");
        bellBtn.setAttribute("aria-expanded", "false");
        bellBtn.focus();
      }
    };
    document.addEventListener("keydown", keydownHandler);
    _docKeydownOff = () => document.removeEventListener("keydown", keydownHandler);

    // Mark all read
    if (markAllBtn) {
      markAllBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        markAllRead(userId).then(() => {
          renderNotifItems();
          updateBadge();
        });
      });
    }

    primeNotificationCache(userId).then(updateBadge);

    // Subscribe to notification changes to update badge live
    const refreshBadge = ({ userId: changedFor }) => {
      if (changedFor !== userId) return;
      // Force a fresh read so the cached unread count is recomputed.
      primeNotificationCache(userId).then(() => {
        updateBadge();
        if (bellWrap?.classList.contains("open")) renderNotifItems();
      });
    };
    const offNotif = on("notifications:changed", refreshBadge);
    const offMsg = on("messages:changed", refreshBadge);
    _unsubNotif = () => { offNotif(); offMsg(); };

    updateBadge();
  }

  render({ user: null });
  const unsubAuth = on("auth:changed", render);
  const unsubLang = onLanguageChange(() => {
    render({ user: getCurrentUser() });
  });

  return () => {
    if (_unsubNotif)  _unsubNotif();
    if (_docClickOff) _docClickOff();
    if (_docKeydownOff) _docKeydownOff();
    unsubAuth();
    unsubLang();
  };
}
