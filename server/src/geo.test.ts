import { describe, it, expect } from "vitest";
import { resolveAircraftGeo, haversineKm, bearing } from "./geo.js";

describe("resolveAircraftGeo", () => {
  it("returns a near-zenith target for an aircraft directly overhead", () => {
    const g = resolveAircraftGeo(48.8566, 2.3522, 10000, 48.8566, 2.3522, 0);
    expect(g.elevation).toBeGreaterThan(80);
    expect(g.azimuth).toBeGreaterThanOrEqual(0);
    expect(g.azimuth).toBeLessThan(360);
    expect(g.distance).toBeGreaterThan(0);
    expect(g.distance).toBeLessThan(5);
  });

  it("reports a moderate elevation for a mid-distance target", () => {
    const g = resolveAircraftGeo(48.89, 2.39, 15000, 48.8566, 2.3522);
    expect(g.elevation).toBeGreaterThan(20);
    expect(g.elevation).toBeLessThan(45);
  });
});

describe("bearing", () => {
  it("is ~0° due north", () => {
    expect(bearing(48.8, 2.3, 48.9, 2.3)).toBeCloseTo(0, 0);
  });
  it("is ~90° due east", () => {
    expect(bearing(48.8, 2.3, 48.8, 2.4)).toBeCloseTo(90, 0);
  });
});

describe("haversineKm", () => {
  it("approximates Paris -> London", () => {
    const d = haversineKm(48.8566, 2.3522, 51.5074, -0.1278);
    expect(d).toBeGreaterThan(330);
    expect(d).toBeLessThan(360);
  });
});
