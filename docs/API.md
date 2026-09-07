# SkyView 3D API

REST endpoints (proxied via `/api/*` in Vite dev, or served directly by the
server in production) plus a single WebSocket channel.

## WebSocket

`ws://<host>:<port>/ws`

Every connected client receives the full SkyView payload ~1×/8 s:

```jsonc
{
  "aircraft": [
    {
      "hex": "a3f2b1",
      "callsign": "AF123",
      "model": "Airbus A350-900",
      "airline": "Air France",
      "altitude": 5000,
      "speed": 450,
      "track": 315,
      "climbRate": 800,
      "lat": 48.8566,
      "lon": 2.3522,
      "distance": 15.2,       // km, slant range
      "azimuth": 45.2,        // deg from North
      "elevation": 30.1,      // deg above horizon
      "from": "CDG",
      "to": "JFK",
      "timestamp": 1693017600000
    }
  ],
  "sky": {
    "sun":  { "azimuth": 270, "elevation": -15, "riseTime": "06:45", "setTime": "20:30", "isDay": false },
    "moon": { "azimuth": 90, "elevation": 45, "phase": 0.75, "visible": true },
    "stars": [{ "name": "Sirius", "azimuth": 180, "elevation": 20, "magnitude": -1.46 }],
    "planets": [{ "name": "Jupiter", "azimuth": 120, "elevation": 30, "magnitude": -2.0 }]
  },
  "config": {
    "source": "opensky",
    "centerLat": 48.8566,
    "centerLon": 2.3522,
    "radiusMiles": 50,
    "locationName": "Paris, France",
    "displayMode": "glyphs"
  },
  "status": { "source": "opensky", "ok": true, "count": 70, "lastOk": 1693017600000 },
  "now": 1693017600000
}
```

## REST

### Health

`GET /api/health`
→ `{ ok: true, source: "opensky" }`

### Config

- `GET /api/config` → current `Config` (location, radius, display prefs, filters).
- `POST /api/config` → merge an `{ centerLat, centerLon, radiusMiles, ... }` patch.
  Validates values; returns `400` on bad input.
- `POST /api/config/reset` → restore defaults.

### Aircraft

- `GET /api/aircraft` → `{ now, aircraft: Aircraft[] }` (the current snapshot).

### Display mode

- `GET /api/aircraft-display` → `{ displayMode }`
- `POST /api/aircraft-display`, body `{ displayMode: "glyphs" | "glb" | "mesh" }`.

### Status

`GET /api/status` → `{ source, ok, count, lastOk, message }`

### Location / geocoding

- `GET /api/geocode?q=Paris` → `{ name, lat, lon, type, displayName }` (Nominatim).
  Accepts `lat,lon` directly. `404` on no match, `502` if the service is down.
- `GET /api/airports?q=paris` → `Airport[]` (by code or city substring).
- `GET /api/airport?code=CDG` → single `Airport` by ICAO/IATA, `404` if unknown.

### Source

`POST /api/source`, body `{ source: "radio" | "api" | "opensky" | "adsbfi" }` → new status.
The choice is persisted to `config.json`.

### Satellites (optional)

`GET /api/tle` → current TLEs from Celestrak (cached). Not required by the core HUD.

## Types

Shared TypeScript contracts live in `shared/src/types.ts` (`Aircraft`,
`SkyData`, `Config`, `WebSocketPayload`, `SourceStatus`).
