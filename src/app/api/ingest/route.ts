import { NextRequest, NextResponse } from "next/server";
import { runIngest } from "../../../lib/ingest/run";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/**
 * Ingestion trigger. Called by the GitHub Actions cron (~10 min cadence) and
 * by the app's staleness check on open. Secret-gated so strangers can't burn
 * function time or hammer the sources.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.INGEST_SECRET;
  if (!secret || req.headers.get("x-ingest-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const stats = await runIngest();
  return NextResponse.json(stats);
}
