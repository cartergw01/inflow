export type SubjectFamilyId = "technology" | "world" | "business" | "culture" | "science" | "sports";

export type SubjectId =
  | "ai"
  | "startups"
  | "software"
  | "cybersecurity"
  | "gadgets"
  | "world"
  | "taiwan"
  | "us-politics"
  | "climate"
  | "markets"
  | "economy"
  | "vc"
  | "personal-finance"
  | "media"
  | "film"
  | "music"
  | "books"
  | "space"
  | "health"
  | "science"
  | "nba"
  | "football"
  | "baseball"
  | "formula-1";

export interface Subject {
  id: SubjectId;
  label: string;
  familyId: SubjectFamilyId;
  description: string;
  /** Search-only language; never persisted as a subject ID. */
  searchTerms: readonly string[];
}

export interface SubjectFamily {
  id: SubjectFamilyId;
  label: string;
  description: string;
  accent: string;
  subjectIds: readonly SubjectId[];
}

export const SUBJECTS: readonly Subject[] = [
  { id: "ai", label: "AI", familyId: "technology", description: "Models, agents, and intelligent tools", searchTerms: ["artificial intelligence", "machine learning", "llm"] },
  { id: "startups", label: "Startups", familyId: "technology", description: "Builders, new companies, and product bets", searchTerms: ["founders", "entrepreneurship", "tech"] },
  { id: "software", label: "Software", familyId: "technology", description: "Platforms, developers, and the cloud", searchTerms: ["programming", "apps", "saas", "developer"] },
  { id: "cybersecurity", label: "Cybersecurity", familyId: "technology", description: "Digital threats, defense, and privacy", searchTerms: ["security", "hacking", "privacy", "breach"] },
  { id: "gadgets", label: "Gadgets", familyId: "technology", description: "Devices, hardware, and consumer tech", searchTerms: ["phones", "hardware", "devices", "reviews"] },

  { id: "world", label: "Global Affairs", familyId: "world", description: "Diplomacy, conflict, and geopolitics", searchTerms: ["world", "international", "foreign policy", "geopolitics"] },
  { id: "taiwan", label: "Taiwan", familyId: "world", description: "Taiwanese society, policy, and the Strait", searchTerms: ["taipei", "cross-strait", "tsmc"] },
  { id: "us-politics", label: "US Politics", familyId: "world", description: "Washington, elections, and public policy", searchTerms: ["politics", "congress", "white house", "government"] },
  { id: "climate", label: "Climate", familyId: "world", description: "A changing planet and its response", searchTerms: ["environment", "global warming", "energy", "weather"] },

  { id: "markets", label: "Markets", familyId: "business", description: "Stocks, bonds, commodities, and capital", searchTerms: ["wall street", "investing", "finance", "business"] },
  { id: "economy", label: "Economy", familyId: "business", description: "Growth, inflation, jobs, and policy", searchTerms: ["economics", "gdp", "federal reserve", "macro"] },
  { id: "vc", label: "Venture Capital", familyId: "business", description: "Funding, investors, and private markets", searchTerms: ["vc", "venture", "fundraising", "seed"] },
  { id: "personal-finance", label: "Personal Finance", familyId: "business", description: "Money decisions for everyday life", searchTerms: ["saving", "retirement", "credit", "mortgage"] },

  { id: "media", label: "Media", familyId: "culture", description: "Journalism, creators, and the attention economy", searchTerms: ["news", "journalism", "publishing", "creators"] },
  { id: "film", label: "Film", familyId: "culture", description: "Cinema, filmmakers, and the screen", searchTerms: ["movies", "cinema", "hollywood"] },
  { id: "music", label: "Music", familyId: "culture", description: "Artists, records, and the listening world", searchTerms: ["albums", "songs", "concerts", "artists"] },
  { id: "books", label: "Books", familyId: "culture", description: "Authors, ideas, and literary life", searchTerms: ["literature", "reading", "authors", "publishing"] },

  { id: "space", label: "Space", familyId: "science", description: "Exploration, astronomy, and the cosmos", searchTerms: ["nasa", "astronomy", "rockets", "planets"] },
  { id: "health", label: "Health", familyId: "science", description: "Medicine, wellbeing, and public health", searchTerms: ["medicine", "medical", "wellness", "disease"] },
  { id: "science", label: "Research", familyId: "science", description: "Discoveries across the natural world", searchTerms: ["science", "research", "physics", "biology"] },

  { id: "nba", label: "NBA", familyId: "sports", description: "Basketball across the league", searchTerms: ["basketball", "hoops"] },
  { id: "football", label: "Football", familyId: "sports", description: "The global game, on and off the pitch", searchTerms: ["soccer", "premier league", "champions league", "fifa"] },
  { id: "baseball", label: "Baseball", familyId: "sports", description: "MLB, ballparks, and the diamond", searchTerms: ["mlb", "major league baseball"] },
  { id: "formula-1", label: "Formula 1", familyId: "sports", description: "Grand prix racing and the paddock", searchTerms: ["f1", "formula one", "motorsport", "racing"] },
] as const;

