import { NextRequest, NextResponse } from "next/server";
import { loadReaderItem } from "../../../../lib/feed-data";
import { stripHtml } from "../../../../lib/ingest/normalize";
import { getProfileId } from "../../../../lib/profile";
import { resolveReaderContent } from "../../../../lib/reader-content";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

/**
 * Article payload for the in-galaxy reader overlay. The 3D scene stays
 * mounted; the overlay fetches content instead of navigating away.
 * Short or missing feed bodies are upgraded from the public publisher page,
 * sanitized, and cached before this response is returned.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const profileId = await getProfileId();
  const row = await loadReaderItem(itemId, profileId);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { item, source, saved } = row;
  const reader = await resolveReaderContent(item, source.sourceClass);
  return NextResponse.json({
    id: item.id,
    title: stripHtml(item.title),
    author: reader.author,
    sourceName: source.name,
    sourceHomepageUrl: source.homepageUrl,
    credibilityTier: source.credibilityTier,
    sourceCheckedAt: source.lastSuccessfulFetchAt?.toISOString() ?? null,
    publishedAt: item.publishedAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    status: item.status,
    verificationStatus: item.verificationStatus,
    correctionNote: item.correctionNote,
    topics: item.topics,
    contentHtml: reader.contentHtml,
    contentStatus: reader.contentStatus,
    readingMinutes: reader.readingMinutes,
    excerpt: reader.excerpt,
    url: item.url,
    saved,
  }, { headers: { "cache-control": "private, no-store" } });
}
