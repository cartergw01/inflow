import { describe, expect, it } from "vitest";
import {
  briefingSelectionReason,
  briefingSummary,
  joinLabels,
} from "../briefing-presentation";

describe("briefing presentation", () => {
  it("explains the zero-new state without claiming no stories were selected", () => {
    expect(briefingSummary(0)).toContain("caught up on new stories");
    expect(briefingSummary(0)).toContain("past seven days");
  });

  it("separates new-story count from the ranked list", () => {
    expect(briefingSummary(1)).toBe(
      "1 new story since your last visit. Stories are ranked for you, with unread stories first.",
    );
    expect(briefingSummary(4)).toContain("4 new stories since your last visit");
  });

  it("formats selected topic labels naturally", () => {
    expect(joinLabels([])).toBe("your chosen topics");
    expect(joinLabels(["Taiwan"])).toBe("Taiwan");
    expect(joinLabels(["Taiwan", "NBA"])).toBe("Taiwan and NBA");
    expect(joinLabels(["Taiwan", "NBA", "AI"])).toBe("Taiwan, NBA, and AI");
  });

  it("uses only reasons supported by ranking metadata", () => {
    const selected = new Set(["taiwan", "nba"] as const);
    expect(briefingSelectionReason({ topics: ["taiwan"], exploration: false }, selected)).toBe(
      "Because you follow Taiwan",
    );
    expect(briefingSelectionReason({ topics: ["markets"], exploration: true }, selected)).toBe(
      "Outside your usual topics",
    );
    expect(briefingSelectionReason({ topics: ["markets"], exploration: false }, selected)).toBe(
      "Strong recent story",
    );
  });
});
