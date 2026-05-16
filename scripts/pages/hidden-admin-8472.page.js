import { boot } from "../app/boot.js";
import { escapeHtml, qs, renderSkeletonCards, renderStateBlock, toast } from "../app/ui.js";
import { guardAdmin } from "../app/router-guards.js";
import { archiveListingAsAdmin, listListings, listUsers } from "../services/admin.service.js";

boot();

const root = document.getElementById("admin-root");
if (root) {
  const user = guardAdmin();
  if (!user) return;

  root.innerHTML = `
    <div class="admin-grid">
      <section class="card pad">
        <div class="admin-toolbar">
          <h2 style="margin:0; letter-spacing:-0.01em;">Users</h2>
          <button class="btn btn-ghost" type="button" data-refresh-users>Refresh</button>
        </div>
        <div id="admin-users" style="margin-top:0.8rem;"></div>
      </section>

      <section class="card pad">
        <div class="admin-toolbar">
          <h2 style="margin:0; letter-spacing:-0.01em;">Listings</h2>
          <button class="btn btn-ghost" type="button" data-refresh-listings>Refresh</button>
        </div>
        <div id="admin-listings" style="margin-top:0.8rem;"></div>
      </section>
    </div>
  `;

  const usersMount = qs(root, "#admin-users");
  const listingsMount = qs(root, "#admin-listings");
  const refreshUsersBtn = qs(root, "[data-refresh-users]");
  const refreshListingsBtn = qs(root, "[data-refresh-listings]");

  function renderUsers() {
    usersMount.innerHTML = renderSkeletonCards(1);
    window.setTimeout(() => {
      const res = listUsers();
      if (!res.ok) {
        usersMount.innerHTML = renderStateBlock({
          title: "Couldn’t load users",
          description: res.error.message ?? "Please try again.",
        });
        return;
      }

      if (!res.data.length) {
        usersMount.innerHTML = renderStateBlock({
          title: "No users found",
          description: "No user records available.",
        });
        return;
      }

      usersMount.innerHTML = `
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Location</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              ${res.data
                .map(
                  (u) => `
                <tr>
                  <td>${escapeHtml(u.name ?? "-")}</td>
                  <td>${escapeHtml(u.email)}</td>
                  <td><span class="pill">${escapeHtml(u.role)}</span></td>
                  <td>${escapeHtml(u.location ?? "-")}</td>
                  <td>${new Date(u.createdAt).toLocaleString()}</td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;
    }, 180);
  }

  function renderListings() {
    listingsMount.innerHTML = renderSkeletonCards(2);
    window.setTimeout(() => {
      const res = listListings({ includeArchived: true });
      if (!res.ok) {
        listingsMount.innerHTML = renderStateBlock({
          title: "Couldn’t load listings",
          description: res.error.message ?? "Please try again.",
        });
        return;
      }

      if (!res.data.length) {
        listingsMount.innerHTML = renderStateBlock({
          title: "No listings found",
          description: "No listing records available.",
        });
        return;
      }

      listingsMount.innerHTML = `
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Location</th>
                <th>Price</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${res.data
                .map(
                  (l) => `
                <tr>
                  <td>${escapeHtml(l.title)}</td>
                  <td>${escapeHtml(l.categoryId)}</td>
                  <td>${escapeHtml(l.location)}</td>
                  <td>${escapeHtml(String(l.price))}/${escapeHtml(l.unit)}</td>
                  <td><span class="pill">${escapeHtml(l.status)}</span></td>
                  <td style="display:flex; gap:0.4rem; flex-wrap:wrap;">
                    <a class="btn btn-ghost" href="/pages/product.html?id=${encodeURIComponent(l.id)}">View</a>
                    <button class="btn btn-ghost" type="button" data-archive="${l.id}" ${l.status === "archived" ? "disabled" : ""}>Archive</button>
                  </td>
                </tr>
              `
                )
                .join("")}
            </tbody>
          </table>
        </div>
      `;

      listingsMount.querySelectorAll("[data-archive]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const id = btn.getAttribute("data-archive");
          const r = archiveListingAsAdmin(id);
          if (!r.ok) {
            toast("error", r.error.message ?? "Failed to archive.");
            return;
          }
          toast("success", "Listing archived.");
          renderListings();
        });
      });
    }, 180);
  }

  refreshUsersBtn.addEventListener("click", renderUsers);
  refreshListingsBtn.addEventListener("click", renderListings);

  renderUsers();
  renderListings();
}

