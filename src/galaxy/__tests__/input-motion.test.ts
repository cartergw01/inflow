import { describe, expect, it } from "vitest";
import { motionEase, panDistanceScale, pinchZoomFactor, wheelZoomFactor } from "../input-motion";

describe("galaxy input motion", () => {
  it("makes touch dragging substantially calmer than mouse dragging", () => {
    expect(panDistanceScale(110, true)).toBeCloseTo(0.088);
    expect(panDistanceScale(110, true)).toBeLessThan(panDistanceScale(110, false) / 2);
  });

  it("caps large wheel bursts and preserves direction", () => {
    expect(wheelZoomFactor(500, 0, 844, true)).toBeCloseTo(wheelZoomFactor(64, 0, 844, true));
    expect(wheelZoomFactor(40, 0, 844, true)).toBeGreaterThan(1);
    expect(wheelZoomFactor(-40, 0, 844, true)).toBeLessThan(1);
  });

  it("damps pinch changes and ignores invalid samples", () => {
    const rawRatio = 100 / 120;
    const damped = pinchZoomFactor(100, 120, true);
    expect(damped).toBeGreaterThan(rawRatio);
    expect(damped).toBeLessThan(1);
    expect(pinchZoomFactor(0, 120, true)).toBe(1);
  });

  it("returns a stable, bounded motion easing step", () => {
    expect(motionEase(1 / 60, true)).toBeGreaterThan(0);
    expect(motionEase(1 / 60, true)).toBeLessThan(1);
    expect(motionEase(1 / 60, true)).toBeLessThan(motionEase(1 / 60, false));
  });
});
