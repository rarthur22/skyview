// Minimal single-line status bar: aircraft count · UTC time · weather (temp,
// wind, condition) · current GPS centre. Fixed to the bottom of the screen.

import { useEffect, useState } from "react";
import { formatClock, formatDate } from "@skyview/shared/index.js";
import { dataManager } from "../utils/data-processing.js";
import type { SourceStatus } from "@skyview/shared/index.js";

export function StatusBar() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const count = dataManager.getAircraft().length;
  const cfg = dataManager.getConfig();
  const status = dataManager.getStatus() as SourceStatus | null;
  const weather = dataManager.getWeather();
  const lat = cfg ? cfg.centerLat.toFixed(6) : "—";
  const lon = cfg ? cfg.centerLon.toFixed(6) : "—";
  const wind = weather
    ? `${Math.round(weather.windDir).toString().padStart(3, "0")}° / ${Math.round(weather.windKt)} kt`
    : "—";

  return (
    <footer className="pointer-events-auto fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-3 border-t border-hud-fg-primary/20 bg-hud-bg-primary/55 px-4 py-1.5 text-[10px] tracking-wide backdrop-blur-md">
      <span className="flex items-center gap-2">
        <span className={`dot ${status?.ok ? "dot-ok" : "dot-err"}`} />
        <span className="font-bold text-hud-fg-primary">{count.toString().padStart(2, "0")} AC</span>
        <span className="text-hud-fg-secondary">SRC {status?.source ?? "—"}</span>
      </span>
      <span className="hidden text-hud-fg-secondary sm:inline">
        {formatClock(now)} <span className="text-hud-fg-primary/50">UTC</span> · {formatDate(now)}
      </span>
      <span className="hidden text-hud-fg-secondary md:inline">
        {weather ? `${Math.round(weather.temperature)}°C` : "T —"} · W {wind} · {weather?.condition ?? "—"}
      </span>
      <span className="text-hud-fg-secondary">
        GPS {lat}, {lon}
      </span>
    </footer>
  );
}
