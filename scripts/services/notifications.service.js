export function createNotification({ userId, type, message, metadata = {} }) {}
export function getNotificationsForUser(userId, { limit = 20 } = {}) {}
export function getUnreadCount(userId) {}
export function markNotificationRead(notificationId) {}
export function markAllRead(userId) {}