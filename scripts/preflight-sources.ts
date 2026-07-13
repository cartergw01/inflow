import { SOURCE_REGISTRY } from "../src/lib/ingest/registry";
import {
  isFeedRegistryEntry,
  preflightFeedSources,
  SOURCE_PREFLIGHT_MAX_SOURCES,
} from "../src/lib/ingest/source-preflight";

const filters = process.argv.slice(2).map((value) => value.toLowerCase());
const candidates = SOURCE_REGISTRY
  .filter(isFeedRegistryEntry)
  .filter((source) => filters.length === 0 || filters.some((filter) => source.name.toLowerCase().includes(filter)));

async function main(): Promise<void> {
  if (candidates.length === 0) throw new Error("No RSS/Substack sources matched the supplied filters.");

  const results = await preflightFeedSources(candidates);
  for (const result of results) {
    const attribution = `attribution \"${result.attribution.label}\" <${result.attribution.url}>`;
    const freshness = result.newestPublishedAt
      ? `${result.entryCount} entries · newest ${result.ageDays}d ago (limit ${result.freshnessLimitDays}d)`
      : `${result.entryCount} entries`;
    const syndication = result.syndicationReference
      ? ` · syndication ${result.syndicationReference.url} (${result.syndicationReference.checked ? `HTTP ${result.syndicationReference.status ?? "error"}${result.syndicationReference.describesSyndication ? ", feed usage described" : ""}` : "recorded"})`
      : "";
    const issues = result.issues.length > 0 ? ` · ${result.issues.join("; ")}` : "";
    process.stdout.write(
      `${result.ok ? "PASS" : "FAIL"} ${result.source} [${result.adapter}]: ${freshness} · ${attribution}${syndication}${issues}\n`,
    );
  }

  const failures = results.filter((result) => !result.ok);
  const truncated = Math.max(0, candidates.length - SOURCE_PREFLIGHT_MAX_SOURCES);
  process.stdout.write(
    `Checked ${results.length} feeds; ${failures.length} failed${truncated > 0 ? `; ${truncated} omitted by the safety limit` : ""}.\n`,
  );
  if (failures.length > 0 || truncated > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
