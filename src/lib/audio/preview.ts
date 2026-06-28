"use client";

/**
 * Voice previews play the ElevenLabs-hosted sample clip (`preview_url`) straight from the catalog —
 * a plain audio fetch that does NOT spend TTS credits. One shared element so a new preview cancels
 * the previous; `onEnd` fires when the clip finishes OR is stopped/superseded, so the UI can flip its
 * ▶/⏹ button back.
 */

let el: HTMLAudioElement | null = null;
let endCb: (() => void) | null = null;

function fireEnd(): void {
  const cb = endCb;
  endCb = null;
  cb?.();
}

export function playPreview(url: string, onEnd?: () => void): void {
  if (typeof Audio === "undefined") return;
  stopPreview(); // stop + notify any current preview first
  if (!url) return;
  const a = new Audio(url); // capture locally — a superseded preview's late callbacks must NOT touch the new one
  el = a;
  endCb = onEnd ?? null;
  a.onended = () => {
    if (el !== a) return; // already superseded
    el = null;
    fireEnd();
  };
  a.play().catch(() => {
    // pause()-induced AbortError on a superseded clip lands here too — guard so it can't null the
    // current element (which would orphan unstoppable, overlapping audio).
    if (el !== a) return;
    el = null;
    fireEnd();
  });
}

export function stopPreview(): void {
  if (el) {
    try {
      el.pause();
    } catch {
      /* noop */
    }
    el.onended = null;
    el = null;
  }
  fireEnd();
}
