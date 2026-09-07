// Filtered + sorted aircraft list for the flight list / selection. Recomputed
// when the payload or filter/sort state changes.

import { useEffect, useMemo, useState } from "react";
import type { Aircraft } from "@skyview/shared/index.js";
import { dataManager } from "../utils/data-processing.js";
import { classifyAircraft, type AircraftKind } from "../utils/classify.js";
import { defaultConfig } from "../config.js";
import { useUI, type AltBand, type SortField } from "../store.js";

export interface ListAircraft extends Aircraft {
  kind: AircraftKind;
}

export interface AircraftListOptions {
  altBand: AltBand;
  typeFilter: Record<string, boolean>;
  sortBy: SortField;
  sortDir: "asc" | "desc";
  minAltFt: number;
  maxAltFt: number;
  radiusMiles: number;
  searchQuery: string;
}

export function sortFilterAircraft(
  aircraft: Aircraft[],
  o: AircraftListOptions,
): ListAircraft[] {
  const LOWER = 10000;
  const q = o.searchQuery.trim().toLowerCase();
  const list = aircraft
    .map((a) => ({ ...a, kind: classifyAircraft(a) }))
    .filter((a) => {
      const lowBand = a.altitude < LOWER;
      if (o.altBand === "low" && !lowBand) return false;
      if (o.altBand === "high" && lowBand) return false;
      if (a.altitude < o.minAltFt || a.altitude > o.maxAltFt) return false;
      if (!o.typeFilter[a.kind]) return false;
      if (q) {
        const hay = [a.callsign, a.airline, a.model, a.registration, a.from, a.to]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

  const dir = o.sortDir === "asc" ? 1 : -1;
  const key: Record<SortField, (a: ListAircraft) => number> = {
    distance: (a) => a.distance,
    altitude: (a) => a.altitude,
    speed: (a) => a.speed,
    climb: (a) => Math.abs(a.climbRate),
  };
  return list.sort((a, b) => (key[o.sortBy](a) - key[o.sortBy](b)) * dir);
}

export function useAircraft(): ListAircraft[] {
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const altBand = useUI((s) => s.altBand);
  const typeFilter = useUI((s) => s.typeFilter);
  const sortBy = useUI((s) => s.sortBy);
  const sortDir = useUI((s) => s.sortDir);
  const searchQuery = useUI((s) => s.searchQuery);

  useEffect(() => {
    const off = dataManager.subscribe((p) => setAircraft(p.aircraft));
    return off;
  }, []);

  const cfg = defaultConfig();
  return useMemo(
    () =>
      sortFilterAircraft(aircraft, {
        altBand,
        typeFilter,
        sortBy,
        sortDir,
        minAltFt: cfg.minAltitudeFt,
        maxAltFt: cfg.maxAltitudeFt,
        radiusMiles: cfg.radiusMiles,
        searchQuery,
      }),
    [aircraft, altBand, typeFilter, sortBy, sortDir, searchQuery],
  );
}
