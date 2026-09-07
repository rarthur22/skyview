// Pure, dependency-free math helpers shared by server + web.
// No DOM access — safe in Node or a browser.

import { DEG, RAD, FT_TO_M, KM_TO_M, MI_TO_KM, KT_TO_KMH, KT_TO_MPH } from "./constants.js";

export interface Meters {
  east: number;
  north: number;
}

export interface SkyAngles {
  /** Degrees from true North, clockwise. */
  az: number;
  /** Degrees above the mathematical horizon. */
  elev: number;
  /** Slant (line-of-sight) distance, meters. */
  slantM: number;
}

/** Clamp a number between min and max. */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function normAz(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Shortest-path interpolate between two azimuths. */
export function lerpAzimuth(a: number, b: number, t: number): number {
  const d = ((b - a + 540) % 360) - 180;
  return normAz(a + d * t);
}

/** Flat-earth local meters (east, north) relative to a reference point. */
export function llToMeters(
  lat: number,
  lon: number,
  lat0: number,
  lon0: number,
): Meters {
  const east = (lon - lon0) * Math.cos(lat0 * DEG) * 111320;
  const north = (lat - lat0) * 110540;
  return { east, north };
}

/** Distance from the reference point to a local offset, meters. */
export function rangeMeters(m: Meters): number {
  return Math.hypot(m.east, m.north);
}

/**
 * Observer at ground level -> apparent sky position of an aircraft.
 * Flat-earth bearing (accurate within a few miles), right-triangle elevation
 * from horizontal range + altitude. Near zenith, the azimuth singularity is
 * stabilized with the caller-provided `fallbackAz`.
 */
export function groundToSkyAngles(
  m: Meters,
  altFt: number,
  fallbackAz?: number,
): SkyAngles {
  const groundM = rangeMeters(m);
  const h = Math.max(0, altFt) * FT_TO_M;
  let az: number;
  let elev: number;
  if (groundM < 0.5) {
    az = fallbackAz ?? 0;
    elev = 89.5;
  } else {
    az = normAz(Math.atan2(m.east, m.north) * RAD);
    elev = Math.atan2(h, groundM) * RAD;
  }
  return { az, elev, slantM: Math.hypot(groundM, h) };
}

/** Formatting helpers. */
export function formatDistance(km: number): string {
  if (km >= 100) return `${Math.round(km)} km`;
  return `${km.toFixed(1)} km`;
}

export function formatAltitude(ft: number): string {
  return `${Math.round(ft).toLocaleString("en-US")} ft`;
}

export function formatSpeed(kt: number, unit: "kt" | "mph" | "kmh" = "kt"): string {
  const v = unit === "mph" ? kt * KT_TO_MPH : unit === "kmh" ? kt * KT_TO_KMH : kt;
  const suffix = unit === "mph" ? "mph" : unit === "kmh" ? "km/h" : "kts";
  return `${Math.round(v)} ${suffix}`;
}

export function formatClimb(fpm: number): string {
  if (Math.abs(fpm) < 100) return "LEVEL";
  return `${fpm > 0 ? "▲" : "▼"} ${Math.abs(Math.round(fpm))} fpm`;
}

export function compassLabel(az: number): string {
  const pts = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return pts[Math.round(az / 45) % 8];
}

/** Human "utc" clock string HH:MM:SS. */
export function formatClock(ms: number): string {
  const d = new Date(ms);
  return d.toTimeString().slice(0, 8);
}

/** Human UTC date string DD/MM/YYYY. */
export function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(
    d.getUTCMonth() + 1,
  ).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

export function kmToMiles(km: number): number {
  return km / MI_TO_KM;
}

export function milesToKm(mi: number): number {
  return mi * MI_TO_KM;
}

export function ftToKm(ft: number): number {
  return ft * FT_TO_M / KM_TO_M;
}

export function kmToFt(km: number): number {
  return km * KM_TO_M / FT_TO_M;
}
