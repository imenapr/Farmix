export const APP = {
  name: "FARMIX",
  slogan: "Where Farms Meet Market",
};

/** UI-only localStorage keys (never authoritative for business data). */
export const STORAGE_KEYS = {
  authCache: "farmix.auth.cache",
};

export const ROLES = /** @type {const} */ ({
  farmer: "farmer",
  business: "business",
  consumer: "consumer",
  admin: "admin",
});

