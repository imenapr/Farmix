import { CATEGORIES as SEED_CATEGORIES } from "./categories-data.js";

/** Seed categories always appear; optional admin overrides in localStorage are merged by id. */
export function getCategories() {
  const byId = new Map(SEED_CATEGORIES.map((c) => [c.id, { ...c }]));
  const stored = localStorage.getItem("farmix_categories");
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        for (const c of parsed) {
          if (c && c.id && c.name) byId.set(String(c.id), { id: String(c.id), name: String(c.name) });
        }
      }
    } catch {
      /* ignore bad JSON */
    }
  }
  return Array.from(byId.values());
}

export function getCategoryById(id) {
  if (!id) return null;
  return getCategories().find((c) => c.id === id) ?? null;
}
