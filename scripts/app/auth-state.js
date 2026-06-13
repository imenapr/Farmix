/**
 * Auth facade — UI should import from here or scripts/app/state.js.
 * Never import auth.service.js directly from components/pages.
 */
export {
  getAuthState,
  subscribeToAuth,
  login,
  signup,
  logout,
  requestPasswordReset,
  completePasswordReset,
  waitForRecoverySession,
  getCurrentUser,
  refreshCurrentUser,
  initAppState,
} from "./state.js";
