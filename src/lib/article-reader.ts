import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { countWords, makeExcerpt, sanitizeContent, stripHtml } from "./ingest/normalize";

const FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 2_500_000;
const MAX_REDIRECTS = 3;
const MIN_ARTICLE_WORDS = 80;
const CACHE_TTL_MS = 30 * 60_000;
const CACHE_LIMIT = 200;
const USER_AGENT = "InFlowReader/0.1 (+https://github.com/cartergw01/inflow)";

export interface ExtractedArticle {
  title: string | null;
  contentHtml: string;
  excerpt: string | null;
  author: string | null;
  readingMinutes: number;
}

interface CacheEntry {
  expiresAt: number;
  value: ExtractedArticle | null;
}

const cache = new Map<string, CacheEntry>();

/** Reject IP ranges that a server-side reader must never be allowed to reach. */
export function isBlockedIp(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^::ffff:/, "");
  if (normalized === "::" || normalized === "::1") return true;

  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224
      || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 0)
      || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19));
  }

  if (isIP(normalized) === 6) {
    return normalized.startsWith("fc") || normalized.startsWith("fd")
      || normalized.startsWith("fe8") || normalized.startsWith("fe9")
      || normalized.startsWith("fea") || normalized.startsWith("feb")
      || normalized.startsWith("2001:db8:");
  }

  return true;
}

async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  const url = new URL(rawUrl);
  if (!(["http:", "https:"] as string[]).includes(url.protocol)) throw new Error("unsupported reader URL protocol");
  if (url.username || url.password) throw new Error("credentialed reader URL");
  if ((url.protocol === "http:" && url.port && url.port !== "80") || (url.protocol === "https:" && url.port && url.port !== "443")) {
    throw new Error("non-standard reader URL port");
  }
  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("private reader hostname");
  }
  if (isIP(hostname)) {
    if (isBlockedIp(hostname)) throw new Error("private reader address");
    return url;
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isBlockedIp(address))) throw new Error("private reader address");
  return url;
}

async function readLimitedHtml(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_HTML_BYTES) throw new Error("reader page too large");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_HTML_BYTES) {
      await reader.cancel();
      throw new Error("reader page too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function fetchPublisherHtml(rawUrl: string): Promise<{ html: string; finalUrl: string }> {
  let url = await assertPublicHttpUrl(rawUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml;q=0.9",
        "user-agent": USER_AGENT,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_REDIRECTS) throw new Error("reader redirect failed");
      url = await assertPublicHttpUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`reader HTTP ${response.status}`);
    const type = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (type && !type.includes("text/html") && !type.includes("application/xhtml+xml")) throw new Error("reader response is not HTML");
    return { html: await readLimitedHtml(response), finalUrl: url.toString() };
  }
  throw new Error("reader redirect failed");
}

function absolutizeArticleHtml(html: string, baseUrl: string): string {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);
  const shareUrl = /(?:twitter\.com\/intent\/tweet|facebook\.com\/sharer|lineit\.line\.me\/share|linkedin\.com\/sharing|reddit\.com\/submit)/i;
  for (const anchor of document.querySelectorAll("a[href]")) {
    if (!shareUrl.test(anchor.getAttribute("href") ?? "")) continue;
    (anchor.closest("li") ?? anchor).remove();
  }
  for (const image of document.querySelectorAll("img")) {
    const width = Number.parseInt(image.getAttribute("width") ?? "", 10);
    const height = Number.parseInt(image.getAttribute("height") ?? "", 10);
    if ((Number.isFinite(width) && width <= 64) || (Number.isFinite(height) && height <= 64)) {
      (image.closest("li") ?? image.closest("a") ?? image).remove();
    }
  }
  for (const list of Array.from(document.querySelectorAll("ul, ol")).reverse()) {
    if (!list.textContent?.trim() && !list.querySelector("img")) list.remove();
  }
  for (const element of document.querySelectorAll("a[href], img[src]")) {
    const attribute = element.localName === "a" ? "href" : "src";
    const value = element.getAttribute(attribute);
    if (!value) continue;
    try {
      element.setAttribute(attribute, new URL(value, baseUrl).toString());
    } catch {
      element.removeAttribute(attribute);
    }
  }
  return document.body.innerHTML;
}

/** Pure HTML-to-reader transformation, exported so publisher layouts can be fixture-tested. */
export function extractReadableArticle(html: string, pageUrl: string): ExtractedArticle | null {
  if (!html.trim()) return null;
  const { document } = parseHTML(html);
  Object.defineProperty(document, "documentURI", { configurable: true, value: pageUrl });
  const parsed = new Readability(document as unknown as Document, {
    charThreshold: 200,
    maxElemsToParse: 25_000,
  }).parse();
  if (!parsed?.content || !parsed.textContent) return null;

  const contentHtml = sanitizeContent(absolutizeArticleHtml(parsed.content, pageUrl));
  const words = countWords(contentHtml);
  if (words < MIN_ARTICLE_WORDS || stripHtml(contentHtml).length < 400) return null;

  return {
    title: parsed.title?.trim() || null,
    contentHtml,
    excerpt: makeExcerpt(parsed.excerpt ?? null, contentHtml),
    author: parsed.byline?.trim() || null,
    readingMinutes: Math.max(1, Math.round(words / 230)),
  };
}

/** Fetches only the public publisher URL and keeps extracted bodies in a short-lived memory cache. */
export async function loadExtractedArticle(url: string): Promise<ExtractedArticle | null> {
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && cached.expiresAt > now) return cached.value;

  let value: ExtractedArticle | null = null;
  try {
    const page = await fetchPublisherHtml(url);
    value = extractReadableArticle(page.html, page.finalUrl);
  } catch {
    value = null;
  }

  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value ?? "");
  cache.set(url, { expiresAt: now + CACHE_TTL_MS, value });
  return value;
}
