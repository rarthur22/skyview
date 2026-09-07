// Flight list: sortable scrollable list of aircraft in view. Clicking a row
// selects + centres it in the viewport.

import {
  formatAltitude,
  formatDistance,
  formatSpeed,
  formatClimb,
  compassLabel,
} from "@skyview/shared/index.js";
import { useUI, type SortField } from "../store.js";
import type { ListAircraft } from "../hooks/useAircraft.js";
import { alertForAircraft } from "../utils/alerts.js";

interface Props {
  items: ListAircraft[];
  selectedHex: string | null;
  onSelect: (hex: string) => void;
}

const SORT_LABELS: Record<SortField, string> = {
  distance: "DST",
  altitude: "ALT",
  speed: "SPD",
  climb: "CLB",
};

export function FlightList({ items, selectedHex, onSelect }: Props) {
  const sortBy = useUI((s) => s.sortBy);
  const sortDir = useUI((s) => s.sortDir);
  const setSort = useUI((s) => s.setSort);
  const toggleSortDir = useUI((s) => s.toggleSortDir);
  const searchQuery = useUI((s) => s.searchQuery);
  const setSearchQuery = useUI((s) => s.setSearchQuery);

  return (
    <div className="hud-panel flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="hud-section-title">Flights</span>
        <span className="flex items-center gap-2">
          <span className="text-[9px] text-hud-fg-secondary">{items.length} shown</span>
          <button className="hud-btn !px-2 !py-0.5 !text-[9px]" onClick={toggleSortDir}>
            {sortDir === "asc" ? "▲" : "▼"} TRI
          </button>
        </span>
      </div>

      <div className="px-3 pb-1">
        <div className="relative">
          <input
            className="hud-input !py-1 pr-7 text-[10px]"
            placeholder="Search callsign, airline, route, reg…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-hud-fg-secondary hover:text-hud-fg-primary"
              onClick={() => setSearchQuery("")}
              title="Clear search"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      <div className="flex border-b border-hud-fg-primary/10">
        {(Object.keys(SORT_LABELS) as SortField[]).map((f) => (
          <button
            key={f}
            onClick={() => setSort(f)}
            className={`flex-1 py-1 text-[9px] font-bold tracking-wider ${
              sortBy === f ? "bg-hud-fg-primary/15 text-hud-fg-primary" : "text-hud-fg-secondary hover:text-hud-fg-primary"
            }`}
          >
            {SORT_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="hud-scroll flex-1 overflow-y-auto px-1 py-1">
        {items.length === 0 && (
          <div className="p-4 text-center text-[11px] text-hud-fg-secondary">
            {searchQuery ? "No aircraft match." : "No aircraft in view."}
          </div>
        )}
        {items.map((a) => {
          const alert = alertForAircraft(a);
          return (
          <div
            key={a.hex}
            onClick={() => onSelect(a.hex)}
            className={`flight-row ${selectedHex === a.hex ? "selected" : ""} ${alert ? `alert-${alert.level}` : ""}`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block text-[9px] leading-none text-hud-fg-secondary"
                  style={{ transform: `rotate(${a.track}deg)` }}
                  title={`Track ${a.track.toFixed(0)}°`}
                >
                  ➤
                </span>
                <span className="text-[13px] font-bold text-hud-fg-primary">
                  {a.callsign || a.hex.slice(0, 6).toUpperCase()}
                </span>
                {alert && <span className={`alert-badge alert-${alert.level}`}>{alert.label}</span>}
              </span>
              <span className="text-[10px] text-hud-fg-secondary">
                {a.from && a.from !== "?" && a.to && a.to !== "?"
                  ? `${a.from} → ${a.to}`
                  : a.airline || "—"}
              </span>
            </div>
            {a.model && <div className="text-[9px] text-hud-fg-secondary/80">{a.model}</div>}
            <div className="flight-meta">
              <Meta label="DST" value={formatDistance(a.distance)} />
              <Meta label="ALT" value={formatAltitude(a.altitude)} />
              <Meta label="SPD" value={formatSpeed(a.speed)} />
              <Meta label="HDG" value={`${a.track.toFixed(0)}° ${compassLabel(a.track)}`} />
            </div>
            <div className="mt-1 text-[9px]">{formatClimb(a.climbRate)}</div>
          </div>
          );
        })}
      </div>
    </div>
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
