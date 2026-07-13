import type { GalaxyStoryDTO } from "../../lib/feed-data";
import { subjectById, type SubjectId } from "../../lib/subjects";

export function briefingSummary(newCount: number): string {
  if (newCount === 0) {
    return "You’re caught up on new stories. Here are the strongest stories from the past seven days, with unread stories first.";
  }

  return `${newCount} new ${newCount === 1 ? "story" : "stories"} since your last visit. Stories are ranked for you, with unread stories first.`;
}

export function joinLabels(labels: readonly string[]): string {
  if (labels.length === 0) return "your chosen topics";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

export function briefingSelectionReason(
  story: Pick<GalaxyStoryDTO, "topics" | "exploration">,
  selectedSubjects: ReadonlySet<SubjectId>,
): string {
  if (story.exploration) return "Outside your usual topics";

  const followedSubject = story.topics
    .map(subjectById)
    .find((subject) => subject && selectedSubjects.has(subject.id));

  if (followedSubject) return `Because you follow ${followedSubject.label}`;
  return "Strong recent story";
}
