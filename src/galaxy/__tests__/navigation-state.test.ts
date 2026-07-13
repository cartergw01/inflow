import { describe, expect, it } from "vitest";
import { initialGalaxyCamera } from "../navigation-state";

const saved = { world: "us-politics", theta: 0.9, phi: 1.4, radius: 13 };

describe("galaxy launch framing", () => {
  it("shows the Today core instead of leaking the last visited world", () => {
    expect(initialGalaxyCamera({ initialMode: "today", initialWorld: null, saved, isMobile: false })).toEqual({
      world: "today",
      theta: 0.9,
      phi: 1.25,
      radius: 14,
    });
  });

  it("opens the universe route at the complete overview", () => {
    expect(initialGalaxyCamera({ initialMode: "universe", initialWorld: null, saved, isMobile: false })).toEqual({
      world: null,
      theta: 0.9,
      phi: 1.12,
      radius: 72,
    });
  });

  it("honors explicit world deep links and mobile framing", () => {
    expect(initialGalaxyCamera({ initialMode: "universe", initialWorld: "ai", saved, isMobile: true })).toEqual({
      world: "ai",
      theta: 0.9,
      phi: 1.4,
      radius: 19,
    });
  });
});
