import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { StandaloneReader } from "../../../components/standalone-reader";
import { getDb } from "../../../db";
import { saves } from "../../../db/schema";
import { loadItem } from "../../../lib/feed-data";
import { stripHtml } from "../../../lib/ingest/normalize";
import { getProfile } from "../../../lib/profile";
export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await loadItem(Number(id));
  return { title: row ? `${row.item.title} — InFlow` : "InFlow" };
}
export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) notFound();
  const row = await loadItem(itemId);
  if (!row) notFound();
  const profile = await getProfile();
  let saved = false;
  if (profile) {
    const result = await getDb().select({ itemId: saves.itemId }).from(saves).where(and(eq(saves.profileId, profile.id), eq(saves.itemId, itemId))).limit(1);
    saved = result.length > 0;
  }
  const { item, source } = row;
  return <StandaloneReader item={{ id: item.id, title: stripHtml(item.title), author: item.author, sourceName: source.name, publishedAt: item.publishedAt.toISOString(), topics: item.topics, contentHtml: item.contentHtml, excerpt: item.excerpt, url: item.url, saved }} />;
}
