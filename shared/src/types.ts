// Shared, cross-boundary model types. The server normalizes both the local
// dump1090 feed and the airplanes.live API into this single `Aircraft` shape,
// and the client renders from it. Kept in `shared` so server + web agree.

export type DisplayMode = "glyphs" | "glb" | "mesh";

/** A single aircraft fix, enriched + geo-resolved server-side. */
export interface Aircraft {
  /** 24-bit ICAO address — the stable key for everything. */
  hex: string;
  /** Callsign, trimmed (e.g. "UAL1234"). */
  callsign: string;

  /** Human type name, e.g. "Boeing 777-300ER". */
  model: string;
  /** Operating airline, e.g. "Air France". */
  airline: string;

  /** Barometric altitude, feet. */
  altitude: number;
  /** Ground speed, knots. */
  speed: number;
  /** True track / heading over ground, degrees (0-360). */
  track: number;
  /** Vertical rate, ft/min (positive = climbing). */
  climbRate: number;

  lat: number;
  lon: number;

  // --- geo-resolved against the configured observer location --- (server-side)
  /** Slant line-of-sight distance observer -> aircraft, km. */
  distance: number;
  /** Bearing from observer to aircraft, degrees from true North (0-360). */
  azimuth: number;
  /** Elevation above the observer's horizon, degrees (0-90). */
  elevation: number;

  /** ICAO destination / origin airport codes (or "?" when unknown). */
  from: string;
  to: string;

  /** Human city/airport names for origin/destination (from adsbdb), when known. */
  fromName?: string;
  toName?: string;

  /** Origin / destination airport coordinates (from adsbdb route), when known. */
  fromLat?: number;
  fromLon?: number;
  toLat?: number;
  toLon?: number;

  /** Squawk / transponder code (e.g. "7700"), when present. */
  squawk?: string;
  /** True when the aircraft is on the ground (alt_baro = "ground"). */
  onGround?: boolean;

  /** Tail number / registration (e.g. "F-ABCD"), when known. */
  registration?: string;

  /** Photo URL from adsbdb, when available. */
  photoUrl?: string;

  /** Server timestamp (ms epoch) the fix came from. */
  timestamp: number;
}

export interface SkyBody {
  name: string;
  azimuth: number;
  elevation: number;
  /** Visual magnitude (astronomical), if known. */
  magnitude?: number;
}

export interface SunData {
  azimuth: number;
  elevation: number;
  riseTime: string;
  setTime: string;
  isDay: boolean;
}

export interface MoonData {
  azimuth: number;
  elevation: number;
  /** Illuminated fraction, 0..1. */
  phase: number;
  visible: boolean;
}

export interface SkyData {
  sun: SunData;
  moon: MoonData;
  stars: SkyBody[];
  planets: SkyBody[];
}

/** A saved place the user can jump the view to. */
export interface LocationProfile {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radiusMiles: number;
}

export type DataSource = "radio" | "api" | "opensky" | "adsbfi";

export interface Config {
  source: DataSource;
  centerLat: number;
  centerLon: number;
  radiusMiles: number;
  locationName: string;
  locationProfiles: LocationProfile[];

  displayMode: DisplayMode;
  showTrails: boolean;
  trailSeconds: number;
  showCompass: boolean;
  showSky: boolean;
  showStars: boolean;
  showSun: boolean;
  showMoon: boolean;
  showGrid: boolean;
  showRangeRings: boolean;
  altitudeColor: boolean;
  glyphSizePx: number;
  brightness: number;

  minAltitudeFt: number;
  maxAltitudeFt: number;
}

export interface SourceStatus {
  source: DataSource;
  ok: boolean;
  count: number;
  lastOk: number | null;
  message?: string;
}

export type WeatherCategory = "clear" | "cloudy" | "rain" | "snow" | "storm" | "fog";

export interface WeatherData {
  temperature: number; // °C
  windKt: number;
  windDir: number; // meteorological degrees (from)
  windGustKt: number;
  cloudCover: number; // 0..100
  condition: string; // human-readable
  code: number; // WMO weather code
  category: WeatherCategory;
  isDay: boolean;
  updatedAt: number;
}

/** The full over-the-wire payload pushed to every client. */
export interface WebSocketPayload {
  aircraft: Aircraft[];
  sky: SkyData;
  config: Config;
  status: SourceStatus;
  weather?: WeatherData;
  now: number;
}
