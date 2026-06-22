"use client";

import { create } from "zustand";

/**
 * Durable chat/prompt history for issue-tracking. Captured write-on-send (not read from the live
 * session map), so it survives closeSession/closeConversation deleting messages. In-memory for the
 * demo; the real backend would persist this server-side.
 */
export interface HistoryEntry {
  id: string;
  ts: number;
  sessionId: string;
  /** who the thread is with — "Jova" or "Team - Role" */
  who: string;
  /** structured identity for filtering (absent = Jova; teamId "nexus" = the orchestrator) */
  teamId?: string;
  agentId?: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  kind?: "dream";
}

let hSeed = 1;
const newId = () => `h-${hSeed++}`;
const MAX = 2000;
const DAY = 86_400_000;

/** A couple of past exchanges so the history screen + date filter have something to show. */
function seed(): HistoryEntry[] {
  const now = Date.now();
  return [
    { id: newId(), ts: now - 2 * DAY, sessionId: "seed-1", who: "Jova", role: "user", content: "What's the team status?" },
    {
      id: newId(),
      ts: now - 2 * DAY + 4000,
      sessionId: "seed-1",
      who: "Jova",
      role: "assistant",
      content: "Everyone's heads-down. Forge shipped the payment fix; Beacon needs your sign-off on an ad-spend call.",
    },
    { id: newId(), ts: now - 1 * DAY, sessionId: "seed-2", who: "Forge - Developer", teamId: "forge", role: "user", content: "Refactor the auth flow when you can." },
    {
      id: newId(),
      ts: now - 1 * DAY + 5000,
      sessionId: "seed-2",
      who: "Forge - Developer",
      teamId: "forge",
      role: "assistant",
      content: "On it — I'll split the token refresh out and add tests.",
    },
  ];
}

interface HistoryState {
  /** chronological (oldest → newest); screens reverse for display */
  entries: HistoryEntry[];
  record: (e: Omit<HistoryEntry, "id">) => void;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  entries: seed(),
  record: (e) => set((st) => ({ entries: [...st.entries, { ...e, id: newId() }].slice(-MAX) })),
}));

if (typeof window !== "undefined") {
  (window as unknown as { __historyStore?: typeof useHistoryStore }).__historyStore = useHistoryStore;
}
