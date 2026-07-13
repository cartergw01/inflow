import { redirect } from "next/navigation";
import { GalaxyApp } from "../../components/galaxy/galaxy-app";
import { getProfile, internalPathWithSearch, type InternalSearchParams } from "../../lib/profile";

export const dynamic = "force-dynamic";
export const metadata = { title: "Universe — InFlow" };

export default async function UniversePage({ searchParams }: { searchParams: Promise<InternalSearchParams> }) {
  const query = await searchParams;
  if (!await getProfile()) redirect(`/welcome?next=${encodeURIComponent(internalPathWithSearch("/universe", query))}`);
  return <GalaxyApp initialWorld={null} initialMode="universe" />;
}
