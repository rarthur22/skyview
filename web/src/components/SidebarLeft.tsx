// Left panel: location, filters, time, display mode and data source.
// Everything is collapse-proof and styled as a floating HUD dock.

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Config } from "@skyview/shared/index.js";
import { formatClock, formatDate } from "@skyview/shared/index.js";
import { useConfig } from "../hooks/useConfig.js";
import { useUI } from "../store.js";
import { getApiBase } from "../utils/api.js";
import { dataManager } from "../utils/data-processing.js";

const API_BASE = getApiBase();

type Source = "radio" | "api" | "opensky" | "adsbfi";

interface Suggest {
  name: string;
  lat: number;
  lon: number;
  type: string;
}

export function SidebarLeft() {
  const { config, prefs, setPrefs, updateServerConfig } = useConfig();

  // Location.
  const [query, setQuery] = useState("");
  const [suggests, setSuggests] = useState<Suggest[]>([]);
  const [latText, setLatText] = useState(String(config.centerLat));
  const [lonText, setLonText] = useState(String(config.centerLon));
  const [geoStatus, setGeoStatus] = useState("");
  const dirty = useRef(false);

  // Refresh the text fields from the live config, but never while typing.
  useEffect(() => {
    if (dirty.current) return;
    setLatText(String(config.centerLat));
    setLonText(String(config.centerLon));
  }, [config.centerLat, config.centerLon]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setSuggests([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const [geo, air] = await Promise.all([
          fetch(`${API_BASE}/geocode?q=${encodeURIComponent(q)}`).then((r) => (r.ok ? r.json() : null)),
          fetch(`${API_BASE}/airports?q=${encodeURIComponent(q)}`).then((r) => (r.ok ? r.json() : null)),
        ]);
        const list: Suggest[] = [];
        if (geo) list.push({ name: geo.name, lat: geo.lat, lon: geo.lon, type: geo.type });
        if (Array.isArray(air)) for (const a of air) list.push({ name: `${a.iata} · ${a.city}`, lat: a.lat, lon: a.lon, type: "airport" });
        setSuggests(list.slice(0, 5));
      } catch {
        setSuggests([]);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  const applyLocation = async (nlat: number, nlon: number, name: string) => {
    if (!Number.isFinite(nlat) || !Number.isFinite(nlon)) return;
    if (Math.abs(nlat) > 90 || Math.abs(nlon) > 180) return;
    dirty.current = false;
    setLatText(String(nlat));
    setLonText(String(nlon));
    setSuggests([]);
    setQuery("");
    await updateServerConfig({ centerLat: nlat, centerLon: nlon, locationName: name });
  };

  const geolocate = () => {
    if (!navigator.geolocation) return setGeoStatus("Unavailable");
    setGeoStatus("Locating…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void applyLocation(pos.coords.latitude, pos.coords.longitude, "My location");
        setGeoStatus("✓");
      },
      () => setGeoStatus("✗"),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div className="sidebar aside-border hud-scroll flex flex-col gap-3 px-3 pb-4">
      <Location query={query} setQuery={setQuery} suggests={suggests} geoStatus={geoStatus}
        latText={latText} lonText={lonText} onLat={(v: string) => { setLatText(v); dirty.current = true; }}
        onLon={(v: string) => { setLonText(v); dirty.current = true; }} onApply={applyLocation} geolocate={geolocate} />

      <Panel title="Filters">
        <div>
          <div className="mb-1 flex justify-between">
            <label className="hud-label">Range</label>
            <span className="text-[11px] text-hud-fg-primary">
              {Math.round(config.radiusMiles)} mi · {Math.round(config.radiusMiles * 1.609)} km
            </span>
          </div>
          <input className="hud-slider" type="range" min={5} max={1000} value={config.radiusMiles}
            onChange={(e) => void updateServerConfig({ radiusMiles: Number(e.target.value) } as Partial<Config>).catch(() => {})} />
          <div className="flex justify-between pt-1 text-[8px] text-hud-fg-secondary">
            <span>5</span><span>100</span><span>250</span><span>500</span><span>1000 mi</span>
          </div>
        </div>
        <BandSelector />
        <TypeFilters />
      </Panel>

      <Panel title="Time">
        <TimeDisplay />
      </Panel>

      <WeatherPanel />

      <Panel title="Display Mode">
        <DisplaySettings prefs={prefs} setPrefs={setPrefs} />
      </Panel>

      <DataSourcePanel />
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sidebar-section">
      <div className="section-header"><span className="hud-section-title">{title}</span></div>
      <div className="section-body">{children}</div>
    </section>
  );
}

function Location({ query, setQuery, suggests, geoStatus, latText, lonText, onLat, onLon, onApply, geolocate }: any) {
  const submit = () => void onApply(parseFloat(latText), parseFloat(lonText), "Custom");
  const copyCoords = async () => {
    const text = `${parseFloat(latText)}, ${parseFloat(lonText)}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard blocked — ignore */
    }
  };
  const shareLink = () => {
    const url = `${window.location.origin}${window.location.pathname}?lat=${parseFloat(latText)}&lon=${parseFloat(lonText)}`;
    void navigator.clipboard?.writeText(url).catch(() => {});
  };
  return (
    <section className="sidebar-section">
      <div className="section-header"><span className="hud-section-title">Location</span></div>
      <div className="section-body">
        <input className="hud-input" placeholder="City, airport… (or lat, lon)" value={query} onChange={(e) => setQuery(e.target.value)} />
        {suggests.length > 0 && (
          <div className="border border-hud-fg-primary/30 bg-hud-bg-secondary">
            {suggests.map((s: Suggest, i: number) => (
              <button key={i} className="block w-full px-2 py-1 text-left text-[11px] hover:bg-hud-fg-primary/15"
                onClick={() => void onApply(s.lat, s.lon, s.name)}>
                {s.name}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div><label className="hud-label">Latitude</label>
            <input className="hud-input" inputMode="decimal" value={latText}
              onChange={(e) => onLat(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} /></div>
          <div><label className="hud-label">Longitude</label>
            <input className="hud-input" inputMode="decimal" value={lonText}
              onChange={(e) => onLon(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="hud-btn" onClick={geolocate}>Geolocate</button>
          <button className="hud-btn hud-btn-active" onClick={submit}>Set</button>
        </div>
        <div className="flex gap-2">
          <button className="hud-btn !flex-1" onClick={() => void copyCoords()}>Copy coords</button>
          <button className="hud-btn !flex-1" onClick={shareLink}>Share link</button>
        </div>
        {geoStatus && <div className="text-[10px] text-hud-fg-secondary">{geoStatus}</div>}
      </div>
    </section>
  );
}

function BandSelector() {
  const altBand = useUI((s) => s.altBand);
  const setAltBand = useUI((s) => s.setAltBand);
  return (
    <div>
      <label className="hud-label block mb-1">Altitude band</label>
      <div className="flex border border-hud-fg-primary/30">
        {(["all", "low", "high"] as const).map((v) => (
          <button key={v} onClick={() => setAltBand(v)}
            className={`flex-1 py-1 text-[10px] font-bold ${altBand === v ? "bg-hud-fg-primary/20 text-hud-fg-primary" : "text-hud-fg-secondary"}`}>
            {v.toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}

function TypeFilters() {
  const typeFilter = useUI((s) => s.typeFilter);
  const toggleType = useUI((s) => s.toggleType);
  const labels: Record<string, string> = { commercial: "Commercial", military: "Military", general: "General", cargo: "Cargo" };
  return (
    <div>
      <label className="hud-label block mb-1">Type</label>
      <div className="flex flex-col gap-1.5">
        {Object.keys(labels).map((t) => (
          <label key={t} className="flex cursor-pointer items-center gap-2">
            <span className={`hud-check ${typeFilter[t] ? "checked" : ""}`} onClick={() => toggleType(t)} />
            <span className="text-[11px]">{labels[t]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function TimeDisplay() {
  const [now, setNow] = useState(Date.now());
  const simHour = useUI((s) => s.simHour);
  const setSimHour = useUI((s) => s.setSimHour);
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  return (
    <div>
      <div className="hud-value text-lg tracking-wider">{formatClock(now)}</div>
      <div className="text-[10px] text-hud-fg-secondary">{formatDate(now)} UTC</div>
      <div className="mt-2">
        <div className="mb-1 flex justify-between">
          <label className="hud-label">Simulate time</label>
          <button className="hud-btn !px-1.5 !py-0.5 !text-[8px]" onClick={() => setSimHour(null)}>
            Live
          </button>
        </div>
        <input className="hud-slider" type="range" min={0} max={23} step={0.25}
          value={simHour ?? 12} onChange={(e) => setSimHour(Number(e.target.value))} />
        <div className="text-[9px] text-hud-fg-secondary">
          {simHour == null ? "Real time" : `Offset 00:00 — simulated ${simHour.toFixed(2)}h`}
        </div>
      </div>
    </div>
  );
}

const WMO_ICON: Record<string, string> = {
  clear: "☀",
  cloudy: "☁",
  rain: "🌧",
  snow: "❄",
  storm: "⛈",
  fog: "🌫",
};

function WeatherPanel() {
  const [w, setW] = useState<any>(null);
  useEffect(() => dataManager.subscribe((p) => setW(p.weather ?? null)), []);
  if (!w) {
    return (
      <Panel title="Weather">
        <div className="text-[10px] text-hud-fg-secondary">No weather data.</div>
      </Panel>
    );
  }
  const windDir = `${Math.round(w.windDir).toString().padStart(3, "0")}°`;
  return (
    <Panel title="Weather">
      <div className="flex items-center gap-2">
        <span className="text-xl">{WMO_ICON[w.category] ?? "☁"}</span>
        <span className="hud-value text-xl">{Math.round(w.temperature)}°C</span>
        <span className="ml-auto text-[10px] text-hud-fg-secondary">{w.condition}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <Meta label="WIND" value={`${windDir}/${Math.round(w.windKt)}kt`} />
        <Meta label="GUST" value={`${Math.round(w.windGustKt)}kt`} />
        <Meta label="CLOUD" value={`${Math.round(w.cloudCover)}%`} />
        <Meta label="DAY" value={w.isDay ? "Day" : "Night"} />
      </div>
    </Panel>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[8px] tracking-wider text-hud-fg-secondary">{label}:</span>
      <span className="text-[10px] text-hud-fg-primary">{value}</span>
    </div>
  );
}

function DisplaySettings({ prefs, setPrefs }: any) {
  const modes = [
    { value: "glyphs", label: "Glyphs", note: "light" },
    { value: "glb", label: "glTF 3D", note: "realistic" },
    { value: "mesh", label: "Mesh", note: "balanced" },
  ];
  const fov = useUI((s) => s.view.fov);
  const setView = useUI((s) => s.setView);
  const resetView = useUI((s) => s.resetView);
  const uiScale = useUI((s) => s.uiScale);
  const setUiScale = useUI((s) => s.setUiScale);
  const amb = useUI((s) => s.amb);
  const setAmb = useUI((s) => s.setAmb);
  return (
    <div className="flex flex-col gap-1.5">
      {modes.map((m) => (
        <label key={m.value} className="flex cursor-pointer items-center gap-2">
          <input type="radio" name="mode" checked={prefs.displayMode === m.value}
            onChange={() => setPrefs({ displayMode: m.value })} className="accent-hud-fg-primary" />
          <span className="text-[11px]">{m.label} <span className="text-hud-fg-secondary/70">({m.note})</span></span>
        </label>
      ))}
      <div className="mt-1">
        <div className="mb-1 flex justify-between">
          <label className="hud-label">Field of view</label>
          <span className="text-[11px] text-hud-fg-primary">{Math.round(fov)}°</span>
        </div>
        <input className="hud-slider" type="range" min={50} max={130} value={fov}
          onChange={(e) => setView({ fov: Number(e.target.value) })} />
      </div>
      <div className="mt-1">
        <div className="mb-1 flex justify-between">
          <label className="hud-label">Brightness</label>
          <span className="text-[11px] text-hud-fg-primary">{Math.round(amb.brightness * 100)}%</span>
        </div>
        <input className="hud-slider" type="range" min={0.6} max={1.6} step={0.05} value={amb.brightness}
          onChange={(e) => setAmb({ brightness: Number(e.target.value) })} />
      </div>
      <div className="mt-1">
        <div className="mb-1 flex justify-between">
          <label className="hud-label">Labels</label>
          <span className="text-[11px] text-hud-fg-primary">{amb.labelRatio}</span>
        </div>
        <input className="hud-slider" type="range" min={20} max={200} step={10} value={amb.labelRatio}
          onChange={(e) => setAmb({ labelRatio: Number(e.target.value) })} />
        <div className="flex justify-between pt-1 text-[8px] text-hud-fg-secondary">
          <span>20</span><span>200 (all)</span>
        </div>
      </div>
      <div className="mt-1">
        <label className="hud-label block mb-1">UI scale</label>
        <div className="flex border border-hud-fg-primary/30">
          {(["sm", "md", "lg"] as const).map((s) => (
            <button key={s} onClick={() => setUiScale(s)}
              className={`flex-1 py-1 text-[10px] font-bold ${uiScale === s ? "bg-hud-fg-primary/20 text-hud-fg-primary" : "text-hud-fg-secondary"}`}>
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <Toggle label="Trails" on={prefs.showTrails} onToggle={() => setPrefs({ showTrails: !prefs.showTrails })} />
      <Toggle label="Altitude colour" on={prefs.altitudeColor} onToggle={() => setPrefs({ altitudeColor: !prefs.altitudeColor })} />
      <Toggle label="Sky" on={prefs.showSky} onToggle={() => setPrefs({ showSky: !prefs.showSky })} />
      <Toggle label="Night mode" on={amb.nightMode} onToggle={() => setAmb({ nightMode: !amb.nightMode })} />
      <Toggle label="Clouds / haze" on={amb.ambiance} onToggle={() => setAmb({ ambiance: !amb.ambiance })} />
      <button className="hud-btn" onClick={resetView}>Reset view</button>
    </div>
  );
}

function Toggle({ label, on, onToggle }: any) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <span className={`hud-check ${on ? "checked" : ""}`} onClick={onToggle} />
      <span className="text-[11px]">{label}</span>
    </label>
  );
}

function DataSourcePanel() {
  const [source, setSource] = useState<Source>(dataManager.getStatus()?.source ?? "opensky");
  const [busy, setBusy] = useState(false);
  useEffect(() => dataManager.subscribe((p) => setSource(p.status.source)), []);

  const changeSource = async (next: Source) => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/source`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: next }),
      });
      if (res.ok) setSource(next);
    } finally {
      setBusy(false);
    }
  };

  const opts: { v: Source; label: string; note: string }[] = [
    { v: "opensky", label: "OpenSky", note: "live, free, no receiver" },
    { v: "adsbfi", label: "adsb.fi", note: "open data, up to 250 NM" },
    { v: "radio", label: "Radio", note: "local dump1090/readsb" },
    { v: "api", label: "airplanes", note: "airplanes.live" },
  ];

  return (
    <section className="sidebar-section">
      <div className="section-header"><span className="hud-section-title">Data Link</span></div>
      <div className="section-body">
        <div className="grid grid-cols-2 gap-1">
          {opts.map((o) => (
            <button key={o.v} disabled={busy}
              className={`hud-btn !px-1 !py-1 !text-[9px] ${source === o.v ? "hud-btn-active" : ""}`}
              onClick={() => void changeSource(o.v)}>
              {o.label}
            </button>
          ))}
        </div>
        <div className="text-[9px] leading-relaxed text-hud-fg-secondary">
          {opts.find((o) => o.v === source)?.note}
        </div>
      </div>
    </section>
  );
}
