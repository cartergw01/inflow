import { redirect } from "next/navigation";
import { GalaxyApp } from "../../components/galaxy/galaxy-app";
import { getProfile } from "../../lib/profile";
export const dynamic = "force-dynamic";
export const metadata = { title: "Saved — InFlow" };
export default async function SavedPage() {
  if (!await getProfile()) redirect("/welcome");
  return <GalaxyApp initialWorld={null} initialPanel="saved" />;
}
