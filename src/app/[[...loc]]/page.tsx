import { notFound } from "next/navigation";
import { GalaxyApp } from "../../components/galaxy/galaxy-app";
import { VISUALS_BY_SLUG } from "../../galaxy/worlds";

export const dynamic = "force-dynamic";

/**
 * The Observatory entry. "/" opens the galaxy; "/g/<world>" drops you
 * straight into a world (deep links + returning sessions skip the flight).
 */
export async function generateMetadata({ params }: { params: Promise<{ loc?: string[] }> }) {
  const { loc } = await params;
  const world = loc?.[0] === "g" ? VISUALS_BY_SLUG.get(loc[1]) : null;
  return { title: world ? `${world.label} — InFlow` : "InFlow" };
}

export default async function ObservatoryPage({ params }: { params: Promise<{ loc?: string[] }> }) {
  const { loc } = await params;

  let initialWorld: string | null = null;
  if (loc && loc.length > 0) {
    if (loc[0] !== "g" || loc.length !== 2 || !VISUALS_BY_SLUG.has(loc[1])) notFound();
    initialWorld = loc[1];
  }

  return <GalaxyApp initialWorld={initialWorld} />;
}
