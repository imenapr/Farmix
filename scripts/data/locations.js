/**
 * Standardized Georgian location data for listings.
 * Store only stable `region_id` values in the database — never translated labels.
 *
 * Future geolocation: listings may add latitude/longitude columns; region_id
 * remains the primary filter key until GPS is implemented.
 */

/** @typedef {{ id: string, ka: string, en: string }} Region */

/** @type {Region[]} */
export const REGIONS = [
  { id: "tbilisi", ka: "თბილისი", en: "Tbilisi" },
  { id: "adjara", ka: "აჭარა", en: "Adjara" },
  { id: "guria", ka: "გურია", en: "Guria" },
  { id: "imereti", ka: "იმერეთი", en: "Imereti" },
  { id: "kakheti", ka: "კახეთი", en: "Kakheti" },
  { id: "kvemo-kartli", ka: "ქვემო ქართლი", en: "Kvemo Kartli" },
  { id: "shida-kartli", ka: "შიდა ქართლი", en: "Shida Kartli" },
  { id: "mtskheta-mtianeti", ka: "მცხეთა-მთიანეთი", en: "Mtskheta-Mtianeti" },
  { id: "samegrelo-zemo-svaneti", ka: "სამეგრელო-ზემო სვანეთი", en: "Samegrelo-Zemo Svaneti" },
  { id: "samtskhe-javakheti", ka: "სამცხე-ჯავახეთი", en: "Samtskhe-Javakheti" },
  {
    id: "racha-lechkhumi-kvemo-svaneti",
    ka: "რაჭა-ლეჩხუმი და ქვემო სვანეთი",
    en: "Racha-Lechkhumi and Kvemo Svaneti",
  },
  { id: "other", ka: "სხვა", en: "Other" },
];

/** Regions selectable when creating or editing a listing (excludes migration fallback). */
export const LISTING_REGIONS = REGIONS.filter((r) => r.id !== "other");

export const REGION_IDS = new Set(REGIONS.map((r) => r.id));
export const LISTING_REGION_IDS = new Set(LISTING_REGIONS.map((r) => r.id));

/**
 * Major cities / towns — reference data for future "Near Me" and geocoding.
 * Village on listings remains optional free text; this is not stored on listings.
 *
 * @type {{ id: string, regionId: string, ka: string, en: string }[]}
 */
export const MAJOR_CITIES = [
  { id: "tbilisi-city", regionId: "tbilisi", ka: "თბილისი", en: "Tbilisi" },
  { id: "batumi", regionId: "adjara", ka: "ბათუმი", en: "Batumi" },
  { id: "kobuleti", regionId: "adjara", ka: "ქობულეთი", en: "Kobuleti" },
  { id: "ozurgeti", regionId: "guria", ka: "ოზურგეთი", en: "Ozurgeti" },
  { id: "kutaisi", regionId: "imereti", ka: "ქუთაისი", en: "Kutaisi" },
  { id: "zestaponi", regionId: "imereti", ka: "ზესტაფონი", en: "Zestaponi" },
  { id: "telavi", regionId: "kakheti", ka: "თელავი", en: "Telavi" },
  { id: "gurjaani", regionId: "kakheti", ka: "გურჯაანი", en: "Gurjaani" },
  { id: "sighnaghi", regionId: "kakheti", ka: "სიღნაღი", en: "Sighnaghi" },
  { id: "rustavi", regionId: "kvemo-kartli", ka: "რუსთავი", en: "Rustavi" },
  { id: "gori", regionId: "shida-kartli", ka: "გორი", en: "Gori" },
  { id: "mtskheta", regionId: "mtskheta-mtianeti", ka: "მცხეთა", en: "Mtskheta" },
  { id: "zugdidi", regionId: "samegrelo-zemo-svaneti", ka: "ზუგდიდი", en: "Zugdidi" },
  { id: "poti", regionId: "samegrelo-zemo-svaneti", ka: "ფოთი", en: "Poti" },
  { id: "akhaltsikhe", regionId: "samtskhe-javakheti", ka: "ახალციხე", en: "Akhaltsikhe" },
  { id: "borjomi", regionId: "samtskhe-javakheti", ka: "ბორჯომი", en: "Borjomi" },
  { id: "ambrolauri", regionId: "racha-lechkhumi-kvemo-svaneti", ka: "ამბროლაური", en: "Ambrolauri" },
];

