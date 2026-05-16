import { ROLES } from "./config.js";
import { getCurrentUser, initAuthSession } from "../services/auth.service.js";
import { toast } from "./ui.js";

function nextParam() {
  return encodeURIComponent(`${location.pathname}${location.search}${location.hash}`);
}

export function redirectToLogin() {
  location.href = `/pages/login.html?next=${nextParam()}`;
}

export function guardAuth() {
  initAuthSession();
  const user = getCurrentUser();
  if (!user) {
    redirectToLogin();
    return null;
  }
  return user;
}

export function guardRole(roles) {
  const user = guardAuth();
  if (!user) return null;
  if (!roles.includes(user.role)) {
    toast("error", "Access denied.");
    location.href = "/index.html";
    return null;
  }
  return user;
}

export function guardAdmin() {
  return guardRole([ROLES.admin]);
}

