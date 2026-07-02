/**
 * The team network — Jova's "nervous system" view. A 4-tier graph:
 *   Nexus (hub)  →  Team "brain"  →  Agent (node-net)  →  Task (workflow step).
 * This file is the data shape only; the scene renders it and a driver animates it.
 */

export type AgentRole = "pm" | "developer" | "qa" | "devops" | "marketing" | "cx";

/** The backend "client" an agent runs on. Net-new; today everything is mock/Letta. */
export type AgentClient = "hermes" | "letta" | "openclaw";

/**
 * An app / API key the agent has access to. The real secret is NEVER stored client-side — only a
 * masked hint + what it's for. (When the backend lands, the secret lives in a server-side vault.)
 */
export interface AccessGrant {
  id: string;
  /** the app / service this connects to — i.e. what the key is for */
  app: string;
  /** masked hint of the key (e.g. "sk-…a1b2"); absent = an app linked without a key */
  keyHint?: string;
}

/**
 * One node in an agent's read-only "memory web" (display-only for now). Future-maps to Letta
 * memory blocks: persona_core / persona_growth / human / affect, plus free-form facts.
 */
export interface MemoryNode {
  id: string;
  label: string;
  kind: "persona_core" | "persona_growth" | "human" | "affect" | "fact";
  /** ids of related nodes — undirected links for the web layout */
  links: string[];
}

export interface AgentTask {
  id: string;
  title: string;
  /** steps taken so far — rendered as the LENGTH (segments) of this task's chain */
  steps: number;
  /** who handed this work over (assigner / upstream agent); null|undefined = Nexus / self-started.
   *  The Team Room renders this as the sheet's provenance stamp (sender color + glyph). */
  fromAgentId?: string | null;
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

  // ---- identity (authored in the Settings → Agent editor; all optional, defaulted in the factory) ----
  /** which backend client this agent runs on */
  client?: AgentClient;
  /** OpenRouter routing preset id (free text until the server supplies a real list) */
  openRouterPreset?: string;
  /** the agent's persona prose — can be authored by Nexus from a prompt */
  soul?: string;
  /** tool names this agent may use */
  tools?: string[];
  /** skills (role-dependent) */
  skills?: string[];
  /** read-only memory web (display only for now) */
  memory?: MemoryNode[];
  /** apps / API keys this agent has access to (secrets masked) */
  access?: AccessGrant[];
  /** Team Room character id (see lib/agents/roomCharacters); unset = the role's default */
  character?: string;
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

  // ---- identity (authored in the Settings → Team editor; optional, defaulted to "") ----
  /** the team's mission statement */
  mission?: string;
  /** what the team is solving for */
  solvingFor?: string;
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

/**
 * A moment of work moving between agents — a PM assigning a task, or an agent handing its
 * output downstream. Transient: the Team Room animates it (a document flying desk-to-desk,
 * stamped with the sender's identity) and then clears it. Bounded + auto-expiring in the store.
 */
export interface FlowEvent {
  id: string;
  teamId: string;
  /** the sender; null = spawned by Nexus / no visible sender */
  fromAgentId: string | null;
  toAgentId: string;
  /** the task this flow created on the target (lets the landed sheet keep sender identity) */
  taskId: string;
  taskTitle: string;
  kind: "assign" | "handoff";
  ts: number;
}

/** Something a team wants to SHOW the operator — surfaces on the Team Room's demo board. */
export interface Demo {
  id: string;
  teamId: string;
  title: string;
  description: string;
  /** http(s) link opens in a new tab; a vault-relative path opens in the DocPanel */
  url: string;
}
