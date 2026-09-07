// SkyView HUD — "augmented reality window". The 3D scene (with HTML labels
// glued to each aircraft) fills the screen. A slim toolbar toggles the two
// floating panels (config left / flight list right); a status line sits at the
// bottom. Selecting an aircraft shows a small detail card and centres the view.

import { useEffect, useState } from "react";
import { useUI } from "../store.js";
import { Viewport3D } from "./Viewport3D.js";
import { StatusBar } from "./StatusBar.js";
import { FlightDetail } from "./FlightDetail.js";
import { SidebarLeft } from "./SidebarLeft.js";
import { SidebarRight } from "./SidebarRight.js";
import { Compass } from "./Compass.js";
import { HelpPanel } from "./HelpPanel.js";
import { AboutModal } from "./AboutModal.js";
import { RadarOverlay } from "./RadarOverlay.js";
import { dataManager } from "../utils/data-processing.js";
import { getApiBase } from "../utils/api.js";
import { click, alertSiren } from "../utils/sound.js";
import { alertForAircraft } from "../utils/alerts.js";
import type { WeatherData } from "@skyview/shared/index.js";

const WMO_ICON: Record<string, string> = {
  clear: "☀",
  cloudy: "☁",
  rain: "🌧",
  snow: "❄",
  storm: "⛈",
  fog: "🌫",
};

function useWeather(): WeatherData | null {
  const [w, setW] = useState<WeatherData | null>(null);
  useEffect(() => dataManager.subscribe((p) => setW(p.weather ?? null)), []);
  return w;
}

export function SkyViewHUD() {
  const leftOpen = useUI((s) => s.sidebarLeftOpen);
  const rightOpen = useUI((s) => s.sidebarRightOpen);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const showRadar = useUI((s) => s.showRadar);
  const setShowRadar = useUI((s) => s.setShowRadar);
  const uiScale = useUI((s) => s.uiScale);
  const weather = useWeather();
  const [helpOpen, setHelpOpen] = useState(false);
  const [sysOpen, setSysOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen().catch(() => {});
    } else {
      void document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => dataManager.start(), []);

  // Deep-link: ?lat=..&lon=.. jumps the observer to that point on first load.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("lat") || !params.has("lon")) return;
    const lat = Number(params.get("lat"));
    const lon = Number(params.get("lon"));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
    fetch(`${getApiBase()}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ centerLat: lat, centerLon: lon, locationName: "Shared" }),
    }).catch(() => {});
  }, []);

  // Sound: a soft click on selection change, an alarm when a new contact becomes
  // an emergency (squawk/low-alt). Respects the soundOn toggle.
  useEffect(() => {
    const prev = { selected: "" as string | null, alerted: new Set<string>() };
    return dataManager.subscribe((p) => {
      const s = useUI.getState();
      if (!s.soundOn) return;
      const sel = s.selectedHex;
      if (sel && sel !== prev.selected) click();
      for (const ac of p.aircraft) {
        const al = alertForAircraft(ac);
        if (al && al.level === "warning" && !prev.alerted.has(ac.hex)) alertSiren();
      }
      prev.alerted = new Set(p.aircraft.filter((ac) => alertForAircraft(ac)?.level === "warning").map((ac) => ac.hex));
      prev.selected = sel;
    });
  }, []);

  // Keyboard: Escape cascades, '?'/'h' toggles help, '['/']' zoom FOV, Space
  // toggles both panels.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useUI.getState();
      if (e.key === "Escape") {
        if (s.selectedHex) return s.setSelected(null);
        if (s.searchQuery) return s.setSearchQuery("");
        if (s.sidebarLeftOpen) return s.toggleSidebar("left");
        if (s.sidebarRightOpen) return s.toggleSidebar("right");
        return;
      }
      if (e.key === "?" || e.key.toLowerCase() === "h") {
        setHelpOpen((v) => !v);
        return;
      }
      if (e.key === " " && e.target === document.body) {
        e.preventDefault();
        s.toggleSidebar("left");
        s.toggleSidebar("right");
        return;
      }
      if (e.key === "[") return s.setView({ fov: Math.max(50, s.view.fov - 5) });
      if (e.key === "]") return s.setView({ fov: Math.min(130, s.view.fov + 5) });
      if (e.key.toLowerCase() === "f") return toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={`relative h-screen w-screen select-none text-hud-fg-primary ui-${uiScale}`}>
      <Viewport3D />
      <div className="hud-cockpit pointer-events-none absolute inset-0 z-10" />

      {/* Toolbar */}
      <header className="absolute left-0 top-0 z-40 flex items-center gap-2 p-3">
        <div className="hud-panel flex items-center gap-2 px-3 py-1.5">
          <h1 className="text-sm font-bold uppercase tracking-tight text-hud-fg-primary [text-shadow:0_0_12px_rgba(0,212,255,0.5)]">
            SkyView <span className="text-hud-fg-secondary">3D</span>
          </h1>
          <span className="dot dot-ok dot-pulse" />
          <button className="hud-btn !px-2 !py-1 !text-[9px]" onClick={() => toggleSidebar("left")}>
            ◧ Config
          </button>
          <button className="hud-btn !px-2 !py-1 !text-[9px]" onClick={() => toggleSidebar("right")}>
            ⊞ Flights
          </button>
          <button
            className={`hud-btn !px-2 !py-1 !text-[9px] ${showRadar ? "hud-btn-active" : ""}`}
            onClick={() => setShowRadar(!showRadar)}
            title="Toggle radar"
          >
            ◎ Radar
          </button>
          <button className="hud-btn !px-2 !py-1 !text-[9px]" onClick={() => setHelpOpen(true)} title="Help (?)">
            ?
          </button>
          <button className="hud-btn !px-2 !py-1 !text-[9px]" onClick={() => setSysOpen(true)} title="System">
            ⓘ
          </button>
          <button className="hud-btn !px-2 !py-1 !text-[9px]" onClick={toggleFullscreen} title="Fullscreen (F)">
            {isFullscreen ? "◱" : "⛶"} Full
          </button>
        </div>
        {weather && (
          <div className="hud-panel flex items-center gap-2 px-3 py-1.5 text-[10px]">
            <span className="text-sm">{WMO_ICON[weather.category] ?? "☁"}</span>
            <span className="text-hud-fg-primary">{Math.round(weather.temperature)}°C</span>
            <span className="text-hud-fg-secondary">
              W {Math.round(weather.windDir).toString().padStart(3, "0")}°/{Math.round(weather.windKt)}
            </span>
            <span className="text-hud-fg-secondary">{weather.condition}</span>
          </div>
        )}
      </header>

      {/* Left panel (config) */}
      <aside className={`sidebar-left ${leftOpen ? "open" : ""} absolute bottom-14 left-3 top-16 z-30 w-72`}>
        <SidebarLeft />
      </aside>

      {/* Compass strip + AZ/EL (tracks the camera view). */}
      <Compass />

      {/* Right panel (flight list) */}
      <aside className={`sidebar-right ${rightOpen ? "open" : ""} absolute bottom-14 right-3 top-16 z-30 w-72`}>
        <SidebarRight />
      </aside>

      {showRadar && <RadarOverlay />}

      <FlightDetail />
      <StatusBar />
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
      {sysOpen && <AboutModal onClose={() => setSysOpen(false)} />}
    </div>
  );
}
