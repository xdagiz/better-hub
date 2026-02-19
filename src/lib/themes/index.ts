import type { ThemeColors, ThemeDefinition } from "./types";
import { midnight, hubLight, hubDark, ember, arctic, dawn } from "./themes";

export type { ThemeColors, ThemeDefinition };

export const STORAGE_KEY = "color-theme";
export const DEFAULT_THEME_ID = "midnight";

const themes: ThemeDefinition[] = [midnight, hubDark, hubLight, ember, arctic, dawn];

const themeMap = new Map(themes.map((t) => [t.id, t]));

export function listThemes(): ThemeDefinition[] {
  return themes;
}

export function getTheme(id: string): ThemeDefinition | undefined {
  return themeMap.get(id);
}

/**
 * Apply a theme by setting CSS custom properties on documentElement.
 * Also syncs the dark/light class to match the theme's mode.
 */
export function applyTheme(themeId: string): void {
  const el = document.documentElement;
  const theme = getTheme(themeId);

  // Get all CSS var keys from the midnight theme as reference
  const allKeys = Object.keys(midnight.colors) as (keyof ThemeColors)[];

  if (!theme || themeId === DEFAULT_THEME_ID) {
    // Remove all inline overrides — let globals.css take over
    for (const key of allKeys) {
      el.style.removeProperty(key);
    }
    return;
  }

  for (const key of allKeys) {
    el.style.setProperty(key, theme.colors[key]);
  }
}
