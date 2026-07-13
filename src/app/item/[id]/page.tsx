import { notFound } from "next/navigation";
import { StandaloneReader } from "../../../components/standalone-reader";
import { loadItem, loadReaderItem } from "../../../lib/feed-data";
import { stripHtml } from "../../../lib/ingest/normalize";
import { getProfileId } from "../../../lib/profile";
import { resolveReaderContent } from "../../../lib/reader-content";
export const dynamic = "force-dynamic";
export const maxDuration = 15;
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await loadItem(Number(id));
  return { title: row ? `${row.item.title} — InFlow` : "InFlow" };
}
export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const itemId = Number(id);
  if (!Number.isInteger(itemId)) notFound();
  const row = await loadReaderItem(itemId, await getProfileId());
  if (!row) notFound();
  const { item, source, saved } = row;
  const reader = await resolveReaderContent(item, source.sourceClass);
  return <StandaloneReader item={{
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
  }} />;
}
