"use client";

import { create } from "zustand";

/**
 * Voice interaction preferences — how you talk to Jova when the chat is closed, what you see, and
 * which devices to use. Persisted to localStorage by hand (same pattern as useChatPrefs), hydrated
 * once from the Voice settings screen's effect.
 *
 * triggerMode  — how a voice turn STARTS:
 *   orb    : a floating mic button; click to toggle continuous hands-free listening
 *   always : always-on listening with a mic-reactive indicator (auto-starts; just talk)
 *   ptt    : hold a configurable key anywhere on the page
 * feedbackMode — what you SEE during a voice-only turn:
 *   captions : your words + her reply drift over the scene, then fade
 *   wisp     : pure presence — only the wisp (+ a minimal listening ring), no text
 *   hud      : a tiny status line (listening / thinking / speaking)
 */

export type TriggerMode = "orb" | "always" | "ptt";
export type FeedbackMode = "captions" | "wisp" | "hud";

const LS_KEY = "jova.voicePrefs";

interface Persisted {
  triggerMode: TriggerMode;
  feedbackMode: FeedbackMode;
  /** KeyboardEvent.code held to talk in "ptt" mode (e.g. "Space", "Backquote", "KeyV"). */
  pttKey: string;
  /** mic deviceId ("" = system default) */
  inputDeviceId: string;
  /** speaker/sink deviceId ("" = system default; output routing needs AudioContext.setSinkId) */
  outputDeviceId: string;
}

interface VoicePrefsState extends Persisted {
  hydrated: boolean;
  setTriggerMode: (m: TriggerMode) => void;
  setFeedbackMode: (m: FeedbackMode) => void;
  setPttKey: (code: string) => void;
  setInputDevice: (id: string) => void;
  setOutputDevice: (id: string) => void;
  hydrate: () => void;
}

const DEFAULTS: Persisted = {
  triggerMode: "orb", // most discoverable out of the box
  feedbackMode: "captions",
  pttKey: "Space",
  inputDeviceId: "",
  outputDeviceId: "",
};

function persist(s: Persisted) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LS_KEY,
      JSON.stringify({
        triggerMode: s.triggerMode,
        feedbackMode: s.feedbackMode,
        pttKey: s.pttKey,
        inputDeviceId: s.inputDeviceId,
        outputDeviceId: s.outputDeviceId,
      }),
    );
  } catch {}
}

export const useVoicePrefs = create<VoicePrefsState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,

  setTriggerMode: (triggerMode) =>
    set((st) => {
      persist({ ...st, triggerMode });
      return { triggerMode };
    }),
  setFeedbackMode: (feedbackMode) =>
    set((st) => {
      persist({ ...st, feedbackMode });
      return { feedbackMode };
    }),
  setPttKey: (pttKey) =>
    set((st) => {
      persist({ ...st, pttKey });
      return { pttKey };
    }),
  setInputDevice: (inputDeviceId) =>
    set((st) => {
      persist({ ...st, inputDeviceId });
      return { inputDeviceId };
    }),
  setOutputDevice: (outputDeviceId) =>
    set((st) => {
      persist({ ...st, outputDeviceId });
      return { outputDeviceId };
    }),

  hydrate: () => {
    if (get().hydrated || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Persisted>;
        const next: Partial<Persisted> = {};
        if (p.triggerMode === "orb" || p.triggerMode === "always" || p.triggerMode === "ptt") next.triggerMode = p.triggerMode;
        if (p.feedbackMode === "captions" || p.feedbackMode === "wisp" || p.feedbackMode === "hud") next.feedbackMode = p.feedbackMode;
        if (typeof p.pttKey === "string" && p.pttKey) next.pttKey = p.pttKey;
        if (typeof p.inputDeviceId === "string") next.inputDeviceId = p.inputDeviceId;
        if (typeof p.outputDeviceId === "string") next.outputDeviceId = p.outputDeviceId;
        set(next);
      }
    } catch {}
    set({ hydrated: true });
  },
}));

/** Friendly label for a KeyboardEvent.code, for the PTT key picker. */
export function keyLabel(code: string): string {
  if (!code) return "—";
  if (code === "Space") return "Space";
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "Backquote") return "`";
  if (code.startsWith("Arrow")) return code.slice(5) + " Arrow";
  return code;
}
