import { SUBJECTS, subjectById } from "./subjects";

/** Compatibility shape for the remaining generic feed helpers. */
export interface Category {
  slug: string;
  label: string;
  /** Short label for narrow viewports. */
  shortLabel?: string;
  /** Classifier topics folded into this tab. Empty = all topics. */
  topics: string[];
}

export const CATEGORIES: Category[] = [
  { slug: "today", label: "Today", topics: [] },
  ...SUBJECTS.map((subject) => ({ slug: subject.id, label: subject.label, topics: [subject.id] })),
];

export function categoryBySlug(slug: string): Category | undefined {
  if (slug === "today") return CATEGORIES[0];
  const subject = subjectById(slug);
  return subject ? { slug: subject.id, label: subject.label, topics: [subject.id] } : undefined;
}

/** Resolve the first precise leaf topic, with hidden legacy alias fallback. */
export function categoryForTopics(topics: string[]): Category | undefined {
  const subject = topics.map(subjectById).find(Boolean);
  return subject ? { slug: subject.id, label: subject.label, topics: [subject.id] } : undefined;
}
