import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  getProfileId: vi.fn(),
  loadReaderItem: vi.fn(),
  resolveReaderContent: vi.fn(),
}));

vi.mock("../../../lib/profile", () => ({ getProfileId: mocks.getProfileId }));
vi.mock("../../../lib/feed-data", () => ({ loadReaderItem: mocks.loadReaderItem }));
vi.mock("../../../lib/reader-content", () => ({ resolveReaderContent: mocks.resolveReaderContent }));

import { GET } from "../item/[id]/route";

const request = new NextRequest("http://localhost/api/item/42");
const context = (id: string) => ({ params: Promise.resolve({ id }) });

describe("GET /api/item/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProfileId.mockResolvedValue("profile-1");
  });

  it("returns 400 for a non-integer item id", async () => {
    const response = await GET(request, context("nope"));
    expect(response.status).toBe(400);
    expect(mocks.loadReaderItem).not.toHaveBeenCalled();
  });

  it("returns 404 when the story does not exist", async () => {
    mocks.loadReaderItem.mockResolvedValue(null);
    const response = await GET(request, context("42"));
    expect(response.status).toBe(404);
  });

  it("returns enriched in-app reader content", async () => {
    const item = {
      id: 42,
      title: "A <b>readable</b> story",
      author: null,
      publishedAt: new Date("2026-07-13T00:00:00Z"),
      updatedAt: new Date("2026-07-13T01:00:00Z"),
      status: "active",
      verificationStatus: "reported",
      correctionNote: null,
      topics: ["taiwan"],
      excerpt: "Feed excerpt",
      url: "https://news.example/story",
    };
    const source = {
      name: "Example News",
      homepageUrl: "https://news.example",
      credibilityTier: "major",
      sourceClass: "news",
      lastSuccessfulFetchAt: new Date("2026-07-13T02:00:00Z"),
    };
    mocks.loadReaderItem.mockResolvedValue({ item, source, saved: false });
    mocks.resolveReaderContent.mockResolvedValue({
      author: "A. Reporter",
      excerpt: "Feed excerpt",
      contentHtml: "<p>Complete public article body.</p>",
      contentStatus: "full",
      readingMinutes: 5,
    });

    const response = await GET(request, context("42"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: 42,
      title: "A readable story",
      author: "A. Reporter",
      contentHtml: "<p>Complete public article body.</p>",
      contentStatus: "full",
      readingMinutes: 5,
    });
    expect(mocks.resolveReaderContent).toHaveBeenCalledWith(item, "news");
  });
});
