const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Convert wheel delta modes to pixels, then cap noisy trackpad bursts. */
export function wheelZoomFactor(deltaY: number, deltaMode: number, viewportHeight: number, isTouchDevice: boolean): number {
  const pixelDelta = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? viewportHeight : 1);
  const capped = clamp(pixelDelta, -64, 64);
  return Math.exp(capped * (isTouchDevice ? 0.0007 : 0.00115));
}

/** Pinch distance is deliberately sub-linear so small finger jitter stays quiet. */
export function pinchZoomFactor(previousDistance: number, nextDistance: number, isTouchDevice: boolean): number {
  if (previousDistance <= 0 || nextDistance <= 0) return 1;
  const ratio = clamp(previousDistance / nextDistance, 0.82, 1.22);
  return Math.pow(ratio, isTouchDevice ? 0.42 : 0.68);
}

export function panDistanceScale(radius: number, isTouchDevice: boolean): number {
  return radius * (isTouchDevice ? 0.0008 : 0.0018);
}

/** Frame-rate-independent easing for direct-manipulation camera targets. */
export function motionEase(deltaSeconds: number, isTouchDevice: boolean): number {
  return 1 - Math.exp(-deltaSeconds * (isTouchDevice ? 9 : 14));
}
