/**
 * Client → BFF helpers for agent persona/human version history. The store lives server-side
 * (src/lib/server/agentVersions.ts); the browser only calls /api/agents/versions.
 */

export type VersionKind = "persona" | "human";
export type VersionSource = "nexus" | "manual" | "jova-human";

export interface VersionEntry {
  id: string;
  text: string;
  prompt?: string;
  source: VersionSource;
  createdAt: number;
}
export interface KindHistory {
  current: string;
  versions: VersionEntry[]; // newest-first, ≤5
}
export interface AgentHistory {
  persona: KindHistory;
  human: KindHistory;
}

export const EMPTY_KIND: KindHistory = { current: "", versions: [] };
export const EMPTY_HISTORY: AgentHistory = { persona: EMPTY_KIND, human: EMPTY_KIND };

export async function getVersions(agentId: string): Promise<AgentHistory> {
  try {
    const res = await fetch(`/api/agents/versions?agentId=${encodeURIComponent(agentId)}`, { cache: "no-store" });
    if (!res.ok) return EMPTY_HISTORY;
    return (await res.json()) as AgentHistory;
  } catch {
    return EMPTY_HISTORY;
  }
}

async function postKind(body: object): Promise<KindHistory | null> {
  try {
    const res = await fetch("/api/agents/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as KindHistory;
  } catch {
    return null;
  }
}

export const appendVersion = (agentId: string, kind: VersionKind, text: string, opts?: { prompt?: string; source?: VersionSource }) =>
  postKind({ action: "append", agentId, kind, text, prompt: opts?.prompt, source: opts?.source });

/** Seed version 1 from the live block iff the store has no history yet (server checks atomically under a
 *  lock). Returns the authoritative history — safe to call on every Edit load; won't clobber real history. */
export const seedIfEmpty = (agentId: string, kind: VersionKind, text: string, opts?: { source?: VersionSource }) =>
  postKind({ action: "seedIfEmpty", agentId, kind, text, source: opts?.source });

export const selectVersion = (agentId: string, kind: VersionKind, versionId: string) =>
  postKind({ action: "select", agentId, kind, versionId });

export const setCurrentVersion = (agentId: string, kind: VersionKind, text: string) =>
  postKind({ action: "setCurrent", agentId, kind, text });

export async function claimDraft(draftId: string, realId: string): Promise<void> {
  try {
    await fetch("/api/agents/versions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claim", draftId, realId }),
    });
  } catch {
    /* best-effort */
  }
}
