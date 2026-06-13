export const APP = {
  name: "FARMIX",
  slogan: "Where Farms Meet Market",
};

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

