"use client";

/**
 * TTS client — speaks Jova's replies aloud via the BFF (/api/tts → ElevenLabs) and drives the wisp's
 * "speaking" pulse from the REAL audio. Each finalized bubble is queued and played in order; an
 * AnalyserNode on the playback graph feeds per-frame RMS into the amplitude module (`setSource("live")`
 * + `pushLiveAmplitude`), so the wisp breathes to her actual voice instead of the synthesized envelope.
 *
 * Design notes:
 * - One shared AudioContext, unlocked on a user gesture (the 🔊 toggle / PTT) so autoplay rules don't
 *   silently swallow the first utterance.
 * - We fetch the whole clip per bubble then decode+play (simple + reliable). Bubbles are short and
 *   turbo TTS is fast, so latency is fine; true MSE streaming is a later optimization.
 * - `stopSpeaking()` is barge-in: clears the queue, aborts the in-flight fetch, and kills playback so
 *   the user can talk over her.
 * - 503 from the route means voice isn't configured → we mark it unavailable and no-op quietly.
 * - 402 means the ElevenLabs account is out of credits → we stop and notify (onVoiceUnavailable) so
 *   the app can disable voice + warn. Each clip carries the speaking agent's chosen voiceId + model.
 */

import { setSource, setSpeaking, pushLiveAmplitude } from "./amplitude";
import { AUDIO_TAG_RE } from "@/lib/jova/speechText";

export type SpeakOpts = { voiceId?: string; model?: string; keyId?: string; tags?: string; readItalics?: boolean };
type QueueItem = { text: string; voiceId: string; model: string; keyId: string };

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let timeData: Uint8Array<ArrayBuffer> | null = null;
let desiredSink = ""; // "" = system default; applied via AudioContext.setSinkId when supported

/** Route her voice to a chosen output device (Chrome/Edge 110+). Safe no-op where unsupported. */
export function setOutputDevice(deviceId: string): void {
  desiredSink = deviceId;
  applySink();
}

function applySink(): void {
  const c = ctx as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
  if (!c || typeof c.setSinkId !== "function") return;
  void c.setSinkId(desiredSink || "").catch(() => {});
}

const queue: QueueItem[] = [];
let playing = false;
let current: { source: AudioBufferSourceNode; resolve: () => void } | null = null;
let inflight: AbortController | null = null;
let ampRaf = 0;
let unavailable = false; // set once the route reports 503 (no key at all), so we stop trying
const exhaustedKeys = new Set<string>(); // keyIds the account ran out of credits on (402) — per key, not global

type SpeakEndCb = () => void;
let onAllDone: SpeakEndCb | null = null;

/** Fired when playback can't proceed: "unconfigured" (503), "exhausted" (402), or "error" (other
 *  non-ok — e.g. a 400) with the upstream detail so it's not silently dropped. */
export type VoiceUnavailableReason = "unconfigured" | "exhausted" | "error";
type UnavailableInfo = { keyId?: string; detail?: string };
let onUnavailable: ((reason: VoiceUnavailableReason, info?: UnavailableInfo) => void) | null = null;
export function setOnVoiceUnavailable(cb: ((reason: VoiceUnavailableReason, info?: UnavailableInfo) => void) | null): void {
  onUnavailable = cb;
}

/** Called from a user gesture (voice toggle / PTT) to satisfy autoplay policy. Safe to call repeatedly. */
export function unlockAudio(): void {
  if (typeof window === "undefined") return;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    analyser.connect(ctx.destination);
    timeData = new Uint8Array(analyser.fftSize);
    if (desiredSink) applySink(); // route to the saved output device once the context exists
  }
  if (ctx.state === "suspended") void ctx.resume();
}

export function isVoiceUnavailable(): boolean {
  return unavailable;
}

/** Clear the unavailable latches — call after a key is added/activated or credits refresh, so voice retries. */
export function resetVoiceAvailability(): void {
  unavailable = false;
  exhaustedKeys.clear();
}

/** Register a callback fired when the whole queue drains (used to resume hands-free listening). */
export function setOnSpeechEnd(cb: SpeakEndCb | null): void {
  onAllDone = cb;
}

/** Queue a reply to be spoken in the given agent's voice/model. Strips markdown first; a v3 `tags`
 *  prefix (e.g. "[evil] [faster]") is prepended VERBATIM after the strip so the directives survive. */
export function speak(text: string, opts?: SpeakOpts): void {
  if (unavailable) return;
  let clean = stripForSpeech(text, { model: opts?.model, readItalics: opts?.readItalics });
  if (!clean) return;
  const tags = opts?.tags?.trim();
  if (tags) clean = `${tags} ${clean}`;
  queue.push({ text: clean, voiceId: opts?.voiceId ?? "", model: opts?.model ?? "", keyId: opts?.keyId ?? "" });
  if (!playing) void drain();
}

/** Barge-in / hard stop: clear the queue, abort fetch, stop current playback, reset amplitude. */
export function stopSpeaking(): void {
  queue.length = 0;
  inflight?.abort();
  inflight = null;
  if (current) {
    try {
      current.source.onended = null;
      current.source.stop();
    } catch {
      /* already stopped */
    }
    current.resolve();
    current = null;
  }
  playing = false;
  endAmplitude();
}

