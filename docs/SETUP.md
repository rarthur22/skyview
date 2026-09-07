# Setup

## Prerequisites

- **Node.js 20+** (tested on 22)
- **npm** (bundled with Node) — the project uses **npm workspaces**. `pnpm` also works if you prefer it.

## Install

```bash
cd skyview-3d
npm install
```

Installing the `web`/`server` packages also pulls Three.js, React, Zustand,
Tailwind, Express, `ws`, and `astronomy-engine`.

## Run (development)

Starts the server (`:3000`) and the Vite dev server (`:5173`) together. The
default source is **OpenSky** (real ADS-B, free, no receiver needed):

```bash
npm run dev
```

Other sources (all real, no mock):

- `opensky` — free OpenSky ADS-B network (**default**)
- `adsbfi` — adsb.fi open data, up to 250 NM, 1 req/s (great fallback)
- `radio` — local dump1090 / readsb feed
- `api` — free airplanes.live API (can return HTTP 403 on some networks)

The source is persisted in `server/data/config.json` — change it once in the
**Data Link** panel of the UI and it stays. `DATA_SOURCE` env var overrides it
for a single run.

Open **http://localhost:5173/**.

### Separately

```bash
npm run dev:server    # server on :3000
npm run dev:web       # web on :5173 (proxies /api + /ws to :3000)
```

## Run (production)

```bash
npm run build                 # web/ -> web/dist
npm start                     # server on :3000 serving the built SPA
```

Open **http://localhost:3000/**.

## Configure

Copy the example env and edit:

```bash
cp server/.env.example server/.env
```

| Var | Default | Purpose |
|---|---|---|
| `DATA_SOURCE` | `opensky` | `radio`/`api`/`opensky`/`adsbfi` |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | bind socket. `0.0.0.0` = reachable from your phone on the LAN. |
| `AIRCRAFT_JSON_URL` | `http://localhost:8080/data/aircraft.json` | radio feed target |
| `API_URL` | `https://api.airplanes.live/v2/point/{lat}/{lon}/{r}` | API template |
| `ADSB_FI_URL` | `https://opendata.adsb.fi/api/v3/lat/{lat}/lon/{lon}/dist/{nm}` | adsb.fi template |
| `GEOCODE_USER_AGENT` | skyview-3d/0.1 | Nominatim UA |
| `SUPPLEMENT_API` | `1` | also poll the API when on radio |
| `POLL_MS` | `8000` | poll cadence; client extrapolates between polls |

The web app reads `VITE_*` variables from `web/.env` (see `server/.env.example`
for the list). In most cases you can ignore them — endpoints are derived from the
page origin.

## Important: the default port

`3000` is the Skylight convention. If something else already occupies it (Docker
Desktop commonly maps `3000`), the server will fail to bind. Setting `PORT` moves
**both** the server **and** the Vite dev proxy, so one variable fixes everything:

```bash
# Windows (cmd.exe)
set PORT=3001 && npm run dev

# PowerShell / macOS / Linux
PORT=3001 npm run dev
```

For a production single-process run it's automatic — set `PORT` and the SPA
derives its API/WS endpoint from the same origin.
