import { boot } from "../app/boot.js";
import { getCurrentUser } from "../services/auth.service.js";
import { renderStateBlock } from "../app/ui.js";
import { openGuestGate } from "../components/guest-gate.js";

boot();

const root = document.getElementById("dashboard-root");
if (root) {
  const user = getCurrentUser();
  if (!user) {
    const next = "/pages/dashboard.html";
    root.innerHTML = renderStateBlock({
      title: "Dashboard access for members",
      description: "Join FARMIX or log in to open your personalized dashboard.",
      actionsHtml: `
        <a class="btn btn-ghost" href="/pages/login.html?next=${encodeURIComponent(next)}">Login</a>
        <a class="btn btn-primary" href="/pages/signup.html?next=${encodeURIComponent(next)}">Create Free Account</a>
      `,
    });
    openGuestGate({ next });
    return;
  }

  if (user.role === "farmer" || user.role === "admin") {
    location.replace("/pages/farmer-dashboard.html");
    return;
  }

  if (user.role === "business") {
    location.replace("/pages/business-dashboard.html");
    return;
  }

  location.replace("/pages/account.html");
}
