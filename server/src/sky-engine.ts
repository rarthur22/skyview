// Real-sky engine: computes the sun, moon, bright stars and naked-eye planets
// at their true horizontal coordinates (azimuth/altitude) for a location + time.
// Reduced to the observer-relative az/el that the HUD renders from.

import * as AstronomyNS from "astronomy-engine";
import type { SkyData, SkyBody, SunData, MoonData } from "@skyview/shared/index.js";

// Some Node versions expose the UMD bundle through `.default` only. Unwrap.
const Astronomy: typeof AstronomyNS =
  (AstronomyNS as unknown as { default?: typeof AstronomyNS }).default ?? AstronomyNS;

const DECL_STARS = [
  { name: "Sirius", ra: 101.287, dec: -16.716, mag: -1.46 },
  { name: "Canopus", ra: 95.988, dec: -52.696, mag: -0.74 },
  { name: "Arcturus", ra: 213.915, dec: 19.182, mag: -0.05 },
  { name: "Vega", ra: 279.234, dec: 38.784, mag: 0.03 },
  { name: "Capella", ra: 79.172, dec: 45.998, mag: 0.08 },
  { name: "Rigel", ra: 78.634, dec: -8.202, mag: 0.13 },
  { name: "Procyon", ra: 114.825, dec: 5.225, mag: 0.34 },
  { name: "Betelgeuse", ra: 88.793, dec: 7.407, mag: 0.42 },
  { name: "Achernar", ra: 24.429, dec: -57.237, mag: 0.46 },
  { name: "Altair", ra: 297.696, dec: 8.868, mag: 0.76 },
  { name: "Aldebaran", ra: 68.98, dec: 16.509, mag: 0.86 },
  { name: "Antares", ra: 247.352, dec: -26.432, mag: 1.09 },
  { name: "Spica", ra: 201.298, dec: -11.161, mag: 0.97 },
  { name: "Pollux", ra: 116.329, dec: 28.026, mag: 1.14 },
  { name: "Fomalhaut", ra: 344.413, dec: -29.622, mag: 1.16 },
  { name: "Deneb", ra: 310.358, dec: 45.28, mag: 1.25 },
  { name: "Regulus", ra: 152.093, dec: 11.967, mag: 1.36 },
  { name: "Castor", ra: 113.65, dec: 31.888, mag: 1.58 },
  { name: "Polaris", ra: 37.955, dec: 89.264, mag: 1.98 },
];

const PLANETS = [
  { body: AstronomyNS.Body.Venus, name: "Venus" },
  { body: AstronomyNS.Body.Jupiter, name: "Jupiter" },
  { body: AstronomyNS.Body.Mars, name: "Mars" },
  { body: AstronomyNS.Body.Saturn, name: "Saturn" },
  { body: AstronomyNS.Body.Mercury, name: "Mercury" },
];

const R2D = 180 / Math.PI;
const DEG = Math.PI / 180;

function norm360(d: number): number {
  return ((d % 360) + 360) % 360;
}

function bodyAltAz(
  body: AstronomyNS.Body,
  date: Date,
  observer: AstronomyNS.Observer,
): { az: number; alt: number; mag: number } {
  let mag = 0;
  try {
    mag = Astronomy.Illumination(body, date).mag;
  } catch {
    /* mag unavailable */
  }
  const eq = Astronomy.Equator(body, date, observer, true, true);
  const hor = Astronomy.Horizon(date, observer, eq.ra, eq.dec, "normal");
  return { az: norm360(hor.azimuth), alt: hor.altitude, mag };
}

function starAltAz(raDeg: number, decDeg: number, lstHours: number, latDeg: number) {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const lat = latDeg * DEG;
  const H = lstHours * 15 * DEG - ra;
  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosAz =
    (Math.sin(dec) - Math.sin(alt) * Math.sin(lat)) / (Math.cos(alt) * Math.cos(lat));
  const sinAz = (-Math.sin(H) * Math.cos(dec)) / Math.cos(alt);
  const az = norm360(Math.atan2(sinAz, cosAz) * R2D);
  return { az, alt: alt * R2D };
}

export interface SkyEngineOptions {
  stars: boolean;
  sun: boolean;
  moon: boolean;
  planets: boolean;
  magLimit: number;
}

export function computeSky(date: Date, latDeg: number, lonDeg: number, o: SkyEngineOptions): SkyData {
  const observer = new Astronomy.Observer(latDeg, lonDeg, 0);
  const sun: SunData = { azimuth: 0, elevation: -90, riseTime: "", setTime: "", isDay: false };
  let moon: MoonData = { azimuth: 0, elevation: -90, phase: 0, visible: false };
  const stars: SkyBody[] = [];
  const planets: SkyBody[] = [];

  if (o.sun) {
    const s = bodyAltAz(AstronomyNS.Body.Sun, date, observer);
    sun.azimuth = s.az;
    sun.elevation = s.alt;
    sun.isDay = s.alt > -0.833;
    const rise = Astronomy.SearchRiseSet(AstronomyNS.Body.Sun, observer, +1, date, 1);
    const set = Astronomy.SearchRiseSet(AstronomyNS.Body.Sun, observer, -1, date, 1);
    sun.riseTime = rise ? rise.date.toTimeString().slice(0, 5) : "—";
    sun.setTime = set ? set.date.toTimeString().slice(0, 5) : "—";
  }

  if (o.moon) {
    const m = bodyAltAz(AstronomyNS.Body.Moon, date, observer);
    const phase = Astronomy.MoonPhase(date); // 0..360, 0=new, 180=full
    moon = {
      azimuth: m.az,
      elevation: m.alt,
      phase: (1 - Math.cos((phase * Math.PI) / 180)) / 2,
      visible: m.alt > -0.833,
    };
  }

  if (o.stars) {
    const lst = Astronomy.SiderealTime(date) + lonDeg / 15;
    for (const s of DECL_STARS) {
      if (s.mag > o.magLimit) continue;
      const { az, alt } = starAltAz(s.ra, s.dec, lst, latDeg);
      if (alt < -2) continue;
      stars.push({ name: s.name, azimuth: az, elevation: alt, magnitude: s.mag });
    }
  }

  if (o.planets) {
    for (const p of PLANETS) {
      const { az, alt, mag } = bodyAltAz(p.body, date, observer);
      if (alt < -2) continue;
      planets.push({ name: p.name, azimuth: az, elevation: alt, magnitude: mag });
    }
  }

  return { sun, moon, stars, planets };
}
