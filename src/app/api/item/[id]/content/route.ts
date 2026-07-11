import { NextRequest, NextResponse } from "next/server";
import { loadItem } from "../../../../../lib/feed-data";
import { loadExtractedArticle } from "../../../../../lib/article-reader";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** On-demand publisher reader view. The base story payload remains fast. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const row = await loadItem(itemId);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const targetUrl = row.item.canonicalUrl || row.item.url;
  const article = await loadExtractedArticle(targetUrl);
  if (!article) return new NextResponse(null, { status: 204 });

  return NextResponse.json({
    ...article,
    contentType: "publisher" as const,
  });
}