const NORMALIZE_ALIASES = /** @type {Record<string, string>} */ ({
  tbilisi: "tbilisi",
  "t'bilisi": "tbilisi",
  თბილისი: "tbilisi",
  adjara: "adjara",
  აჭარა: "adjara",
  batumi: "adjara",
  ბათუმი: "adjara",
  guria: "guria",
  გურია: "guria",
  imereti: "imereti",
  იმერეთი: "imereti",
  kutaisi: "imereti",
  ქუთაისი: "imereti",
  kakheti: "kakheti",
  კახეთი: "kakheti",
  gurjaani: "kakheti",
  გურჯაანი: "kakheti",
  telavi: "kakheti",
  თელავი: "kakheti",
  "kvemo kartli": "kvemo-kartli",
  "ქვემო ქართლი": "kvemo-kartli",
  rustavi: "kvemo-kartli",
  რუსთავი: "kvemo-kartli",
  "shida kartli": "shida-kartli",
  "შიდა ქართლი": "shida-kartli",
  gori: "shida-kartli",
  გორი: "shida-kartli",
  "mtskheta-mtianeti": "mtskheta-mtianeti",
  "მცხეთა-მთიანეთი": "mtskheta-mtianeti",
  mtskheta: "mtskheta-mtianeti",
  მცხეთა: "mtskheta-mtianeti",
  "samegrelo-zemo svaneti": "samegrelo-zemo-svaneti",
  "სამეგრელო-ზემო სვანეთი": "samegrelo-zemo-svaneti",
  zugdidi: "samegrelo-zemo-svaneti",
  ზუგდიდი: "samegrelo-zemo-svaneti",
  "samtskhe-javakheti": "samtskhe-javakheti",
  "სამცხე-ჯავახეთი": "samtskhe-javakheti",
  akhaltsikhe: "samtskhe-javakheti",
  ახალციხე: "samtskhe-javakheti",
  "racha-lechkhumi and kvemo svaneti": "racha-lechkhumi-kvemo-svaneti",
  "რაჭა-ლეჩხუმი და ქვემო სვანეთი": "racha-lechkhumi-kvemo-svaneti",
});

/**
 * Best-effort normalization of legacy free-text location → region_id + village.
 * Used by DB migration scripts and documentation; not authoritative at runtime.
 *
 * @param {string} text
 * @returns {{ regionId: string, village: string | null }}
 */
export function normalizeLegacyLocation(text) {
  const raw = String(text ?? "").trim();
  if (!raw) return { regionId: "other", village: null };

  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const villagePart = parts[0];
    const regionPart = parts.slice(1).join(", ");
    const regionId = matchRegionToken(regionPart);
    if (regionId) return { regionId, village: villagePart };
  }

  const direct = matchRegionToken(raw);
  if (direct) return { regionId: direct, village: null };

  for (const city of MAJOR_CITIES) {
    if (tokensMatch(raw, city.en) || tokensMatch(raw, city.ka)) {
      return { regionId: city.regionId, village: city.en };
    }
  }

  return { regionId: "other", village: raw };
}

function matchRegionToken(token) {
  const normalized = String(token ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (REGION_IDS.has(normalized)) return normalized;
  if (NORMALIZE_ALIASES[normalized]) return NORMALIZE_ALIASES[normalized];
  if (NORMALIZE_ALIASES[token.trim()]) return NORMALIZE_ALIASES[token.trim()];

  for (const region of REGIONS) {
    if (tokensMatch(normalized, region.en) || tokensMatch(token, region.ka)) {
      return region.id;
    }
  }
  return null;
}

function tokensMatch(a, b) {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

/**
 * @param {string} regionId
 * @returns {Region | null}
 */
export function getRegionById(regionId) {
  return REGIONS.find((r) => r.id === regionId) ?? null;
}

/**
 * @param {string} regionId
 * @param {"en" | "ka" | string} [lang]
 */
export function getRegionLabel(regionId, lang = "en") {
  const region = getRegionById(regionId);
  if (!region) {
    if (regionId === "other") return lang === "ka" ? "სხვა" : "Other";
    return String(regionId ?? "");
  }
  return lang === "ka" ? region.ka : region.en;
}

/**
 * Human-readable listing location for UI (never exposes raw region_id as the only text).
 *
 * @param {string} regionId
 * @param {string | null | undefined} village
 * @param {"en" | "ka" | string} [lang]
 */
export function formatListingLocation(regionId, village, lang = "en") {
  const regionLabel = getRegionLabel(regionId, lang);
  const v = String(village ?? "").trim();
  if (v && regionId && regionId !== "other") return `${v}, ${regionLabel}`;
  if (v) return v;
  return regionLabel;
}

/**
 * @param {{ selectedId?: string, lang?: string, regions?: Region[], includeEmpty?: boolean, emptyLabel?: string }} [opts]
 */
export function renderRegionOptionsHtml({
  selectedId = "",
  lang = "en",
  regions = LISTING_REGIONS,
  includeEmpty = false,
  emptyLabel = "",
} = {}) {
  const resolvedLang = lang === "ka" ? "ka" : "en";
  let html = "";
  if (includeEmpty) {
    html += `<option value="">${emptyLabel}</option>`;
  }
  for (const region of regions) {
    const label = resolvedLang === "ka" ? region.ka : region.en;
    const selected = region.id === selectedId ? " selected" : "";
    html += `<option value="${region.id}"${selected}>${label}</option>`;
  }
  return html;
}
