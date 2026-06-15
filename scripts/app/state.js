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
  refreshCurrentUser as authRefresh,
  requestPasswordReset as authRequestPasswordReset,
  completePasswordReset as authCompletePasswordReset,
  waitForRecoverySession as authWaitForRecoverySession,
  watchSession,
} from "../services/auth.service.js";
import { getListingById as getListingByIdSvc, getUserListings as getUserListingsSvc, searchListings as searchListingsSvc, getTrendingListings as getTrendingListingsSvc } from "../services/listings.service.js";

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

export async function requestPasswordReset(input) {
  return authRequestPasswordReset(input);
}

export async function completePasswordReset(input) {
  return authCompletePasswordReset(input);
}

export async function waitForRecoverySession(timeoutMs) {
  return authWaitForRecoverySession(timeoutMs);
}

export function getCurrentUser() {
  return getAuthUser();
}

/** Force a fresh Supabase role/profile fetch, bypassing the TTL cache. */
export async function refreshCurrentUser() {
  return authRefresh();
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
  return getTrendingListingsSvc(limit);
}
