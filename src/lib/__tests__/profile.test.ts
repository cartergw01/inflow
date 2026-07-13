import { describe, expect, it } from "vitest";
import { NextResponse } from "next/server";
import {
  PROFILE_COOKIE,
  internalPathWithSearch,
  sanitizeNextPath,
  setProfileCookie,
  validateProfileInterests,
} from "../profile";

describe("profile interests contract", () => {
  it("keeps canonical subjects in first-seen order and removes duplicates", () => {
    expect(validateProfileInterests({ interests: ["nba", "ai", "nba", "taiwan"] })).toEqual({
      ok: true,
      interests: ["nba", "ai", "taiwan"],
    });
  });

  it.each([
    null,
    [],
    {},
    { interests: "nba" },
    { interests: ["nba", 42] },
  ])("rejects a malformed request with 400: %j", (body) => {
    const result = validateProfileInterests(body);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("rejects aliases and unknown subject IDs with a structured 422", () => {
    expect(validateProfileInterests({ interests: ["ai", "tech", "gardening", "tech"] })).toEqual({
      ok: false,
      status: 422,
      error: {
        code: "unknown_subjects",
        message: "One or more interests are not recognized subjects.",
        details: { unknownIds: ["tech", "gardening"] },
      },
    });
  });

  it.each([
    [[], 0],
    [["ai", "startups", "software", "cybersecurity", "gadgets", "world"], 6],
  ])("rejects %i unique subjects outside the one-to-five range", (interests, actual) => {
    expect(validateProfileInterests({ interests })).toMatchObject({
      ok: false,
      status: 422,
      error: {
        code: "interest_count_out_of_range",
        details: { min: 1, max: 5, actual },
      },
    });
  });

  it("applies the range after de-duplication", () => {
    expect(validateProfileInterests({ interests: ["ai", "ai", "ai"] })).toEqual({
      ok: true,
      interests: ["ai"],
    });
  });

  it("applies the shared anonymous-profile cookie policy", () => {
    const response = NextResponse.json({ ok: true });
    setProfileCookie(response, "177a2c13-09f9-4919-a5c1-d48f8ffab371");

    expect(response.cookies.get(PROFILE_COOKIE)?.value).toBe("177a2c13-09f9-4919-a5c1-d48f8ffab371");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax");
    expect(response.headers.get("set-cookie")).toContain("Path=/");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=31536000");
  });

  it("keeps onboarding return paths internal and avoids welcome loops", () => {
    expect(sanitizeNextPath("/g/us-politics?from=briefing")).toBe("/g/us-politics?from=briefing");
    expect(sanitizeNextPath("https://example.com/steal")).toBe("/");
    expect(sanitizeNextPath("//example.com/steal")).toBe("/");
    expect(sanitizeNextPath("/\\example.com/steal")).toBe("/");
    expect(sanitizeNextPath("/welcome?next=/welcome")).toBe("/");
  });

  it("preserves repeated protected-page query parameters", () => {
    expect(internalPathWithSearch("/g/ai", {
      from: "briefing",
      tag: ["one", "two"],
      empty: undefined,
    })).toBe("/g/ai?from=briefing&tag=one&tag=two");
  });
});
