import { describe, expect, it } from "vitest";
import { storyGlowSize, storyHitSize, storyVisualSize } from "../story-visuals";

describe("story marker visuals", () => {
  it("keeps ranked sparks small and gently tapered", () => {
    expect(storyVisualSize(0)).toBeCloseTo(0.095);
    expect(storyVisualSize(10)).toBeLessThan(storyVisualSize(0));
    expect(storyVisualSize(100)).toBe(0.055);
  });

  it("keeps invisible hit areas larger than the rendered spark", () => {
    for (const index of [0, 5, 20, 100]) {
      expect(storyHitSize(index)).toBeGreaterThan(storyVisualSize(index) * 2);
    }
  });

  it("uses brightness and glow restraint for story state", () => {
    expect(storyGlowSize(0, 1, false)).toBeGreaterThan(storyGlowSize(0, 0, false));
    expect(storyGlowSize(0, 0, true)).toBeLessThan(storyGlowSize(0, 0, false));
  });
});
