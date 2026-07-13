import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Readability } from "@mozilla/readability";
import { DOMParser } from "linkedom";
import { countWords, sanitizeContent } from "./ingest/normalize";

const MAX_ARTICLE_BYTES = 3_000_000;
const MAX_REDIRECTS = 4;
const MIN_ARTICLE_WORDS = 80;
const FETCH_TIMEOUT_MS = 8_000;

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;
type ResolveHost = (hostname: string) => Promise<readonly { address: string }[]>;

export interface ExtractedArticle {
  title: string | null;
  byline: string | null;
  excerpt: string | null;
  contentHtml: string;
  wordCount: number;
}

export interface ArticleFetchDependencies {
  fetchImpl?: FetchLike;
  resolveHost?: ResolveHost;
  timeoutMs?: number;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b, c] = parts;
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  const family = isIP(normalized);
  if (family === 4) return isPrivateIpv4(normalized);
  if (family !== 6) return true;
  if (normalized.startsWith("::ffff:")) return isPrivateIpv4(normalized.slice(7));
  return (
    normalized === "::" || normalized === "::1" ||
    normalized.startsWith("fc") || normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized) || normalized.startsWith("ff") ||
    normalized.startsWith("2001:db8")
  );
}

export function parsePublicArticleUrl(raw: string | URL): URL | null {
  let url: URL;
  try {
    url = raw instanceof URL ? new URL(raw) : new URL(raw);
  } catch {
    return null;
  }
  const hostname = url.hostname.toLowerCase();
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username || url.password || !hostname ||
    hostname === "localhost" || hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") || hostname.endsWith(".internal") ||
    (isIP(hostname) > 0 && isPrivateAddress(hostname))
  ) return null;
  return url;
}

async function assertPublicDestination(url: URL, resolveHost: ResolveHost): Promise<boolean> {
  if (!parsePublicArticleUrl(url)) return false;
  if (isIP(url.hostname) > 0) return !isPrivateAddress(url.hostname);
  try {
    const addresses = await resolveHost(url.hostname);
    return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address));
  } catch {
    return false;
  }
}

async function readLimitedHtml(response: Response): Promise<string | null> {
  const advertisedLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(advertisedLength) && advertisedLength > MAX_ARTICLE_BYTES) return null;
  if (!response.body) return null;

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let html = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_ARTICLE_BYTES) {
      await reader.cancel();
      return null;
    }
    html += decoder.decode(value, { stream: true });
  }
  return html + decoder.decode();
}

function absolutizeReaderUrls(document: Document, baseUrl: string) {
  for (const element of document.querySelectorAll<HTMLElement>("a[href], img[src]")) {
    const attribute = element.tagName.toLowerCase() === "a" ? "href" : "src";
    const value = element.getAttribute(attribute);
    if (!value) continue;
    try {
      element.setAttribute(attribute, new URL(value, baseUrl).toString());
    } catch {
      element.removeAttribute(attribute);
    }
  }
}

export function extractReadableArticle(html: string, pageUrl: string): ExtractedArticle | null {
  const parsedUrl = parsePublicArticleUrl(pageUrl);
  if (!parsedUrl || !html.trim()) return null;

  const document = new DOMParser().parseFromString(html, "text/html") as unknown as Document;
  const base = document.createElement("base");
  base.setAttribute("href", parsedUrl.toString());
  document.head?.prepend(base);

  const article = new Readability(document, {
    charThreshold: 300,
    maxElemsToParse: 12_000,
  }).parse();
  if (!article?.content) return null;

  const contentDocument = new DOMParser().parseFromString(
    `<!doctype html><html><body>${article.content}</body></html>`,
    "text/html",
  ) as unknown as Document;
  absolutizeReaderUrls(contentDocument, parsedUrl.toString());
  const contentHtml = sanitizeContent(contentDocument.body?.innerHTML ?? article.content);
  const wordCount = countWords(contentHtml);
  if (wordCount < MIN_ARTICLE_WORDS) return null;

  return {
    title: article.title?.trim() || null,
    byline: article.byline?.trim() || null,
    excerpt: article.excerpt?.trim() || null,
    contentHtml,
    wordCount,
  };
}

export async function fetchReadableArticle(
  rawUrl: string,
  dependencies: ArticleFetchDependencies = {},
): Promise<ExtractedArticle | null> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const resolveHost = dependencies.resolveHost ?? (async (hostname) => lookup(hostname, { all: true, verbatim: true }));
  const timeoutMs = dependencies.timeoutMs ?? FETCH_TIMEOUT_MS;
  let current = parsePublicArticleUrl(rawUrl);
  if (!current) return null;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    if (!await assertPublicDestination(current, resolveHost)) return null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchImpl(current, {
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml;q=0.9",
          "user-agent": "InFlow Reader/1.0 (+https://inflow-tawny.vercel.app)",
        },
      });
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === MAX_REDIRECTS) return null;
      try {
        current = new URL(location, current);
      } catch {
        return null;
      }
      continue;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!response.ok || (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml"))) return null;
    const html = await readLimitedHtml(response);
    return html ? extractReadableArticle(html, current.toString()) : null;
  }
  return null;
}
