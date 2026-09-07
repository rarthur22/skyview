// Categorize an aircraft for filtering/coloring. Cheap heuristic when no explicit
// category is broadcast: military from the ICAO-68 block + known makers, cargo and
// GA by known models/owners, everything else commercial.

import type { Aircraft } from "@skyview/shared/index.js";

export type AircraftKind = "commercial" | "military" | "general" | "cargo";

const GA_MODELS = [
  "Cessna",
  "Piper",
  "Cirrus",
  "Pilatus",
  "Robin",
  "DA40",
  "DA42",
  "Diamond",
  "Beechcraft",
  "Socata",
  "Mooney",
];

const CARGO_MODEL_RE = /(\b47.*F\b|\b77.*F\b|\bMD-?11F|\bA3..F$|\b748F|\b391F)/i;

const MIL_FLIGHT_RE = /^(MIL|AF|RAF|USAF|RCAF|NAVY|AIRFORCE|GOT)/i;

export function classifyAircraft(ac: Aircraft): AircraftKind {
  const hex = parseInt(ac.hex, 16);
  // US military transponders sit in the 0xAD-0xAF block.
  if (!Number.isNaN(hex) && hex >= 0xad0000 && hex <= 0xafffff) return "military";
  if (ac.callsign && MIL_FLIGHT_RE.test(ac.callsign)) return "military";
  if (ac.model && CARGO_MODEL_RE.test(ac.model)) return "cargo";
  if (ac.model && GA_MODELS.some((m) => ac.model.toLowerCase().includes(m.toLowerCase()))) {
    return "general";
  }
  if (!ac.airline || ac.airline === "Private") return "general";
  return "commercial";
}
