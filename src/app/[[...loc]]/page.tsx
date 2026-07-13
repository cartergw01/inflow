import { notFound, redirect } from "next/navigation";
import { GalaxyApp } from "../../components/galaxy/galaxy-app";
import { getProfile, internalPathWithSearch, type InternalSearchParams } from "../../lib/profile";
import { DEFAULT_SUBJECT_IDS, isSubjectId, normalizeSubjectIds, subjectById } from "../../lib/subjects";

export const dynamic = "force-dynamic";

/**
 * The Observatory entry. "/" opens the galaxy; "/g/<world>" drops you
 * straight into a world (deep links + returning sessions skip the flight).
 */
export async function generateMetadata({ params }: { params: Promise<{ loc?: string[] }> }) {
  const { loc } = await params;
  const subject = loc?.[0] === "g" ? subjectById(loc[1]) : null;
  return { title: subject ? `${subject.label} — InFlow` : "InFlow" };
}

export default async function ObservatoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ loc?: string[] }>;
  searchParams: Promise<InternalSearchParams>;
}) {
  const [{ loc }, query] = await Promise.all([params, searchParams]);
  const pathname = loc?.length ? `/${loc.map(encodeURIComponent).join("/")}` : "/";
  const requestedPath = internalPathWithSearch(pathname, query);
  const profile = await getProfile();
  if (!profile) redirect(`/welcome?next=${encodeURIComponent(requestedPath)}`);

  let initialWorld: string | null = null;
  if (loc && loc.length > 0) {
    if (loc[0] !== "g" || loc.length !== 2) notFound();
    if (loc[1] === "politics") redirect("/g/us-politics");
    if (!isSubjectId(loc[1])) notFound();
    const subject = subjectById(loc[1]);
    if (!subject) notFound();
    const selected = normalizeSubjectIds(profile.interests);
    const selectedIds = selected.length > 0 ? selected : [...DEFAULT_SUBJECT_IDS];
    if (!selectedIds.includes(subject.id)) notFound();
    initialWorld = subject.id;
  }

  return <GalaxyApp initialWorld={initialWorld} />;
}
