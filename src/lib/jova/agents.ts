/**
 * Client → BFF helpers for per-agent preset routing. The browser only calls our own /api/agents
 * route; the Letta bearer token lives server-side. Mirrors PresetSummary's slug values.
 */

export interface AgentInfo {
  id: string;
  name: string;
  /** preset slug this agent routes to, or "" for the default. */
  preset: string;
}

/** List real agents with the preset each routes through. */
export async function listAgents(): Promise<AgentInfo[]> {
  const res = await fetch("/api/agents", { cache: "no-store" });
  if (!res.ok) throw new Error(`agents ${res.status}`);
  return ((await res.json()) as { agents?: AgentInfo[] }).agents ?? [];
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
