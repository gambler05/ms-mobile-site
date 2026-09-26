"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light" | "system";
export type Density = "comfortable" | "compact";

interface UiState {
  theme: Theme;
  density: Density;
  sidebarCollapsed: boolean;
  paletteOpen: boolean;
  setTheme: (t: Theme) => void;
  setDensity: (d: Density) => void;
  toggleSidebar: () => void;
  setPaletteOpen: (o: boolean) => void;
}

function writeCookie(name: string, value: string) {
  if (typeof document !== "undefined") document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`;
}

export function applyTheme(theme: Theme) {
  if (typeof document === "undefined") return;
  const resolved = theme === "system" ? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : theme;
  document.documentElement.dataset.theme = resolved;
  writeCookie("rf_theme", theme);
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  return document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`))?.[1];
}

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      // Le cookie fait foi (il pilote le rendu serveur) ; le stockage local n'est qu'un cache.
      theme: (["dark", "light", "system"].includes(readCookie("rf_theme") ?? "") ? readCookie("rf_theme") : "dark") as Theme,
      density: readCookie("rf_density") === "compact" ? "compact" : "comfortable",
      sidebarCollapsed: false,
      paletteOpen: false,
      setTheme: (theme) => {
        applyTheme(theme);
        set({ theme });
      },
      setDensity: (density) => {
        document.documentElement.dataset.density = density;
        writeCookie("rf_density", density);
        set({ density });
      },
      toggleSidebar: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
    }),
    { name: "rf-ui", partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }) },
  ),
);
