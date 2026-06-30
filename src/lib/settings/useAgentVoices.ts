"use client";

import { create } from "zustand";
import type { VoiceModel } from "@/lib/voice/types";

/**
 * Per-agent voice assignment roster (persisted to localStorage). Jova is a built-in entry that speaks;
 * other agents can be added and assigned a voice + model now, but `enabled` (speak aloud) defaults OFF
 * for them until the agent/team provisioning is ready. Playback (useConversation) reads `forKey()`.
 */

export type AgentVoice = {
  id: string; // "jova" for the built-in; the REAL Letta agent id for live agents; uuid for placeholders
  name: string;
  keyId: string; // which stored ElevenLabs key this voice lives on ("" = active/default)
  voiceId: string; // "" = account/server default
  model: VoiceModel;
  /** v3-only audio-tag prefix prepended to the spoken text, e.g. "[evil] [mockery] [faster]". */
  v3Tags: string;
  enabled: boolean; // speak this agent's replies aloud
  /** read *italic* asides/actions aloud (default true). Off → italic spans are skipped in speech but
   *  still shown in chat. */
  readItalics?: boolean;
  builtin?: boolean; // jova — not removable, on by default
  /** true when this entry is keyed to a REAL Letta agent id (materialized from listAgents) — its
   *  voice actually routes (forKey hits on the chat session's lettaId), so Speak is enable-able. */
  real?: boolean;
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
  setReadItalics: (id: string, on: boolean) => void;
  rename: (id: string, name: string) => void;
  addAgent: (name: string) => void;
  /** materialize an entry keyed by a REAL Letta agent id (idempotent); seeds voice defaults once. */
  ensureAgent: (id: string, name: string, defaults?: { model?: VoiceModel; v3Tags?: string }) => void;
  /** re-key a create-flow draft entry (`draft-…`) onto the real agent id once the agent exists. */
  claimDraft: (draftId: string, realId: string, name?: string) => void;
  /** drop real-agent entries whose id is no longer a live agent (e.g. deleted in Letta) — clears dupes. */
  pruneStale: (liveIds: string[]) => void;
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
    readItalics: a.readItalics ?? true,
    real: a.real ?? false,
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
  setReadItalics: (id, on) =>
    set((st) => {
      const roster = st.roster.map((a) => (a.id === id ? { ...a, readItalics: on } : a));
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
  ensureAgent: (id, name, defaults) =>
    set((st) => {
      const cur = st.roster.find((a) => a.id === id);
      if (cur) {
        // already present — just make sure it's flagged real (so Speak is enable-able) + name in sync,
        // without clobbering the user's voice/model/tags choices.
        if (cur.real && cur.name === name) return st;
        const roster = st.roster.map((a) => (a.id === id ? { ...a, real: true, name } : a));
        persist(roster);
        return { roster };
      }
      // adopt a manual placeholder with the same name (rewire it to the real id) instead of duplicating —
      // but NEVER for a create-flow draft id: a draft must be a fresh standalone entry, so opening the
      // Create voice editor can't consume (and on cancel, destroy) an unrelated same-named placeholder.
      const norm = (s: string) => s.trim().toLowerCase();
      const ph = id.startsWith("draft-") ? undefined : st.roster.find((a) => !a.builtin && !a.real && norm(a.name) === norm(name));
      if (ph) {
        const roster = st.roster.map((a) => (a.id === ph.id ? { ...a, id, name, real: true } : a));
        persist(roster);
        return { roster };
      }
      const entry: AgentVoice = {
        id,
        name,
        keyId: "",
        voiceId: "",
        model: defaults?.model ?? DEFAULT_MODEL,
        v3Tags: defaults?.v3Tags ?? "",
        enabled: false,
        real: true,
      };
      const roster = [...st.roster, entry];
      persist(roster);
      return { roster };
    }),
  claimDraft: (draftId, realId, name) =>
    set((st) => {
      const draft = st.roster.find((a) => a.id === draftId);
      if (!draft) return st;
      // re-key the draft onto the real id (dropping any stale entry already at that id), keep its
      // voice/model/tag choices, and flag it real so it routes + Speak is enable-able.
      const roster = st.roster
        .filter((a) => a.id !== realId)
        .map((a) => (a.id === draftId ? { ...a, id: realId, name: name ?? a.name, real: true } : a));
      persist(roster);
      return { roster };
    }),
  pruneStale: (liveIds) =>
    set((st) => {
      const live = new Set(liveIds);
      // keep Jova (built-in), manual placeholders (not real), and real entries that still exist live.
      // Abandoned create-flow drafts (draft-…) are never a live agent → always drop them.
      const roster = st.roster.filter((a) => a.builtin || (!a.id.startsWith("draft-") && (!a.real || live.has(a.id))));
      if (roster.length === st.roster.length) return st;
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
