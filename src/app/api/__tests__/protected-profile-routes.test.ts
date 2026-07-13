import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProfile: vi.fn(),
  loadBriefing: vi.fn(),
  loadGalaxy: vi.fn(),
  getDb: vi.fn(),
  runIngest: vi.fn(),
}));

vi.mock("../../../lib/profile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/profile")>();
  return { ...actual, getProfile: mocks.getProfile };
});
vi.mock("../../../lib/feed-data", () => ({
  loadBriefing: mocks.loadBriefing,
  loadGalaxy: mocks.loadGalaxy,
}));
vi.mock("../../../db", () => ({ getDb: mocks.getDb }));
vi.mock("../../../lib/ingest/run", () => ({ runIngest: mocks.runIngest }));

import { GET as getBriefing } from "../briefing/route";
import { GET as getGalaxy } from "../galaxy/route";

describe("profile-required data APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getProfile.mockResolvedValue(null);
  });

  it.each([
    ["briefing", getBriefing],
    ["galaxy", getGalaxy],
  ])("returns the shared 401 contract from /api/%s without creating state", async (_name, get) => {
    const response = await get();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "profile_required",
        message: "Complete onboarding before requesting personalized data.",
      },
    });
    expect(mocks.loadBriefing).not.toHaveBeenCalled();
    expect(mocks.loadGalaxy).not.toHaveBeenCalled();
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.runIngest).not.toHaveBeenCalled();
  });
});
