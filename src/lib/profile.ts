import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { profiles, type Profile } from "../db/schema";

export const PROFILE_COOKIE = "inflow_profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The profile is whoever holds the cookie — anonymous, no login (see
 * NOTES.md). Returns null on first visit; the onboarding flow creates the row.
 */
export async function getProfile(): Promise<Profile | null> {
  const store = await cookies();
  const id = store.get(PROFILE_COOKIE)?.value;
  if (!id || !UUID_RE.test(id)) return null;
  const db = getDb();
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
  return profile ?? null;
}
