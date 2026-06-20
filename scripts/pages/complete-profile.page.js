import { boot } from "../app/boot.js";
import { completeOAuthRole, userNeedsRoleSelection, getCurrentUser, initAppState } from "../app/auth-state.js";
import { toast, qs, setText } from "../app/ui.js";
import { t, onLanguageChange } from "../app/i18n.js";

boot();

const root = document.getElementById("complete-profile-root");
if (!root) throw new Error("Missing #complete-profile-root");

async function ensureAccess() {
  await initAppState();
  const user = getCurrentUser();
  if (!user) {
    location.href = "/pages/login.html?next=%2Fpages%2Fcomplete-profile.html";
    return false;
  }

  const pending = await userNeedsRoleSelection();
  if (!pending) {
    location.href = "/index.html";
    return false;
  }

  return true;
}

function render() {
  root.innerHTML = `
    <div class="auth-page">
      <div class="auth-card wide">
        <a class="auth-brand" href="/index.html">
          <img src="/img/logo.png" alt="FARMIX logo" />
          <span class="auth-brand-name">FARMIX</span>
        </a>

        <h1 class="auth-heading">${t("auth.completeProfile.title")}</h1>
        <p class="auth-subheading">${t("auth.completeProfile.subtitle")}</p>

        <p class="form-error-banner" id="err-banner" role="alert"></p>

        <form id="complete-profile-form" novalidate>
          <span class="role-section-label">${t("auth.signup.iAmA")}</span>
          <div class="role-grid" id="role-grid">
            <button type="button" class="role-card" data-role="farmer">
              <span class="role-card-check" aria-hidden="true">&#10003;</span>
              <span class="role-card-icon">&#127807;</span>
              <span class="role-card-title">${t("auth.signup.farmer")}</span>
              <span class="role-card-desc">${t("auth.signup.farmerDesc")}</span>
            </button>

            <button type="button" class="role-card" data-role="business">
              <span class="role-card-check" aria-hidden="true">&#10003;</span>
              <span class="role-card-icon">&#127978;</span>
              <span class="role-card-title">${t("auth.signup.business")}</span>
              <span class="role-card-desc">${t("auth.signup.businessDesc")}</span>
            </button>

            <button type="button" class="role-card" data-role="consumer">
              <span class="role-card-check" aria-hidden="true">&#10003;</span>
              <span class="role-card-icon">&#128722;</span>
              <span class="role-card-title">${t("auth.signup.consumer")}</span>
              <span class="role-card-desc">${t("auth.signup.consumerDesc")}</span>
            </button>
          </div>

          <input type="hidden" name="role" id="role-hidden" value="" />
          <span class="form-error" data-err="role" style="display:block; margin-bottom:0.75rem;"></span>

          <button class="btn btn-primary btn-full" type="submit" data-submit>
            ${t("auth.completeProfile.button")}
          </button>
        </form>
      </div>
    </div>
  `;

  const form = qs(root, "#complete-profile-form");
  const submitBtn = qs(root, "[data-submit]");
  const banner = qs(root, "#err-banner");
  const roleInput = qs(root, "#role-hidden");
  const roleCards = root.querySelectorAll(".role-card[data-role]");

  roleCards.forEach((card) => {
    card.addEventListener("click", () => {
      roleCards.forEach((c) => c.classList.remove("selected"));
      card.classList.add("selected");
      roleInput.value = card.dataset.role;
      setText(root.querySelector("[data-err='role']"), "");
    });
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    setText(banner, "");
    setText(root.querySelector("[data-err='role']"), "");

    const role = roleInput.value;
    if (!role) {
      setText(root.querySelector("[data-err='role']"), t("service.roleInvalid"));
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = t("auth.completeProfile.loading");

    const res = await completeOAuthRole(role);

    if (!res.ok) {
      submitBtn.disabled = false;
      submitBtn.textContent = t("auth.completeProfile.button");
      const fe = res.error.fieldErrors ?? {};
      if (fe.role) setText(root.querySelector("[data-err='role']"), fe.role);
      setText(banner, res.error.message ?? t("auth.completeProfile.failed"));
      toast("error", res.error.message ?? t("auth.completeProfile.failed"));
      return;
    }

    toast("success", t("auth.completeProfile.toast", { name: res.data.user.name }));
    location.href = "/index.html";
  });
}

async function start() {
  const allowed = await ensureAccess();
  if (!allowed) return;
  render();
  onLanguageChange(render);
}

start();
