import { NextResponse } from "next/server";
import { loadSaved, loadSources } from "../../../lib/feed-data";
import { getProfile } from "../../../lib/profile";

export const dynamic = "force-dynamic";

export async function GET() {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 401 });
  const [saved, sources] = await Promise.all([loadSaved(profile), loadSources(profile)]);
  return NextResponse.json({ saved, sources });
}
