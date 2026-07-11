import { redirect } from "next/navigation";
import { LibraryPage } from "../../components/library-page";
import { getProfile } from "../../lib/profile";
export const dynamic = "force-dynamic";
export const metadata = { title: "Saved — InFlow" };
export default async function SavedPage() {
  if (!await getProfile()) redirect("/");
  return <LibraryPage initialTab="saved" />;
}
