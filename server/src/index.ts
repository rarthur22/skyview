// Entry point. Wires the config store, data poller, sky engine, WebSocket hub,
// REST API, and (in production) serves the built web app. Binds 0.0.0.0 so the
// HUD is reachable from your phone on the LAN.

import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import express from "express";
import type { Config, SkyData } from "@skyview/shared/index.js";
import { ConfigStore, DEFAULT_CONFIG, ConfigValidationError, validateConfig } from "./config.js";
import { RouteEnricher } from "./enrichment.js";
import { Poller } from "./adsb.js";
import { Hub } from "./websocket.js";
import { TleStore } from "./tle.js";
import { resolveLocation, parseLatLon } from "./geocode.js";
import { searchAirports, lookupAirport } from "./airports.js";
import { computeSky } from "./sky-engine.js";
import { makeWeatherProvider } from "./weather.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(__dirname, "..");
const DATA_DIR = process.env.DATA_DIR ?? resolve(SERVER_ROOT, "data");
const WEB_DIST = resolve(SERVER_ROOT, "../web/dist");

const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
// Env override for data source. If unset, config.json is used (persisted via UI).
const ENV_SOURCE_RAW = process.env.DATA_SOURCE?.trim();
const ENV_SOURCE: Config["source"] | null =
  ENV_SOURCE_RAW === "radio" || ENV_SOURCE_RAW === "api" || ENV_SOURCE_RAW === "opensky" || ENV_SOURCE_RAW === "adsbfi"
    ? ENV_SOURCE_RAW
    : null;
const RADIO_URL = process.env.AIRCRAFT_JSON_URL ?? "http://localhost:8080/data/aircraft.json";
const API_URL = process.env.API_URL ?? "https://api.airplanes.live/v2/point/{lat}/{lon}/{r}";
const ADSB_FI_URL = process.env.ADSB_FI_URL ?? "https://opendata.adsb.fi/api/v3/lat/{lat}/lon/{lon}/dist/{nm}";
const POLL_MS = Number(process.env.POLL_MS ?? 8000);
const SUPPLEMENT_API = (process.env.SUPPLEMENT_API ?? "0") !== "0";
const API_POLL_MS = Number(process.env.API_POLL_MS ?? 8000);
const GEOCODE_UA = process.env.GEOCODE_USER_AGENT ?? "SkyView/1.0";
const ALLOWED_HOSTS = (process.env.ALLOWED_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

const serverDefaultConfig: Config = { ...DEFAULT_CONFIG, locationName: "Paris, France" };

function hostAllowed(host: string | undefined): boolean {
  if (!host) return true;
  const h = host.toLowerCase().replace(/:\d+$/, "");
  if (ALLOWED_HOSTS.length === 0) {
    return (
      h === "localhost" ||
      h === "127.0.0.1" ||
      h === "[::1]" ||
      h.endsWith(".local") ||
      /^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)
    );
  }
  return ALLOWED_HOSTS.some((allowed) => {
    const a = allowed.toLowerCase();
    if (a.startsWith("*.")) return h.endsWith(a.slice(1));
    return h === a;
  });
}

/** Sky cache: recompute at most every 30s; cheap enough to do inline in the hub. */
function makeSkyProvider(lat: () => number, lon: () => number, config: () => Config): () => SkyData {
  let cached: SkyData | null = null;
  let at = 0;
  return () => {
    const now = Date.now();
    if (cached && now - at < 30_000) return cached;
    cached = computeSky(new Date(now), lat(), lon(), {
      stars: config().showSky && config().showStars,
      sun: config().showSky && config().showSun,
      moon: config().showSky && config().showMoon,
      planets: false,
      magLimit: 2.6,
    });
    at = now;
    return cached;
  };
}

