import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { saves } from "../../../../db/schema";
import { loadItem } from "../../../../lib/feed-data";
import { stripHtml } from "../../../../lib/ingest/normalize";
import { getProfile } from "../../../../lib/profile";

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

  const row = await loadItem(itemId);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const profile = await getProfile();
  let saved = false;
  if (profile) {
    const db = getDb();
    const rows = await db
      .select({ itemId: saves.itemId })
      .from(saves)
      .where(and(eq(saves.profileId, profile.id), eq(saves.itemId, itemId)))
      .limit(1);
    saved = rows.length > 0;
  }

  const { item, source } = row;
  return NextResponse.json({
    id: item.id,
    title: stripHtml(item.title),
    author: item.author,
    sourceName: source.name,
    publishedAt: item.publishedAt.toISOString(),
    topics: item.topics,
    contentHtml: item.contentHtml,
    excerpt: item.excerpt,
    url: item.url,
    saved,
  });
}
