import { redirect } from "next/navigation";
import { LibraryPage } from "../../components/library-page";
import { getProfile, internalPathWithSearch, type InternalSearchParams } from "../../lib/profile";
export const dynamic = "force-dynamic";
export const metadata = { title: "Saved — InFlow" };
export default async function SavedPage({ searchParams }: { searchParams: Promise<InternalSearchParams> }) {
  const query = await searchParams;
  if (!await getProfile()) redirect(`/welcome?next=${encodeURIComponent(internalPathWithSearch("/saved", query))}`);
  return <LibraryPage initialTab="saved" />;
}
