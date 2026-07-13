import { describe, expect, it } from "vitest";
import { sanitizeNextPath } from "../../../lib/profile";

describe("welcome next-path sanitization", () => {
  it("preserves safe internal paths, queries, and fragments", () => {
    expect(sanitizeNextPath("/universe?world=ai#story")).toBe("/universe?world=ai#story");
    expect(sanitizeNextPath("/g/taiwan")).toBe("/g/taiwan");
  });

  it.each([
    "https://example.com",
    "//example.com",
    "/%2f%2fexample.com",
    "/\\example.com",
    "/welcome",
    "/welcome/again",
  ])("falls back for unsafe or recursive target %s", (target) => {
    expect(sanitizeNextPath(target)).toBe("/");
  });

  it("falls back for repeated query params", () => {
    expect(sanitizeNextPath(["/universe", "//example.com"])).toBe("/");
  });
});