export const SUBJECT_FAMILIES: readonly SubjectFamily[] = [
  { id: "technology", label: "Technology", description: "What humanity is building next", accent: "#69E7FF", subjectIds: ["ai", "startups", "software", "cybersecurity", "gadgets"] },
  { id: "world", label: "World", description: "The forces reshaping our shared planet", accent: "#FF6F91", subjectIds: ["world", "taiwan", "us-politics", "climate"] },
  { id: "business", label: "Business", description: "Money, companies, and the wider economy", accent: "#FFD166", subjectIds: ["markets", "economy", "vc", "personal-finance"] },
  { id: "culture", label: "Culture", description: "The stories and art moving through society", accent: "#B79CFF", subjectIds: ["media", "film", "music", "books"] },
  { id: "science", label: "Science", description: "New knowledge, from the body to the cosmos", accent: "#79E6B1", subjectIds: ["space", "health", "science"] },
  { id: "sports", label: "Sports", description: "Competition, teams, and human performance", accent: "#FF9F5A", subjectIds: ["nba", "football", "baseball", "formula-1"] },
] as const;

export const DEFAULT_SUBJECT_IDS = ["ai", "startups", "taiwan", "us-politics", "nba"] as const satisfies readonly SubjectId[];

export const SUBJECT_IDS: ReadonlySet<SubjectId> = new Set(SUBJECTS.map((subject) => subject.id));

/** Compatibility only: aliases are accepted when reading old profiles/routes, never shown in the picker. */
export const LEGACY_SUBJECT_ALIASES = {
  tech: "startups",
  business: "markets",
  politics: "us-politics",
} as const satisfies Readonly<Record<string, SubjectId>>;

const SUBJECT_BY_ID = new Map<SubjectId, Subject>(SUBJECTS.map((subject) => [subject.id, subject]));

export function isSubjectId(value: unknown): value is SubjectId {
  return typeof value === "string" && SUBJECT_IDS.has(value as SubjectId);
}

export function resolveSubjectId(value: unknown): SubjectId | null {
  if (typeof value !== "string") return null;
  const candidate = value.trim().toLowerCase();
  if (isSubjectId(candidate)) return candidate;
  return LEGACY_SUBJECT_ALIASES[candidate as keyof typeof LEGACY_SUBJECT_ALIASES] ?? null;
}

/** Resolve aliases, retain first-selection order, remove duplicates, and clamp to the visible-world limit. */
export function normalizeSubjectIds(
  values: readonly unknown[] | null | undefined,
  max = 5,
): SubjectId[] {
  if (!values || max <= 0) return [];
  const limit = Number.isFinite(max) ? Math.floor(max) : 5;
  const result: SubjectId[] = [];
  const seen = new Set<SubjectId>();
  for (const value of values) {
    const id = resolveSubjectId(value);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= limit) break;
  }
  return result;
}

export function subjectById(value: unknown): Subject | undefined {
  const id = resolveSubjectId(value);
  return id ? SUBJECT_BY_ID.get(id) : undefined;
}

export function searchSubjects(query: string): Subject[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...SUBJECTS];
  return SUBJECTS.filter((subject) => {
    const family = SUBJECT_FAMILIES.find((candidate) => candidate.id === subject.familyId);
    return [subject.id, subject.label, subject.description, family?.label, ...subject.searchTerms]
      .some((value) => value?.toLowerCase().includes(normalized) ?? false);
  });
}
