import { NextRequest, NextResponse } from "next/server";
import { loadReaderItem } from "../../../../lib/feed-data";
import { stripHtml } from "../../../../lib/ingest/normalize";
import { getProfileId } from "../../../../lib/profile";

export const dynamic = "force-dynamic";

/**
 * Article payload for the in-galaxy reader overlay. The 3D scene stays
 * mounted; the overlay fetches content instead of navigating away.
 * contentHtml was sanitized at ingest (see normalize.ts).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const profileId = await getProfileId();
  const row = await loadReaderItem(itemId, profileId);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { item, source, saved } = row;
  return NextResponse.json({
    id: item.id,
    title: stripHtml(item.title),
    author: item.author,
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
    contentHtml: item.contentHtml,
    excerpt: item.excerpt,
    url: item.url,
    saved,
  });
}
