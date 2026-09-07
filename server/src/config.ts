// Persistent configuration store. Loads a JSON file on boot, keeps an in-memory
// copy as the single source of truth, patches it, and writes it back atomically.
// The client gets the current config via GET /api/config and the WS payload.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { Config, DisplayMode, LocationProfile } from "@skyview/shared/index.js";

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

const MODES: DisplayMode[] = ["glyphs", "glb", "mesh"];
const SOURCES: Config["source"][] = ["opensky", "radio", "api", "adsbfi"];

export const DEFAULT_CONFIG: Config = {
  source: "opensky",
  centerLat: 48.8566,
  centerLon: 2.3522,
  radiusMiles: 50,
  locationName: "Paris, France",
  locationProfiles: [],

  displayMode: "mesh",
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

export function mergeConfig(base: Config, patch: Partial<Config>): Config {
  return {
    ...base,
    ...patch,
    locationProfiles: patch.locationProfiles
      ? patch.locationProfiles
      : base.locationProfiles,
  };
}

/** Validate a patch before applying; throws ConfigValidationError on bad state. */
export function validateConfig(c: Partial<Config>): void {
  if (c.source != null && !SOURCES.includes(c.source)) {
    throw new ConfigValidationError(`source must be one of ${SOURCES.join(", ")}`);
  }
  if (c.centerLat != null && (c.centerLat < -90 || c.centerLat > 90)) {
    throw new ConfigValidationError("centerLat must be between -90 and 90");
  }
  if (c.centerLon != null && (c.centerLon < -180 || c.centerLon > 180)) {
    throw new ConfigValidationError("centerLon must be between -180 and 180");
  }
  if (c.radiusMiles != null && (c.radiusMiles < 1 || c.radiusMiles > 1000)) {
    throw new ConfigValidationError("radiusMiles must be between 1 and 1000");
  }
  if (c.displayMode != null && !MODES.includes(c.displayMode)) {
    throw new ConfigValidationError(`displayMode must be one of ${MODES.join(", ")}`);
  }
  if (c.minAltitudeFt != null && c.maxAltitudeFt != null && c.minAltitudeFt > c.maxAltitudeFt) {
    throw new ConfigValidationError("minAltitudeFt must be <= maxAltitudeFt");
  }
}

export class ConfigStore {
  private config: Config;
  private dirty = false;

  constructor(
    private path: string,
    private initial: Config,
  ) {
    this.config = { ...initial };
  }

  async load(): Promise<void> {
    if (!existsSync(this.path)) return;
    try {
      const raw = JSON.parse(readFileSync(this.path, "utf8")) as Partial<Config>;
      this.config = mergeConfig(this.initial, raw);
    } catch (err) {
      console.error(
        "[config] failed to parse config.json, using defaults:",
        (err as Error).message,
      );
    }
  }

  get(): Config {
    return this.config;
  }

  patch(patch: Partial<Config>): Config {
    validateConfig(patch);
    this.config = mergeConfig(this.config, patch);
    this.persist();
    return this.config;
  }

  reset(): Config {
    this.config = DEFAULT_CONFIG;
    this.persist();
    return this.config;
  }

  /** Merge an arbitrary partial profile bucket (used by location-profiling). */
  addProfile(profile: LocationProfile): void {
    const rest = this.config.locationProfiles.filter((p) => p.id !== profile.id);
    this.config = { ...this.config, locationProfiles: [...rest, profile] };
    this.persist();
  }

  private persist(): void {
    if (this.dirty) return;
    this.dirty = true;
    queueMicrotask(() => {
      this.dirty = false;
      try {
        mkdirSync(dirname(this.path), { recursive: true });
        writeFileSync(this.path, JSON.stringify(this.config, null, 2), "utf8");
      } catch (err) {
        console.error("[config] failed to write config.json:", (err as Error).message);
      }
    });
  }
}

export function configPath(): string {
  return resolve(process.cwd(), "data", "config.json");
}
