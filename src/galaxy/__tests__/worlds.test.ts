import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { WORLD_VISUALS, seeded, worldPosition } from "../worlds";
import { SUBJECTS } from "../../lib/subjects";

describe("world layouts", () => {
  it("are deterministic — same story id always lands in the same place", () => {
    for (const w of WORLD_VISUALS) {
      const a = w.layout(5, 12345);
      const b = w.layout(5, 12345);
      expect(a).toEqual(b);
    }
  });

  it("provides one visual for every canonical subject and all family cores", () => {
    expect(WORLD_VISUALS.slice(1).map((world) => world.slug)).toEqual(SUBJECTS.map((subject) => subject.id));
    expect(new Set(WORLD_VISUALS.map((world) => world.core))).toEqual(new Set([
      "sun", "arena", "lattice", "isle", "rotunda", "globe", "exchange", "constellation", "atom",
    ]));
  });

  it("provides a generated portrait asset for every topic world", () => {
    for (const world of WORLD_VISUALS.slice(1)) {
      expect(world.portrait).toBe(`/galaxy/worlds/${world.slug}.webp`);
      expect(existsSync(join(process.cwd(), "public", world.portrait!))).toBe(true);
    }
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

  it("spaces one-to-five selected worlds evenly and deterministically", () => {
    const selected = WORLD_VISUALS.slice(1, 6);
    const bearings = selected.map((world, index) => {
      const position = worldPosition(world, 0, index, selected.length);
      return Math.atan2(position.z, position.x);
    });
    const gaps = bearings.map((bearing, index) => {
      const next = bearings[(index + 1) % bearings.length];
      return (next - bearing + Math.PI * 2) % (Math.PI * 2);
    });
    gaps.forEach((gap) => expect(gap).toBeCloseTo((Math.PI * 2) / selected.length, 8));
    expect(worldPosition(selected[2], 0.4, 2, selected.length)).toEqual(worldPosition(selected[2], 0.4, 2, selected.length));
  });
});
