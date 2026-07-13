import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => {
  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const insertReturning = vi.fn();
  const insertValues = vi.fn(() => ({ returning: insertReturning }));
  const db = {
    update: vi.fn(() => ({ set: updateSet })),
    insert: vi.fn(() => ({ values: insertValues })),
  };

  return {
    db,
    getDb: vi.fn(() => db),
    getProfileId: vi.fn(),
    setProfileCookie: vi.fn(),
    updateSet,
    updateReturning,
    insertValues,
    insertReturning,
  };
});

vi.mock("../../../db", () => ({ getDb: mocks.getDb }));
vi.mock("../../../lib/profile", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/profile")>();
  return {
    ...actual,
    getProfileId: mocks.getProfileId,
    setProfileCookie: mocks.setProfileCookie,
  };
});

import { POST } from "../profile/route";

const EXISTING_ID = "177a2c13-09f9-4919-a5c1-d48f8ffab371";
const NEW_ID = "32b44ea9-9dc4-4be9-907a-cb684fef42ab";

function profileRequest(body: string) {
  return new NextRequest("http://localhost/api/profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a structured 400 without touching the database for malformed JSON", async () => {
    const response = await POST(profileRequest("{"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "invalid_json",
        message: "Request body must contain valid JSON.",
      },
    });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("returns a structured 422 for unknown canonical subjects", async () => {
    const response = await POST(profileRequest(JSON.stringify({ interests: ["ai", "tech"] })));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "unknown_subjects",
        details: { unknownIds: ["tech"] },
      },
    });
    expect(mocks.getDb).not.toHaveBeenCalled();
  });

  it("creates a profile, preserves normalized interest order, and returns 201", async () => {
    mocks.getProfileId.mockResolvedValue(null);
    mocks.insertReturning.mockResolvedValue([{ id: NEW_ID }]);

    const response = await POST(profileRequest(JSON.stringify({ interests: ["nba", "ai", "nba"] })));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true, interests: ["nba", "ai"] });
    expect(mocks.insertValues).toHaveBeenCalledWith({ interests: ["nba", "ai"] });
    expect(mocks.setProfileCookie).toHaveBeenCalledWith(expect.any(NextResponse), NEW_ID);
  });

  it("updates the row behind an existing cookie and returns 200", async () => {
    mocks.getProfileId.mockResolvedValue(EXISTING_ID);
    mocks.updateReturning.mockResolvedValue([{ id: EXISTING_ID }]);

    const response = await POST(profileRequest(JSON.stringify({ interests: ["space", "health"] })));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, interests: ["space", "health"] });
    expect(mocks.updateSet).toHaveBeenCalledWith({ interests: ["space", "health"] });
    expect(mocks.db.insert).not.toHaveBeenCalled();
    expect(mocks.setProfileCookie).toHaveBeenCalledWith(expect.any(NextResponse), EXISTING_ID);
  });

  it("replaces a stale but valid profile cookie and returns 201", async () => {
    mocks.getProfileId.mockResolvedValue(EXISTING_ID);
    mocks.updateReturning.mockResolvedValue([]);
    mocks.insertReturning.mockResolvedValue([{ id: NEW_ID }]);

    const response = await POST(profileRequest(JSON.stringify({ interests: ["markets"] })));

    expect(response.status).toBe(201);
    expect(mocks.db.update).toHaveBeenCalledOnce();
    expect(mocks.db.insert).toHaveBeenCalledOnce();
    expect(mocks.setProfileCookie).toHaveBeenCalledWith(expect.any(NextResponse), NEW_ID);
  });
});
