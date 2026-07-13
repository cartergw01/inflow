import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { profiles } from "../../../db/schema";
import {
  getProfileId,
  setProfileCookie,
  validateProfileInterests,
} from "../../../lib/profile";

/** Creates or tunes the anonymous profile without adding an authentication gate. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "invalid_json",
          message: "Request body must contain valid JSON.",
        },
      },
      { status: 400 },
    );
  }

  const validation = validateProfileInterests(body);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.error },
      { status: validation.status },
    );
  }

  const db = getDb();
  const existingId = await getProfileId();
  let profile = existingId
    ? (await db
        .update(profiles)
        .set({ interests: validation.interests })
        .where(eq(profiles.id, existingId))
        .returning())[0]
    : undefined;
  const created = !profile;

  // A syntactically valid cookie can outlive its database row. Treat that as
  // a new anonymous visitor and replace the stale cookie with the new row ID.
  if (!profile) {
    [profile] = await db
      .insert(profiles)
      .values({ interests: validation.interests })
      .returning();
  }

  const res = NextResponse.json(
    { ok: true, interests: validation.interests },
    { status: created ? 201 : 200 },
  );
  setProfileCookie(res, profile.id);
  return res;
}
