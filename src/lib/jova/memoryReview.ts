import type { AuditEntry, DriftReport, ReconcileAction } from "@/lib/jova/memoryTypes";

/**
 * Browser client for the memory-review surface. Talks only to our BFF (/api/memory), never the sidecar
 * directly — the sidecar URL and any secret stay server-side. See src/lib/jova/memorySidecar.ts.
 */

export type { AuditEntry, DiffLine, DriftItem, DriftReport, DriftStatus, ReconcileAction } from "@/lib/jova/memoryTypes";

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const msg = await res
      .json()
      .then((j) => (j as { error?: string }).error)
      .catch(() => null);
    throw new Error(msg ?? `request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

/** Fetch the current drift report (out-of-band edits) for an agent. */
export async function fetchDrift(agent: string): Promise<DriftReport> {
  return unwrap<DriftReport>(await fetch(`/api/memory?agent=${encodeURIComponent(agent)}`, { cache: "no-store" }));
}

/** Fetch the reconciliation audit history for an agent. */
export async function fetchAudit(agent: string, limit = 50): Promise<AuditEntry[]> {
  const d = await unwrap<{ entries: AuditEntry[] }>(
    await fetch(`/api/memory?agent=${encodeURIComponent(agent)}&view=audit&limit=${limit}`, { cache: "no-store" }),
  );
  return d.entries ?? [];
}

/** Accept (fold into recall) or discard (revert to trusted) drift; noteIds null/empty = all. Returns the
 *  fresh report after the change. */
export async function reconcileDrift(
  agent: string,
  action: ReconcileAction,
  noteIds: string[] | null = null,
): Promise<DriftReport> {
  const d = await unwrap<{ report: DriftReport }>(
    await fetch(`/api/memory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "reconcile", agent, action, noteIds }),
    }),
  );
  return d.report;
}

/** Toggle trusted-vault mode. Returns the new auto-sync state. */
export async function setAutoSync(agent: string, enabled: boolean): Promise<boolean> {
  const d = await unwrap<{ autoSync: boolean }>(
    await fetch(`/api/memory`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "autosync", agent, enabled }),
    }),
  );
  return d.autoSync;
}
