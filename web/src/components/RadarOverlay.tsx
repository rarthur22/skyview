// 2D North-up tactical radar overlay. Maps each contact's azimuth (polar angle)
// and slant distance (radial) onto a circular scope. Pure CSS + absolutely
// positioned blips; reuses the .radar-scope theme from hud-theme.css.
//
// North is up, East is right, distance grows outwardly and is normalised to
// the current configured range (the outermost ring = radiusMiles).

import { useEffect, useState } from "react";
import { dataManager } from "../utils/data-processing.js";
import { useUI } from "../store.js";
import { alertForAircraft } from "../utils/alerts.js";

interface Blip {
  hex: string;
  x: number; // -1..1 (E/W)
  y: number; // -1..1 (N/S), +y up
  callsign: string;
  alert: boolean;
}

export function RadarOverlay() {
  const [items, setItems] = useState<Blip[]>([]);
  const selectedHex = useUI((s) => s.selectedHex);
  const setSelected = useUI((s) => s.setSelected);
  const setView = useUI((s) => s.setView);

  useEffect(() => {
    let iv: ReturnType<typeof setInterval> | null = null;
    const tick = () => {
      const cfg = dataManager.getConfig();
      const range = Math.max(5, cfg?.radiusMiles ?? 100);
      const frames = dataManager.getFrames(Date.now());
      const blips = frames
        .filter((a) => a.distance > 0)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 60)
        .map((a) => {
          const azRad = (a.azimuth * Math.PI) / 180;
          const frac = Math.min(1, a.distance / range);
          return {
            hex: a.hex,
            x: Math.sin(azRad) * frac,
            y: Math.cos(azRad) * frac,
            callsign: a.callsign || a.hex.slice(0, 6).toUpperCase(),
            alert: !!alertForAircraft(a),
          };
        });
      setItems(blips);
    };
    tick();
    iv = setInterval(tick, 1000);
    return () => {
      if (iv) clearInterval(iv);
    };
  }, []);

  return (
    <div className="radar-overlay">
      <div className="radar-scope">
        <div className="radar-ring radar-ring-1" />
        <div className="radar-ring radar-ring-2" />
        <div className="radar-ring radar-ring-3" />
        <div className="radar-crosshair-x" />
        <div className="radar-crosshair-y" />
        <div className="radar-sweep" />
        <div className="radar-n">N</div>
        <div className="radar-e">E</div>
        <div className="radar-s">S</div>
        <div className="radar-w">W</div>

        {items.map((b) => {
          const px = 50 + b.x * 46;
          const py = 50 - b.y * 46;
          const sel = selectedHex === b.hex;
          return (
            <button
              key={b.hex}
              title={b.callsign}
              className={`radar-contact ${sel ? "selected" : ""}`}
              style={{ left: `${px}%`, top: `${py}%` }}
              onClick={(e) => {
                e.stopPropagation();
                setSelected(b.hex);
                const ac = dataManager.getAircraft().find((a) => a.hex === b.hex);
                if (ac) setView({ azimuth: ac.azimuth, elevation: Math.max(8, Math.min(89, ac.elevation)) });
              }}
            >
              <span className={`radar-contact-shape ${b.alert ? "radar-alert" : ""}`} />
            </button>
          );
        })}
        <div className="radar-center">
          <span>YOU</span>
        </div>
      </div>
    </div>
  );
}