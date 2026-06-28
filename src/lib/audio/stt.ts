"use client";

/**
 * STT client — streams mic audio to Deepgram's realtime API and surfaces transcripts.
 *
 * Flow: mint a short-lived key from our BFF (/api/stt/token, never the long-lived key) → getUserMedia →
 * open a WebSocket straight to Deepgram with the `["token", key]` subprotocol → push MediaRecorder
 * webm/opus chunks → read interim + final transcripts back.
 *
 * Two modes:
 * - "continuous" (hands-free): each end-of-utterance (`speech_final`) is emitted via onFinal so the UI
 *   can auto-send, then we keep listening for the next utterance.
 * - "ptt" (push-to-talk): we buffer the whole hold as one utterance; `flushPtt()` on release flushes
 *   Deepgram and emits the accumulated text once, then stops.
 *
 * onPartial streams the live (interim) text so the composer can preview what she's hearing.
 */

type SttMode = "continuous" | "ptt";

type SttHandlers = {
  onPartial?: (text: string) => void; // live interim transcript (not yet committed)
  onFinal: (text: string) => void; // a complete utterance, ready to send
  onError?: (msg: string) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

type DgAlt = { transcript?: string };
type DgResults = {
  type?: string;
  is_final?: boolean;
  speech_final?: boolean;
  channel?: { alternatives?: DgAlt[] };
};

let ws: WebSocket | null = null;
let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let keepAlive = 0;
let mode: SttMode = "continuous";
let handlers: SttHandlers | null = null;
let unavailable = false;

// input-level meter (drives the "she hears you" listening indicator)
let inputCtx: AudioContext | null = null;
let inputAnalyser: AnalyserNode | null = null;
let inputData: Uint8Array<ArrayBuffer> | null = null;
let inputRaf = 0;
let inputLevel = 0; // smoothed 0..1

/** Live mic input level (0..1), for the listening indicator. 0 when not capturing. */
export function getInputLevel(): number {
  return inputLevel;
}

// transcript accumulation for the in-progress utterance
let finalized = ""; // committed (is_final) segments
let partial = ""; // latest interim segment

const DG_PARAMS = new URLSearchParams({
  model: "nova-2",
  language: "en-US",
  smart_format: "true",
  punctuate: "true",
  interim_results: "true",
  endpointing: "300", // ms of silence that ends an utterance (drives speech_final)
}).toString();

export function isListening(): boolean {
  return !!ws || !!recorder;
}

export function isSttUnavailable(): boolean {
  return unavailable;
}

/** Start capturing. Resolves once the socket is open and audio is flowing (or rejects on setup error). */
export async function startStt(m: SttMode, h: SttHandlers, opts?: { inputDeviceId?: string }): Promise<void> {
  if (isListening()) stopStt();
  mode = m;
  handlers = h;
  finalized = "";
  partial = "";

  // 1) short-lived Deepgram key from our server
  let key: string;
  try {
    const r = await fetch("/api/stt/token", { method: "POST" });
    if (r.status === 503) {
      unavailable = true;
      h.onError?.("Voice input isn't configured.");
      return;
    }
    const j = (await r.json()) as { key?: string; error?: string };
    if (!r.ok || !j.key) {
      h.onError?.(j.error || `STT token ${r.status}`);
      return;
    }
    key = j.key;
  } catch (e) {
    h.onError?.(`STT token error: ${String(e).slice(0, 120)}`);
    return;
  }

  // 2) mic (honor the chosen input device if set)
  try {
    const audio: MediaTrackConstraints = { echoCancellation: true, noiseSuppression: true, channelCount: 1 };
    if (opts?.inputDeviceId) audio.deviceId = { exact: opts.inputDeviceId };
    stream = await navigator.mediaDevices.getUserMedia({ audio });
  } catch (e) {
    const name = (e as { name?: string })?.name;
    h.onError?.(name === "NotAllowedError" ? "Microphone permission denied." : `Mic error: ${String(e).slice(0, 120)}`);
    cleanup();
    return;
  }
  startInputMeter(stream);

  // 3) socket — Deepgram auto-detects the webm/opus container, so we do NOT set encoding/sample_rate
  const mime = pickMime();
  if (!mime) {
    h.onError?.("This browser can't record audio for transcription.");
    cleanup();
    return;
  }

  try {
    ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${DG_PARAMS}`, ["token", key]);
  } catch (e) {
    h.onError?.(`STT socket error: ${String(e).slice(0, 120)}`);
    cleanup();
    return;
  }

  ws.onopen = () => {
    if (!stream) return;
    recorder = new MediaRecorder(stream, { mimeType: mime });
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0 && ws?.readyState === WebSocket.OPEN) ws.send(ev.data);
    };
    recorder.start(250); // emit a chunk every 250ms
    // keep the socket alive across any silence gaps
    keepAlive = window.setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "KeepAlive" }));
    }, 7000);
    handlers?.onOpen?.();
  };

  ws.onmessage = (ev) => {
    let msg: DgResults;
    try {
      msg = JSON.parse(ev.data as string);
    } catch {
      return;
    }
    if (msg.type && msg.type !== "Results") return; // Metadata / UtteranceEnd / etc.
    const text = msg.channel?.alternatives?.[0]?.transcript ?? "";

    if (msg.is_final) {
      if (text) finalized = (finalized ? finalized + " " : "") + text;
      partial = "";
    } else {
      partial = text;
    }
    handlers?.onPartial?.([finalized, partial].filter(Boolean).join(" "));

    // hands-free: end of an utterance → emit it and reset for the next one
    if (mode === "continuous" && msg.speech_final) {
      const utterance = finalized.trim();
      finalized = "";
      partial = "";
      if (utterance) handlers?.onFinal(utterance);
      handlers?.onPartial?.("");
    }
  };

  ws.onerror = () => handlers?.onError?.("Transcription connection error.");
  ws.onclose = () => {
    handlers?.onClose?.();
  };
}

/**
 * Release push-to-talk: flush Deepgram and emit the whole hold as one utterance, then stop.
 * Deepgram returns remaining finals after CloseStream; we give it a brief window to land them.
 */
export async function flushPtt(): Promise<void> {
  const h = handlers;
  if (recorder && recorder.state !== "inactive") recorder.stop();
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "CloseStream" }));
    // wait briefly for trailing finals
    await new Promise<void>((resolve) => window.setTimeout(resolve, 350));
  }
  const utterance = [finalized, partial].filter(Boolean).join(" ").trim();
  finalized = "";
  partial = "";
  stopStt();
  if (utterance) h?.onFinal(utterance);
}

/** Hard stop: mic off, no final emit. Used for toggling hands-free off or canceling. */
export function stopStt(): void {
  cleanup();
  handlers?.onPartial?.("");
}

function cleanup(): void {
  if (keepAlive) {
    clearInterval(keepAlive);
    keepAlive = 0;
  }
  if (recorder && recorder.state !== "inactive") {
    try {
      recorder.stop();
    } catch {
      /* noop */
    }
  }
  recorder = null;
  if (ws) {
    try {
      ws.onmessage = null;
      ws.onerror = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close();
    } catch {
      /* noop */
    }
    ws = null;
  }
  if (stream) {
    stream.getTracks().forEach((t) => t.stop());
    stream = null;
  }
  stopInputMeter();
}

/** Tap the mic stream with an AnalyserNode so the UI can show a live "she hears you" level. */
function startInputMeter(src: MediaStream): void {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    inputCtx = new AC();
    const node = inputCtx.createMediaStreamSource(src);
    inputAnalyser = inputCtx.createAnalyser();
    inputAnalyser.fftSize = 512;
    inputAnalyser.smoothingTimeConstant = 0.5;
    node.connect(inputAnalyser); // analyser only — do NOT connect to destination (would echo the mic)
    inputData = new Uint8Array(inputAnalyser.fftSize);
    const loop = () => {
      if (!inputAnalyser || !inputData) {
        inputRaf = 0;
        return;
      }
      inputAnalyser.getByteTimeDomainData(inputData);
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) {
        const v = (inputData[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / inputData.length);
      inputLevel += (Math.min(1, rms * 3.5) - inputLevel) * 0.3; // smooth
      inputRaf = requestAnimationFrame(loop);
    };
    inputRaf = requestAnimationFrame(loop);
  } catch {
    /* metering is best-effort; STT still works without it */
  }
}

function stopInputMeter(): void {
  if (inputRaf) {
    cancelAnimationFrame(inputRaf);
    inputRaf = 0;
  }
  inputAnalyser = null;
  inputData = null;
  inputLevel = 0;
  if (inputCtx) {
    void inputCtx.close().catch(() => {});
    inputCtx = null;
  }
}

function pickMime(): string | "" {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? "";
}
