"use client";

import { create } from "zustand";
import type { ChatTarget } from "@/lib/jova/types";
import { listAgents } from "@/lib/jova/agents";

const LS_KEY = "jova.chatPrefs";

/** The default preset an agent routes through when it has no explicit one (empty handle). */
const DEFAULT_PRESET = "jova-conversation";

interface Persisted {
  /** preset slugs allowed to participate in reactions (give + understand). */
  reactionsAllowlist: string[];
  /** show ElevenLabs v3 emphasis tags ("[angry]") in the chat transcript (default: hidden). */
  showAudioTags: boolean;
  /** user-added preset slugs surfaced in the Agents routing dropdowns. Temporary stopgap until the
   *  OpenRouter preset-list API returns the workspace's presets. */
  customPresets: string[];
}

interface ChatPrefsState extends Persisted {
  hydrated: boolean;
  /** agentId -> preset slug ("" = default), plus a "jova" key — used to gate reactions per target. */
  agentPresets: Record<string, string>;
  toggleAllowlist: (slug: string) => void;
  setShowAudioTags: (on: boolean) => void;
  /** add a user-defined preset slug (normalized to [a-z0-9_-]); ignores blanks/dupes. */
  addCustomPreset: (slug: string) => void;
  removeCustomPreset: (slug: string) => void;
  hydrate: () => void;
  /** refresh the agentId->preset map from the BFF (best-effort; safe offline) */
  refreshAgentPresets: () => Promise<void>;
  /** is reactions enabled for the agent this session is addressed to? */
  reactionsEnabledFor: (target: ChatTarget | null | undefined) => boolean;
}

const DEFAULTS: Persisted = {
  reactionsAllowlist: [DEFAULT_PRESET],
  showAudioTags: false,
  customPresets: [],
};

function persist(s: Persisted) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LS_KEY,
      JSON.stringify({ reactionsAllowlist: s.reactionsAllowlist, showAudioTags: s.showAudioTags, customPresets: s.customPresets }),
    );
  } catch {}
}

export const useChatPrefs = create<ChatPrefsState>((set, get) => ({
  ...DEFAULTS,
  hydrated: false,
  agentPresets: {},

  toggleAllowlist: (slug) =>
    set((st) => {
      const has = st.reactionsAllowlist.includes(slug);
      const reactionsAllowlist = has ? st.reactionsAllowlist.filter((s) => s !== slug) : [...st.reactionsAllowlist, slug];
      persist({ reactionsAllowlist, showAudioTags: st.showAudioTags, customPresets: st.customPresets });
      return { reactionsAllowlist };
    }),

  setShowAudioTags: (on) =>
    set((st) => {
      persist({ reactionsAllowlist: st.reactionsAllowlist, showAudioTags: on, customPresets: st.customPresets });
      return { showAudioTags: on };
    }),

  addCustomPreset: (raw) =>
    set((st) => {
      const slug = raw.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
      if (!slug || st.customPresets.includes(slug)) return {};
      const customPresets = [...st.customPresets, slug];
      persist({ reactionsAllowlist: st.reactionsAllowlist, showAudioTags: st.showAudioTags, customPresets });
      return { customPresets };
    }),

  removeCustomPreset: (slug) =>
    set((st) => {
      const customPresets = st.customPresets.filter((s) => s !== slug);
      persist({ reactionsAllowlist: st.reactionsAllowlist, showAudioTags: st.showAudioTags, customPresets });
      return { customPresets };
    }),

  hydrate: () => {
    if (get().hydrated || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Persisted>;
        if (Array.isArray(p.reactionsAllowlist)) set({ reactionsAllowlist: p.reactionsAllowlist });
        if (typeof p.showAudioTags === "boolean") set({ showAudioTags: p.showAudioTags });
        if (Array.isArray(p.customPresets)) set({ customPresets: p.customPresets.filter((s): s is string => typeof s === "string") });
      }
    } catch {}
    set({ hydrated: true });
    void get().refreshAgentPresets();
  },

  refreshAgentPresets: async () => {
    try {
      const agents = await listAgents();
      const map: Record<string, string> = {};
      for (const a of agents) {
        map[a.id] = a.preset || "";
        if (a.name?.toLowerCase() === "jova") map["jova"] = a.preset || "";
      }
      set({ agentPresets: map });
    } catch {
      /* offline / mock — leave the map empty; reactionsEnabledFor falls back to the default preset */
    }
  },

  reactionsEnabledFor: (target) => {
    const { agentPresets, reactionsAllowlist } = get();
    const key = target ? target.agentId : "jova";
    const slug = (agentPresets[key] || DEFAULT_PRESET) as string;
    return reactionsAllowlist.includes(slug || DEFAULT_PRESET);
  },
}));
