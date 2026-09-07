// Enrichment: airline-by-callsign, ICAO type-code -> human name, and a lightweight
// route resolver (adsbdb v0) with an in-memory cache. Kept deliberately lean so the
// standalone server has no bundled data tables — a miss is non-fatal and returns
// empty fields that the UI degrades gracefully on.

// RAM-only route cache. Nothing is written to disk, so the dev watcher never
// restarts the server on a cache write (the old behaviour caused WS ECONNRESET).

/** Curated airline prefix -> full name. Covers the most common operators. */
const AIRLINES: Record<string, string> = {
  ACA: "Air Canada",
  AFR: "Air France",
  AMX: "AeroMéxico",
  AUA: "Austrian Airlines",
  AVA: "Avianca",
  AZA: "ITA Airways",
  BAW: "British Airways",
  BMI: "midlands",
  BVN: "Bavaria",
  CAL: "China Airlines",
  CCA: "Air China",
  CPA: "Cathay Pacific",
  DLH: "Lufthansa",
  DAL: "Delta Air Lines",
  EIN: "Aer Lingus",
  ETH: "Ethiopian Airlines",
  ETD: "Etihad Airways",
  EZY: "easyJet",
  GLO: "Air Greenland",
  IBE: "Iberia",
  ICE: "Icelandair",
  JAL: "Japan Airlines",
  KAC: "Kuwait Airways",
  KAL: "Korean Air",
  KLM: "KLM Royal Dutch Airlines",
  LAN: "LATAM Airlines",
  LOT: "LOT Polish Airlines",
  MAS: "Malaysia Airlines",
  NKS: "Spirit Airlines",
  QAN: "Qantas",
  QFA: "Qantas",
  ROU: "Air Canada Rouge",
  RYR: "Ryanair",
  SAS: "Scandinavian Airlines",
  SWA: "Southwest Airlines",
  TAR: "TAP Air Portugal",
  THY: "Turkish Airlines",
  TUI: "TUI Airways",
  UAL: "United Airlines",
  UAE: "Emirates",
  VIR: "Virgin Atlantic",
  VLG: "Vueling",
  WZZ: "Wizz Air",
};

const HEX: Record<string, string> = {};
for (const [prefix, name] of Object.entries(AIRLINES)) {
  HEX[prefix.toLowerCase()] = name;
}

/** Map a callsign (e.g. "AFR1234") to an airline name, or undefined. */
export function airlineFromCallsign(callsign?: string): string | undefined {
  if (!callsign) return undefined;
  const m = callsign.toLowerCase().match(/^[a-z]{3}/);
  if (!m) return undefined;
  return HEX[m[0]];
}

/** Common ICAO type code -> human description. */
const TYPES: Record<string, string> = {
  A20N: "Airbus A320neo",
  A21N: "Airbus A321neo",
  A306: "Airbus A300-600",
  A318: "Airbus A318",
  A319: "Airbus A319",
  A320: "Airbus A320",
  A321: "Airbus A321",
  A332: "Airbus A330-200",
  A333: "Airbus A330-300",
  A339: "Airbus A330-900",
  A343: "Airbus A340-300",
  A359: "Airbus A350-900",
  A388: "Airbus A380-800",
  A748: "Avro 748",
  AT43: "ATR 42-300",
  AT72: "ATR 72",
  B350: "Beechcraft King Air 350",
  B38M: "Boeing 737 MAX 8",
  B39M: "Boeing 737 MAX 9",
  B712: "Boeing 717-200",
  B738: "Boeing 737-800",
  B739: "Boeing 737-900",
  B742: "Boeing 747-200",
  B744: "Boeing 747-400",
  B748: "Boeing 747-8",
  B752: "Boeing 757-200",
  B753: "Boeing 757-300",
  B762: "Boeing 767-200",
  B763: "Boeing 767-300",
  B77L: "Boeing 777-200LR",
  B772: "Boeing 777-200",
  B77W: "Boeing 777-300ER",
  B788: "Boeing 787-8",
  B789: "Boeing 787-9",
  B78X: "Boeing 787-10",
  C152: "Cessna 152",
  C172: "Cessna 172",
  C208: "Cessna 208 Caravan",
  CRJ2: "Bombardier CRJ-200",
  CRJ7: "Bombardier CRJ-700",
  CRJ9: "Bombardier CRJ-900",
  E170: "Embraer E170",
  E190: "Embraer E190",
  E195: "Embraer E195",
  E55P: "Embraer Phenom 300",
  ERJ145: "Embraer ERJ-145",
  GLF6: "Gulfstream G650",
  MD82: "McDonnell Douglas MD-82",
  MD88: "McDonnell Douglas MD-88",
  PC12: "Pilatus PC-12",
  PRM1: "Raytheon Premier I",
  R22: "Robinson R22",
  R44: "Robinson R44",
  RJ85: "BAe 146-200",
  SR22: "Cirrus SR22",
  SU95: "Sukhoi Superjet 100",
  SW4: "Metroliner",
  ZZZZ: "Unknown — no flight plan",
};

