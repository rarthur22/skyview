import { describe, it, expect } from "vitest";
import { airlineFromCallsign, typeName } from "./enrichment.js";

describe("airlineFromCallsign", () => {
  it("resolves a known airline prefix", () => {
    expect(airlineFromCallsign("AFR1234")).toBe("Air France");
    expect(airlineFromCallsign("UAL5678")).toBe("United Airlines");
  });
  it("returns undefined for an unknown prefix", () => {
    expect(airlineFromCallsign("ZZZ123")).toBeUndefined();
  });
});

describe("typeName", () => {
  it("maps a known ICAO type code", () => {
    expect(typeName("B738")).toBe("Boeing 737-800");
    expect(typeName("A388")).toBe("Airbus A380-800");
  });
  it("passes through unknown codes", () => {
    expect(typeName("F550")).toBe("F550");
  });
  it("handles missing codes", () => {
    expect(typeName()).toBeUndefined();
  });
});
