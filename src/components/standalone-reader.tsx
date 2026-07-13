"use client";
import { useRouter } from "next/navigation";
import type { ReaderPayload } from "./galaxy/reader-overlay";
import { ReaderOverlay } from "./galaxy/reader-overlay";
export function StandaloneReader({ item }: { item: ReaderPayload }) {
  const router = useRouter();
  return <ReaderOverlay item={item} accent="#4d6bff" contextLabel="Today" position={1} total={1} previous={null} next={null} onClose={() => history.length > 1 ? router.back() : router.push("/")} onSaveChange={() => undefined} />;
}
