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
}

interface ChatPrefsState extends Persisted {
  hydrated: boolean;
  /** agentId -> preset slug ("" = default), plus a "jova" key — used to gate reactions per target. */
  agentPresets: Record<string, string>;
  toggleAllowlist: (slug: string) => void;
  hydrate: () => void;
  /** refresh the agentId->preset map from the BFF (best-effort; safe offline) */
  refreshAgentPresets: () => Promise<void>;
  /** is reactions enabled for the agent this session is addressed to? */
  reactionsEnabledFor: (target: ChatTarget | null | undefined) => boolean;
}

const DEFAULTS: Persisted = {
  reactionsAllowlist: [DEFAULT_PRESET],
};

function persist(s: Persisted) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify({ reactionsAllowlist: s.reactionsAllowlist }));
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
      persist({ reactionsAllowlist });
      return { reactionsAllowlist };
    }),

  hydrate: () => {
    if (get().hydrated || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<Persisted>;
        if (Array.isArray(p.reactionsAllowlist)) set({ reactionsAllowlist: p.reactionsAllowlist });
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
