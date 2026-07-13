import { describe, expect, it } from "vitest";
import { affinityKey, type AffinityMap } from "../ranking/types";
import { DEFAULT_SUBJECT_IDS } from "../subjects";
import {
  mergeCandidateGroups,
  resolveSelectedSubjects,
  subjectAffinityWeight,
} from "../feed-data";

describe("selected-subject feed data", () => {
  it("resolves aliases in order, dedupes, and clamps worlds to five", () => {
    const subjects = resolveSelectedSubjects([
      "music",
      "tech",
      "ai",
      "music",
      "business",
      "health",
      "nba",
    ]);

    expect(subjects.map((subject) => subject.id)).toEqual([
      "music",
      "startups",
      "ai",
      "markets",
      "health",
    ]);
  });

  it("uses onboarding defaults for an empty or invalid legacy profile", () => {
    expect(resolveSelectedSubjects([]).map((subject) => subject.id)).toEqual(DEFAULT_SUBJECT_IDS);
    expect(resolveSelectedSubjects(["unknown"]).map((subject) => subject.id)).toEqual(DEFAULT_SUBJECT_IDS);
  });

  it("merges global and subject pools without reordering the first occurrence", () => {
    const global = [{ item: { id: 3 }, pool: "global" }, { item: { id: 2 }, pool: "global" }];
    const ai = [{ item: { id: 2 }, pool: "ai" }, { item: { id: 1 }, pool: "ai" }];
    const health = [{ item: { id: 1 }, pool: "health" }, { item: { id: 4 }, pool: "health" }];

    expect(mergeCandidateGroups([global, ai, health])).toEqual([
      { item: { id: 3 }, pool: "global" },
      { item: { id: 2 }, pool: "global" },
      { item: { id: 1 }, pool: "ai" },
      { item: { id: 4 }, pool: "health" },
    ]);
  });

  it("falls back to legacy affinities only until a canonical leaf exists", () => {
    const now = new Date("2026-07-13T00:00:00Z");
    const affinities: AffinityMap = new Map([
      [affinityKey("topic", "tech"), { weight: 3, updatedAt: now }],
      [affinityKey("topic", "business"), { weight: 2, updatedAt: now }],
      [affinityKey("topic", "politics"), { weight: 1, updatedAt: now }],
      [affinityKey("topic", "startups"), { weight: -2, updatedAt: now }],
    ]);

    expect(subjectAffinityWeight(affinities, "startups")).toBe(0);
    expect(subjectAffinityWeight(affinities, "markets")).toBe(2);
    expect(subjectAffinityWeight(affinities, "us-politics")).toBe(1);
    expect(subjectAffinityWeight(affinities, "health")).toBe(0);
  });
});
