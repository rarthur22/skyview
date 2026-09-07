// Alert detection for the HUD. Cheap heuristics: dangerously low altitude,
// rapid descent, or an emergency squawk. Returns null when nothing is wrong.

import type { Aircraft } from "@skyview/shared/index.js";

export type AlertLevel = "caution" | "warning";

export interface Alert {
  level: AlertLevel;
  label: string;
}

const LOW_ALT_FT = 2500;
const RAPID_DESCENT_FPM = -2000;

/** Emergency / special squawk codes (ICAO 7700 etc.). */
const SQUAWK_ALERTS: Record<string, { level: AlertLevel; label: string }> = {
  "7700": { level: "warning", label: "EMERG" },
  "7600": { level: "warning", label: "RADIO" },
  "7500": { level: "warning", label: "HIJACK" },
  "1200": { level: "caution", label: "VFR" },
};

/** Aircraft below a low ceiling, descending fast, squawking an emergency code,
 *  or on the ground. Returns the most severe alert. */
export function alertForAircraft(ac: Aircraft): Alert | null {
  if (ac.squawk) {
    const sq = SQUAWK_ALERTS[ac.squawk];
    if (sq) return sq;
  }
  if (ac.onGround) {
    return { level: "caution", label: "ON GROUND" };
  }
  if (ac.altitude > 0 && ac.altitude < LOW_ALT_FT) {
    return { level: "warning", label: "LOW ALT" };
  }
  if (ac.climbRate < RAPID_DESCENT_FPM) {
    return { level: "caution", label: "RAPID DESC" };
  }
  return null;
}