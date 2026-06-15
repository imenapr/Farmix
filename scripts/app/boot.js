import { initToasts } from "../components/toast.js";
import { mountNavbar } from "../components/navbar.js";
import { mountFooter } from "../components/footer.js";
import { mountGuestActionGates } from "../components/guest-gate.js";
import { initAppState } from "./state.js";
import { initTheme } from "./theme.js";
import { initListingNavigation } from "./ui.js";

function ensureGlobalDesignSystem() {
  if (!document.head) return;

  if (!document.querySelector("link[data-farmix-preconnect='supabase']")) {
    const supabasePc = document.createElement("link");
    supabasePc.rel = "preconnect";
    supabasePc.href = "https://kxdgnygvwnaxfcsljujt.supabase.co";
    supabasePc.crossOrigin = "anonymous";
    supabasePc.setAttribute("data-farmix-preconnect", "supabase");
    document.head.appendChild(supabasePc);
  }

  if (!document.querySelector("link[data-farmix-fonts='true']")) {
    const preconnectA = document.createElement("link");
    preconnectA.rel = "preconnect";
    preconnectA.href = "https://fonts.googleapis.com";
    document.head.appendChild(preconnectA);

    const preconnectB = document.createElement("link");
    preconnectB.rel = "preconnect";
    preconnectB.href = "https://fonts.gstatic.com";
    preconnectB.crossOrigin = "anonymous";
    document.head.appendChild(preconnectB);

    const fonts = document.createElement("link");
    fonts.rel = "stylesheet";
    // Include italic variants of Playfair Display for the hero em tag
    fonts.href =
      "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Playfair+Display:ital,wght@0,600;0,700;0,800;1,600;1,700;1,800&display=swap";
    fonts.setAttribute("data-farmix-fonts", "true");
    document.head.appendChild(fonts);
  }
}

export function boot() {
  initTheme();
  ensureGlobalDesignSystem();
  initToasts();
  initListingNavigation();

  const shell = document.querySelector("[data-app-shell]");
  if (shell) shell.classList.add("app-shell");

  const navMount    = document.querySelector("[data-mount='navbar']");
  const footerMount = document.querySelector("[data-mount='footer']");

  mountNavbar(navMount);
  mountFooter(footerMount);

  // Defer auth initialization to not block page render
  // This happens in background without blocking UI
  Promise.resolve().then(async () => {
    await initAppState();
    mountGuestActionGates();
  });
}
