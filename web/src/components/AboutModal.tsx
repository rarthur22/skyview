// About / system-status modal. Shows live connection info (source, aircraft
// count, latency, weather) plus a small FPS + payload readout. Toggled from the
// toolbar "?" button or the '?' / 'h' key.

import { useEffect, useState } from "react";
import { dataManager } from "../utils/data-processing.js";
import { useUI } from "../store.js";

export function AboutModal({ onClose }: { onClose: () => void }) {
  const [fps, setFps] = useState(0);
  const [size, setSize] = useState(0);
  const soundOn = useUI((s) => s.soundOn);
  const setSoundOn = useUI((s) => s.setSoundOn);
  const uiScale = useUI((s) => s.uiScale);
  const setUiScale = useUI((s) => s.setUiScale);

  useEffect(() => {
    let frames = 0;
    let last = performance.now();
    const tick = (t: number) => {
      frames += 1;
      const dt = t - last;
      if (dt > 500) {
        setFps(Math.round((frames * 1000) / dt));
        frames = 0;
        last = t;
      }
      raf = requestAnimationFrame(tick);
    };
    let raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, []);

  const status = dataManager.getStatus();
  const count = dataManager.getAircraft().length;
  const latency = dataManager.avgLatencyMs;
  const weather = dataManager.getWeather();
  const cfg = dataManager.getConfig();

  useEffect(() => {
    const update = () => setSize(JSON.stringify(dataManager.getAircraft()).length);
    update();
    return dataManager.subscribe(update);
  }, []);

  return (
    <div className="pointer-events-auto absolute right-3 top-16 z-40 w-80" onClick={(e) => e.stopPropagation()}>
      <div className="hud-panel px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="hud-section-title">System</span>
          <button className="hud-btn !px-2 !py-0.5 !text-[9px]" onClick={onClose}>✕</button>
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          <Stat label="SOURCE" value={status?.source ?? "—"} />
          <Stat label="COUNT" value={`${count} AC`} />
          <Stat label="LATENCY" value={`${Math.round(latency)} ms`} />
          <Stat label="FPS" value={`${fps}`} />
          <Stat label="PAYLOAD" value={`${(size / 1024).toFixed(1)} kB`} />
          <Stat label="TEMP" value={weather ? `${Math.round(weather.temperature)}°C` : "—"} />
        </div>

        <div className="mt-3 border-t border-hud-fg-primary/20 pt-2">
          <label className="hud-label">Observing</label>
          <div className="text-[11px] text-hud-fg-secondary">
            {cfg ? `${cfg.locationName} · ${cfg.centerLat.toFixed(4)}, ${cfg.centerLon.toFixed(4)}` : "—"}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px]">
          <button className="hud-btn !px-2 !py-1 !text-[9px]" onClick={() => setSoundOn(!soundOn)}>
            {soundOn ? "🔊 Sound" : "🔇 Muted"}
          </button>
          <div className="flex gap-1">
            {(["sm", "md", "lg"] as const).map((s) => (
              <button
                key={s}
                className={`hud-btn !px-2 !py-1 !text-[9px] ${uiScale === s ? "hud-btn-active" : ""}`}
                onClick={() => setUiScale(s)}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-2 text-[9px] text-hud-fg-secondary">
          SkyView 3D · real-time ADSB · {status?.ok ? "online" : "offline"}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="hud-label">{label}</span>
      <span className="text-hud-fg-primary">{value}</span>
    </div>
  );
}