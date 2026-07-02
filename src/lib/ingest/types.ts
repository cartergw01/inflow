import type { NewItem, Source } from "../../db/schema";

/** A parsed-but-not-yet-normalized entry from any adapter. */
export interface RawItem {
  guid: string;
  title: string;
  url: string;
  author: string | null;
  /** Publisher-provided description/summary. Never generated. */
  excerpt: string | null;
  /** Full HTML body when the feed provides one (Substack does). Unsanitized. */
  contentHtml: string | null;
  imageUrl: string | null;
  publishedAt: Date;
}

export interface FetchResult {
  items: RawItem[];
  /** True when the server said 304 / nothing new. */
  notModified: boolean;
  etag: string | null;
  lastModified: string | null;
}

export interface SourceAdapter {
  fetch(source: Source): Promise<FetchResult>;
}

export interface IngestSourceStat {
  source: string;
  fetched: number;
  inserted: number;
  status: string;
}

export interface IngestStats {
  sources: number;
  fetched: number;
  inserted: number;
  clustered: number;
  errors: string[];
  perSource: IngestSourceStat[];
  ms: number;
}

export type NormalizedItem = Omit<NewItem, "id" | "fetchedAt" | "clusterId">;
