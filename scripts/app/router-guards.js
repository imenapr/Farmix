import { ROLES } from "./config.js";
import { getCurrentUser } from "./auth-state.js";
import { initAppState } from "./state.js";
import { toast } from "./ui.js";

function nextParam() {
  return encodeURIComponent(`${location.pathname}${location.search}${location.hash}`);
}

export function redirectToLogin() {
  location.href = `/pages/login.html?next=${nextParam()}`;
}

export async function guardAuth() {
  await initAppState();
  const user = getCurrentUser();
  if (!user) {
    redirectToLogin();
    return null;
  }
  return user;
}

export async function guardRole(roles) {
  const user = await guardAuth();
  if (!user) return null;
  if (!roles.includes(user.role)) {
    toast("error", "Access denied.");
    location.href = "/index.html";
    return null;
  }
  return user;
}

export async function guardAdmin() {
  return guardRole([ROLES.admin]);
}

