import { describe, expect, it } from "vitest";
import { verificationForGroup, type EvidenceSource } from "../credibility";

const source = (credibilityTier: EvidenceSource["credibilityTier"], sourceFamily: string): EvidenceSource => ({
  credibilityTier,
  sourceFamily,
});

describe("verificationForGroup", () => {
  it("keeps a lone social claim unconfirmed", () => {
    const social = source("social", "journalist-a");
    expect(verificationForGroup(social, [social])).toBe("unconfirmed");
  });

  it("corroborates social signal only when an independent outlet matches", () => {
    const social = source("social", "journalist-a");
    expect(verificationForGroup(social, [social, source("major", "reuters")])).toBe("corroborated");
    expect(verificationForGroup(social, [social, source("social", "journalist-b")])).toBe("unconfirmed");
  });

  it("does not count two channels from one editorial family twice", () => {
    const outlet = source("major", "reuters");
    expect(verificationForGroup(outlet, [outlet, source("major", "reuters")])).toBe("reported");
  });

  it("marks independently reported outlet coverage corroborated", () => {
    const outlet = source("major", "reuters");
    expect(verificationForGroup(outlet, [outlet, source("major", "ap")])).toBe("corroborated");
  });
});
