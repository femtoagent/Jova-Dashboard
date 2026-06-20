/**
 * The team network — Jova's "nervous system" view. A 4-tier graph:
 *   Nexus (hub)  →  Team "brain"  →  Agent (node-net)  →  Task (workflow step).
 * This file is the data shape only; the scene renders it and a driver animates it.
 */

export type AgentRole = "pm" | "developer" | "qa" | "devops" | "marketing" | "cx";

export interface AgentTask {
  id: string;
  title: string;
  /** steps taken so far — rendered as the LENGTH (segments) of this task's chain */
  steps: number;
}

export interface AgentNode {
  id: string;
  role: AgentRole;
  label: string;
  /** position relative to the team brain centre (world units) */
  offset: [number, number, number];
  /** deterministic seed for this agent's idle-chain layout */
  seed: number;
  /** active workflows — each renders as ONE dendrite chain; steps = chain length */
  tasks: AgentTask[];
  /** recently completed task titles (most recent first, capped) */
  recent: string[];
}

export interface TeamMetrics {
  /** all values are PER DAY; the panel multiplies by the selected window (1/3/7/30 days) */
  tokensIn: number;
  tokensOut: number;
  /** inference / API cost (USD/day) */
  tokenCost: number;
  /** budget agents spend on tools, designs, ads, etc. (USD/day) */
  productCost: number;
  /** earned from selling products (USD/day) */
  revenue: number;
}

/** An agent's proposed improvement awaiting the operator's sign-off. */
export interface Approval {
  id: string;
  agentId: string;
  agentLabel: string;
  text: string;
}

export interface Team {
  id: string;
  name: string;
  /** world position of the team "brain" */
  position: [number, number, number];
  /** hex colour for the brain glow + its strands/pulses */
  color: string;
  agents: AgentNode[];
  metrics: TeamMetrics;
  approvals: Approval[];
  /** how long the team has been live (days); deletable only while ≤ 3 */
  ageDays: number;
}

/**
 * A daily "if I could improve my team / product today, what would I do?" reflection — from a team's
 * PM, or network-wide from Nexus. Awaits the operator's Approve / Deny / Ask. Separate from the
 * operational Approval (which is for "may I run this command / install this").
 */
export interface Dream {
  id: string;
  /** the team whose PM dreamt this; null = a Nexus-level (network-wide) dream */
  teamId: string | null;
  /** display title — the team name, or "Nexus" */
  title: string;
  color: string;
  text: string;
}