export function typeName(typeCode?: string): string | undefined {
  if (!typeCode) return undefined;
  return TYPES[typeCode] ?? TYPES[typeCode.toLowerCase()] ?? typeCode;
}

interface Route {
  airline?: string;
  origin?: string;
  destination?: string;
  originName?: string;
  destName?: string;
  originCity?: string;
  destCity?: string;
  originLat?: number;
  originLon?: number;
  destLat?: number;
  destLon?: number;
}

interface AirportInfo {
  name?: string;
  municipality?: string;
  iata_code?: string;
  icao_code?: string;
  latitude?: number;
  longitude?: number;
}

interface AircraftInfo {
  /** ICAO type code, e.g. "A359". */
  icaoType?: string;
  /** Manufacturer, e.g. "Airbus". */
  manufacturer?: string;
  /** Tail number / registration, e.g. "F-ABCD". */
  registration?: string;
  /** Photo URL from adsbdb, when available. */
  photoUrl?: string;
}

interface CachedRoute extends Route, AircraftInfo {
  hex: string;
  callsign?: string;
  fetchedAt: number;
}

/**
 * Thin, RAM-only cached adsbdb (v0) route/aircraft resolver. Best-effort and
 * rate-limit aware: lookups are queued and fired at a modest pace, a 429 pauses
 * the queue, and negative results (aircraft/route not found) are cached too so
 * we never hammer the API for the same hex repeatedly.
 */
export class RouteEnricher {
  private cache = new Map<string, CachedRoute>();
  private pending = new Set<string>();
  private queue: { hex: string; callsign?: string }[] = [];
  private draining = false;
  private lastFetchAt = 0;
  private backoffUntil = 0;

  /** Min interval between adsbdb calls (ms). Kept conservative: the free tier
   *  allows ~512 req/60s but the callsign route dataset is sparse, and a shared
   *  IP can be throttled hard. Best-effort enrichment, not a hard dependency. */
  private static MIN_INTERVAL_MS = 1500;
  private static RATE_LIMIT_BACKOFF_MS = 60_000;
  private static NEGATIVE_TTL_MS = 6 * 3600_000; // don't re-ask a miss for 6h

  constructor(
    /** Kept for API compatibility, but no longer used — the cache is in memory only. */
    private cachePath: string,
    private ttlHours = 12,
  ) {
    void this.cachePath;
  }

  ping(): void {
    /* RAM-only: nothing to persist */
  }

  load(): void {
    /* RAM-only: start with an empty cache */
  }

  /** Synchronously resolve cached route + aircraft info. */
  enrichSync(
    hex: string,
    _callsign: string | undefined,
    now: number,
  ): { route?: Route; aircraft?: AircraftInfo } {
    const hit = this.cache.get(hex);
    if (hit && now - hit.fetchedAt < this.ttlHours * 3600_000) {
      if (hit.airline || hit.origin || hit.destination || hit.icaoType || hit.registration) {
        return this.toResult(hit);
      }
    }
    return {};
  }

