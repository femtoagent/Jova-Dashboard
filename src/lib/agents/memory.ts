/**
 * Memory backends — which long-term memory ENGINE an agent uses. This is the per-agent counterpart to
 * the framework registry: a single source of truth so the Create/Edit picker populates automatically.
 * (What that engine *does* — episodic/semantic recall, reflection, cadence — is the separate memory
 * PROFILE; see memoryProfile.ts. The engine is where memories live; the profile is how they behave.)
 *
 *  - **letta**  — Letta's built-in archival/passage recall (pure vector similarity, no ranking). Only
 *                 meaningful on the Letta framework, so it's scoped to it. Default for Letta agents.
 *  - **ranked** — "Jova Memory": the relevance + importance + recency ranking sidecar over the vault.
 *                 Framework-agnostic (any agent can call it over HTTP); takes effect once the service runs.
 *  - **none**   — no long-term memory (in-context blocks only). Framework-agnostic.
 *
 * The choice is stored in the agent's Letta `metadata.memory`. Unlike framework, memory is MUTABLE — you
 * can re-point an agent at a different backend from the Edit screen.
 */
export interface AgentMemory {
  /** stable id stored in metadata.memory */
  id: string;
  label: string;
  /** one-line, card-length subline shown under the label in the engine picker. */
  description: string;
  /** frameworks this engine is available on. Omit → framework-agnostic (available everywhere). */
  frameworks?: string[];
  /** true when choosing this engine opens a configurable profile below (drives the "▾ profile" hint +
   *  the unfolding panel — keyed off data, not a hardcoded id). */
  configurable?: boolean;
}

export const AGENT_MEMORIES: AgentMemory[] = [
  { id: "letta", label: "Letta archival", description: "Built-in vector recall — semantic similarity, no ranking. Letta only.", frameworks: ["letta"] },
  { id: "ranked", label: "Ranked memory", description: "Ranks memory by relevance, importance, and recency. Opens a profile below.", configurable: true },
  { id: "none", label: "None", description: "In-context only — nothing carries between sessions." },
];

/** The backend an agent uses if none is recorded (today: everyone, and every agent is on Letta). */
export const DEFAULT_MEMORY = "letta";

/** Is this engine available on this framework? (No `frameworks` list → available everywhere.) */
export function isMemoryAllowed(memoryId: string, frameworkId: string): boolean {
  const m = AGENT_MEMORIES.find((x) => x.id === (memoryId ?? "").trim().toLowerCase());
  if (!m) return false;
  return !m.frameworks || m.frameworks.includes((frameworkId ?? "").trim().toLowerCase());
}

/** The engines selectable on a given framework (drives the picker so e.g. Letta archival is hidden for
 *  a Hermes agent). Framework-agnostic engines always appear. */
export function memoriesForFramework(frameworkId: string): AgentMemory[] {
  return AGENT_MEMORIES.filter((m) => isMemoryAllowed(m.id, frameworkId));
}

/** A sensible engine for a fresh agent on this framework — the global default when it's allowed there,
 *  else the first engine that is (so a non-Letta agent never starts pinned to Letta archival). */
export function defaultMemoryForFramework(frameworkId: string): string {
  if (isMemoryAllowed(DEFAULT_MEMORY, frameworkId)) return DEFAULT_MEMORY;
  return memoriesForFramework(frameworkId)[0]?.id ?? "none";
}

/** Human label for a memory id, falling back to the default's label for unknown/empty ids. */
export function memoryLabel(id: string | undefined | null): string {
  const m = AGENT_MEMORIES.find((x) => x.id === (id ?? "").trim().toLowerCase());
  return m?.label ?? AGENT_MEMORIES.find((x) => x.id === DEFAULT_MEMORY)!.label;
}
