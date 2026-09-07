import { describe, it, expect } from "vitest";
import { llToMeters, groundToSkyAngles, clamp, formatAltitude, normAz } from "./utils.js";

describe("clamp", () => {
  it("bounds a value", () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });
});

describe("normAz", () => {
  it("wraps to 0-360", () => {
    expect(normAz(-10)).toBeCloseTo(350);
    expect(normAz(370)).toBeCloseTo(10);
    expect(normAz(0)).toBe(0);
  });
});

describe("llToMeters", () => {
  it("is small for a near point and grows for a distant one", () => {
    const near = llToMeters(48.85661, 2.35221, 48.8566, 2.3522);
    const far = llToMeters(48.86, 2.36, 48.8566, 2.3522);
    expect(Math.abs(near.north)).toBeLessThan(10);
    expect(range(near)).toBeLessThan(10);
    expect(range(far)).toBeGreaterThan(300);
  });
});

describe("groundToSkyAngles", () => {
  it("gives near-zenith elevation for an overhead target", () => {
    const s = groundToSkyAngles({ east: 0.2, north: 0.2 }, 10000, 45);
    expect(s.elev).toBeGreaterThan(80);
    expect(s.slantM).toBeGreaterThan(2000);
  });
  it("gives a low elevation for a distant target at low altitude", () => {
    const s = groundToSkyAngles({ east: 20000, north: 10000 }, 1000);
    expect(s.elev).toBeLessThan(5);
  });
});

describe("formatAltitude", () => {
  it("formats feet with thousands separators", () => {
    expect(formatAltitude(35000)).toBe("35,000 ft");
  });
});

function range(m: { east: number; north: number }): number {
  return Math.hypot(m.east, m.north);
}
