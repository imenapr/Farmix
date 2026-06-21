/**
 * Centralized application state — the only layer UI should read/write through.
 * Components must NOT import Supabase or legacy db modules directly.
 */

import {
  initAuthSession,
  getCurrentUser as getAuthUser,
  login as authLogin,
  signup as authSignup,
  logout as authLogout,
  loginWithGoogle as authLoginWithGoogle,
  signupWithGoogle as authSignupWithGoogle,
  requestPasswordReset as authRequestPasswordReset,
  sendPasswordResetEmail as authSendPasswordResetEmail,
  completePasswordReset as authCompletePasswordReset,
  waitForRecoverySession as authWaitForRecoverySession,
  watchSession,
} from "../services/auth.service.js";
import { getListingById as getListingByIdSvc, getUserListings as getUserListingsSvc, searchListings as searchListingsSvc, getTrendingListings as getTrendingListingsSvc } from "../services/listings.service.js";

let initPromise = null;

export async function initAppState() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    await initAuthSession();
    watchSession();
  })();
  return initPromise;
}

export async function login(input) {
  return authLogin(input);
}

export async function signup(input) {
  return authSignup(input);
}

export async function loginWithGoogle() {
  return authLoginWithGoogle();
}

export async function signupWithGoogle() {
  return authSignupWithGoogle();
}

export async function logout() {
  return authLogout();
}

export async function requestPasswordReset(input) {
  return authRequestPasswordReset(input);
}

export async function sendPasswordResetEmail(email) {
  return authSendPasswordResetEmail(email);
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
