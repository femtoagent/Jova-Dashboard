/**
 * Client → BFF helpers for per-agent preset routing. The browser only calls our own /api/agents
 * route; the Letta bearer token lives server-side. Mirrors PresetSummary's slug values.
 */

export interface AgentInfo {
  id: string;
  name: string;
  /** preset slug this agent routes to, or "" for the default. */
  preset: string;
  /** role / subtitle (e.g. "nekomimi"); "" when unset. */
  role: string;
  /** org team display name, or "" for none. */
  team: string;
  /** short persona snippet for the list's detailed view. */
  personaSnippet?: string;
}

/** Full agent detail incl. its persona + human memory-block text (for the Edit screen). */
export interface AgentDetail extends AgentInfo {
  persona: string;
  human: string;
  /** the runtime this agent runs on ("letta" for everything we create today); read-only in Edit. */
  framework: string;
  /** which long-term memory backend the agent uses ("letta" = built-in archival); editable in Edit. */
  memory: string;
  /** core/protected agent → block defaults to read-only (unlockable per-block in the Edit UI). */
  personaProtected: boolean;
  humanProtected: boolean;
}

/** List real agents with the preset each routes through. Surfaces the route's real error body
 *  (e.g. "Can't reach Letta — is the tunnel up?") instead of a bare status, so a backend-down blip
 *  reads as something actionable rather than a mystery 502. */
export async function listAgents(): Promise<AgentInfo[]> {
  const res = await fetch("/api/agents", { cache: "no-store" });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `agents ${res.status}`);
  }
  return ((await res.json()) as { agents?: AgentInfo[] }).agents ?? [];
}

/** Fetch one agent's full detail (incl. persona + human block text) for the Edit screen. */
export async function getAgent(id: string): Promise<AgentDetail> {
  const res = await fetch(`/api/agents?id=${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `agent ${res.status}`);
  }
  return ((await res.json()) as { agent: AgentDetail }).agent;
}

/** What the create-agent form sends to the BFF. */
export interface CreateAgentInput {
  name: string;
  persona: string;
  human?: string;
  preset?: string;
  role?: string;
  team?: string;
  /** runtime framework id (defaults to "letta" server-side; only Letta is creatable today). */
  framework?: string;
  /** memory-backend id (defaults to "letta" server-side). */
  memory?: string;
}

/** Create a new Letta agent (clones the default brain config server-side). Returns the new agent. */
export async function createAgent(input: CreateAgentInput): Promise<AgentInfo> {
  const res = await fetch("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `create agent ${res.status}`);
  }
  return ((await res.json()) as { agent: AgentInfo }).agent;
}

/** Delete an agent by id (protected agents are rejected server-side). Pass name for the guard. */
export async function deleteAgent(agentId: string, name?: string): Promise<void> {
  const res = await fetch("/api/agents", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, name }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `delete agent ${res.status}`);
  }
}

/** Set an agent's preset (persisted to Letta as its model handle). Returns the updated agent. */
export async function setAgentPreset(agentId: string, preset: string): Promise<AgentInfo> {
  const res = await fetch("/api/agents", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, preset }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `set preset ${res.status}`);
  }
  return ((await res.json()) as { agent: AgentInfo }).agent;
}

/** Update an agent's identity (name/role/team) and/or persona/human block text. Returns the updated agent. */
export async function updateAgent(input: {
  agentId: string;
  name?: string;
  role?: string;
  team?: string;
  memory?: string;
  persona?: string;
  human?: string;
}): Promise<AgentInfo> {
  const res = await fetch("/api/agents", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "update", ...input }),
  });
  if (!res.ok) {
    const detail = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(detail.error ?? `update agent ${res.status}`);
  }
  return ((await res.json()) as { agent: AgentInfo }).agent;
}
