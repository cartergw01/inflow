import { describe, expect, it } from "vitest";
import { topicLabel } from "../format";
import { SUBJECTS } from "../subjects";

describe("topic labels", () => {
  it("derives every canonical label from the subject catalog", () => {
    for (const subject of SUBJECTS) expect(topicLabel(subject.id)).toBe(subject.label);
  });

  it("resolves hidden legacy aliases to their canonical leaf labels", () => {
    expect(topicLabel("tech")).toBe("Startups");
    expect(topicLabel("business")).toBe("Markets");
    expect(topicLabel("politics")).toBe("US Politics");
  });
});
