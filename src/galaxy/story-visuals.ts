/**
 * Story markers are intentionally quiet. Rank remains visible through a small
 * brightness/size taper, while the rail does the real ordering work.
 */
export function storyVisualSize(index: number): number {
  return Math.max(0.055, 0.095 - index * 0.0015);
}

/** A larger, invisible target keeps tiny sparks comfortable to click. */
export function storyHitSize(index: number): number {
  return Math.max(0.3, storyVisualSize(index) * 3.6);
}

export function storyGlowSize(index: number, fresh: number, read: boolean): number {
  const size = storyVisualSize(index);
  return size * (read ? 1.45 : 2.15 + fresh * 1.35);
}
