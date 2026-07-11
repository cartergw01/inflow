import { redirect } from "next/navigation";
import { GalaxyApp } from "../../components/galaxy/galaxy-app";
import { getProfile } from "../../lib/profile";
export const dynamic = "force-dynamic";
export const metadata = { title: "Sources — InFlow" };
export default async function SourcesPage() {
  if (!await getProfile()) redirect("/");
  return <GalaxyApp initialWorld={null} initialPanel="sources" />;
}
