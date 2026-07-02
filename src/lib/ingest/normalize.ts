import sanitizeHtml from "sanitize-html";

/**
 * Params that identify campaigns/clicks, not content. Stripped so the same
 * article shared through different channels dedupes to one canonical URL.
 */
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "smid",
  "smtyp",
  "cmpid",
  "ftag",
  "guccounter",
  "guce_referrer",
  "guce_referrer_sig",
]);

export function canonicalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  const toDelete: string[] = [];
  url.searchParams.forEach((_v, k) => {
    if (k.startsWith("utm_") || TRACKING_PARAMS.has(k)) toDelete.push(k);
  });
  for (const k of toDelete) url.searchParams.delete(k);
  // Sort remaining params so param order never splits a canonical URL.
  url.searchParams.sort();
  let href = url.toString();
  if (href.endsWith("/") && url.pathname !== "/") href = href.slice(0, -1);
  if (url.pathname === "/" && !url.search && href.endsWith("/")) href = href.slice(0, -1);
  return href;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&#160;": " ",
  "&hellip;": "…",
  "&mdash;": "—",
  "&ndash;": "–",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&rdquo;": "”",
  "&ldquo;": "“",
  "&#8217;": "’",
  "&#8216;": "‘",
  "&#8220;": "“",
  "&#8221;": "”",
  "&#8212;": "—",
  "&#8211;": "–",
};

export function stripHtml(html: string): string {
  let text = html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<[^>]+>/g, " ");
  text = text.replace(/&[a-z]+;|&#\d+;/gi, (m) => ENTITIES[m] ?? " ");
  return text.replace(/\s+/g, " ").trim();
}

const EXCERPT_MAX = 320;

/**
 * Excerpt = the publisher's own words, trimmed. Prefers the feed description;
 * falls back to the opening of the full content. Never generated text.
 */
export function makeExcerpt(description: string | null, contentHtml: string | null): string | null {
  const base = description?.trim() ? stripHtml(description) : contentHtml ? stripHtml(contentHtml) : "";
  if (!base) return null;
  if (base.length <= EXCERPT_MAX) return base;
  const cut = base.slice(0, EXCERPT_MAX);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > EXCERPT_MAX * 0.6 ? lastSpace : EXCERPT_MAX)}…`;
}

/**
 * Reader-view HTML must be safe to render: allow document structure, links,
 * and images only; strip scripts, styles, forms, and event handlers.
 */
export function sanitizeContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "b", "strong", "i", "em", "u", "s", "a", "img",
      "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "blockquote", "pre", "code", "hr",
      "figure", "figcaption", "table", "thead", "tbody", "tr", "th", "td",
    ],
    allowedAttributes: {
      a: ["href", "title", "rel", "target"],
      img: ["src", "alt", "title", "width", "height"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
  });
}

/** First inline image of the content, used when the feed has no enclosure. */
export function firstImageSrc(contentHtml: string | null): string | null {
  if (!contentHtml) return null;
  const m = contentHtml.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (!m) return null;
  const src = m[1];
  return src.startsWith("http") ? src : null;
}
