import type { AuditEntry, DriftItem, DriftReport, ReconcileAction } from "@/lib/jova/memoryTypes";

/**
 * Server-only client for the jova-memory reconciliation API (the review half of the memory sidecar —
 * jova_memory.py :4200). The browser never imports this: it reads JOVA_MEMORY_URL from server env and
 * talks to the loopback sidecar (reachable from the dashboard host the same way Letta is — see
 * CONNECTING.md). It maps the sidecar's snake_case JSON to the camelCase memoryTypes the UI uses.
 *
 * The sidecar owns the trusted snapshots and the diff/accept/discard/audit logic (so a huge diff or a
 * path-escape can't be driven from here); this module is a thin, typed passthrough.
 */

const BASE = (process.env.JOVA_MEMORY_URL ?? "http://127.0.0.1:4200").replace(/\/+$/, "");

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`memory sidecar ${path} ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

function mapItem(x: Record<string, unknown>): DriftItem {
  return {
    noteId: String(x.note_id ?? ""),
    status: x.status as DriftItem["status"],
    kind: String(x.kind ?? ""),
    path: String(x.path ?? ""),
    trusted: (x.trusted as string | null) ?? null,
    current: (x.current as string | null) ?? null,
    diff: (x.diff as DriftItem["diff"]) ?? [],
    added: Number(x.added ?? 0),
    removed: Number(x.removed ?? 0),
  };
}

function mapAudit(x: Record<string, unknown>): AuditEntry {
  return {
    ts: Number(x.ts ?? 0),
    action: x.action as AuditEntry["action"],
    noteId: String(x.note_id ?? ""),
    status: x.status as AuditEntry["status"],
    detail: String(x.detail ?? ""),
  };
}

/** List out-of-band edits (modified/new/deleted) for one agent, with diffs + auto-sync state. */
export async function getDrift(agent: string): Promise<DriftReport> {
  const d = await post("/drift", { agent });
  return {
    agent: String(d.agent ?? agent),
    autoSync: Boolean(d.auto_sync),
    clean: Boolean(d.clean),
    items: ((d.items as Record<string, unknown>[]) ?? []).map(mapItem),
  };
}

/** Accept (fold into recall) or discard (revert to trusted) drifted notes; null noteIds = all drift. */
export async function reconcile(agent: string, action: ReconcileAction, noteIds: string[] | null): Promise<{ applied: number }> {
  const d = await post("/reconcile", { agent, action, note_ids: noteIds });
  return { applied: Number(d.applied ?? 0) };
}

/** Toggle trusted-vault mode for one agent. */
export async function setAutoSync(agent: string, enabled: boolean): Promise<boolean> {
  const d = await post("/autosync", { agent, enabled });
  return Boolean(d.auto_sync);
}

/** Recent reconciliation history for one agent. */
export async function getAudit(agent: string, limit = 50): Promise<AuditEntry[]> {
  const d = await post("/audit", { agent, limit });
  return ((d.entries as Record<string, unknown>[]) ?? []).map(mapAudit);
}
