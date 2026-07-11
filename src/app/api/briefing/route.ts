import { NextResponse } from "next/server";
import { loadBriefing } from "../../../lib/feed-data";
import { createDefaultProfile, getProfile, PROFILE_COOKIE } from "../../../lib/profile";

export const dynamic = "force-dynamic";

export async function GET() {
  const existingProfile = await getProfile();
  const profile = existingProfile ?? await createDefaultProfile();
  const briefing = await loadBriefing(profile);
  const response = NextResponse.json(briefing);
  if (!existingProfile) {
    response.cookies.set(PROFILE_COOKIE, profile.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return response;
}