async function drain(): Promise<void> {
  if (playing) return;
  playing = true;
  while (queue.length) {
    const item = queue.shift()!;
    try {
      await playOne(item);
    } catch {
      // network/decode/abort — drop this clip and keep going so one failure doesn't wedge the queue
    }
  }
  playing = false;
  endAmplitude();
  onAllDone?.();
}

async function playOne(item: QueueItem): Promise<void> {
  unlockAudio();
  if (!ctx || !analyser) return;
  if (exhaustedKeys.has(item.keyId)) return; // this agent's key is out of credits — skip, don't mute others

  inflight = new AbortController();
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: item.text, voiceId: item.voiceId || undefined, model: item.model || undefined, keyId: item.keyId || undefined }),
    signal: inflight.signal,
  });

  if (res.status === 503) {
    unavailable = true; // voice keys not set — stop bothering the route
    queue.length = 0;
    onUnavailable?.("unconfigured");
    return;
  }
  if (res.status === 402) {
    // out of credits on THIS key only — mark it and skip; agents on other keys keep working
    exhaustedKeys.add(item.keyId);
    onUnavailable?.("exhausted", { keyId: item.keyId });
    return;
  }
  if (!res.ok) {
    // surface the upstream reason instead of dropping it silently (e.g. a bad-request 400)
    const detail = await res.text().catch(() => "");
    onUnavailable?.("error", { keyId: item.keyId, detail: detail.slice(0, 200) });
    return;
  }

  const buf = await res.arrayBuffer();
  inflight = null;
  // decodeAudioData wants its own copy; some browsers detach the ArrayBuffer
  const audio = await ctx.decodeAudioData(buf.slice(0));

  await new Promise<void>((resolve) => {
    if (!ctx || !analyser) return resolve();
    const src = ctx.createBufferSource();
    src.buffer = audio;
    src.connect(analyser);
    current = { source: src, resolve };
    startAmplitude();
    src.onended = () => {
      if (current?.source === src) current = null;
      resolve();
    };
    src.start();
  });
}

function startAmplitude(): void {
  setSource("live");
  setSpeaking(true);
  if (ampRaf || !analyser || !timeData) return;
  const loop = () => {
    if (!analyser || !timeData) {
      ampRaf = 0;
      return;
    }
    analyser.getByteTimeDomainData(timeData);
    let sum = 0;
    for (let i = 0; i < timeData.length; i++) {
      const v = (timeData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / timeData.length);
    // speech RMS sits low (~0.05–0.25); scale into a lively 0..1 range and clamp
    pushLiveAmplitude(Math.min(1, rms * 3.2));
    ampRaf = requestAnimationFrame(loop);
  };
  ampRaf = requestAnimationFrame(loop);
}

function endAmplitude(): void {
  if (ampRaf) {
    cancelAnimationFrame(ampRaf);
    ampRaf = 0;
  }
  pushLiveAmplitude(0);
  setSpeaking(false);
  setSource("fake"); // hand the wisp's idle/streaming pulse back to the synthesized envelope
}

/** Drop *italic* / _italic_ SPANS (the words too) while preserving **bold**, so an agent set to not
 *  read italics skips asides/actions like *leans in* without that text vanishing from the chat.
 *  Bold markers are removed FIRST (keeping the words), so after that no ** remains and the single-*
 *  pass only hits genuine *italic* spans — no fragile sentinel/restore dance needed. */
function dropItalicSpans(t: string): string {
  // keep **bold** and __bold__ WORDS (their markers are stripped later in stripForSpeech), so the
  // italic passes below can't eat bold text
  t = t.replace(/\*\*([\s\S]*?)\*\*/g, "$1");
  t = t.replace(/__([\s\S]*?)__/g, "$1");
  // drop *italic* and _italic_ SPANS (words too); underscore guarded so snake_case / paths aren't eaten
  t = t.replace(/\*([^*\n]+?)\*/g, " ");
  t = t.replace(/(?<![A-Za-z0-9])_([^_\n]+?)_(?![A-Za-z0-9])/g, " ");
  return t;
}

/** Turn markdown reply text into something natural to hear: drop syntax, links→label, code→omitted.
 *  v3 keeps inline emphasis tags ("[angry]") as delivery cues; other models strip them. With
 *  readItalics:false, italic spans are dropped entirely (not just their markers). */
function stripForSpeech(input: string, opts?: { model?: string; readItalics?: boolean }): string {
  let t = input;
  // emphasis tags: keep for eleven_v3 (it performs them); strip for any other model so they aren't read aloud
  if (opts?.model !== "eleven_v3") t = t.replace(AUDIO_TAG_RE, " ");
  if (opts?.readItalics === false) t = dropItalicSpans(t);
  t = t.replace(/```[\s\S]*?```/g, " "); // fenced code blocks
  t = t.replace(/`([^`]+)`/g, "$1"); // inline code
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, " "); // images
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1"); // links → label
  t = t.replace(/^\s{0,3}#{1,6}\s+/gm, ""); // headings
  t = t.replace(/^\s{0,3}>\s?/gm, ""); // blockquotes
  t = t.replace(/^\s*[-*+]\s+/gm, ""); // list bullets
  t = t.replace(/(\*\*|__|\*|_|~~)/g, ""); // bold/italic/strike markers
  t = t.replace(/^\s*React:.*$/gim, ""); // safety: never read a reaction directive aloud
  t = t.replace(/\s+/g, " ").trim();
  return t;
}
