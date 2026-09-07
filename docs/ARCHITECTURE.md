# SkyView 3D Architecture

SkyView 3D is a small pnpm workspace with three packages and no shared state
between the backend and the frontend other than the JSON contract.

```
                 opensky / adsb.fi / dump1090 / airplanes.live
                                │ poll (~8 s)
                                ▼
              server/  (Node · Express · ws)  :3000
              • adsb.ts        poll + normalize + enrich + source rotation
              • geo.ts         az/el/distance vs. the observer
              • sky-engine.ts  sun/moon/stars/planets (astronomy-engine)
              • enrichment.ts  airline / type / route (adsbdb v0, RAM cache)
              • config.ts      persisted user config (config.json)
              • websocket.ts   broadcast {aircraft, sky, config, status}
              ├────────────── REST /api/* ──────────────┬──────────────┐
              ▼                                         ▼              ▼
        web/ (React + Three.js + Tailwind) :5173  (dev)   :3000  (prod, served by server)
        • SkyViewHUD        layout
        • Viewport3D        Three.js scene + render loop
        • SidebarLeft/Right config + filters / flight list
        • Compass, AircraftGlyph, StatusBar
        • data-processing   WebSocket client + dead-reckoning
        • hooks             useWebSocket/useCamera/useAircraft/useConfig
        • store.ts          zustand UI state (camera, selection, filters)
```

## Data flow

1. **Server** polls the chosen source (auto-rotating between `opensky` ↔ `adsbfi` ↔
   `api` ↔ `radio` with per-source cooldowns), normalizes records into the shared
   `Aircraft` shape, enriches them (airline, type, route via **adsbdb v0**), and
   resolves observer-relative geometry (`distance`, `azimuth`, `elevation`)
   against the configured `centerLat`/`centerLon`.
2. **WebSocket** `ws://host/ws` pushes the full payload `{aircraft, sky, config,
   status, weather, now}` to every connected client ~1×/8 s.
3. **Web** dead-reckons each aircraft between fixes (extrapolating lat/lon/alt
   along heading/speed at 60 fps), so motion stays smooth from ~8 s updates.
4. The **render loop** places aircraft on a sky dome by `(azimuth, elevation)`,
   scales by `distance`, orients by `track`, synthesizes trails and the sky layer,
   and projects labels to screen coordinates in a DOM overlay.

## Coordinate system

- `+X = East`, `+Z = North`, `+Y = Up` (zenith).
- `azimuth` is measured from true North (0=N, 90=E, 180=S, 270=W).
- `elevation` is degrees above the mathematical horizon (90 = zenith).
- Aircraft are placed on a dome at radius `max(0.5, distance_km) × KM_TO_UNIT`;
  the camera sits at the origin looking along the current view direction.

## Display modes

| Mode | Visual | Cost |
|---|---|---|
| `glyphs` | geometric heading dart | lightest |
| `mesh` | procedural 3D jet silhouette | medium |
| `glb` | glTF model (falls back to `mesh`) | heaviest (per-fragment) |

The active mode is a client preference (persisted) and synced to the server via
`POST /api/aircraft-display`.

## Slow-downs, not correctness issues

- The server keeps a **sticky** enrichment cache so routes never flicker back
  to `?` between polls.
- The frontend **dead-reckons** between fixes for smooth motion; aircraft stale
  for > ~30 s are culled.
- The **sky engine** caches results for 30 s (it only changes with time/position).
