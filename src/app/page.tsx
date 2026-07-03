import { after } from "next/server";
import { FeedStream } from "../components/feed-stream";
import { Masthead } from "../components/masthead";
import { Onboarding } from "../components/onboarding";
import { loadFeed } from "../lib/feed-data";
import { isStale, runIngest } from "../lib/ingest/run";
import { getProfile } from "../lib/profile";

export const dynamic = "force-dynamic";

export default async function Home() {
  const profile = await getProfile();
  if (!profile) return <Onboarding />;

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

  return (
    <>
      <Masthead updatedAt={feed.updatedAt} />
      <main className="flex-1">
        <FeedStream entries={feed.entries} latest={feed.latest} />
      </main>
    </>
  );
}
