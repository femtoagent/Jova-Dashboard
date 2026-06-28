"use client";

import { create } from "zustand";
import type { VoiceModel } from "@/lib/voice/types";

/**
 * Per-agent voice assignment roster (persisted to localStorage). Jova is a built-in entry that speaks;
 * other agents can be added and assigned a voice + model now, but `enabled` (speak aloud) defaults OFF
 * for them until the agent/team provisioning is ready. Playback (useConversation) reads `forKey()`.
 */

export type AgentVoice = {
  id: string; // "jova" for the built-in; uuid for added agents
  name: string;
  keyId: string; // which stored ElevenLabs key this voice lives on ("" = active/default)
  voiceId: string; // "" = account/server default
  model: VoiceModel;
  /** v3-only audio-tag prefix prepended to the spoken text, e.g. "[evil] [mockery] [faster]". */
  v3Tags: string;
  enabled: boolean; // speak this agent's replies aloud
  builtin?: boolean; // jova — not removable, on by default
};

const LS_KEY = "jova.agentVoices";
const DEFAULT_MODEL: VoiceModel = "eleven_flash_v2_5";
const JOVA: AgentVoice = { id: "jova", name: "Jova", keyId: "", voiceId: "", model: DEFAULT_MODEL, v3Tags: "", enabled: true, builtin: true };

interface AgentVoicesState {
  roster: AgentVoice[];
  hydrated: boolean;
  /** the entry for an agent key (or a disabled default so unmapped agents never speak). */
  forKey: (id: string) => AgentVoice;
  /** assign a voice — a voice belongs to a specific key, so both are set together. */
  setVoice: (id: string, voiceId: string, keyId: string) => void;
  setModel: (id: string, model: VoiceModel) => void;
  setV3Tags: (id: string, tags: string) => void;
  setEnabled: (id: string, on: boolean) => void;
  rename: (id: string, name: string) => void;
  addAgent: (name: string) => void;
  removeAgent: (id: string) => void;
  hydrate: () => void;
}

function persist(roster: AgentVoice[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(roster));
  } catch {}
}

/** Keep Jova first + present and backfill any missing fields (e.g. keyId from older storage). */
function withJova(roster: Partial<AgentVoice>[]): AgentVoice[] {
  const norm = (a: Partial<AgentVoice>): AgentVoice => ({
    id: a.id ?? crypto.randomUUID(),
    name: a.name ?? "Agent",
    keyId: a.keyId ?? "",
    voiceId: a.voiceId ?? "",
    model: a.model ?? DEFAULT_MODEL,
    v3Tags: a.v3Tags ?? "",
    enabled: a.enabled ?? false,
  });
  const jova = roster.find((a) => a.id === "jova");
  const rest = roster.filter((a) => a.id !== "jova").map(norm);
  return [{ ...JOVA, ...(jova ?? {}), id: "jova", builtin: true }, ...rest];
}

export const useAgentVoices = create<AgentVoicesState>((set, get) => ({
  roster: [JOVA],
  hydrated: false,

  forKey: (id) => get().roster.find((a) => a.id === id) ?? { id, name: id, keyId: "", voiceId: "", model: DEFAULT_MODEL, v3Tags: "", enabled: false },

  setVoice: (id, voiceId, keyId) =>
    set((st) => {
      const roster = st.roster.map((a) => (a.id === id ? { ...a, voiceId, keyId } : a));
      persist(roster);
      return { roster };
    }),
  setModel: (id, model) =>
    set((st) => {
      const roster = st.roster.map((a) => (a.id === id ? { ...a, model } : a));
      persist(roster);
      return { roster };
    }),
  setV3Tags: (id, v3Tags) =>
    set((st) => {
      const roster = st.roster.map((a) => (a.id === id ? { ...a, v3Tags } : a));
      persist(roster);
      return { roster };
    }),
  setEnabled: (id, on) =>
    set((st) => {
      const roster = st.roster.map((a) => (a.id === id ? { ...a, enabled: on } : a));
      persist(roster);
      return { roster };
    }),
  rename: (id, name) =>
    set((st) => {
      const roster = st.roster.map((a) => (a.id === id ? { ...a, name } : a));
      persist(roster);
      return { roster };
    }),
  addAgent: (name) =>
    set((st) => {
      const entry: AgentVoice = { id: crypto.randomUUID(), name: name.trim() || "New agent", keyId: "", voiceId: "", model: DEFAULT_MODEL, v3Tags: "", enabled: false };
      const roster = [...st.roster, entry];
      persist(roster);
      return { roster };
    }),
  removeAgent: (id) =>
    set((st) => {
      if (id === "jova") return st; // built-in
      const roster = st.roster.filter((a) => a.id !== id);
      persist(roster);
      return { roster };
    }),

  hydrate: () => {
    if (get().hydrated || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<AgentVoice>[];
        if (Array.isArray(parsed)) set({ roster: withJova(parsed) });
      }
    } catch {}
    set({ hydrated: true });
  },
}));
