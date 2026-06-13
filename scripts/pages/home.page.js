import { boot } from "../app/boot.js";
import { renderSkeletonCards, renderStateBlock } from "../app/ui.js";
import { renderListingCard } from "../components/listing-card.js";
import { getTrendingListings } from "../app/state.js";
import { getCurrentUser } from "../app/auth-state.js";

boot();

const mount = document.getElementById("home-latest");
if (mount) {
  mount.innerHTML = renderSkeletonCards(3);

  getTrendingListings(6).then((res) => {
    const user = getCurrentUser();
    const isGuest = !user;

    if (!res.ok) {
      mount.innerHTML = renderStateBlock({
        title: "Couldn't load listings",
        description: res.error?.message ?? "Please try again later.",
        actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">Browse marketplace</a>`,
      });
      return;
    }

    const latest = res.data;
    if (!latest.length) {
      mount.innerHTML = renderStateBlock({
        title: "No listings yet",
        description: "When farmers add listings, you'll see them here.",
        actionsHtml: `<a class="btn btn-primary" href="/pages/marketplace.html">Browse marketplace</a>`,
      });
      return;
    }

    mount.innerHTML = `
      <div class="grid cols-3">
        ${latest.map((l) => renderListingCard(l, { compact: true, maskLocation: isGuest })).join("")}
      </div>
    `;
  });
}
