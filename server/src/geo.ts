// Geo resolution: turn each aircraft's lat/lon/altitude into the observer-relative
// distance (km), azimuth (deg from North) and elevation (deg above horizon) that
// the HUD renders from. Also provides observation-space ECEF helpers for the
// pointing/track math.

import {
  DEG,
  RAD,
  FT_TO_KM,
  KM_TO_M,
  llToMeters,
  rangeMeters,
  groundToSkyAngles,
  type Meters,
} from "@skyview/shared/index.js";

export interface AircraftGeo {
  distance: number; // km, slant LOS
  azimuth: number; // deg from North
  elevation: number; // deg above horizon
}

/** Observer-relative geometry for a single aircraft. */
export function resolveAircraftGeo(
  lat: number,
  lon: number,
  altFt: number,
  centerLat: number,
  centerLon: number,
  fallbackAz?: number,
): AircraftGeo {
  const m = llToMeters(lat, lon, centerLat, centerLon);
  const sky = groundToSkyAngles(m, altFt, fallbackAz);
  return {
    distance: sky.slantM / KM_TO_M,
    azimuth: sky.az,
    elevation: sky.elev,
  };
}

/** Great-circle bearing from point A to point B, degrees from North. */
export function bearing(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const la1 = aLat * DEG;
  const la2 = bLat * DEG;
  const dLon = (bLon - aLon) * DEG;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * RAD) + 360) % 360;
}

/** Great-circle distance in km (Haversine). */
export function haversineKm(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const la1 = aLat * DEG;
  const la2 = bLat * DEG;
  const dLat = (bLat - aLat) * DEG;
  const dLon = (bLon - aLon) * DEG;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** ECEF (meters) of a lat/lon/alt point. */
export function ecef(lat: number, lon: number, altM: number): { x: number; y: number; z: number } {
  const a = 6378137;
  const e2 = 0.00669437999014;
  const latR = lat * DEG;
  const lonR = lon * DEG;
  const sinLat = Math.sin(latR);
  const cosLat = Math.cos(latR);
  const N = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  return {
    x: (N + altM) * cosLat * Math.cos(lonR),
    y: (N + altM) * cosLat * Math.sin(lonR),
    z: (N * (1 - e2) + altM) * sinLat,
  };
}

/** Convert an altitude (feet) to a local offset in an observation dome. */
export function altFtToMeters(altFt: number): number {
  return altFt * FT_TO_KM * KM_TO_M;
}

export type { Meters };
export { rangeMeters };
