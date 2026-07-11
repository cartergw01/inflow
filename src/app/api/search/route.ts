import { NextRequest, NextResponse } from "next/server";
import { searchFeed } from "../../../lib/feed-data";
import { getProfile } from "../../../lib/profile";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const profile = await getProfile();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 401 });
  const query = request.nextUrl.searchParams.get("q") ?? "";
  if (query.trim().length < 2) return NextResponse.json({ stories: [] });
  return NextResponse.json({ stories: await searchFeed(profile, query) });
}
