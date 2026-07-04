import { redirect } from "next/navigation";
import { after } from "next/server";
import { SignalFeed } from "../../components/signal-feed";
import { loadFeed } from "../../lib/feed-data";
import { isStale, runIngest } from "../../lib/ingest/run";
import { getProfile } from "../../lib/profile";

export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const profile = await getProfile();
  if (!profile) redirect("/welcome");

  const feed = await loadFeed(profile);

  // Freshness backstop: if the cron hasn't run recently, refresh after the
  // response is sent so the next open is current (see NOTES.md).
  if (await isStale(15)) {
    after(async () => {
      try {
        await runIngest();
      } catch (err) {
        console.error("background ingest failed", err);
      }
    });
  }

  return <SignalFeed entries={feed.entries} latest={feed.latest} />;
}
