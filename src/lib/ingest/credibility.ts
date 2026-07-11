import type { CredibilityTier, VerificationStatus } from "../../db/schema";

export interface EvidenceSource {
  credibilityTier: CredibilityTier;
  sourceFamily: string;
}

/**
 * Corroboration counts independent editorial families, never syndicated copies.
 * Social-only claims remain unconfirmed until a non-social outlet matches them.
 */
export function verificationForGroup(source: EvidenceSource, group: EvidenceSource[]): VerificationStatus {
  const independentFamilies = new Set(group.map((entry) => entry.sourceFamily));
  const hasIndependentOutlet = group.some(
    (entry) => entry.sourceFamily !== source.sourceFamily && entry.credibilityTier !== "social",
  );
  if (independentFamilies.size >= 2 && (source.credibilityTier !== "social" || hasIndependentOutlet)) {
    return "corroborated";
  }
  return source.credibilityTier === "social" ? "unconfirmed" : "reported";
}
