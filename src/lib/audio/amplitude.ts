"use client";

/**
 * Audio amplitude source that drives the wisp's "speaking" animation.
 *
 * DEMO: when speaking, we synthesize a believable speech envelope (bursts + noise).
 * PHASE 4: point this at the real ElevenLabs TTS audio — create an AnalyserNode on the
 * playback stream and call pushLiveAmplitude(rms) per frame; call setSource("live").
 * The wisp shaders read getAmplitude() and never need to know which source it is.
 */

let amplitude = 0; // smoothed 0..1, what the scene reads
let target = 0;
let speaking = false;
let source: "fake" | "live" = "fake";
let raf = 0;
let last = 0;

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export function getAmplitude(): number {
  return amplitude;
}

export function setSource(s: "fake" | "live"): void {
  source = s;
}

/** Real TTS path pushes measured amplitude here (used when source === "live"). */
export function pushLiveAmplitude(rms: number): void {
  if (source === "live") target = clamp01(rms);
}

export function setSpeaking(v: boolean): void {
  speaking = v;
  if (typeof window === "undefined") return;
  if (v && !raf) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
}

function tick(t: number): void {
  const dt = Math.min(0.05, (t - last) / 1000);
  last = t;

  if (speaking && source === "fake") {
    // Layered envelope so it reads like speech cadence, not a sine wave.
    const slow = 0.35 + 0.32 * Math.abs(Math.sin(t * 0.006));
    const fast = 0.18 * Math.sin(t * 0.03);
    const jitter = 0.2 * Math.random();
    target = clamp01(slow + fast + jitter);
  } else if (!speaking) {
    target = 0;
  }

  // critically-damped-ish smoothing
  amplitude += (target - amplitude) * (1 - Math.exp(-dt * 14));

  if (speaking || amplitude > 0.001) {
    raf = requestAnimationFrame(tick);
  } else {
    amplitude = 0;
    raf = 0;
  }
}
