import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { profiles, type Profile } from "../db/schema";
import { isSubjectId, type SubjectId } from "./subjects";

export const PROFILE_COOKIE = "inflow_profile";
export const PROFILE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 365,
  path: "/",
} as const;

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export type ProfileInterestsValidation =
  | { ok: true; interests: SubjectId[] }
  | { ok: false; status: 400 | 422; error: ApiError };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate the public profile-write contract. Duplicate IDs are collapsed in
 * first-seen order, but aliases and unknown values are rejected: this endpoint
 * accepts canonical SubjectIds only.
 */
export function validateProfileInterests(body: unknown): ProfileInterestsValidation {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "invalid_request",
        message: "Request body must be a JSON object with an interests array.",
      },
    };
  }

  const interests = (body as { interests?: unknown }).interests;
  if (!Array.isArray(interests) || interests.some((value) => typeof value !== "string")) {
    return {
      ok: false,
      status: 400,
      error: {
        code: "invalid_interests",
        message: "interests must be an array of subject ID strings.",
      },
    };
  }

  const unknownIds = [...new Set(interests.filter((value) => !isSubjectId(value)))];
  if (unknownIds.length > 0) {
    return {
      ok: false,
      status: 422,
      error: {
        code: "unknown_subjects",
        message: "One or more interests are not recognized subjects.",
        details: { unknownIds },
      },
    };
  }

  const normalized = [...new Set(interests)] as SubjectId[];
  if (normalized.length < 1 || normalized.length > 5) {
    return {
      ok: false,
      status: 422,
      error: {
        code: "interest_count_out_of_range",
        message: "Choose between one and five subjects.",
        details: { min: 1, max: 5, actual: normalized.length },
      },
    };
  }

  return { ok: true, interests: normalized };
}

export async function getProfileId(): Promise<string | null> {
  const id = (await cookies()).get(PROFILE_COOKIE)?.value;
  return id && UUID_RE.test(id) ? id : null;
}

/**
 * The profile is whoever holds the cookie — anonymous, no login (see
 * NOTES.md). Returns null on first visit; the onboarding flow creates the row.
 */
export async function getProfile(): Promise<Profile | null> {
  const id = await getProfileId();
  if (!id) return null;
  const db = getDb();
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
  return profile ?? null;
}

/** Apply the anonymous-profile cookie consistently from any route handler. */
export function setProfileCookie(response: NextResponse, profileId: string): void {
  response.cookies.set(PROFILE_COOKIE, profileId, PROFILE_COOKIE_OPTIONS);
}

/** Shared response for APIs that require a completed anonymous profile. */
export function profileRequiredResponse() {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "profile_required",
        message: "Complete onboarding before requesting personalized data.",
      },
    },
    { status: 401 },
  );
}

export type InternalSearchParams = Readonly<Record<string, string | string[] | undefined>>;

/** Preserve a protected page's query string while keeping its pathname explicit and internal. */
export function internalPathWithSearch(pathname: string, searchParams: InternalSearchParams): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (value !== undefined) {
      query.append(key, value);
    }
  }
  const serialized = query.toString();
  return serialized ? `${pathname}?${serialized}` : pathname;
}

/** Keep onboarding returns inside this application and out of a redirect loop. */
export function sanitizeNextPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string") return fallback;
  const candidate = value.trim();
  if (!candidate.startsWith("/") || candidate.startsWith("//") || /[\u0000-\u001f\u007f\\]/.test(candidate)) return fallback;
  try {
    const decoded = decodeURIComponent(candidate);
    if (!decoded.startsWith("/") || decoded.startsWith("//") || /[\u0000-\u001f\u007f\\]/.test(decoded)) return fallback;
    const parsed = new URL(candidate, "https://inflow.local");
    if (parsed.origin !== "https://inflow.local" || parsed.pathname === "/welcome" || parsed.pathname.startsWith("/welcome/")) return fallback;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
