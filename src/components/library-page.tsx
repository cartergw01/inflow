"use client";

import { useRouter } from "next/navigation";
import { LibraryDrawer, type LibraryTab } from "./galaxy/library-drawer";

export function LibraryPage({ initialTab }: { initialTab: LibraryTab }) {
  const router = useRouter();
  return <LibraryDrawer
    standalone
    initialTab={initialTab}
    onTabChange={(tab) => router.push(`/${tab}`)}
    onOpenStory={(story) => router.push(`/item/${story.id}`)}
  />;
}
