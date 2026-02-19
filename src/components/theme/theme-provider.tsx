"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTheme } from "next-themes";
import {
  applyTheme,
  getTheme,
  listThemes,
  STORAGE_KEY,
  DEFAULT_THEME_ID,
  type ThemeDefinition,
} from "@/lib/themes";

interface ColorThemeContext {
  colorTheme: string;
  setColorTheme: (id: string) => void;
  themes: ThemeDefinition[];
  mode: "dark" | "light";
}

const Ctx = createContext<ColorThemeContext | null>(null);

export function useColorTheme(): ColorThemeContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useColorTheme must be used within ColorThemeProvider");
  return ctx;
}

export function ColorThemeProvider({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme();
  const [colorTheme, setColorThemeState] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_THEME_ID;
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID;
  });
  const syncedFromDb = useRef(false);

  const themes = listThemes();
  const currentTheme = getTheme(colorTheme);
  const mode = currentTheme?.mode ?? "dark";

  // Apply CSS vars and sync next-themes mode whenever colorTheme changes
  useEffect(() => {
    applyTheme(colorTheme);
    const theme = getTheme(colorTheme);
    if (theme) {
      setTheme(theme.mode);
    }
  }, [colorTheme, setTheme]);

  // On mount: fetch theme from DB — if it differs from localStorage, adopt it
  useEffect(() => {
    if (syncedFromDb.current) return;
    syncedFromDb.current = true;

    fetch("/api/user-settings")
      .then((r) => r.ok ? r.json() : null)
      .then((settings) => {
        if (!settings?.colorTheme) return;
        const dbTheme = settings.colorTheme;
        const local = localStorage.getItem(STORAGE_KEY) ?? DEFAULT_THEME_ID;
        if (dbTheme !== local && getTheme(dbTheme)) {
          localStorage.setItem(STORAGE_KEY, dbTheme);
          setColorThemeState(dbTheme);
        }
      })
      .catch(() => {});
  }, []);

  const setColorTheme = useCallback((id: string) => {
    const apply = () => {
      localStorage.setItem(STORAGE_KEY, id);
      setColorThemeState(id);
    };

    // Smooth crossfade via View Transitions API
    if (typeof document !== "undefined" && "startViewTransition" in document) {
      (document as any).startViewTransition(apply);
    } else {
      apply();
    }

    // Persist to DB in background
    fetch("/api/user-settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ colorTheme: id }),
    }).catch(() => {});
  }, []);

  return (
    <Ctx.Provider value={{ colorTheme, setColorTheme, themes, mode }}>
      {children}
    </Ctx.Provider>
  );
}
