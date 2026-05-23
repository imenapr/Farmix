import { boot } from "../app/boot.js";
import { renderSkeletonCards, renderStateBlock } from "../app/ui.js";
import { loadDb } from "../data/db.js";
import { LISTING_STATUS } from "../app/config.js";
import { renderListingCard } from "../components/listing-card.js";
import { getCurrentUser } from "../services/auth.service.js";


boot();

const mount = document.getElementById("home-latest");
if (mount) {
  mount.innerHTML = renderSkeletonCards(6);

  window.setTimeout(() => {
    const db = loadDb();
    const user = getCurrentUser();
    const isGuest = !user;
    const suspendedIds = new Set(db.users.filter((u) => u.suspended).map((u) => u.id));
    const latest = db.listings
      .filter((l) => l.status === LISTING_STATUS.active && !suspendedIds.has(l.sellerId))
      .slice()
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 6);
    const topFarmers = db.users
      .filter((u) => u.role === "farmer" && !u.suspended)
      .slice()
      .sort((a, b) => {
        const aListings = db.listings.filter((l) => l.sellerId === a.id && l.status === LISTING_STATUS.active).length;
        const bListings = db.listings.filter((l) => l.sellerId === b.id && l.status === LISTING_STATUS.active).length;
        return bListings - aListings;
      })
      .slice(0, 4);

    if (!latest.length) {
      mount.innerHTML = renderStateBlock({
        title: "No listings yet",
        description: "When farmers add listings, you’ll see them here.",
        actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">Browse marketplace</a>`,
      });
      return;
    }

    const farmersStrip = topFarmers.length
      ? `
      `
      : "";

    mount.innerHTML = `
      ${isGuest ? farmersStrip : ""}
      <div class="grid cols-3">
        ${latest.map((l) => renderListingCard(l, { compact: true, maskLocation: isGuest })).join("")}
      </div>
    `;
  }, 650);
}
