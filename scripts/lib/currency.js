/** Fixed exchange rate — all Supabase prices are stored in GEL. */
export const USD_TO_GEL = 2.65;

export const CURRENCIES = Object.freeze({
  GEL: "GEL",
  USD: "USD",
});

export const CURRENCY_SYMBOLS = Object.freeze({
  GEL: "₾",
  USD: "$",
});

export function getCurrencySymbol(currency) {
  return currency === CURRENCIES.USD ? CURRENCY_SYMBOLS.USD : CURRENCY_SYMBOLS.GEL;
}

const STORAGE_KEY = "farmix.currency";

export function toGELFromUSD(usd) {
  const n = Number(usd);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * USD_TO_GEL * 100) / 100;
}

export function toUSDFromGEL(gel) {
  const n = Number(gel);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n / USD_TO_GEL) * 100) / 100;
}

export function getDisplayCurrency() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === CURRENCIES.USD ? CURRENCIES.USD : CURRENCIES.GEL;
  } catch {
    return CURRENCIES.GEL;
  }
}

export function setDisplayCurrency(currency) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      currency === CURRENCIES.USD ? CURRENCIES.USD : CURRENCIES.GEL,
    );
  } catch {
    /* ignore quota errors */
  }
}

/**
 * @param {number} gelAmount — price as stored in Supabase (always GEL)
 * @param {"GEL"|"USD"} [currency]
 */
export function formatPrice(gelAmount, currency = CURRENCIES.GEL) {
  const gel = Number(gelAmount);
  if (!Number.isFinite(gel)) {
    return currency === CURRENCIES.USD ? "$0.00" : "₾0";
  }

  if (currency === CURRENCIES.USD) {
    return `$${toUSDFromGEL(gel).toFixed(2)}`;
  }

  const formatted = gel.toFixed(2).replace(/\.00$/, "");
  return `₾${formatted}`;
}

/**
 * Converts a user-entered price to GEL for database storage.
 * @param {number|string} inputPrice
 * @param {"GEL"|"USD"} inputCurrency
 */
export function priceToStorageGEL(inputPrice, inputCurrency = CURRENCIES.GEL) {
  const n = Number(String(inputPrice ?? "").trim());
  if (!Number.isFinite(n)) return NaN;
  const gel = inputCurrency === CURRENCIES.USD ? toGELFromUSD(n) : n;
  return Math.round(gel * 100) / 100;
}
