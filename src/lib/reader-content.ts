import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { items, type Item, type SourceClass } from "../db/schema";
import { countWords } from "./ingest/normalize";
import { fetchReadableArticle, type ExtractedArticle } from "./article-reader";

const FULL_READER_WORDS = 180;
const WORDS_PER_MINUTE = 230;
const refreshes = new Map<number, Promise<ExtractedArticle | null>>();

export type ReaderContentStatus = "full" | "partial" | "unavailable";

export interface ResolvedReaderContent {
  author: string | null;
  excerpt: string | null;
  contentHtml: string | null;
  contentStatus: ReaderContentStatus;
  readingMinutes: number | null;
}

export function needsReaderExtraction(wordCount: number, sourceClass: SourceClass): boolean {
  return sourceClass !== "social" && wordCount < FULL_READER_WORDS;
}

export function shouldUseExtractedContent(existingWords: number, extractedWords: number): boolean {
  return extractedWords >= existingWords + 25;
}

async function extractOnce(item: Item): Promise<ExtractedArticle | null> {
  const pending = refreshes.get(item.id);
  if (pending) return pending;
  const extraction = fetchReadableArticle(item.url).finally(() => refreshes.delete(item.id));
  refreshes.set(item.id, extraction);
  return extraction;
}

export async function resolveReaderContent(item: Item, sourceClass: SourceClass): Promise<ResolvedReaderContent> {
  const existingWords = countWords(item.contentHtml);
  let extracted: ExtractedArticle | null = null;
  if (needsReaderExtraction(existingWords, sourceClass)) extracted = await extractOnce(item);

  const shouldUseExtraction = Boolean(extracted && shouldUseExtractedContent(existingWords, extracted.wordCount));
  const contentHtml = shouldUseExtraction ? extracted!.contentHtml : item.contentHtml;
  const wordCount = shouldUseExtraction ? extracted!.wordCount : existingWords;
  const author = item.author ?? (shouldUseExtraction ? extracted!.byline : null);
  const excerpt = item.excerpt ?? (shouldUseExtraction ? extracted!.excerpt : null);

  if (shouldUseExtraction) {
    try {
      await getDb()
        .update(items)
        .set({
          contentHtml,
          wordCount,
          author,
          excerpt,
        })
        .where(eq(items.id, item.id));
    } catch {
      // The current reader request can still use the extracted content when
      // cache persistence is temporarily unavailable.
    }
  }

  const contentStatus: ReaderContentStatus = !contentHtml
    ? "unavailable"
    : shouldUseExtraction || sourceClass === "social" || wordCount >= FULL_READER_WORDS
      ? "full"
      : "partial";

  return {
    author,
    excerpt,
    contentHtml,
    contentStatus,
    readingMinutes: wordCount > 0 ? Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE)) : null,
  };
}
