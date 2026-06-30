/**
 * Memory backends — which long-term memory an agent uses. This is the per-agent counterpart to the
 * framework registry: a single source of truth so the Create/Edit picker populates automatically.
 *
 *  - **letta**  — Letta's built-in archival/passage recall (pure vector similarity, no ranking). Default,
 *                 available today; what every agent uses now.
 *  - **ranked** — "Jova Memory": the relevance + importance + recency ranking sidecar over the vault.
 *                 Selectable so you can assign intent now; takes effect once the memory service is live.
 *  - **none**   — no long-term memory (in-context blocks only).
 *
 * The choice is stored in the agent's Letta `metadata.memory`. Unlike framework, memory is MUTABLE — you
 * can re-point an agent at a different backend from the Edit screen.
 */
export interface AgentMemory {
  /** stable id stored in metadata.memory */
  id: string;
  label: string;
  description: string;
}

export const AGENT_MEMORIES: AgentMemory[] = [
  { id: "letta", label: "Letta archival", description: "Built-in vector recall — semantic similarity only. Default, available now." },
  { id: "ranked", label: "Jova Memory (ranked)", description: "Relevance + importance + recency ranking over the vault. Takes effect once the memory service is running." },
  { id: "none", label: "None", description: "No long-term memory — in-context blocks only." },
];

/** The backend an agent uses if none is recorded (today: everyone). */
export const DEFAULT_MEMORY = "letta";

/** Human label for a memory id, falling back to the default's label for unknown/empty ids. */
export function memoryLabel(id: string | undefined | null): string {
  const m = AGENT_MEMORIES.find((x) => x.id === (id ?? "").trim().toLowerCase());
  return m?.label ?? AGENT_MEMORIES.find((x) => x.id === DEFAULT_MEMORY)!.label;
}
