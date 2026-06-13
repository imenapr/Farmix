import { boot } from "../app/boot.js";
import { guardAuth } from "../app/router-guards.js";
import { toast, qs, setText } from "../app/ui.js";
import { logout as doLogout } from "../app/auth-state.js";
import { initAppState } from "../app/state.js";
import { getUserById, updateProfile } from "../services/users.service.js";

boot();

const root = document.getElementById("account-root");
if (root) {
  guardAuth().then(async (user) => {
    if (!user) return;

    const fetched = await getUserById(user.id);
    if (!fetched.ok) {
      root.innerHTML = `<div class="state-block"><h2 class="state-title">Account not found</h2><p class="state-desc">Please log in again.</p></div>`;
      return;
    }

    const record = fetched.data;
    root.innerHTML = `
        <section class="card pad" style="max-width: 720px;">
          <form id="profile-form" class="stack" novalidate>
            <div class="muted" style="font-size: var(--text-sm);">
              Signed in as <strong>${record.email}</strong> · role <strong>${record.role}</strong>
            </div>

            <div class="grid" style="grid-template-columns: 1fr; gap: 0.85rem;">
              <label class="stack" style="gap:0.35rem;">
                <span style="font-weight: 700;">Name</span>
                <input class="input" name="name" required />
                <span class="error-text" data-err="name"></span>
              </label>
              <label class="stack" style="gap:0.35rem;">
                <span style="font-weight: 700;">Location</span>
                <input class="input" name="location" required />
                <span class="error-text" data-err="location"></span>
              </label>
            </div>

            <div class="grid" style="grid-template-columns: 1fr; gap: 0.85rem;">
              <label class="stack" style="gap:0.35rem;">
                <span style="font-weight: 700;">Phone (optional)</span>
                <input class="input" name="phone" />
                <span class="error-text" data-err="phone"></span>
              </label>
              <label class="stack" style="gap:0.35rem;">
                <span style="font-weight: 700;">Bio (optional)</span>
                <textarea class="textarea" name="bio" rows="3"></textarea>
                <span class="error-text" data-err="bio"></span>
              </label>
            </div>

            <div class="grid" style="grid-template-columns: 1fr; gap: 0.85rem;">
              <label class="stack" style="gap:0.35rem;">
                <span style="font-weight: 700;">Farm name (farmers)</span>
                <input class="input" name="farmName" />
                <span class="error-text" data-err="farmName"></span>
              </label>
              <label class="stack" style="gap:0.35rem;">
                <span style="font-weight: 700;">Company name (businesses)</span>
                <input class="input" name="companyName" />
                <span class="error-text" data-err="companyName"></span>
              </label>
            </div>

            <p class="error-text" data-err="form" style="margin:0;"></p>

            <div style="display:flex; gap:0.6rem; flex-wrap:wrap; align-items:center;">
              <button class="btn btn-primary" type="submit" data-submit>Save changes</button>
              <button class="btn btn-ghost" type="button" data-logout>Logout</button>
            </div>
          </form>
        </section>
      `;

    const form = qs(root, "#profile-form");
    const submitBtn = qs(root, "[data-submit]");
    const logoutBtn = qs(root, "[data-logout]");

    const setVal = (name, value) => {
      const el = form.elements.namedItem(name);
      if (el) el.value = value ?? "";
    };

    setVal("name", record.name);
    setVal("location", record.location);
    setVal("phone", record.phone);
    setVal("bio", record.bio);
    setVal("farmName", record.farmName);
    setVal("companyName", record.companyName);

    const err = (k) => qs(root, `[data-err='${k}']`);
    const errForm = err("form");

    function clearErrors() {
      for (const k of ["name", "location", "phone", "bio", "farmName", "companyName", "form"]) setText(err(k), "");
    }

    function setLoading(isLoading) {
      submitBtn.disabled = isLoading;
      submitBtn.textContent = isLoading ? "Saving..." : "Save changes";
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      clearErrors();
      setLoading(true);

      const fd = new FormData(form);
      const res = await updateProfile(user.id, {
        name: fd.get("name"),
        location: fd.get("location"),
        phone: fd.get("phone"),
        bio: fd.get("bio"),
        farmName: fd.get("farmName"),
        companyName: fd.get("companyName"),
      });

      if (!res.ok) {
        setLoading(false);
        for (const [k, msg] of Object.entries(res.error.fieldErrors ?? {})) {
          const el = root.querySelector(`[data-err='${k}']`);
          if (el) el.textContent = msg;
        }
        setText(errForm, res.error.message ?? "Fix the highlighted fields.");
        return;
      }

      setLoading(false);
      toast("success", "Profile updated.");
      await initAppState();
    });

    logoutBtn.addEventListener("click", async () => {
      await doLogout();
      toast("success", "Logged out.");
      location.href = "/index.html";
    });
  });
}
