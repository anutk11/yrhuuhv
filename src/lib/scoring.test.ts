import { describe, expect, it } from "vitest";
import { calculateScore } from "./scoring";

describe("calculateScore", () => {
  it("returns zero when incorrect", () => {
    expect(calculateScore(false, 1, 15).total).toBe(0);
  });
  it("rewards faster correct answers", () => {
    expect(calculateScore(true, 1, 15).total).toBeGreaterThan(calculateScore(true, 14, 15).total);
  });
  it("never exceeds 1000", () => {
    expect(calculateScore(true, 0, 15).total).toBeLessThanOrEqual(1000);
  });
});
