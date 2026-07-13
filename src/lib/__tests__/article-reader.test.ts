import { describe, expect, it, vi } from "vitest";
import {
  extractReadableArticle,
  fetchReadableArticle,
  isPrivateAddress,
  parsePublicArticleUrl,
} from "../article-reader";
import { needsReaderExtraction, shouldUseExtractedContent } from "../reader-content";

const paragraph = "A public article should remain readable inside the application, with enough reporting detail and context for a person to understand the story without leaving their reading flow. ";
const articleHtml = `<!doctype html><html><head><title>Reader test</title></head><body>
  <nav>Subscribe Sign in Trending</nav>
  <article>
    <h1>A complete story for the reader</h1>
    <p>${paragraph.repeat(2)}</p>
    <p>${paragraph.repeat(2)}</p>
    <p>${paragraph.repeat(2)}</p>
    <p>${paragraph.repeat(2)}</p>
    <p>Read the <a href="/background">background reporting</a>.</p>
    <img src="/images/story.jpg" alt="Story image" onerror="alert(1)">
    <script>alert("no")</script>
  </article>
  <aside>Recommended shopping links</aside>
</body></html>`;

describe("article reader extraction", () => {
  it("extracts, sanitizes, and absolutizes a public article", () => {
    const article = extractReadableArticle(articleHtml, "https://news.example/story");
    expect(article).not.toBeNull();
    expect(article!.wordCount).toBeGreaterThan(180);
    expect(article!.contentHtml).toContain('href="https://news.example/background"');
    expect(article!.contentHtml).toContain('src="https://news.example/images/story.jpg"');
    expect(article!.contentHtml).not.toContain("script");
    expect(article!.contentHtml).not.toContain("onerror");
    expect(article!.contentHtml).not.toContain("Recommended shopping links");
  });

  it("rejects private and non-web destinations before fetching", async () => {
    const fetchImpl = vi.fn();
    expect(parsePublicArticleUrl("file:///etc/passwd")).toBeNull();
    expect(parsePublicArticleUrl("http://localhost/admin")).toBeNull();
    expect(isPrivateAddress("10.1.2.3")).toBe(true);
    expect(isPrivateAddress("127.0.0.1")).toBe(true);
    expect(isPrivateAddress("93.184.216.34")).toBe(false);
    await expect(fetchReadableArticle("http://127.0.0.1/admin", { fetchImpl })).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fetches a public HTML page and returns reader content", async () => {
    const fetchImpl = vi.fn(async () => new Response(articleHtml, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    }));
    const article = await fetchReadableArticle("https://news.example/story", {
      fetchImpl,
      resolveHost: async () => [{ address: "93.184.216.34" }],
      timeoutMs: 250,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(article?.wordCount).toBeGreaterThan(180);
  });

  it("only extracts short non-social items", () => {
    expect(needsReaderExtraction(0, "news")).toBe(true);
    expect(needsReaderExtraction(179, "longform")).toBe(true);
    expect(needsReaderExtraction(180, "news")).toBe(false);
    expect(needsReaderExtraction(20, "social")).toBe(false);
  });

  it("uses a meaningfully fuller extracted body even when the story is concise", () => {
    expect(shouldUseExtractedContent(0, 90)).toBe(true);
    expect(shouldUseExtractedContent(100, 124)).toBe(false);
    expect(shouldUseExtractedContent(100, 125)).toBe(true);
  });
});
