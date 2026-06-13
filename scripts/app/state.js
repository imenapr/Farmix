/**
 * Centralized application state — the only layer UI should read/write through.
 * Components must NOT import Supabase or legacy db modules directly.
 */

import { on } from "./events.js";
import {
  initAuthSession,
  getCurrentUser as getAuthUser,
  login as authLogin,
  signup as authSignup,
  logout as authLogout,
  watchSession,
} from "../services/auth.service.js";
import { getListingById as getListingByIdSvc, getUserListings as getUserListingsSvc, searchListings as searchListingsSvc } from "../services/listings.service.js";

let initialized = false;

/** @typedef {{ isLoggedIn: boolean, userRole: string, user: object | null }} AuthState */

export function getAuthState() {
  const user = getAuthUser();
  return {
    isLoggedIn: Boolean(user),
    userRole: user?.role ?? "guest",
    user: user ?? null,
  };
}

/** @param {(state: AuthState) => void} fn */
export function subscribeToAuth(fn) {
  fn(getAuthState());
  return on("auth:changed", () => fn(getAuthState()));
}

export async function initAppState() {
  if (initialized) return;
  initialized = true;
  await initAuthSession();
  watchSession();
  const user = getAuthUser();
  if (user?.role === "admin") {
    const { primeNotificationCache } = await import("../services/notifications.service.js");
    primeNotificationCache(user.id);
  }
}

export async function login(input) {
  return authLogin(input);
}

export async function signup(input) {
  return authSignup(input);
}

export async function logout() {
  return authLogout();
}

export function getCurrentUser() {
  return getAuthUser();
}

export async function searchListings(filters) {
  return searchListingsSvc(filters);
}

export async function getListingById(id) {
  return getListingByIdSvc(id);
}

export async function getUserListings(userId) {
  return getUserListingsSvc(userId);
}

/** Home page: latest active listings. */
export async function getTrendingListings(limit = 6) {
  const params = new URLSearchParams({ sort: "newest", page: "1" });
  const res = await searchListingsSvc(params);
  if (!res.ok) return res;
  return { ok: true, data: res.data.items.slice(0, limit) };
}
