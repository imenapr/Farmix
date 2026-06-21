import { boot } from "../app/boot.js";
import { guardAuth } from "../app/router-guards.js";
import { toast, qs, setText, escapeHtml, renderStateBlock, mountListingCardLinks } from "../app/ui.js";
import { logout as doLogout } from "../app/auth-state.js";
import { formatAuthIdentifier } from "../lib/auth-email.js";
import { updateProfile } from "../services/users.service.js";
import { uploadUserAvatar } from "../services/avatar.service.js";
import { listFavoritesForUser, removeFavorite } from "../services/favorites.service.js";
import { renderUserAvatar, wireUserAvatarFallbacks } from "../components/user-avatar.js";
import { renderListingCard } from "../components/listing-card.js";
import { getDisplayCurrency } from "../lib/currency.js";
import { t, onLanguageChange, translatePageHead } from "../app/i18n.js";

boot();
translatePageHead("account.pageTitle", "account.pageSubtitle");

const root = document.getElementById("account-root");
let accountUser = null;
let accountRecord = null;
let savedFormState = null;
let favoriteListings = null;
let favoritesLoading = false;

function captureFormState(form) {
  if (!form) return null;
  const fd = new FormData(form);
  return Object.fromEntries(fd.entries());
}

function restoreFormState(form, state) {
  if (!form || !state) return;
  for (const [name, value] of Object.entries(state)) {
    const el = form.elements.namedItem(name);
    if (el) el.value = value ?? "";
  }
}

function ensureProfileSection() {
  if (!root.querySelector("[data-profile-section]")) {
    root.innerHTML = `<div data-profile-section></div>`;
  }
  return root.querySelector("[data-profile-section]");
}

