// Compass strip + view readout. A fixed horizontal band of azimuth graduations
// that scrolls with the camera heading, with a center marker showing where you
// look, plus an AZ/EL numerical readout in HUD style.

import { useUI } from "../store.js";

const CARDS: { deg: number; label: string }[] = [
  { deg: 0, label: "N" },
  { deg: 45, label: "NE" },
  { deg: 90, label: "E" },
  { deg: 135, label: "SE" },
  { deg: 180, label: "S" },
  { deg: 225, label: "SW" },
  { deg: 270, label: "W" },
  { deg: 315, label: "NW" },
];

function cardinalLabel(az: number): string {
  let best = CARDS[0];
  let bestD = 181;
  for (const card of CARDS) {
    const d = Math.abs(((az - card.deg + 540) % 360) - 180);
    if (d < bestD) {
      bestD = d;
      best = card;
    }
  }
  return best.label;
}

export function Compass() {
  const view = useUI((s) => s.view);
  const az = view.azimuth;

  // Graduations every 10°, major ticks every 30°, labels every 30°.
  const ticks = [];
  for (let rel = -90; rel <= 90; rel += 10) {
    const abs = Math.round(((az + rel) % 360 + 360) % 360);
    const major = abs % 30 === 0;
    const card = CARDS.find((c) => c.deg === abs);
    ticks.push(
      <div key={rel} className="relative flex flex-1 items-start justify-center">
        <div
          className="h-3 w-px"
          style={{ background: major ? "rgba(0,212,255,0.8)" : "rgba(0,212,255,0.35)" }}
        />
        {major && (
          <span className="absolute -top-1 text-[8px] font-bold text-hud-fg-primary/80">
            {card ? card.label : String(abs).padStart(3, "0")}
          </span>
        )}
      </div>,
    );
  }

  return (
    <div className="pointer-events-none absolute left-1/2 top-14 z-30 w-[420px] -translate-x-1/2 select-none">
      <div className="relative h-6">
        {/* Center marker */}
        <div className="absolute left-1/2 top-0 h-4 w-0.5 -translate-x-1/2 bg-hud-fg-primary shadow-[0_0_6px_var(--hud-glow)]" />
        <div className="absolute left-1/2 top-0 flex h-full w-full -translate-x-1/2 items-start">
          {ticks}
        </div>
      </div>
      <div className="mt-0.5 flex items-center justify-center gap-3 text-[11px] tracking-widest">
        <span className="font-bold text-hud-fg-primary">
          AZ {String(Math.round(((az % 360) + 360) % 360)).padStart(3, "0")}°{" "}
          <span className="text-hud-fg-secondary">{cardinalLabel(az)}</span>
        </span>
        <span className="text-hud-fg-secondary">·</span>
        <span className="text-hud-fg-secondary">
          EL {Math.round(view.elevation)}°
        </span>
      </div>
    </div>
  );
}