  /** Queue an async adsbdb lookup (deduped; never more than one request/hex). */
  warm(hex: string, callsign?: string): void {
    if (this.pending.has(hex)) return;
    const existing = this.cache.get(hex);
    if (existing && Date.now() - existing.fetchedAt < this.ttlHours * 3600_000) return;
    this.pending.add(hex);
    this.queue.push({ hex, callsign });
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const now = Date.now();
        if (now < this.backoffUntil) {
          await sleep(this.backoffUntil - now);
          continue;
        }
        const wait = this.lastFetchAt + RouteEnricher.MIN_INTERVAL_MS - now;
        if (wait > 0) await sleep(wait);

        const { hex, callsign } = this.queue.shift()!;
        await this.fetchAdsbdv(hex, callsign);
      }
    } finally {
      this.draining = false;
    }
  }

  private toResult(hit: CachedRoute): { route?: Route; aircraft?: AircraftInfo } {
    return {
      route: {
        airline: hit.airline,
        origin: hit.origin,
        destination: hit.destination,
        originName: hit.originName,
        destName: hit.destName,
        originCity: hit.originCity,
        destCity: hit.destCity,
        originLat: hit.originLat,
        originLon: hit.originLon,
        destLat: hit.destLat,
        destLon: hit.destLon,
      },
      aircraft: {
        icaoType: hit.icaoType,
        manufacturer: hit.manufacturer,
        registration: hit.registration,
        photoUrl: hit.photoUrl,
      },
    };
  }

  private async fetchAdsbdv(hex: string, callsign?: string): Promise<void> {
    try {
      // Combined aircraft + flightroute lookup (single GET when we have both).
      const path = callsign
        ? `aircraft/${encodeURIComponent(hex)}?callsign=${encodeURIComponent(callsign)}`
        : `aircraft/${encodeURIComponent(hex)}`;
      const res = await fetch(`https://api.adsbdb.com/v0/${path}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(4000),
      });
      this.lastFetchAt = Date.now();

      if (res.status === 429) {
        // Rate-limited: pause the whole queue, don't cache anything.
        this.backoffUntil = Date.now() + RouteEnricher.RATE_LIMIT_BACKOFF_MS;
        return;
      }
      if (!res.ok) return;

      const json = (await res.json()) as {
        response?: {
          aircraft?: {
            type?: string;
            icao_type?: string;
            manufacturer?: string;
            registration?: string;
            mode_s?: string;
            url_photo?: string | null;
            url_photo_thumbnail?: string | null;
          };
          flightroute?: {
            airline?: { name?: string };
            origin?: AirportInfo;
            destination?: AirportInfo;
          };
        };
      };
      const aircraft = json.response?.aircraft;
      const route = json.response?.flightroute;
      if (!aircraft && !route) {
        // No aircraft/route on file — cache the miss so we don't re-ask for
        // this hex until NEGATIVE_TTL_MS (callsign route coverage is sparse).
        this.cache.set(hex, { hex, fetchedAt: Date.now() - (this.ttlHours * 3600_000 - RouteEnricher.NEGATIVE_TTL_MS) });
        return;
      }

      const entry: CachedRoute = {
        hex,
        callsign,
        fetchedAt: Date.now(),
        airline: route?.airline?.name,
        origin: route?.origin?.icao_code ?? route?.origin?.iata_code,
        destination: route?.destination?.icao_code ?? route?.destination?.iata_code,
        originName: route?.origin?.municipality ?? route?.origin?.name,
        destName: route?.destination?.municipality ?? route?.destination?.name,
        originCity: route?.origin?.municipality,
        destCity: route?.destination?.municipality,
        originLat: route?.origin?.latitude,
        originLon: route?.origin?.longitude,
        destLat: route?.destination?.latitude,
        destLon: route?.destination?.longitude,
        icaoType: aircraft?.icao_type ?? aircraft?.type,
        manufacturer: aircraft?.manufacturer,
        registration: aircraft?.registration,
        photoUrl: aircraft?.url_photo_thumbnail ?? aircraft?.url_photo ?? undefined,
      };
      this.cache.set(hex, entry);
      return;
    } catch {
      /* offline / network — drop, allow a later retry */
      return;
    } finally {
      this.pending.delete(hex);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