function renderFavoritesSection() {
  const existing = root?.querySelector("[data-favorites-section]");
  if (existing) existing.remove();
  if (!root || !accountUser) return;

  const section = document.createElement("section");
  section.className = "card pad account-favorites";
  section.dataset.favoritesSection = "true";

  if (favoritesLoading) {
    section.innerHTML = `
      <header class="account-favorites-head">
        <h2 class="account-favorites-title">${escapeHtml(t("account.favoritesTitle"))}</h2>
        <p class="muted account-favorites-subtitle">${escapeHtml(t("account.favoritesSubtitle"))}</p>
      </header>
      <div class="account-favorites-grid">
        <div class="skeleton" style="height: 220px; border-radius: 18px;"></div>
        <div class="skeleton" style="height: 220px; border-radius: 18px;"></div>
      </div>
    `;
    root.appendChild(section);
    return;
  }

  const listings = favoriteListings ?? [];
  const currency = getDisplayCurrency();

  section.innerHTML = `
    <header class="account-favorites-head">
      <h2 class="account-favorites-title">${escapeHtml(t("account.favoritesTitle"))}</h2>
      <p class="muted account-favorites-subtitle">${escapeHtml(t("account.favoritesSubtitle"))}</p>
    </header>
    ${
      listings.length
        ? `
      <div class="account-favorites-grid" data-favorites-grid>
        ${listings
          .map(
            (listing) => `
          <div class="account-favorite-item" data-favorite-item="${escapeHtml(listing.id)}">
            ${renderListingCard(listing, { compact: true, currency })}
            <button
              type="button"
              class="btn btn-ghost btn-sm account-favorite-remove"
              data-remove-favorite="${escapeHtml(listing.id)}"
              aria-label="${escapeHtml(t("favorites.removeAria"))}: ${escapeHtml(listing.title)}"
            >
              ${escapeHtml(t("favorites.remove"))}
            </button>
          </div>
        `,
          )
          .join("")}
      </div>
    `
        : renderStateBlock({
            title: t("favorites.empty"),
            actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">${escapeHtml(t("favorites.browse"))}</a>`,
          })
    }
  `;

  root.appendChild(section);

  const grid = section.querySelector("[data-favorites-grid]");
  if (grid) {
    mountListingCardLinks(grid);
    grid.querySelectorAll("[data-remove-favorite]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const listingId = btn.getAttribute("data-remove-favorite");
        if (!listingId || !accountUser) return;

        btn.disabled = true;
        const res = await removeFavorite(accountUser.id, listingId);
        if (!res.ok) {
          btn.disabled = false;
          toast("error", res.error.message ?? t("favorites.failed"));
          return;
        }

        favoriteListings = (favoriteListings ?? []).filter((item) => String(item.id) !== String(listingId));
        toast("success", t("favorites.removed"));
        renderFavoritesSection();
      });
    });
  }
}

async function loadFavorites() {
  if (!accountUser) return;
  favoritesLoading = true;
  renderFavoritesSection();

  const res = await listFavoritesForUser(accountUser.id);
  favoritesLoading = false;
  favoriteListings = res.ok ? res.data : [];
  if (!res.ok) toast("error", res.error.message ?? t("favorites.failed"));
  renderFavoritesSection();
}

function renderAccountForm() {
  if (!accountUser || !accountRecord) return;

  const profileRoot = ensureProfileSection();
  const record = accountRecord;
  const isFarmer = record.role === "farmer";
  const isBusiness = record.role === "business";
  const roleLabel = {
    farmer: t("nav.role.farmer"),
    business: t("nav.role.business"),
    consumer: t("nav.role.consumer"),
    admin: t("nav.role.admin"),
  }[record.role] ?? record.role;

  profileRoot.innerHTML = `
    <section class="card pad" style="max-width: 720px;">
      <form id="profile-form" class="stack" novalidate>
        <div class="account-avatar-block">
          <div class="account-avatar-preview" id="avatar-preview">
            ${renderUserAvatar(record, { size: "lg" })}
          </div>
          <input type="file" id="avatar-file" accept="image/jpeg,image/png,image/webp" hidden />
          <button type="button" class="account-avatar-change" id="avatar-change-btn">${t("account.changePhoto")}</button>
          <span class="error-text" data-err="avatar"></span>
        </div>

        <div class="muted" style="font-size: var(--text-sm);">
          ${t("account.signedInAs")} <strong>${escapeHtml(formatAuthIdentifier(record))}</strong> · ${t("common.role")} <strong>${roleLabel}</strong>
        </div>

        <div class="grid" style="grid-template-columns: 1fr; gap: 0.85rem;">
          <label class="stack" style="gap:0.35rem;">
            <span style="font-weight: 700;">${t("common.name")}</span>
            <input class="input" name="name" required />
            <span class="error-text" data-err="name"></span>
          </label>
        </div>

        <div class="grid" style="grid-template-columns: 1fr; gap: 0.85rem;">
          <label class="stack" style="gap:0.35rem;">
            <span style="font-weight: 700;">${t("account.phoneOptional")}</span>
            <input class="input" name="phone" />
            <span class="error-text" data-err="phone"></span>
          </label>
          <label class="stack" style="gap:0.35rem;">
            <span style="font-weight: 700;">${t("account.bioOptional")}</span>
            <textarea class="textarea" name="bio" rows="3"></textarea>
            <span class="error-text" data-err="bio"></span>
          </label>
        </div>

        <div class="grid" style="grid-template-columns: 1fr; gap: 0.85rem;">
          ${
            isFarmer
              ? `
          <label class="stack" style="gap:0.35rem;">
            <span style="font-weight: 700;">${t("account.farmNameOptional")}</span>
            <input class="input" name="farmName" />
            <span class="error-text" data-err="farmName"></span>
          </label>`
              : ""
          }
          ${
            isBusiness
              ? `
          <label class="stack" style="gap:0.35rem;">
            <span style="font-weight: 700;">${t("account.companyName")}</span>
            <input class="input" name="companyName" />
            <span class="error-text" data-err="companyName"></span>
          </label>`
              : ""
          }
        </div>

        <p class="error-text" data-err="form" style="margin:0;"></p>

        <div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center;">
          <button class="btn btn-primary" type="submit" data-submit>${t("common.saveChanges")}</button>
          <button class="btn btn-ghost" type="button" data-logout>${t("common.logout")}</button>
        </div>
      </form>
    </section>
  `;

  const form = qs(profileRoot, "#profile-form");
  const submitBtn = qs(profileRoot, "[data-submit]");
  const logoutBtn = qs(profileRoot, "[data-logout]");
  const avatarPreview = qs(profileRoot, "#avatar-preview");
  const avatarFileInput = qs(profileRoot, "#avatar-file");
  const avatarChangeBtn = qs(profileRoot, "#avatar-change-btn");
  const avatarErr = qs(profileRoot, "[data-err='avatar']");

  wireUserAvatarFallbacks(avatarPreview);

  function setAvatarPreview(user) {
    avatarPreview.innerHTML = renderUserAvatar(user, { size: "lg" });
    wireUserAvatarFallbacks(avatarPreview);
  }

  avatarChangeBtn?.addEventListener("click", () => {
    avatarFileInput?.click();
  });

  avatarFileInput?.addEventListener("change", async () => {
    const file = avatarFileInput.files?.[0];
    avatarFileInput.value = "";
    if (!file) return;

    setText(avatarErr, "");
    const previewUrl = URL.createObjectURL(file);
    const previewUser = { ...accountRecord, avatarUrl: previewUrl };
    setAvatarPreview(previewUser);

    avatarChangeBtn.disabled = true;
    const res = await uploadUserAvatar(accountUser.id, file);
    URL.revokeObjectURL(previewUrl);
    avatarChangeBtn.disabled = false;

    if (!res.ok) {
      setAvatarPreview(accountRecord);
      const msg = res.error.fieldErrors?.avatar ?? res.error.message ?? t("account.avatarUploadFailed");
      setText(avatarErr, msg);
      toast("error", msg);
      return;
    }

    accountRecord = res.data;
    setAvatarPreview(accountRecord);
    toast("success", t("account.avatarUpdated"));
  });

  const setVal = (name, value) => {
    const el = form.elements.namedItem(name);
    if (el) el.value = value ?? "";
  };

  setVal("name", record.name);
  setVal("phone", record.phone);
  setVal("bio", record.bio);
  setVal("farmName", record.farmName);
  setVal("companyName", record.companyName);
  restoreFormState(form, savedFormState);

  const err = (k) => qs(profileRoot, `[data-err='${k}']`);
  const errForm = err("form");

  function clearErrors() {
    for (const k of ["name", "phone", "bio", "farmName", "companyName", "form"]) setText(err(k), "");
  }

  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.textContent = isLoading ? t("common.saving") : t("common.saveChanges");
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors();
    setLoading(true);

    const fd = new FormData(form);
    const res = await updateProfile(accountUser.id, {
      name: fd.get("name"),
      phone: fd.get("phone"),
      bio: fd.get("bio"),
      farmName: fd.get("farmName"),
      companyName: fd.get("companyName"),
    });

    if (!res.ok) {
      setLoading(false);
      for (const [k, msg] of Object.entries(res.error.fieldErrors ?? {})) {
        const el = profileRoot.querySelector(`[data-err='${k}']`);
        if (el) el.textContent = msg;
      }
      setText(errForm, res.error.message ?? t("service.fixHighlighted"));
      return;
    }

    accountRecord = res.data;
    setLoading(false);
    toast("success", t("account.profileUpdated"));
  });

  logoutBtn.addEventListener("click", async () => {
    await doLogout();
    toast("success", t("account.loggedOut"));
    location.href = "/index.html";
  });

  renderFavoritesSection();
}

if (root) {
  guardAuth().then(async (user) => {
    if (!user) return;
    accountUser = user;
    accountRecord = user;
    renderAccountForm();
    loadFavorites();
    onLanguageChange(() => {
      translatePageHead("account.pageTitle", "account.pageSubtitle");
      savedFormState = captureFormState(root.querySelector("#profile-form"));
      renderAccountForm();
    });
  });
}
