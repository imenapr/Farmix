/**
 * Auth facade — UI should import from here or scripts/app/state.js.
 * Never import auth.service.js directly from components/pages.
 */
export {
  login,
  signup,
  logout,
  requestPasswordReset,
  sendPasswordResetEmail,
  completePasswordReset,
  waitForRecoverySession,
  getCurrentUser,
  initAppState,
} from "./state.js";