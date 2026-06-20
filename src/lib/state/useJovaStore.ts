"use client";

import { create } from "zustand";
import type { ChatMessage, ChatSession } from "@/lib/jova/types";
import { type Mood, type WispType, NEUTRAL_MOOD } from "@/lib/mood";

/** The four states from the brief — the soul of the wisp. */
export type WispState = "approaching" | "present" | "speaking" | "receded";

interface JovaState {
  // ---- scene ----
  wispType: WispType;
  wispState: WispState;
  mood: Mood;
  quality: "high" | "low";
  /** Nexus spins up to an "active/processing" state when true, easing back to baseline when false. */
  nexusActive: boolean;
  /** Master switch for Nexus's spatial audio (off by default; needs a user gesture to start). */
  soundOn: boolean;

  // ---- chat ----
  sessions: ChatSession[];
  activeSessionId: string | null;
  messages: Record<string, ChatMessage[]>;
  chatOpen: boolean;
  voiceOn: boolean; // TTS (her voice out) — wired in Phase 4
  micOn: boolean; // STT (mic in) — wired in Phase 4
  lastInteraction: number;

  // ---- scene actions ----
  setWispType: (t: WispType) => void;
  setWispState: (s: WispState) => void;
  setMood: (m: Mood) => void;
  mergeMood: (m: Partial<Mood>) => void;
  setQuality: (q: "high" | "low") => void;
  setNexusActive: (v: boolean) => void;
  setSoundOn: (v: boolean) => void;

  // ---- chat actions ----
  createSession: (title?: string) => string;
  switchSession: (id: string) => void;
  addMessage: (sessionId: string, msg: ChatMessage) => void;
  appendToken: (sessionId: string, msgId: string, text: string) => void;
  setReasoning: (sessionId: string, msgId: string, text: string) => void;
  finalizeMessage: (sessionId: string, msgId: string) => void;
  setChatOpen: (open: boolean) => void;
  toggleVoice: () => void;
  toggleMic: () => void;

  /** Register interaction; if she had receded, bring her back. */
  touch: () => void;
}

export const useJovaStore = create<JovaState>((set, get) => ({
  wispType: "orb",
  wispState: "present",
  mood: NEUTRAL_MOOD,
  quality: "high",
  nexusActive: false,
  soundOn: false,

  sessions: [],
  activeSessionId: null,
  messages: {},
  chatOpen: true,
  voiceOn: false,
  micOn: false,
  lastInteraction: Date.now(),

  setWispType: (t) => set({ wispType: t }),
  setWispState: (s) => set({ wispState: s }),
  setMood: (m) => set({ mood: m }),
  mergeMood: (m) => set((st) => ({ mood: { ...st.mood, ...m } })),
  setQuality: (q) => set({ quality: q }),
  setNexusActive: (v) => set({ nexusActive: v }),
  setSoundOn: (v) => set({ soundOn: v }),

  createSession: (title) => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const session: ChatSession = {
      id,
      title: title ?? `Session ${get().sessions.length + 1}`,
      createdAt: now,
      updatedAt: now,
    };
    set((st) => ({
      sessions: [...st.sessions, session],
      activeSessionId: id,
      messages: { ...st.messages, [id]: [] },
    }));
    return id;
  },

  switchSession: (id) => set({ activeSessionId: id }),

  addMessage: (sessionId, msg) =>
    set((st) => ({
      messages: {
        ...st.messages,
        [sessionId]: [...(st.messages[sessionId] ?? []), msg],
      },
      sessions: st.sessions.map((s) =>
        s.id === sessionId ? { ...s, updatedAt: Date.now() } : s
      ),
    })),

  appendToken: (sessionId, msgId, text) =>
    set((st) => ({
      messages: {
        ...st.messages,
        [sessionId]: (st.messages[sessionId] ?? []).map((m) =>
          m.id === msgId ? { ...m, content: m.content + text } : m
        ),
      },
    })),

  setReasoning: (sessionId, msgId, text) =>
    set((st) => ({
      messages: {
        ...st.messages,
        [sessionId]: (st.messages[sessionId] ?? []).map((m) =>
          m.id === msgId ? { ...m, reasoning: text } : m
        ),
      },
    })),

  finalizeMessage: (sessionId, msgId) =>
    set((st) => ({
      messages: {
        ...st.messages,
        [sessionId]: (st.messages[sessionId] ?? []).map((m) =>
          m.id === msgId ? { ...m, streaming: false } : m
        ),
      },
    })),

  setChatOpen: (open) => set({ chatOpen: open }),
  toggleVoice: () => set((st) => ({ voiceOn: !st.voiceOn })),
  toggleMic: () => set((st) => ({ micOn: !st.micOn })),

  touch: () =>
    set((st) => ({
      lastInteraction: Date.now(),
      wispState: st.wispState === "receded" ? "approaching" : st.wispState,
    })),
}));

// Dev convenience: expose the store for smoke tests / debugging in the browser console.
if (typeof window !== "undefined") {
  (window as unknown as { __jovaStore?: typeof useJovaStore }).__jovaStore = useJovaStore;
}
