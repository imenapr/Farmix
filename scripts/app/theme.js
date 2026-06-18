import { emit } from "./events.js";

const THEME_KEY = "farmix.theme";
const THEMES = {
  light: "light",
  dark: "dark",
};

function normalizeTheme(value) {
  return value === THEMES.dark ? THEMES.dark : THEMES.light;
}

function hasStoredTheme() {
  try {
    return Boolean(localStorage.getItem(THEME_KEY));
  } catch {
    return false;
  }
}

/** System appearance when the OS/browser reports a preference; otherwise null. */
function getSystemTheme() {
  if (!window.matchMedia) return null;
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) return THEMES.dark;
  if (window.matchMedia("(prefers-color-scheme: light)").matches) return THEMES.light;
  return null;
}

function getPreferredTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved) return normalizeTheme(saved);
  } catch {}

  const system = getSystemTheme();
  if (system) return system;

  return THEMES.dark;
}

function getRoot() {
  return document.documentElement;
}

function applyTheme(theme) {
  const normalized = normalizeTheme(theme);
  const root = getRoot();
  root.setAttribute("data-theme", normalized);
  root.style.colorScheme = normalized;
  syncAllChartsWithTheme();
  emit("theme:changed", { theme: normalized });
  document.dispatchEvent(new CustomEvent("farmix:theme-changed", { detail: { theme: normalized } }));
  return normalized;
}

export function getTheme() {
  return normalizeTheme(getRoot().getAttribute("data-theme"));
}

export function setTheme(theme) {
  const applied = applyTheme(theme);
  try {
    localStorage.setItem(THEME_KEY, applied);
  } catch {}
  return applied;
}

export function toggleTheme() {
  const next = getTheme() === THEMES.dark ? THEMES.light : THEMES.dark;
  return setTheme(next);
}

export function initTheme() {
  applyTheme(getPreferredTheme());

  const darkMq = window.matchMedia?.("(prefers-color-scheme: dark)");
  const lightMq = window.matchMedia?.("(prefers-color-scheme: light)");
  if (!darkMq && !lightMq) return;

  const onSystemThemeChange = () => {
    if (hasStoredTheme()) return;
    applyTheme(getPreferredTheme());
  };

  darkMq?.addEventListener?.("change", onSystemThemeChange);
  lightMq?.addEventListener?.("change", onSystemThemeChange);
  darkMq?.addListener?.(onSystemThemeChange);
  lightMq?.addListener?.(onSystemThemeChange);
}

export function getChartThemeTokens() {
  const styles = getComputedStyle(getRoot());
  return {
    axis: styles.getPropertyValue("--chart-axis-color").trim(),
    grid: styles.getPropertyValue("--chart-grid-color").trim(),
    label: styles.getPropertyValue("--chart-label-color").trim(),
  };
}

function syncAllChartsWithTheme() {
  const chartApi = window.Chart;
  if (!chartApi) return;

  const { axis, grid, label } = getChartThemeTokens();
  const instances = chartApi.instances ? Object.values(chartApi.instances) : [];

  for (const chart of instances) {
    if (!chart?.options) continue;
    const scales = chart.options.scales ?? {};
    for (const scale of Object.values(scales)) {
      if (!scale) continue;
      scale.ticks = scale.ticks ?? {};
      scale.grid = scale.grid ?? {};
      scale.title = scale.title ?? {};
      scale.ticks.color = axis;
      scale.grid.color = grid;
      scale.title.color = label;
    }
    chart.update("none");
  }
}
