import { initToasts } from "../components/toast.js";
import { mountNavbar } from "../components/navbar.js";
import { mountFooter } from "../components/footer.js";
import { mountGuestActionGates } from "../components/guest-gate.js";
import { initAppState } from "./state.js";
import { initTheme } from "./theme.js";
import { initListingNavigation } from "./ui.js";

function ensureGlobalDesignSystem() {
  if (!document.head) return;

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

  if (!document.querySelector("script[data-farmix-tailwind='true']")) {
    window.tailwind = window.tailwind || {};
    window.tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
            serif: ["Playfair Display", "ui-serif", "Georgia", "serif"],
          },
          colors: {
            emeraldBrand: {
              50:  "#ecfdf5",
              100: "#d1fae5",
              200: "#a7f3d0",
              300: "#6ee7b7",
              400: "#34d399",
              500: "#10b981",
              600: "#059669",
              700: "#047857",
              800: "#065f46",
              900: "#064e3b",
            },
          },
          boxShadow: {
            glass:       "0 8px 32px rgba(6,95,70,0.12), inset 0 1px 0 rgba(255,255,255,0.88)",
            "glass-lg":  "0 24px 64px rgba(6,95,70,0.18), inset 0 1px 0 rgba(255,255,255,0.88)",
            "glass-xl":  "0 32px 80px rgba(6,95,70,0.24), inset 0 1px 0 rgba(255,255,255,0.90)",
          },
          backdropBlur: {
            glass: "20px",
            "glass-heavy": "28px",
          },
          borderColor: {
            glass: "rgba(255,255,255,0.74)",
          },
        },
      },
    };

    const tw = document.createElement("script");
    tw.src = "https://cdn.tailwindcss.com";
    tw.setAttribute("data-farmix-tailwind", "true");
    document.head.appendChild(tw);
  }

  // Minimal body class — actual background gradient is in base.css
  document.body.classList.add("antialiased");
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