async function main(): Promise<void> {
  const store = new ConfigStore(resolve(DATA_DIR, "config.json"), serverDefaultConfig);
  await store.load();

  const enricher = new RouteEnricher(resolve(DATA_DIR, "route-cache.json"), 12);
  await enricher.load();
  enricher.ping();

  const tleStore = new TleStore();

  const app = express();
  app.use((req, res, next) => {
    if (!hostAllowed(req.headers.host)) {
      res.status(403).type("text/plain").send("Forbidden: Host header not in allowlist.\n");
      return;
    }
    next();
  });
  app.use(express.json());

  const server = createServer(app);
  const getSky = makeSkyProvider(() => store.get().centerLat, () => store.get().centerLon, () => store.get());
  const getWeather = makeWeatherProvider(() => store.get().centerLat, () => store.get().centerLon);

  const hub = new Hub(server, {
    getConfig: () => store.get(),
    getStatus: () => poller.getStatus(),
    getSky,
    getWeather,
    isOriginAllowed: (origin) => {
      if (!origin) return true;
      const host = new URL(origin).hostname;
      return hostAllowed(host);
    },
  });

  // Resolve source: env var overrides config.json (one-time override). Coerce
  // any legacy/invalid value (e.g. old "mock") back to the opensky default.
  const cfgSource = store.get().source;
  const safeSource: Config["source"] =
    cfgSource === "opensky" || cfgSource === "radio" || cfgSource === "api" || cfgSource === "adsbfi"
      ? cfgSource
      : "opensky";
  const initialSource = ENV_SOURCE ?? safeSource;
  if (ENV_SOURCE || cfgSource !== safeSource) store.patch({ source: safeSource });

  const poller = new Poller({
    source: initialSource,
    radioUrl: RADIO_URL,
    apiUrlTemplate: API_URL,
    adsbfiUrlTemplate: ADSB_FI_URL,
    pollMs: POLL_MS,
    supplementApi: SUPPLEMENT_API,
    apiPollMs: API_POLL_MS,
    getConfig: () => store.get(),
    enricher,
    onSnapshot: (now, aircraft) => hub.setAircraft(now, aircraft),
    onStatus: () => hub.broadcast(),
  });

  // --- REST API ---
  app.get("/api/health", (_req, res) => res.json({ ok: true, source: poller.getStatus().source }));
  app.get("/api/config", (_req, res) => res.json(store.get()));
  app.post("/api/config", (req, res) => {
    try {
      validateConfig(req.body ?? {});
      res.json(store.patch(req.body ?? {}));
    } catch (err) {
      if (err instanceof ConfigValidationError) return res.status(400).json({ error: err.message });
      throw err;
    }
  });
  app.post("/api/config/reset", (_req, res) => res.json(store.reset()));
  app.get("/api/aircraft", (_req, res) => res.json(poller.getSnapshot()));
  app.get("/api/aircraft-display", (_req, res) => res.json({ displayMode: store.get().displayMode }));
  app.post("/api/aircraft-display", (req, res) => {
    const mode = req.body?.displayMode;
    if (mode !== "glyphs" && mode !== "glb" && mode !== "mesh") {
      return res.status(400).json({ error: "displayMode must be glyphs | glb | mesh" });
    }
    res.json(store.patch({ displayMode: mode }));
  });
  app.get("/api/status", (_req, res) => res.json(poller.getStatus()));
  app.get("/api/weather", (_req, res) => res.json(getWeather() ?? { error: "unavailable" }));
  app.get("/api/geocode", async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (!q) return res.status(400).json({ error: "missing query parameter q" });
    const direct = parseLatLon(q);
    if (direct) return res.json(direct);
    try {
      const hit = await resolveLocation(q, { userAgent: GEOCODE_UA });
      if (!hit) return res.status(404).json({ error: `no match for "${q}"` });
      res.json(hit);
    } catch {
      res.status(502).json({ error: "geocoding service unavailable" });
    }
  });
  app.get("/api/airports", async (req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (!q) return res.status(400).json({ error: "missing query parameter q" });
    res.json(searchAirports(q));
  });
  app.get("/api/airport", async (req, res) => {
    const code = String(req.query.code ?? "").trim().toUpperCase();
    if (!code) return res.status(400).json({ error: "missing query parameter code" });
    const found = lookupAirport(code);
    if (!found) return res.status(404).json({ error: `no airport matching "${code}"` });
    res.json(found);
  });
  app.get("/api/tle", async (_req, res) => res.json(await tleStore.get()));
  app.post("/api/source", (req, res) => {
    const s = req.body?.source;
    if (s !== "radio" && s !== "api" && s !== "opensky" && s !== "adsbfi") {
      return res.status(400).json({ error: "source must be 'radio', 'api', 'opensky' or 'adsbfi'" });
    }
    store.patch({ source: s });
    poller.setSource(s);
    res.json(poller.getStatus());
  });

  // --- static web (production build) ---
  if (existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST));
    app.get("/", (_req, res) => res.sendFile(resolve(WEB_DIST, "index.html")));
  } else {
    app.get("/", (_req, res) =>
      res.type("text/plain").send("Web build not found. Run `pnpm --filter @skyview/web build`, or use the Vite dev server."),
    );
  }

  poller.start();

  server.listen(PORT, HOST, () => {
    console.log(`[skyview] SkyView 3D ready — source=${initialSource}, port=${PORT}`);
    console.log(`[skyview] server listening on http://${HOST}:${PORT}`);
    console.log(`[skyview] data source: ${initialSource}`);
    console.log(`[skyview] websocket:   ws://${HOST}:${PORT}/ws`);
    if (initialSource !== "api" && initialSource !== "adsbfi") {
      console.log(`[skyview] radio url:    ${RADIO_URL}`);
    }
  });
}

main().catch((err) => {
  console.error("[skyview] fatal:", err);
  process.exit(1);
});
