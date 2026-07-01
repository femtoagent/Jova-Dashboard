/**
 * Shared types for the memory-review (reconciliation) surface. Pure types only — no server or client
 * code — so both the server sidecar client (memorySidecar.ts) and the browser client (memoryReview.ts)
 * can import them without coupling. The sidecar speaks snake_case JSON; memorySidecar.ts maps it to the
 * camelCase shapes below so the rest of the app never sees the wire format.
 */

/** How a note's markdown has drifted from what Jova has indexed (the trusted copy). */
export type DriftStatus = "modified" | "new" | "deleted";

/** One line of a trusted→current diff. */
export interface DiffLine {
  t: "ctx" | "add" | "del";
  text: string;
}

/** A note whose markdown differs from the trusted, indexed copy — i.e. edited outside the app. */
export interface DriftItem {
  noteId: string;
  status: DriftStatus;
  kind: string; // fact | event | semantic
  path: string;
  /** the trusted (indexed) full text, or null for a brand-new file. */
  trusted: string | null;
  /** the current on-disk full text, or null for a deleted file. */
  current: string | null;
  diff: DiffLine[];
  added: number;
  removed: number;
}

/** The drift report for one agent. */
export interface DriftReport {
  agent: string;
  /** trusted-vault mode: outside edits are auto-applied (and audited) rather than held for review. */
  autoSync: boolean;
  clean: boolean;
  items: DriftItem[];
}

/** One entry in the reconciliation audit trail. */
export interface AuditEntry {
  ts: number; // unix seconds
  action: "accept" | "discard" | "auto-accept";
  noteId: string;
  status: DriftStatus;
  detail: string; // e.g. "+3/-1"
}

export type ReconcileAction = "accept" | "discard";
