// Central UI store (zustand). Camera view, selection, sorting and filter state.
// Display preferences persist to localStorage so they survive reloads.

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DisplayMode } from "@skyview/shared/index.js";

export type SortField = "distance" | "altitude" | "speed" | "climb";
export type AltBand = "all" | "low" | "high";

export interface ViewState {
  azimuth: number;
  elevation: number;
  fov: number;
}

export interface DisplayPrefs {
  displayMode: DisplayMode;
  showTrails: boolean;
  trailSeconds: number;
  showCompass: boolean;
  showSky: boolean;
  showStars: boolean;
  showSun: boolean;
  showMoon: boolean;
  altitudeColor: boolean;
}

/** Ambient / atmosphere toggles (all safe & reversible). */
export interface AmbiencePrefs {
  /** Master brightness 0.6–1.6 (1 = original look). */
  brightness: number;
  /** Auto-dim the sky/lights at night (sun.isDay). */
  nightMode: boolean;
  /** Light drifting clouds + horizon haze. */
  ambiance: boolean;
  /** Label density: 20 = nearest only, 200 = show everything. */
  labelRatio: number;
}

interface UIState {
  view: ViewState;
  selectedHex: string | null;
  sortBy: SortField;
  sortDir: "asc" | "desc";
  altBand: AltBand;
  typeFilter: Record<string, boolean>;
  prefs: DisplayPrefs;
  amb: AmbiencePrefs;
  sidebarLeftOpen: boolean;
  sidebarRightOpen: boolean;
  searchQuery: string;
  showRadar: boolean;
  uiScale: "sm" | "md" | "lg";
  /** Simulated hour offset (0-23) for a client-side sun preview, or null. */
  simHour: number | null;
  /** Play UI/alert sounds. */
  soundOn: boolean;

  setView: (v: Partial<ViewState>) => void;
  resetView: () => void;
  setSelected: (hex: string | null) => void;
  setSort: (field: SortField) => void;
  toggleSortDir: () => void;
  setAltBand: (b: AltBand) => void;
  toggleType: (t: string) => void;
  setPrefs: (p: Partial<DisplayPrefs>) => void;
  setAmb: (a: Partial<AmbiencePrefs>) => void;
  toggleSidebar: (which: "left" | "right") => void;
  setSearchQuery: (q: string) => void;
  setShowRadar: (v: boolean) => void;
  setUiScale: (s: "sm" | "md" | "lg") => void;
  setSimHour: (h: number | null) => void;
  setSoundOn: (v: boolean) => void;
}

const defaultPrefs: DisplayPrefs = {
  displayMode: (import.meta.env.VITE_AIRCRAFT_MODEL as DisplayMode) ?? "glb",
  showTrails: true,
  trailSeconds: 45,
  showCompass: true,
  showSky: true,
  showStars: true,
  showSun: true,
  showMoon: true,
  altitudeColor: true,
};

const defaultTypeFilter: Record<string, boolean> = {
  commercial: true,
  military: true,
  general: true,
  cargo: true,
};

const defaultAmb: AmbiencePrefs = {
  brightness: 1,
  nightMode: true,
  ambiance: true,
  labelRatio: 40,
};

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      view: { azimuth: 0, elevation: 55, fov: 110 },
      selectedHex: null,
      sortBy: "distance",
      sortDir: "desc",
      altBand: "all",
      typeFilter: defaultTypeFilter,
      prefs: defaultPrefs,
      amb: defaultAmb,
      sidebarLeftOpen: true,
      sidebarRightOpen: true,
      searchQuery: "",
      showRadar: false,
      uiScale: "md",
      simHour: null,
      soundOn: true,

      setView: (v) => set((s) => ({ view: { ...s.view, ...v } })),
      resetView: () => set({ view: { azimuth: 0, elevation: 55, fov: 110 } }),
      setSelected: (hex) => set({ selectedHex: hex }),
      setSort: (field) => set((s) => ({ sortBy: field, sortDir: s.sortBy === field ? s.sortDir : "desc" })),
      toggleSortDir: () => set((s) => ({ sortDir: s.sortDir === "asc" ? "desc" : "asc" })),
      setAltBand: (b) => set({ altBand: b }),
      toggleType: (t) =>
        set((s) => {
          const next = { ...s.typeFilter, [t]: !s.typeFilter[t] };
          // Keep at least one type enabled.
          if (Object.values(next).every((v) => !v)) next[t] = true;
          return { typeFilter: next };
        }),
      setPrefs: (p) => set((s) => ({ prefs: { ...s.prefs, ...p } })),
      setAmb: (a) => set((s) => ({ amb: { ...s.amb, ...a } })),
      toggleSidebar: (which) =>
        set((s) =>
          which === "left"
            ? { sidebarLeftOpen: !s.sidebarLeftOpen }
            : { sidebarRightOpen: !s.sidebarRightOpen },
        ),
      setSearchQuery: (q) => set({ searchQuery: q }),
      setShowRadar: (v) => set({ showRadar: v }),
      setUiScale: (uiScale) => set({ uiScale }),
      setSimHour: (simHour) => set({ simHour }),
      setSoundOn: (soundOn) => set({ soundOn }),
    }),
    {
      name: "skyview-ui",
      partialize: (s) => ({ prefs: s.prefs, amb: s.amb, sortBy: s.sortBy, showRadar: s.showRadar, uiScale: s.uiScale }) as Partial<UIState>,
    },
  ),
);

export const CATEGORY_KEYS = Object.keys(defaultTypeFilter);
export { defaultPrefs, defaultAmb };
