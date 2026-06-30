"use client";

import { useMemo } from "react";
import { create } from "zustand";
import { characterByName, matchSecretCode } from "@/lib/agents/characters";

/**
 * Session-only unlock state for SECRET characters (e.g. Mira). Typing a character's code in the
 * new-chat search reveals it in the chat picker, the Voice studio, and the Routing screen — for THIS
 * session only. It is deliberately NOT persisted: reload re-hides her and you re-enter the code. This
 * is an easter-egg gate, not a security boundary (the agent still exists server-side regardless).
 */
interface SecretAgentsState {
  /** lowercased agent names revealed this session */
  unlocked: string[];
  unlock: (name: string) => void;
  /** re-hide a secret character (e.g. when its chat is closed) — disappears from picker/Routing/Voice */
  relock: (name: string) => void;
  /** if `input` matches a secret code, unlock that character and return its name */
  tryCode: (input: string) => string | null;
}

export const useSecretAgents = create<SecretAgentsState>((set, get) => ({
  unlocked: [],
  unlock: (name) =>
    set((st) => (st.unlocked.includes(name.toLowerCase()) ? st : { unlocked: [...st.unlocked, name.toLowerCase()] })),
  relock: (name) =>
    set((st) => ({ unlocked: st.unlocked.filter((n) => n !== name.toLowerCase()) })),
  tryCode: (input) => {
    const name = matchSecretCode(input);
    if (name) get().unlock(name);
    return name;
  },
}));

/** Is this agent currently hidden? (a secret character that hasn't been unlocked this session). */
export function isAgentHidden(name: string | undefined | null, unlocked: string[]): boolean {
  const meta = characterByName(name);
  return !!meta?.secret && !unlocked.includes((name ?? "").toLowerCase());
}

/**
 * Hook returning a reactive `hidden(name)` predicate — components re-render when an unlock happens.
 * Use this to filter agent lists in the chat picker, Voice studio, and Routing.
 */
export function useIsHidden(): (name: string | undefined | null) => boolean {
  const unlocked = useSecretAgents((s) => s.unlocked);
  return useMemo(() => (name: string | undefined | null) => isAgentHidden(name, unlocked), [unlocked]);
}
