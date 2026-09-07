// Client-side default config, seeded from Vite env. The authoritative config
// arrives over the WebSocket / REST from the server; this is just the initial
// fallback before the first payload, and the seed for a local-first mode.

import type { Config } from "@skyview/shared/index.js";

export function defaultConfig(): Config {
  const lat = Number(import.meta.env.VITE_DEFAULT_LAT ?? 48.8566);
  const lon = Number(import.meta.env.VITE_DEFAULT_LON ?? 2.3522);
  const radius = Number(import.meta.env.VITE_DEFAULT_RADIUS ?? 50);
  const mode = (import.meta.env.VITE_AIRCRAFT_MODEL ?? "glb") as Config["displayMode"];
  return {
    source: "opensky",
    centerLat: lat,
    centerLon: lon,
    radiusMiles: radius,
    locationName: "Paris, France",
    locationProfiles: [],
    displayMode: mode,
    showTrails: true,
    trailSeconds: 45,
    showCompass: true,
    showSky: true,
    showStars: true,
    showSun: true,
    showMoon: true,
    showGrid: true,
    showRangeRings: true,
    altitudeColor: true,
    glyphSizePx: 22,
    brightness: 1,
    minAltitudeFt: 100,
    maxAltitudeFt: 60000,
  };
}
