import { describe, expect, it } from "vitest";
import { esperaReconexion } from "./reconexion";

describe("esperaReconexion", () => {
  it("esperas", () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(esperaReconexion)).toEqual([1000, 2000, 4000, 8000, 10000, 10000, 10000]);
  });
});
