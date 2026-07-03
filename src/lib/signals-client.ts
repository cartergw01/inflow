"use client";

import type { SignalType } from "../db/schema";

export interface ClientSignal {
  itemId: number;
  type: SignalType;
  value?: number;
}

/**
 * Client-side signal buffer. Impressions are noisy and frequent, so they
 * batch and flush on visibility change / interval; explicit actions
 * (save, more/less, open) send immediately so the UI can trust they landed.
 */
const queue: ClientSignal[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let listenersBound = false;

export function flushSignals(): void {
  if (queue.length === 0) return;
  const payload = JSON.stringify({ signals: queue.splice(0, queue.length) });
  // sendBeacon survives page teardown; fall back to keepalive fetch.
  if (!(navigator.sendBeacon && navigator.sendBeacon("/api/signals", payload))) {
    void fetch("/api/signals", { method: "POST", body: payload, keepalive: true });
  }
}

export function queueSignal(signal: ClientSignal): void {
  queue.push(signal);
  if (queue.length >= 25) flushSignals();
  ensureLifecycle();
}

export function sendSignal(signal: ClientSignal): void {
  void fetch("/api/signals", {
    method: "POST",
    body: JSON.stringify({ signals: [signal] }),
    keepalive: true,
  });
}

function ensureLifecycle(): void {
  if (listenersBound) return;
  listenersBound = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushSignals();
  });
  window.addEventListener("pagehide", flushSignals);
  flushTimer ??= setInterval(flushSignals, 15_000);
}
