// Live aircraft data manager. Connects to the SkyView WebSocket, keeps the latest
// two snapshots, and interpolates positions between them so the HUD animates
// smoothly at 60fps from ~1 Hz updates. Singleton — components subscribe.

import type {
  Aircraft,
  Config,
  SkyData,
  SourceStatus,
  WeatherData,
  WebSocketPayload,
} from "@skyview/shared/index.js";
import { DEG, llToMeters, groundToSkyAngles } from "@skyview/shared/index.js";
import { skyPos } from "./calculations.js";

/** Every airborne contact is projected onto a dome of this fixed radius, so all
 *  aircraft keep a constant on-screen size regardless of ground distance. */
export const DOME_RADIUS = 500;

export interface AircraftFrame extends Aircraft {
  /** 3D position in scene units (already scaled). */
  x: number;
  y: number;
  z: number;
}

interface Snapshot {
  now: number;
  byHex: Map<string, Aircraft>;
}

const SERVER_URL =
  import.meta.env.VITE_SERVER_URL ??
  (typeof window !== "undefined" && window.location?.protocol
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/ws`
    : "ws://localhost:3000/ws");

class AircraftDataManager {
  private ws: WebSocket | null = null;
  private cur: Snapshot = { now: 0, byHex: new Map() };
  private config: Config | null = null;
  private sky: SkyData | null = null;
  private weather: WeatherData | null = null;
  private status: SourceStatus | null = null;
  private lastPayload: WebSocketPayload | null = null;

  private subscribers = new Set<(p: WebSocketPayload) => void>();
  private stateSubscribers = new Set<() => void>();

  private connected = false;
  private lastUpdate = 0;
  private latencySamples: number[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectAttempts = 0;

  start(url: string = SERVER_URL): void {
    if (this.ws) return;
    this.open(url);
  }

  stop(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  private open(url: string): void {
    this.ws = new WebSocket(url);
    const started = performance.now();

    this.ws.onopen = () => {
      this.connected = true;
      this.connectAttempts = 0;
      this.notifyState();
    };

    this.ws.onmessage = (ev) => {
      try {
        const p = JSON.parse(ev.data as string) as WebSocketPayload;
        this.ingest(p);
        this.latencySamples.push(performance.now() - started);
        if (this.latencySamples.length > 20) this.latencySamples.shift();
        this.notify();
      } catch {
        /* malformed frame — drop */
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.notifyState();
      const backoff = Math.min(5000, 500 * 2 ** this.connectAttempts);
      this.connectAttempts += 1;
      this.reconnectTimer = setTimeout(() => this.open(url), backoff);
    };

    this.ws.onerror = () => {
      /* onclose will fire the reconnect */
    };
  }

  private ingest(p: WebSocketPayload): void {
    // Shift current -> previous, roll in the new snapshot.
    const byHex = new Map<string, Aircraft>();
    for (const ac of p.aircraft) byHex.set(ac.hex, ac);
    this.cur = { now: p.now, byHex };
    this.config = p.config;
    this.sky = p.sky;
    this.weather = p.weather ?? null;
    this.status = p.status;
    this.lastPayload = p;
    this.lastUpdate = Date.now();
  }

  subscribe(cb: (p: WebSocketPayload) => void): () => void {
    this.subscribers.add(cb);
    if (this.lastPayload) cb(this.lastPayload);
    return () => this.subscribers.delete(cb);
  }

  subscribeState(cb: () => void): () => void {
    this.stateSubscribers.add(cb);
    return () => this.stateSubscribers.delete(cb);
  }

  private notify(): void {
    if (!this.lastPayload) return;
    for (const cb of this.subscribers) cb(this.lastPayload);
  }

  private notifyState(): void {
    for (const cb of this.stateSubscribers) cb();
  }

  // --- accessors ---

  get connectedLive(): boolean {
    return this.connected;
  }

  get lastUpdateMs(): number {
    return this.lastUpdate;
  }

  get avgLatencyMs(): number {
    if (!this.latencySamples.length) return 0;
    return this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;
  }

  getConfig(): Config | null {
    return this.config;
  }

  getSky(): SkyData | null {
    return this.sky;
  }

  getWeather(): WeatherData | null {
    return this.weather;
  }

  getStatus(): SourceStatus | null {
    return this.status;
  }

  /** All known aircraft, current snapshot (no interpolation). */
  getAircraft(): Aircraft[] {
    return this.cur.now ? [...this.cur.byHex.values()] : [];
  }

  /** Aircraft frames at `renderTime`, dead-reckoned forward from each latest fix
   *  so motion stays smooth across the (~8s) gaps between polls. */
  getFrames(renderTime: number): AircraftFrame[] {
    if (!this.cur.now) return [];
    const cfg = this.config;
    const frames: AircraftFrame[] = [];

    for (const a of this.cur.byHex.values()) {
      const hasPos = a.lat !== 0 || a.lon !== 0;
      let lat = a.lat;
      let lon = a.lon;
      let alt = a.altitude;
      let az = a.azimuth;
      let el = a.elevation;
      let dist = a.distance;

      if (hasPos && cfg) {
        const dt = Math.max(0, Math.min(30, (renderTime - a.timestamp) / 1000));
        if (dt > 0.05) {
          const v = a.speed * 0.514444; // m/s
          const ve = v * Math.sin(a.track * DEG);
          const vn = v * Math.cos(a.track * DEG);
          lat = a.lat + (vn * dt) / 110540;
          lon = a.lon + (ve * dt) / (111320 * Math.cos(a.lat * DEG));
          alt = a.altitude + a.climbRate * (dt / 60);
          const m = llToMeters(lat, lon, cfg.centerLat, cfg.centerLon);
          const sky = groundToSkyAngles(m, alt, a.track);
          az = sky.az;
          el = sky.elev;
          dist = sky.slantM / 1000;
        }
      }

      // All contacts sit on a dome. Radius grows slightly with distance so
      // aircraft at the same bearing/elevation don't stack on top of each other.
      const r = DOME_RADIUS + Math.min(450, Math.max(0, (dist - 10) * 1.5));
      const p = skyPos(az, el, r);
      frames.push({ ...a, x: p.x, y: p.y, z: p.z, altitude: alt, distance: dist, azimuth: az, elevation: el });
    }

    return frames;
  }
}

export const dataManager = new AircraftDataManager();
export { SERVER_URL };
