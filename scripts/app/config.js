export const APP = {
  name: "FARMIX",
  slogan: "Where Farms Meet Market",
};

// Admin gate — checked client-side as a second factor in addition to admin role.
// Change this before deploying to anything sensitive.
export const ADMIN_ACCESS_KEY = "FARMIX-ADMIN-2024";

/** UI-only localStorage keys (never authoritative for business data). */
export const STORAGE_KEYS = {
  authCache: "farmix.auth.cache",
  theme: "farmix.theme",
  categories: "farmix_categories",
};

export const ROLES = /** @type {const} */ ({
  farmer: "farmer",
  business: "business",
  consumer: "consumer",
  admin: "admin",
});

export const LISTING_STATUS = /** @type {const} */ ({
  active: "active",
  sold: "sold",
  archived: "archived",
});

export const MESSAGE_STATUS = /** @type {const} */ ({
  new: "new",
  read: "read",
  archived: "archived",
});

export const ORDER_STATUS = /** @type {const} */ ({
  pending:    "pending",
  processing: "processing",
  shipped:    "shipped",
  delivered:  "delivered",
  cancelled:  "cancelled",
});

