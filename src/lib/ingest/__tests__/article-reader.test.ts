import { describe, expect, it } from "vitest";
import { extractReadableArticle, isBlockedIp } from "../../article-reader";

describe("article reader", () => {
  it("extracts the story body and makes publisher-relative links absolute", () => {
    const paragraphs = Array.from({ length: 8 }, (_, index) =>
      `<p>Paragraph ${index + 1} contains original reporting with enough detail to make this a readable news article for people following the story.</p>`,
    ).join("");
    const article = extractReadableArticle(
      `<!doctype html><html><head><title>Reader fixture</title></head><body><nav>Navigation noise</nav><main><article><h1>Reader fixture</h1><ul><li><a href="https://twitter.com/intent/tweet?text=fixture"><img src="/share.png" width="20"></a></li></ul>${paragraphs}<p><a href="/related">Related coverage</a></p><img src="/photo.jpg" alt="News photo"></article></main><footer>Footer noise</footer></body></html>`,
      "https://publisher.example/news/story",
    );

    expect(article).not.toBeNull();
    expect(article?.contentHtml).toContain("Paragraph 1");
    expect(article?.contentHtml).toContain('href="https://publisher.example/related"');
    expect(article?.contentHtml).toContain('src="https://publisher.example/photo.jpg"');
    expect(article?.contentHtml).not.toContain("share.png");
    expect(article?.contentHtml).not.toContain("twitter.com/intent");
    expect(article?.contentHtml).not.toContain("Navigation noise");
    expect(article?.readingMinutes).toBeGreaterThanOrEqual(1);
  });

  it("refuses short snippets that are not full stories", () => {
    expect(extractReadableArticle("<article><p>Only a short teaser.</p></article>", "https://publisher.example/story")).toBeNull();
  });

  it("blocks private and reserved network ranges", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("10.2.3.4")).toBe(true);
    expect(isBlockedIp("192.168.1.2")).toBe(true);
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("8.8.8.8")).toBe(false);
    expect(isBlockedIp("2606:4700:4700::1111")).toBe(false);
  });
});
