import { GalaxyApp } from "../../components/galaxy/galaxy-app";

export const dynamic = "force-dynamic";
export const metadata = { title: "Universe — InFlow" };

export default function UniversePage() {
  return <GalaxyApp initialWorld={null} initialMode="universe" />;
}
