/**
 * Agent frameworks — the runtime/backend an agent is built on. Today the dashboard only CREATES Letta
 * agents (everything we've been provisioning). **Hermes** and **Openclaw** are reserved for a future,
 * SEPARATE setup flow — they appear here for reference but aren't creatable from the Create screen yet.
 *
 * This is the single source of truth: when another framework becomes creatable, flip its `creatable`
 * flag (or add a new entry) and the Create picker + Edit display populate automatically. The chosen
 * framework is persisted in the agent's Letta `metadata.framework` (defaults to "letta" for every
 * existing agent). It's set at creation and is read-only thereafter.
 */
export interface AgentFramework {
  /** stable id stored in metadata.framework */
  id: string;
  label: string;
  /** can the dashboard create agents of this framework today? */
  creatable: boolean;
}

export const AGENT_FRAMEWORKS: AgentFramework[] = [
  { id: "letta", label: "Letta", creatable: true },
  { id: "hermes", label: "Hermes", creatable: false },
  { id: "openclaw", label: "Openclaw", creatable: false },
];

/** The only framework we can create today (and the fallback for agents with no recorded framework). */
export const DEFAULT_FRAMEWORK = "letta";

/** Human label for a framework id, falling back to the default's label for unknown/empty ids. */
export function frameworkLabel(id: string | undefined | null): string {
  const f = AGENT_FRAMEWORKS.find((x) => x.id === (id ?? "").trim().toLowerCase());
  return f?.label ?? AGENT_FRAMEWORKS.find((x) => x.id === DEFAULT_FRAMEWORK)!.label;
}
