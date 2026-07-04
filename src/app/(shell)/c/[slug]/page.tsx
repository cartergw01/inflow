import { notFound, redirect } from "next/navigation";
import { SignalFeed } from "../../../../components/signal-feed";
import { categoryBySlug } from "../../../../lib/categories";
import { loadFeed } from "../../../../lib/feed-data";
import { getProfile } from "../../../../lib/profile";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = categoryBySlug(slug);
  return { title: category ? `${category.label} — InFlow` : "InFlow" };
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = categoryBySlug(slug);
  if (!category) notFound();
  if (category.slug === "today") redirect("/");

  const profile = await getProfile();
  if (!profile) redirect("/welcome");

  const feed = await loadFeed(profile, category);
  return <SignalFeed entries={feed.entries} latest={feed.latest} />;
}
