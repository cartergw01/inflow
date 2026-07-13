import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUBJECT_IDS,
  SUBJECTS,
  SUBJECT_FAMILIES,
  isSubjectId,
  normalizeSubjectIds,
  resolveSubjectId,
  searchSubjects,
  subjectById,
} from "../subjects";

describe("subject catalog", () => {
  it("contains exactly 24 unique leaves in the approved family shape", () => {
    expect(SUBJECTS).toHaveLength(24);
    expect(new Set(SUBJECTS.map((subject) => subject.id)).size).toBe(24);
    expect(SUBJECT_FAMILIES.map((family) => family.subjectIds.length)).toEqual([5, 4, 4, 4, 3, 4]);
    expect(SUBJECT_FAMILIES.flatMap((family) => family.subjectIds)).toEqual(SUBJECTS.map((subject) => subject.id));
  });

  it("uses the approved five defaults", () => {
    expect(DEFAULT_SUBJECT_IDS).toEqual(["ai", "startups", "taiwan", "us-politics", "nba"]);
  });

  it("distinguishes canonical IDs from compatibility aliases", () => {
    expect(isSubjectId("startups")).toBe(true);
    expect(isSubjectId("tech")).toBe(false);
    expect(resolveSubjectId(" tech ")).toBe("startups");
    expect(resolveSubjectId("business")).toBe("markets");
    expect(resolveSubjectId("politics")).toBe("us-politics");
    expect(resolveSubjectId("unknown")).toBeNull();
  });

  it("normalizes legacy profiles in order, dedupes, rejects unknowns, and clamps", () => {
    expect(normalizeSubjectIds(["tech", "ai", "startups", "business", "taiwan", "nba"], 4)).toEqual([
      "startups",
      "ai",
      "markets",
      "taiwan",
    ]);
  });

  it("looks up aliases without exposing them as catalog entries", () => {
    expect(subjectById("politics")?.id).toBe("us-politics");
    expect(SUBJECTS.some((subject) => subject.id === ("politics" as never))).toBe(false);
  });

  it("searches labels, families, descriptions, and synonyms", () => {
    expect(searchSubjects("soccer").map((subject) => subject.id)).toEqual(["football"]);
    expect(searchSubjects("artificial intelligence").map((subject) => subject.id)).toEqual(["ai"]);
    expect(searchSubjects("culture").map((subject) => subject.id)).toEqual(["media", "film", "music", "books"]);
    expect(searchSubjects("")).toHaveLength(24);
  });
});
