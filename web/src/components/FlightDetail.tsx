// Selected-flight detail card. Shows the full info for the aircraft the user
// clicked, anchored bottom-left over the viewport.

import { useEffect, useRef, useState } from "react";
import type { Aircraft } from "@skyview/shared/index.js";
import {
  formatAltitude,
  formatSpeed,
  formatDistance,
  formatClimb,
  compassLabel,
} from "@skyview/shared/index.js";
import { dataManager } from "../utils/data-processing.js";
import { classifyAircraft } from "../utils/classify.js";
import { useUI } from "../store.js";

function staleAge(ac: Aircraft): { label: string; cls: string } {
  const s = (Date.now() - ac.timestamp) / 1000;
  if (s < 8) return { label: "FRESH", cls: "stale-ok" };
  if (s < 30) return { label: "STALE", cls: "stale-warn" };
  return { label: "OLD", cls: "stale-err" };
}

/** A tiny SVG sparkline of altitude trend for the selected aircraft. */
function AltTrend({ ac }: { ac: Aircraft }) {
  const samples = useRef<{ t: number; alt: number }[]>([]);
  useEffect(() => {
    samples.current.push({ t: Date.now(), alt: ac.altitude });
    if (samples.current.length > 80) samples.current.shift();
  }, [ac.altitude]);

  const pts = samples.current;
  if (pts.length < 2) return null;
  const min = Math.min(...pts.map((p) => p.alt));
  const max = Math.max(...pts.map((p) => p.alt));
  const range = Math.max(1, max - min);
  const W = 260;
  const H = 44;
  const coords = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * W;
    const y = H - ((p.alt - min) / range) * (H - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const lastY = coords[coords.length - 1]?.split(",")[1] ?? 0;
  const midY = H / 2;
  return (
    <div className="border-t border-dotted border-hud-fg-primary/20 px-3 py-2">
      <div className="mb-1 flex items-center justify-between text-[9px]">
        <span className="hud-label">ALT trend</span>
        <span className="text-hud-fg-secondary">{formatAltitude(ac.altitude)}</span>
      </div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-11">
        <line x1="0" y1={midY} x2={W} y2={midY} stroke="rgba(0,212,255,0.15)" strokeWidth="1" />
        <polyline
          points={coords.join(" ")}
          fill="none"
          stroke={ac.climbRate > 0 ? "#7dffb0" : ac.climbRate < 0 ? "#ffb347" : "#00d4ff"}
          strokeWidth="1.5"
        />
        <circle cx={W} cy={lastY} r="2" fill="#00d4ff" />
      </svg>
    </div>
  );
}

export function FlightDetail() {
  const selectedHex = useUI((s) => s.selectedHex);
  const setSelected = useUI((s) => s.setSelected);
  const [ac, setAc] = useState<Aircraft | null>(null);
  const [photoGl, setPhotoGl] = useState(true);

  useEffect(() => {
    setPhotoGl(true);
    return dataManager.subscribe((p) => {
      const a = p.aircraft.find((x) => x.hex === selectedHex);
      setAc(a ?? null);
    });
  }, [selectedHex]);

  if (!selectedHex || !ac) return null;
  const kind = classifyAircraft(ac);
  const stale = staleAge(ac);

  return (
    <div className="hud-panel pointer-events-auto absolute bottom-16 left-3 z-30 w-72 overflow-hidden text-hud-fg-primary">
      <div className="flex items-center justify-between border-b border-hud-fg-primary/25 bg-hud-fg-primary/10 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold tracking-wider">
            {ac.callsign || ac.hex.slice(0, 6).toUpperCase()}
          </span>
          <span className="rounded bg-hud-fg-primary/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide">
            {kind}
          </span>
        </div>
        <button
          className="hud-btn !px-2 !py-0.5 !text-[10px]"
          onClick={() => setSelected(null)}
          title="Close"
        >
          ✕
        </button>
      </div>

      {ac.photoUrl && (
        <div className="px-3 pt-3">
          <div className="aircraft-photo relative h-32 w-full overflow-hidden rounded-md">
            {photoGl && (
              <div className="absolute inset-0 flex items-center justify-center text-[10px] text-hud-fg-secondary">
                loading…
              </div>
            )}
            <img
              src={ac.photoUrl}
              alt={ac.registration || ac.model || ac.callsign}
              className="aircraft-photo-img h-full w-full object-cover"
              onLoad={() => setPhotoGl(false)}
              onError={() => setPhotoGl(false)}
              loading="lazy"
              referrerPolicy="no-referrer"
            />
            <div className="aircraft-photo-gradient absolute inset-0" />
            <div className="absolute bottom-1.5 left-2 flex items-center gap-1.5 text-[9px] uppercase tracking-wider">
              {ac.registration && (
                <span className="aircraft-photo-tag">{ac.registration}</span>
              )}
              {ac.model && (
                <span className="aircraft-photo-tag aircraft-photo-tag-dim">{ac.model}</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="px-3 py-2">
        <div className="flex items-center gap-2">
          {ac.airline && <div className="text-[11px] text-hud-fg-secondary">{ac.airline}</div>}
          <span className={`ml-auto text-[9px] tracking-wider ${stale.cls}`}>{stale.label}</span>
        </div>
        {ac.model && <div className="text-[10px] text-hud-fg-secondary/80">{ac.model}</div>}
        {ac.registration && (
          <div className="text-[10px] text-hud-fg-secondary/70">REG {ac.registration}</div>
        )}
        <div className="mt-1 flex items-center gap-2 text-[13px]">
          <div className="text-center">
            <div className="font-bold text-hud-fg-primary">{ac.from}</div>
            {ac.fromName && (
              <div className="text-[9px] text-hud-fg-secondary/80">{ac.fromName}</div>
            )}
          </div>
          <span className="text-hud-fg-secondary">→</span>
          <div className="text-center">
            <div className="font-bold text-hud-fg-primary">{ac.to}</div>
            {ac.toName && (
              <div className="text-[9px] text-hud-fg-secondary/80">{ac.toName}</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-dotted border-hud-fg-primary/20 px-3 py-2 text-[11px]">
        <Meta label="ALT" value={formatAltitude(ac.altitude)} />
        <Meta label="SPD" value={formatSpeed(ac.speed)} />
        <Meta label="HDG" value={`${ac.track.toFixed(0)}° ${compassLabel(ac.track)}`} />
        <Meta label="DST" value={formatDistance(ac.distance)} />
        <Meta label="ELV" value={`${ac.elevation.toFixed(1)}°`} />
        <Meta label="RATE" value={formatClimb(ac.climbRate)} />
        <Meta label="LAT" value={ac.lat.toFixed(5)} />
        <Meta label="LON" value={ac.lon.toFixed(5)} />
      </div>

      <AltTrend ac={ac} />
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="hud-label">{label}</span>
      <span className="text-hud-fg-primary">{value}</span>
    </div>
  );
}
