import "dotenv/config";
import { getDb } from "../src/db";
import { reclassifyRecentItems } from "../src/lib/ingest/reclassify";

async function main(): Promise<void> {
  const result = await reclassifyRecentItems(getDb());
  process.stdout.write(
    `Reclassified ${result.updated} of ${result.scanned} items published since ${result.since.toISOString()}.\n`,
  );
}

main().then(
  () => process.exit(0),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exit(1);
  },
);
