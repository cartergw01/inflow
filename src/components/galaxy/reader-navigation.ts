export type ReaderDirection = "previous" | "next";

export function readerSwipeDirection({
  startX,
  startY,
  endX,
  endY,
  viewportWidth,
}: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  viewportWidth: number;
}): ReaderDirection | null {
  if (startX < 24 || startX > viewportWidth - 24) return null;
  const deltaX = endX - startX;
  const deltaY = endY - startY;
  const threshold = Math.max(72, viewportWidth * 0.22);
  if (Math.abs(deltaX) < threshold || Math.abs(deltaX) <= Math.abs(deltaY) * 1.25) return null;
  return deltaX < 0 ? "next" : "previous";
}
