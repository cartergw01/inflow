import { describe, expect, it } from "vitest";
import { canonicalizeUrl, makeExcerpt, sanitizeContent, stripHtml } from "../normalize";

describe("canonicalizeUrl", () => {
  it("strips tracking params but keeps meaningful ones", () => {
    expect(
      canonicalizeUrl("https://Example.com/story?utm_source=rss&utm_medium=feed&id=7&fbclid=x"),
    ).toBe("https://example.com/story?id=7");
  });

  it("dedupes the same article shared via different channels", () => {
    const a = canonicalizeUrl("https://site.com/a/?utm_campaign=tw#section");
    const b = canonicalizeUrl("https://site.com/a/");
    expect(a).toBe(b);
  });

  it("sorts query params so order never splits a URL", () => {
    expect(canonicalizeUrl("https://s.com/p?b=2&a=1")).toBe(canonicalizeUrl("https://s.com/p?a=1&b=2"));
  });

  it("returns malformed input unchanged rather than throwing", () => {
    expect(canonicalizeUrl("not a url")).toBe("not a url");
  });
});

describe("makeExcerpt", () => {
  it("prefers the publisher description and strips HTML", () => {
    expect(makeExcerpt("<p>The <b>publisher's</b> own words</p>", "<p>body</p>")).toBe(
      "The publisher's own words",
    );
  });

  it("falls back to content opening and truncates at a word boundary", () => {
    const long = `<p>${"word ".repeat(200)}</p>`;
    const excerpt = makeExcerpt(null, long);
    expect(excerpt!.length).toBeLessThanOrEqual(321);
    expect(excerpt!.endsWith("…")).toBe(true);
  });

  it("returns null when there is nothing to excerpt (never fabricates)", () => {
    expect(makeExcerpt(null, null)).toBeNull();
    expect(makeExcerpt("  ", "")).toBeNull();
  });

  it("treats a literal 'null' description as absent (observed in ESPN's live feed)", () => {
    expect(makeExcerpt("null", null)).toBeNull();
    expect(makeExcerpt("NULL", "<p>Fallback body text here</p>")).toBe("Fallback body text here");
  });
});

describe("sanitizeContent", () => {
  it("removes scripts, event handlers, and forms but keeps structure", () => {
    const dirty = `<p onclick="evil()">Hi <script>alert(1)</script><a href="javascript:evil()">x</a><a href="https://ok.com">ok</a></p><img src="https://img.com/a.jpg">`;
    const clean = sanitizeContent(dirty);
    expect(clean).not.toContain("script");
    expect(clean).not.toContain("onclick");
    expect(clean).not.toContain("javascript:");
    expect(clean).toContain('href="https://ok.com"');
    expect(clean).toContain('src="https://img.com/a.jpg"');
    expect(clean).toContain('loading="lazy"');
    expect(clean).toContain('decoding="async"');
  });

  it("forces external links to open safely", () => {
    const clean = sanitizeContent('<a href="https://x.com/a">a</a>');
    expect(clean).toContain('rel="noopener noreferrer"');
    expect(clean).toContain('target="_blank"');
  });
});

describe("stripHtml", () => {
  it("decodes entities and collapses whitespace", () => {
    expect(stripHtml("Tom &amp; Jerry &mdash;  <i>friends</i>")).toBe("Tom & Jerry — friends");
  });
});
