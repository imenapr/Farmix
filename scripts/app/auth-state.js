/**
 * Centralized auth state — the single swap point for connecting a real backend.
 *
 * Current implementation: Supabase Auth (primary) + localStorage fallback.
 *
 * @typedef {{ isLoggedIn: boolean, userRole: 'farmer'|'business'|'consumer'|'admin'|'guest', user: object|null }} AuthState
 */

import { getCurrentUser, login as _login, signup as _signup, logout as _logout } from "../services/auth.service.js";
import { on } from "./events.js";

/** Returns a snapshot of the current auth state. */
export function getAuthState() {
  const user = getCurrentUser();
  return {
    isLoggedIn: Boolean(user),
    userRole  : user?.role ?? "guest",
    user      : user ?? null,
  };
}

/**
 * Subscribe to auth state changes.
 * @param {(state: AuthState) => void} fn
 * @returns {() => void} unsubscribe
 */
export function subscribeToAuth(fn) {
  return on("auth:changed", ({ user }) => {
    fn({
      isLoggedIn: Boolean(user),
      userRole  : user?.role ?? "guest",
      user      : user ?? null,
    });
  });
}

/**
 * Log in with email + password.
 * @param {{ email: string, password: string }} input
 * @returns {Promise<import('../services/auth.service.js').Result>}
 */
export async function login(input) {
  return _login(input);
}

/**
 * Create a new account.
 * @param {{ name: string, email: string, password: string, role: string, location: string, farmName?: string, companyName?: string }} input
 * @returns {Promise<import('../services/auth.service.js').Result>}
 */
export async function signup(input) {
  return _signup(input);
}

/** Log out the current user and clear session. */
export async function logout() {
  return _logout();
}
