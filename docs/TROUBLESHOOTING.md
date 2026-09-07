# Troubleshooting

## No aircraft visible

- The app shows **only real traffic** — there is no mock source. If the left panel
  shows a no-aircraft state, check the **status bar**: it shows `SRC` and the
  failure reason.
- In `opensky` (default) mode the view resolves around `centerLat`/`centerLon`.
  Set your location in **Location**, then widen the **Range** slider if you're
  far from an airport.
- **Positionless** records are kept but render at the center — real overhead
  traffic needs a lat/lon fix.

## `source fetch failed: …` in the status bar

The reason in parentheses is measured *from the server*:

- `DNS lookup failed (host)` — the server can't resolve the host. With `radio`,
  check `AIRCRAFT_JSON_URL`; with `api`, check the network.
- `connection refused` / `host unreachable` / `timeout` — check the feed URL's
  port and that the decoder web server is up.
- `HTTP 429` — the public API is rate-limiting. SkyView backs off automatically
  and recovers on its own; aircraft hold position through brief outages.

## `source fetch failed: HTTP 403` in the status bar (in `api` mode)

The free [airplanes.live](https://airplanes.live/) API can return **HTTP 403**
from some networks / regions (Cloudflare bot protection or IP policy). This is
not a SkyView bug. Options:

- **Use OpenSky** — the default `opensky` source needs no receiver and is free.
- **Use adsb.fi** — the `adsbfi` source (open data, up to 250 NM) is often more
  tolerant than OpenSky when the latter is rate-limiting your IP.
- **Use a local receiver** — `set DATA_SOURCE=radio` and point
  `AIRCRAFT_JSON_URL` at your `dump1090`/`readsb` feed.
- Check whether your network/proxy allows `api.airplanes.live`.

> The default source is `opensky`. The app auto-rotates between `opensky` ↔
> `adsbfi` ↔ `api` ↔ `radio` on failure with per-source cooldowns, so a
> temporarily rate-limited source doesn't leave you empty.

## The server won't bind port 3000

Docker Desktop and other tools often use `3000`. Set `PORT` once and both the
server **and** the dev proxy follow:

```bash
# Windows (cmd.exe)
set PORT=3001 && npm run dev

# PowerShell / macOS / Linux
PORT=3001 npm run dev
```

## The 3D view looks empty / nothing moves

- Open the browser console. The most common cause is a blocked WebSocket (mixed
  content or an origin check). With `ALLOWED_HOSTS` empty, the server allows
  loopback / LAN / `*.local` by default.
- If you're viewing from a non-LAN origin or a custom hostname, add it:
  `ALLOWED_HOSTS=skyview.mydomain.com pnpm dev`.

## Geographic/search endpoints fail

`/api/geocode` uses the free Nominatim service. It can be rate-limited or
momentarily down — the UI degrades to the lat/lon input. Set a descriptive
`GEOCODE_USER_AGENT` if you hit it heavily.

## glTF models don't appear

The `glb` display mode first loads the free Apache-2.0 aircraft model from the
configured remote URL. If the network or CORS blocks it, it falls back to the
procedural mesh — that's expected and not an error. A local model can be added
as `web/public/models/plane.gltf` by changing `DEFAULT_GLB_URL` in
`web/src/utils/aircraft-models.ts`.

## Performance

- 60 fps is targeted for up to ~100 aircraft. The heaviest settings are `glb`
  models and long trails.
- If FPS drops, switch to **Glyphs** mode and/or shorten **Trails**.

## Smoothing / extrapolation look

The HUD extrapolates aircraft between the ~8 s snapshots to render at 60 fps
(dead-reckoning along heading/speed, capped at 30 s). If motion looks like it
"waits then jumps", the server poll cadence (`POLL_MS`) may be lower than your
expectations — decrease it, or lower `POLL_MS` (larger numbers = slower updates,
more uniform).
