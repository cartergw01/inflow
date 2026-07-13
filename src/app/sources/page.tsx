import { redirect } from "next/navigation";
import { LibraryPage } from "../../components/library-page";
import { getProfile, internalPathWithSearch, type InternalSearchParams } from "../../lib/profile";
export const dynamic = "force-dynamic";
export const metadata = { title: "Sources — InFlow" };
export default async function SourcesPage({ searchParams }: { searchParams: Promise<InternalSearchParams> }) {
  const query = await searchParams;
  if (!await getProfile()) redirect(`/welcome?next=${encodeURIComponent(internalPathWithSearch("/sources", query))}`);
  return <LibraryPage initialTab="sources" />;
}
