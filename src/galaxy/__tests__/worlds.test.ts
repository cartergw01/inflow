import { describe, expect, it } from "vitest";
import { WORLD_VISUALS, seeded, worldPosition } from "../worlds";

describe("world layouts", () => {
  it("are deterministic — same story id always lands in the same place", () => {
    for (const w of WORLD_VISUALS) {
      const a = w.layout(5, 12345);
      const b = w.layout(5, 12345);
      expect(a).toEqual(b);
    }
  });

  it("give distinct worlds distinct formations for the same inputs", () => {
    const shapes = WORLD_VISUALS.map((w) => {
      const p = w.layout(3, 999);
      return `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;
    });
    expect(new Set(shapes).size).toBe(WORLD_VISUALS.length);
  });

  it("keeps stories clear of the core (no z-fighting with world geometry)", () => {
    for (const w of WORLD_VISUALS) {
      for (let i = 0; i < 40; i++) {
        const p = w.layout(i, i * 7919 + 13);
        const dist = Math.hypot(p.x, p.y, p.z);
        expect(dist, `${w.slug} story ${i}`).toBeGreaterThan(2.2);
      }
    }
  });

  it("seeded() is stable and uniform-ish", () => {
    expect(seeded(42, 7)).toBe(seeded(42, 7));
    const samples = Array.from({ length: 200 }, (_, i) => seeded(i, 3));
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...samples)).toBeLessThanOrEqual(1);
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    expect(mean).toBeGreaterThan(0.35);
    expect(mean).toBeLessThan(0.65);
  });

  it("affinity pulls worlds toward the sun", () => {
    const w = WORLD_VISUALS.find((v) => v.slug === "taiwan")!;
    const cold = worldPosition(w, 0);
    const warm = worldPosition(w, 1);
    const dist = (p: { x: number; y: number; z: number }) => Math.hypot(p.x, p.y, p.z);
    expect(dist(warm)).toBeLessThan(dist(cold));
  });
});
