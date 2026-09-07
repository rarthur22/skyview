// Data acquisition + enrichment + geo-resolution. Polls the active source
// (radio | api), normalizes readsb records into our Aircraft shape, enriches
// them (airline, type, route), resolves observer-relative geometry, and emits
// a ready-to-render snapshot to the WebSocket hub.

import type { Aircraft, Config, SourceStatus } from "@skyview/shared/index.js";
import { milesToKm, DEG } from "@skyview/shared/index.js";
import { RouteEnricher, airlineFromCallsign, typeName } from "./enrichment.js";
import { resolveAircraftGeo } from "./geo.js";
import { llToMeters, rangeMeters } from "@skyview/shared/index.js";

/** Raw readsb-style aircraft record (subset we use). */
interface RawAircraft {
  hex?: string;
  flight?: string;
  lat?: number;
  lon?: number;
  alt_baro?: number | "ground";
  alt_geom?: number;
  gs?: number;
  track?: number;
  baro_rate?: number;
  squawk?: string;
  r?: string;
  t?: string;
  seen?: number;
}

function normalize(raw: RawAircraft, ts: number): Aircraft | null {
  if (!raw.hex) return null;
  const onGround = raw.alt_baro === "ground";
  const altBaro = onGround ? null : (raw.alt_baro as number | undefined) ?? null;
  const alt = altBaro ?? (raw.alt_geom as number | undefined) ?? 0;
  const flight = raw.flight?.trim() ?? "";

  return {
    hex: raw.hex,
    callsign: flight,
    model: "",
    airline: "",
    altitude: alt,
    speed: raw.gs ?? 0,
    track: raw.track ?? 0,
    climbRate: raw.baro_rate ?? 0,
    lat: raw.lat ?? 0,
    lon: raw.lon ?? 0,
    distance: 0,
    azimuth: 0,
    elevation: 0,
    from: "?",
    to: "?",
    squawk: raw.squawk || undefined,
    onGround,
    timestamp: ts,
  };
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(6000),
    headers: {
      // Some ADS-B APIs (airplanes.live / Cloudflare) reject the default undici UA.
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function describeFetchError(e: unknown): string {
  if (!(e instanceof Error)) return "fetch failed";
  if (e.name === "TimeoutError" || e.name === "AbortError") return "timeout after 6s";
  const code: string | undefined =
    (e.cause as { code?: string } | undefined)?.code ?? (e as { code?: string }).code;
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "DNS lookup failed";
    case "ECONNREFUSED":
      return "connection refused";
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return "host unreachable";
    case "ETIMEDOUT":
      return "connect timeout";
    case "ECONNRESET":
      return "connection reset";
  }
  return code ?? e.message ?? "fetch failed";
}

const RATE_LIMIT_BACKOFF_MS = 45_000;
const SOURCE_FAIL_BACKOFF_MS = 20_000;

export interface PollerOptions {
  source: "radio" | "api" | "opensky" | "adsbfi";
  radioUrl: string;
  apiUrlTemplate: string;
  adsbfiUrlTemplate: string;
  pollMs: number;
  supplementApi: boolean;
  apiPollMs: number;
  getConfig: () => Config;
  enricher: RouteEnricher;
  onSnapshot: (now: number, aircraft: Aircraft[]) => void;
  onStatus: (status: SourceStatus) => void;
}

const RADIUS_KM_FACTOR = 1.08;

export class Poller {
  private timer: ReturnType<typeof setInterval> | null = null;
  private apiTimer: ReturnType<typeof setInterval> | null = null;
  private status: SourceStatus;
  private last: Aircraft[] = [];
  private lastApi: Aircraft[] = [];
  private lastError: string | null = null;
  private lastErrorLogAt = 0;
  private apiBackoffUntil = 0;
  /** Per-source cooldown (ms epoch until we may retry that source again). */
  private cooldown: Record<string, number> = {};
  /** Order the server tries real sources when one fails. */
  private rotation: ("opensky" | "api" | "radio" | "adsbfi")[] = ["opensky", "adsbfi", "api", "radio"];

  private sticky = new Map<string, Partial<Aircraft>>();
  /** hex -> raw ICAO type code, captured at normalize for enrichment. */
  private typeCodes = new Map<string, string>();

  constructor(private o: PollerOptions) {
    this.status = { source: o.source, ok: false, count: 0, lastOk: null };
  }

  getSnapshot(): { now: number; aircraft: Aircraft[] } {
    return { now: Date.now(), aircraft: this.last };
  }

  getStatus(): SourceStatus {
    return this.status;
  }

  setSource(source: "radio" | "api" | "opensky" | "adsbfi"): void {
    this.o.source = source;
    this.status.source = source;
    this.syncApiTimer();
  }

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.o.pollMs);
    this.syncApiTimer();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.apiTimer) clearInterval(this.apiTimer);
    this.timer = null;
    this.apiTimer = null;
  }

  private syncApiTimer(): void {
    const want = this.o.source === "radio" && this.o.supplementApi;
    if (want && !this.apiTimer && this.timer) {
      void this.refreshApi();
      this.apiTimer = setInterval(() => void this.refreshApi(), this.o.apiPollMs);
    } else if (!want && this.apiTimer) {
      clearInterval(this.apiTimer);
      this.apiTimer = null;
      this.lastApi = [];
    }
  }

  private buildApiUrl(): string {
    const c = this.o.getConfig();
    const r = Math.min(250, Math.max(2, Math.round(c.radiusMiles) + 1));
    return this.o.apiUrlTemplate
      .replace("{lat}", String(c.centerLat))
      .replace("{lon}", String(c.centerLon))
      .replace("{r}", String(r));
  }

  private buildAdsbfiUrl(): string {
    const c = this.o.getConfig();
    // adsb.fi v3 point query: dist is in nautical miles, max 250.
    const nm = Math.min(250, Math.max(2, Math.round(c.radiusMiles)));
    return this.o.adsbfiUrlTemplate
      .replace("{lat}", String(c.centerLat))
      .replace("{lon}", String(c.centerLon))
      .replace("{nm}", String(nm));
  }

  private buildOpenskyUrl(): string {
    const c = this.o.getConfig();
    const radiusKm = milesToKm(c.radiusMiles);
    const dLat = radiusKm / 110.574;
    const dLon = radiusKm / (111.32 * Math.cos(c.centerLat * DEG));
    return (
      `https://opensky-network.org/api/states/all?lamin=${(c.centerLat - dLat).toFixed(4)}` +
      `&lomin=${(c.centerLon - dLon).toFixed(4)}&lamax=${(c.centerLat + dLat).toFixed(4)}` +
      `&lomax=${(c.centerLon + dLon).toFixed(4)}`
    );
  }

  private async fetchList(
    source: "radio" | "api" | "opensky" | "adsbfi",
    now: number,
  ): Promise<Aircraft[] | null> {
    const url =
      source === "radio"
        ? this.o.radioUrl
        : source === "opensky"
          ? this.buildOpenskyUrl()
          : source === "adsbfi"
            ? this.buildAdsbfiUrl()
            : this.buildApiUrl();
    try {
      const json = await fetchJson(url);
      if (source === "opensky") {
        const states: unknown[][] = json.states ?? [];
        const list: Aircraft[] = [];
        for (const s of states) {
          const ac = openskyToAircraft(s, now);
          if (ac) list.push(ac);
        }
        return this.withinRadius(list);
      }
      const rawList: RawAircraft[] = json.aircraft ?? json.ac ?? [];
      const list: Aircraft[] = [];
      for (const raw of rawList) {
        const ac = normalize(raw, now);
        if (ac) {
          if (raw.t) this.typeCodes.set(ac.hex, raw.t);
          list.push(ac);
        }
      }
      return source === "api" || source === "adsbfi" ? this.withinRadius(list) : list;
    } catch (e) {
      const reason = describeFetchError(e);
      // Back off on any source's rate limit (OpenSky / airplanes.live / …).
      if (reason === "HTTP 429") this.apiBackoffUntil = now + RATE_LIMIT_BACKOFF_MS;
      let host = url;
      try {
        host = new URL(url).host;
      } catch {
        /* keep url */
      }
      this.lastError = `${source} fetch failed: ${reason} (${host})`;
      if (now - this.lastErrorLogAt > 30_000) {
        this.lastErrorLogAt = now;
        console.error(`[poller] ${source} fetch failed: ${reason} — ${url}`);
      }
      return null;
    }
  }

  private async refreshApi(): Promise<void> {
    // Only ever supplement the radio source — never the API itself, and never
    // opensky (they should not double-request).
    if (this.o.source !== "radio") return;
    if (Date.now() < this.apiBackoffUntil) return;
    const list = await this.fetchList("api", Date.now());
    if (list) this.lastApi = list;
  }

  private withinRadius(list: Aircraft[]): Aircraft[] {
    const c = this.o.getConfig();
    const maxKm = milesToKm(c.radiusMiles) * RADIUS_KM_FACTOR;
    return list.filter((ac) => {
      if (ac.lat === 0 && ac.lon === 0) return true;
      const m = llToMeters(ac.lat, ac.lon, c.centerLat, c.centerLon);
      return rangeMeters(m) / 1000 <= maxKm;
    });
  }

  private enrich(ac: Aircraft, now: number): void {
    ac.airline = ac.airline || airlineFromCallsign(ac.callsign) || "";
    ac.model = ac.model || typeName(this.typeCodes.get(ac.hex)) || "";

    const e = this.o.enricher.enrichSync(ac.hex, ac.callsign, now);
    if (e.route) {
      ac.airline = ac.airline || e.route.airline || "";
      ac.from = (e.route.origin ?? ac.from) || "?";
      ac.to = (e.route.destination ?? ac.to) || "?";
      ac.fromName = e.route.originCity ?? e.route.originName ?? "";
      ac.toName = e.route.destCity ?? e.route.destName ?? "";
      if (e.route.originLat != null && e.route.originLon != null) {
        ac.fromLat = e.route.originLat;
        ac.fromLon = e.route.originLon;
      }
      if (e.route.destLat != null && e.route.destLon != null) {
        ac.toLat = e.route.destLat;
        ac.toLon = e.route.destLon;
      }
    }
    if (e.aircraft) {
      const a = e.aircraft;
      ac.registration = ac.registration || a.registration || "";
      ac.photoUrl = ac.photoUrl || a.photoUrl || "";
      // adsbdb knows the manufacturer + exact ICAO type — prefer it over the
      // bundled type-name table when the aircraft didn't carry a type code.
      if (!ac.model && a.icaoType) {
        ac.model = typeName(a.icaoType) || (a.manufacturer ? `${a.manufacturer} ${a.icaoType}` : a.icaoType);
      }
    }

    // Sticky: never drop resolved fields back to empty on a later snapshot.
    const prev = this.sticky.get(ac.hex);
    ac.airline = ac.airline || prev?.airline || "";
    ac.model = ac.model || prev?.model || "";
    ac.from = ac.from && ac.from !== "?" ? ac.from : prev?.from || "?";
    ac.to = ac.to && ac.to !== "?" ? ac.to : prev?.to || "?";
    ac.fromName = ac.fromName || prev?.fromName || "";
    ac.toName = ac.toName || prev?.toName || "";
    ac.registration = ac.registration || prev?.registration || "";
    ac.photoUrl = ac.photoUrl || prev?.photoUrl || "";
    ac.timestamp = now;
    this.sticky.set(ac.hex, {
      airline: ac.airline,
      model: ac.model,
      from: ac.from,
      to: ac.to,
      fromName: ac.fromName,
      toName: ac.toName,
      registration: ac.registration,
      photoUrl: ac.photoUrl,
    });

    this.o.enricher.warm(ac.hex, ac.callsign);
  }

  private geoResolve(ac: Aircraft): void {
    const c = this.o.getConfig();
    const geo = resolveAircraftGeo(ac.lat, ac.lon, ac.altitude, c.centerLat, c.centerLon, ac.track);
    ac.azimuth = geo.azimuth;
    ac.elevation = geo.elevation;
    ac.distance = geo.distance;
  }

  private async tick(): Promise<void> {
    const now = Date.now();

    // Source rotation: pick the current real source if it's not cooling,
    // otherwise move to the next free one. If everything is cooling we hold the
    // last snapshot silently (the client extrapolates) — no network call.
    const source = this.nextFreeSource(now);
    if (!source) {
      this.status = { ...this.status, ok: false, count: this.last.length, message: "sources cooling — holding last fix" };
      this.o.onStatus(this.status);
      return;
    }
    if (source !== this.o.source) this.o.source = source;

    const primary = await this.fetchList(source, now);
    if (primary === null) {
      this.cooldown[source] = now + (this.lastError?.includes("429") ? RATE_LIMIT_BACKOFF_MS : SOURCE_FAIL_BACKOFF_MS);
      const alt = this.nextFreeSource(now + 1);
      if (alt) this.o.source = alt;
      this.status = { ...this.status, ok: false, count: this.last.length, lastOk: this.status.lastOk, message: this.lastError ?? "source fetch failed" };
      this.o.onStatus(this.status);
      return;
    }

    const supplement = source === "radio" && this.o.supplementApi;
    const merged = supplement ? mergeSources(primary, this.lastApi) : primary;
    for (const ac of merged) {
      if (ac.lat !== 0 || ac.lon !== 0) this.geoResolve(ac);
      this.enrich(ac, now);
    }

    this.last = merged;
    this.cooldown[source] = 0; // success — clear the cooldown
    this.status = {
      source,
      ok: true,
      count: merged.length,
      lastOk: now,
      message: supplement ? `radio + ${this.lastApi.length} via API` : undefined,
    };
    this.o.onSnapshot(now, merged);
    this.o.onStatus(this.status);
  }

  /** The real source to poll: the active one if healthy, else the next free one.
   *  Returns null when every source is cooling. */
  private nextFreeSource(now: number): "opensky" | "api" | "radio" | "adsbfi" | null {
    const active = this.o.source;
    if ((this.cooldown[active] ?? 0) <= now) return active;
    for (const s of this.rotation) {
      if (s === active) continue;
      if ((this.cooldown[s] ?? 0) <= now) return s;
    }
    return null;
  }
}

