import { describe, expect, it } from "vitest";
import { updateWorldSelection } from "../onboarding";

describe("onboarding world selection", () => {
  it("retains selection order and removes a subject without reordering the rest", () => {
    expect(updateWorldSelection(["ai", "taiwan"], "nba")).toEqual({
      selection: ["ai", "taiwan", "nba"],
      atLimit: false,
    });
    expect(updateWorldSelection(["ai", "taiwan", "nba"], "taiwan")).toEqual({
      selection: ["ai", "nba"],
      atLimit: false,
    });
  });

  it("enforces the five-world limit without discarding the current selection", () => {
    const current = ["ai", "startups", "taiwan", "us-politics", "nba"] as const;
    expect(updateWorldSelection(current, "music")).toEqual({
      selection: [...current],
      atLimit: true,
    });
  });
});
