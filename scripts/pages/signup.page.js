import { boot } from "../app/boot.js";
import { signup } from "../app/auth-state.js";
import { toast, qs, setText } from "../app/ui.js";

boot();

const root = document.getElementById("signup-root");
if (!root) throw new Error("Missing #signup-root");

root.innerHTML = `
  <div class="auth-page">
    <div class="auth-card wide">

      <!-- Brand -->
      <a class="auth-brand" href="/index.html">
        <img src="/img/logo.png" alt="FARMIX logo" />
        <span class="auth-brand-name">FARMIX</span>
      </a>

      <!-- Heading -->
      <h1 class="auth-heading">Create your account.</h1>
      <p class="auth-subheading">Join the FARMIX marketplace in seconds.</p>

      <!-- Error banner -->
      <p class="form-error-banner" id="err-banner" role="alert"></p>

      <form id="signup-form" novalidate>

        <!-- ── Role picker ── -->
        <span class="role-section-label">I am a&hellip;</span>
        <div class="role-grid" id="role-grid">

          <button type="button" class="role-card" data-role="farmer">
            <span class="role-card-check" aria-hidden="true">&#10003;</span>
            <span class="role-card-icon">&#127807;</span>
            <span class="role-card-title">Farmer</span>
            <span class="role-card-desc">I grow and sell fresh produce from my farm</span>
          </button>

          <button type="button" class="role-card" data-role="business">
            <span class="role-card-check" aria-hidden="true">&#10003;</span>
            <span class="role-card-icon">&#127978;</span>
            <span class="role-card-title">Business Buyer</span>
            <span class="role-card-desc">I source fresh produce in bulk for my business</span>
          </button>

        </div>
        <!-- Hidden radio backing the visual selection -->
        <input type="hidden" name="role" id="role-hidden" value="" />
        <span class="form-error" data-err="role" style="display:block; margin-bottom:0.75rem;"></span>

        <!-- ── Full name ── -->
        <div class="form-field">
          <label class="form-label" for="sf-name">Full name</label>
          <input class="input" id="sf-name" name="name"
                 autocomplete="name" placeholder="Jane Doe" required />
          <span class="form-error" data-err="name"></span>
        </div>

        <!-- ── Conditional: Farm name (farmer only) ── -->
        <div class="conditional-field" data-cond="farmName">
          <div class="form-field">
            <label class="form-label" for="sf-farmName">Farm name</label>
            <input class="input" id="sf-farmName" name="farmName"
                   placeholder="Green Acres Farm" />
            <span class="form-error" data-err="farmName"></span>
          </div>
        </div>

        <!-- ── Conditional: Company name (business only) ── -->
        <div class="conditional-field" data-cond="companyName">
          <div class="form-field">
            <label class="form-label" for="sf-companyName">Company name</label>
            <input class="input" id="sf-companyName" name="companyName"
                   placeholder="Fresh Eats Ltd." />
            <span class="form-error" data-err="companyName"></span>
          </div>
        </div>

        <!-- ── Location ── -->
        <div class="form-field">
          <label class="form-label" for="sf-location">Location</label>
          <input class="input" id="sf-location" name="location"
                 autocomplete="address-level2" placeholder="City, State" required />
          <span class="form-error" data-err="location"></span>
        </div>

        <!-- ── Email ── -->
        <div class="form-field">
          <label class="form-label" for="sf-email">Email address</label>
          <input class="input" id="sf-email" name="email"
                 type="email" autocomplete="email" placeholder="you@example.com" required />
          <span class="form-error" data-err="email"></span>
        </div>

        <!-- ── Password ── -->
        <div class="form-field">
          <label class="form-label" for="sf-password">Password</label>
          <input class="input" id="sf-password" name="password"
                 type="password" autocomplete="new-password" placeholder="Min. 8 characters" required />
          <span class="form-error" data-err="password"></span>
        </div>

        <button class="btn btn-primary btn-full" type="submit" data-submit>
          Create account
        </button>

      </form>

      <p class="auth-footer">
        Already have an account?
        <a id="login-link" href="/pages/login.html">Log in</a>
      </p>

    </div>
  </div>
`;

const form      = qs(root, "#signup-form");
const submitBtn = qs(root, "[data-submit]");
const banner    = qs(root, "#err-banner");
const roleInput = qs(root, "#role-hidden");
const loginLink = qs(root, "#login-link");
const farmWrap  = qs(root, "[data-cond='farmName']");
const compWrap  = qs(root, "[data-cond='companyName']");
const farmInput = form.elements.namedItem("farmName");
const compInput = form.elements.namedItem("companyName");

// ─── Role picker ─────────────────────────────────────────────────
const roleCards = root.querySelectorAll(".role-card[data-role]");

function syncConditionalFields(role) {
  const isFarmer   = role === "farmer";
  const isBusiness = role === "business";

  farmWrap.classList.toggle("visible", isFarmer);
  compWrap.classList.toggle("visible", isBusiness);

  if (!isFarmer)   farmInput.value = "";
  if (!isBusiness) compInput.value = "";
}

roleCards.forEach((card) => {
  card.addEventListener("click", () => {
    roleCards.forEach((c) => c.classList.remove("selected"));
    card.classList.add("selected");
    roleInput.value = card.dataset.role;
    syncConditionalFields(card.dataset.role);
    // Clear role error on selection
    setText(root.querySelector("[data-err='role']"), "");
  });
});

const next = new URLSearchParams(location.search).get("next");
if (next) loginLink.href = `/pages/login.html?next=${encodeURIComponent(next)}`;

// ─── Error helpers ────────────────────────────────────────────────
const FIELD_KEYS = ["name", "farmName", "companyName", "location", "email", "password", "role", "form"];

function clearErrors() {
  setText(banner, "");
  for (const k of FIELD_KEYS) {
    const el = root.querySelector(`[data-err='${k}']`);
    if (el) setText(el, "");
  }
}

function setLoading(on) {
  submitBtn.disabled = on;
  submitBtn.textContent = on ? "Creating account…" : "Create account";
}

// ─── Submit ───────────────────────────────────────────────────────
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearErrors();
  setLoading(true);

  const fd  = new FormData(form);
  const res = await signup({
    name        : fd.get("name"),
    farmName    : fd.get("farmName"),
    companyName : fd.get("companyName"),
    location    : fd.get("location"),
    email       : fd.get("email"),
    password    : fd.get("password"),
    role        : fd.get("role"),
  });

  if (!res.ok) {
    setLoading(false);
    const fe = res.error.fieldErrors ?? {};
    for (const [k, msg] of Object.entries(fe)) {
      const el = root.querySelector(`[data-err='${k}']`);
      if (el) setText(el, msg);
    }
    setText(banner, res.error.message ?? "Sign-up failed.");
    return;
  }

  toast("success", `Welcome to FARMIX, ${res.data.user.name}!`);
  location.href = next || "/index.html";
});