function mergeSources(radio: Aircraft[], api: Aircraft[]): Aircraft[] {
  const byHex = new Map<string, Aircraft>();
  for (const a of api) byHex.set(a.hex, a);
  for (const r of radio) {
    const existing = byHex.get(r.hex);
    if (!existing) {
      byHex.set(r.hex, r);
      continue;
    }
    byHex.set(r.hex, r.timestamp >= existing.timestamp ? r : existing);
  }
  return [...byHex.values()];
}

/** Map an OpenSky state tuple to our Aircraft shape (units converted: m/s -> kt,
 *  m/s -> fpm). Tuple indexes are stable per the OpenSky states/all schema. */
function openskyToAircraft(s: unknown[], now: number): Aircraft | null {
  const icao24 = typeof s[0] === "string" ? s[0] : null;
  if (!icao24) return null;
  const callsign = typeof s[1] === "string" ? s[1].trim() : "";
  const lon = typeof s[5] === "number" ? (s[5] as number) : null;
  const lat = typeof s[6] === "number" ? (s[6] as number) : null;
  const baroAlt = typeof s[7] === "number" ? (s[7] as number) : null;
  const geoAlt = typeof s[13] === "number" ? (s[13] as number) : null;
  const vel = typeof s[9] === "number" ? (s[9] as number) : null; // m/s
  const track = typeof s[10] === "number" ? (s[10] as number) : null;
  const vRate = typeof s[11] === "number" ? (s[11] as number) : null; // m/s
  const squawk = typeof s[3] === "string" ? (s[3] as string) : undefined;
  const lastContact = typeof s[4] === "number" ? (s[4] as number) : null; // epoch seconds

  return {
    hex: icao24.toLowerCase(),
    callsign: callsign.replace(/^0+/, ""),
    model: "",
    airline: "",
    altitude: baroAlt ?? geoAlt ?? 0,
    speed: vel != null ? vel / 0.514444 : 0,
    track: track ?? 0,
    climbRate: vRate != null ? vRate / 0.005080278 : 0,
    lat: lat ?? 0,
    lon: lon ?? 0,
    distance: 0,
    azimuth: 0,
    elevation: 0,
    from: "?",
    to: "?",
    squawk: squawk && squawk !== "0000" ? squawk : undefined,
    timestamp: lastContact && lastContact > 0 ? lastContact * 1000 : now,
  };
}
