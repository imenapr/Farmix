import { boot } from "../app/boot.js";
import { escapeHtml, renderSkeletonCards, renderStateBlock, qs } from "../app/ui.js";
import { getUserById } from "../services/users.service.js";
import { getUserListings } from "../app/state.js";
import { renderListingCard } from "../components/listing-card.js";

boot();

const root = document.getElementById("profile-root");
if (root) {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    root.innerHTML = renderStateBlock({
      title: "Missing profile ID",
      description: "Return to the marketplace and open a seller profile.",
      actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">Back to marketplace</a>`,
    });
  } else {
    root.innerHTML = `
      <section class="card pad">
        <div id="profile-head"></div>
      </section>
      <div style="height: 0.9rem;"></div>
      <section class="card pad">
        <h2 style="margin:0 0 0.6rem; letter-spacing:-0.01em;">Active listings</h2>
        <div id="profile-listings"></div>
      </section>
    `;

    const head = qs(root, "#profile-head");
    const listingsMount = qs(root, "#profile-listings");

    head.innerHTML = renderStateBlock({ title: "Loading profile…", description: "Please wait." });
    listingsMount.innerHTML = renderSkeletonCards(6);

    Promise.all([getUserById(id), getUserListings(id)]).then(([u, l]) => {
      if (!u.ok) {
        root.innerHTML = renderStateBlock({
          title: "Profile not found",
          description: "This user may not exist.",
          actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">Back to marketplace</a>`,
        });
        return;
      }

      const user = u.data;
      document.title = `${user.name} · FARMIX`;

      head.innerHTML = `
        <div class="pill">${escapeHtml(user.role)}</div>
        <h2 style="margin:0.5rem 0 0; letter-spacing:-0.01em;">${escapeHtml(user.name)}</h2>
        <div class="muted">${escapeHtml(user.location)}</div>
        ${user.farmName ? `<div class="muted">Farm: <strong>${escapeHtml(user.farmName)}</strong></div>` : ""}
        ${user.companyName ? `<div class="muted">Business: <strong>${escapeHtml(user.companyName)}</strong></div>` : ""}
        ${user.phone ? `<div class="muted">Phone: <strong>${escapeHtml(user.phone)}</strong></div>` : ""}
        ${user.bio ? `<p class="muted" style="margin:0.6rem 0 0; white-space:pre-wrap;">${escapeHtml(user.bio)}</p>` : ""}
      `;

      if (!l.ok) {
        listingsMount.innerHTML = renderStateBlock({
          title: "Couldn't load listings",
          description: l.error?.message ?? "Please try again.",
          actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">Back</a>`,
        });
        return;
      }

      if (!l.data.length) {
        listingsMount.innerHTML = renderStateBlock({
          title: "No active listings",
          description: "This seller doesn't have active listings right now.",
        });
        return;
      }

      listingsMount.innerHTML = `<div class="grid cols-3">${l.data.map((x) => renderListingCard(x)).join("")}</div>`;
    });
  }
}
