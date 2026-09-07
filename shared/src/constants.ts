// Shared constants: unit conversions, display defaults, HUD palette.

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;

export const FT_TO_M = 0.3048;
export const KM_TO_M = 1000;
export const MI_TO_M = 1609.34;
export const MI_TO_KM = 1.60934;
export const NM_PER_MILE = 0.868976;

export const KT_TO_MS = 0.514444;
export const KT_TO_KMH = 1.852;
export const KT_TO_MPH = 1.15078;
export const FT_TO_KM = FT_TO_M / KM_TO_M;

/** Miles-to-KM default for the airspace radius. */
export const DEFAULT_RADIUS_MILES = 50;

/** HUD palette (cyan / deep-navy). */
export const HUDPalette = {
  bgPrimary: "#0a0e27",
  bgSecondary: "#1a1f3a",
  fgPrimary: "#00d4ff",
  fgSecondary: "#4a7c8c",
  accentWarn: "#ff6b35",
  accentSuccess: "#00ff00",
  gridLine: "#004411",
};

/** Glyph color helpers — aircraft rendered by altitude band. */
export function glyphColor(altFt: number): string {
  if (altFt >= 30000) return "#00d4ff";
  if (altFt >= 10000) return "#3ed6a0";
  if (altFt >= 2000) return "#ffd166";
  return "#ff6b35";
}
