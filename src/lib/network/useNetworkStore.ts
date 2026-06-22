"use client";

import { create } from "zustand";
import type { AccessGrant, AgentNode, AgentRole, Approval, Dream, MemoryNode, Team, TeamMetrics } from "./types";
import { useJovaStore } from "@/lib/state/useJovaStore";

/** Fallback origin for the team strands until NexusViz publishes its real crown world position.
 *  Matches NexusViz's crown ([0,-3,-22] + CROWN_LOCAL 1.6 * scale 3) so there's no first-frame pop. */
export const NEXUS_HUB: [number, number, number] = [0, 1.8, -22];

export type MetricsWindow = 1 | 3 | 7 | 30 | "all";

const NEW_NAMES = ["Vertex", "Quill", "Nova", "Onyx", "Pulse", "Cobalt", "Ember", "Sable", "Lumen", "Apex", "Rune", "Talon"];
const PALETTE = ["#ffb05f", "#ff6f91", "#9bff5f", "#7fd6ff", "#d68cff", "#ffe06a", "#5fffd0", "#ff8f5f"];

/**
 * A RANDOM canopy position that won't land in Nexus's silhouette (Nexus ≈ x[-7.2,7.2], y[-3,15.2]).
 * A team must be either off to a side (|x| ≥ 10) OR above the crown (y ≥ 18) — never centred-and-low
 * (which would render occluded behind Nexus). Also keeps spacing from existing teams. Random so
 * the network feels organic, not gridded.
 */
function randomTeamPosition(existing: Team[]): [number, number, number] {
  for (let tries = 0; tries < 80; tries++) {
    const x = (Math.random() * 2 - 1) * 32; // -32..32
    const y = 12 + Math.random() * 26; // 12..38
    const z = -30 - Math.random() * 34; // -30..-64
    if (Math.abs(x) < 10 && y < 18) continue; // would sit behind / over Nexus
    const tooClose = existing.some((c) => {
      const dx = c.position[0] - x, dy = c.position[1] - y, dz = c.position[2] - z;
      return dx * dx + dy * dy + dz * dz < 12 * 12;
    });
    if (tooClose) continue;
    return [x, y, z];
  }
  // fallback: high and to a side
  const side = Math.random() < 0.5 ? -1 : 1;
  return [side * (14 + Math.random() * 16), 22 + Math.random() * 14, -34 - Math.random() * 26];
}

/** Lay out a team's agents on an even, camera-facing ring (PM at top) so none overlap. */
function layoutAgents(agents: AgentNode[]): AgentNode[] {
  const n = agents.length;
  agents.forEach((a, i) => {
    const ang = (i / n) * Math.PI * 2 + Math.PI / 2; // PM (index 0) sits at the top
    const rad = 1.15;
    a.offset = [Math.cos(ang) * rad, Math.sin(ang) * rad * 0.8, a.role === "pm" ? 0.4 : 0.1];
  });
  return agents;
}

let agentSeed = 1;
const ROLE_TRAIT: Record<AgentRole, string> = {
  pm: "Owns the roadmap",
  developer: "Ships the build",
  qa: "Guards quality",
  devops: "Keeps it running",
  marketing: "Tells the story",
  cx: "Speaks for the users",
};
/** A small seeded memory web so every agent has something to show in the (read-only) memory view. */
function mockMemory(role: AgentRole, label: string): MemoryNode[] {
  return [
    { id: "core", label: `${label} — identity`, kind: "persona_core", links: ["human", "role"] },
    { id: "human", label: "Operator", kind: "human", links: ["core"] },
    { id: "role", label: ROLE_TRAIT[role], kind: "fact", links: ["core", "growth"] },
    { id: "growth", label: "Lessons so far", kind: "persona_growth", links: ["role"] },
  ];
}

let accessSeed = 1;
const newAccessId = () => `acc-${accessSeed++}`;
/** A seeded access grant so the Access view isn't empty (secret masked; demo only). */
function mockAccess(): AccessGrant[] {
  return [{ id: newAccessId(), app: "OpenRouter", keyHint: "sk-or-••••a1b2" }];
}
function agent(role: AgentRole, label: string): AgentNode {
  return {
    id: `${role}-${agentSeed}`,
    role,
    label,
    offset: [0, 0, 0],
    seed: agentSeed++ * 97 + 13,
    tasks: [],
    recent: [],
    client: "letta",
    openRouterPreset: "",
    soul: "",
    tools: [],
    skills: [],
    memory: mockMemory(role, label),
    access: mockAccess(),
  };
}

let taskCounter = 1;
const newTaskId = () => `task-${taskCounter++}`;
let approvalCounter = 1;
const newApprovalId = () => `appr-${approvalCounter++}`;
let teamIdCounter = 100;
let addedCount = 0; // monotonic — keeps added teams' names/colours unique across add/remove churn
let dreamCounter = 1;
const newDreamId = () => `dream-${dreamCounter++}`;

/** Mock dream text (until the daily cron prompts real PMs / Nexus in Step B). */
const TEAM_DREAMS = [
  "Pair the QA and Dev agents on a shared test harness",
  "Spin up a second marketing agent for paid social",
  "Add a nightly self-review of yesterday's tickets",
  "Carve the API into two focused services",
  "Give CX a draft-replies co-pilot",
  "Auto-summarize each shipped feature for the changelog",
];
const NEXUS_DREAMS = [
  "Stand up a shared design-system team every product can pull from",
  "Rebalance budget from ad spend toward infra reliability",
  "Form a cross-team tiger squad for the recurring outage class",
  "Create a weekly demo where teams show what they shipped",
];

function team(
  id: string,
  name: string,
  position: [number, number, number],
  color: string,
  agents: AgentNode[],
  metrics: TeamMetrics,
  ageDays: number,
  approvals: Approval[] = []
): Team {
  return { id, name, position, color, agents: layoutAgents(agents), metrics, approvals, ageDays, mission: "", solvingFor: "" };
}

/** Teams float high/far on a randomly-feeling canopy; strands rise to them from Nexus's crown. */
function seed(): Team[] {
  const forge = [agent("pm", "Product Manager"), agent("developer", "Developer"), agent("qa", "QA / DevOps")];
  const beacon = [agent("pm", "Product Manager"), agent("marketing", "Marketing"), agent("cx", "Customer Experience")];
  const atlas = [agent("pm", "Product Manager"), agent("devops", "DevOps"), agent("developer", "Developer")];
  const halo = [
    agent("pm", "Product Manager"),
    agent("cx", "Customer Experience"),
    agent("marketing", "Marketing"),
    agent("developer", "Developer"),
  ];
  return [
    team("forge", "Forge", [-28, 21, -42], "#29e0d6", forge,
      { tokensIn: 184000, tokensOut: 92000, tokenCost: 4.1, productCost: 2.5, revenue: 9.0 }, 30,
      [{ id: newApprovalId(), agentId: forge[1]!.id, agentLabel: forge[1]!.label, text: "Adopt a Redis cache to cut p95 latency ~30%" }]),
    team("beacon", "Beacon", [26, 26, -50], "#5fb6ff", beacon,
      { tokensIn: 96000, tokensOut: 51000, tokenCost: 2.05, productCost: 1.2, revenue: 5.5 }, 12),
    team("atlas", "Atlas", [-9, 34, -64], "#b98cff", atlas,
      { tokensIn: 240000, tokensOut: 130000, tokenCost: 6.4, productCost: 4.0, revenue: 11.0 }, 45),
    team("halo", "Halo", [22, 18, -36], "#46f0a0", halo,
      { tokensIn: 142000, tokensOut: 78000, tokenCost: 3.25, productCost: 1.8, revenue: 7.2 }, 8),
  ];
}

/** One dream per team (its PM) + one Nexus dream. Deterministic for the seed so it's stable. */
function makeDreams(teams: Team[]): Dream[] {
  const ds: Dream[] = teams.map((t, i) => ({
    id: newDreamId(),
    teamId: t.id,
    title: t.name,
    color: t.color,
    text: TEAM_DREAMS[i % TEAM_DREAMS.length] ?? "Improve the team",
  }));
  ds.push({ id: newDreamId(), teamId: null, title: "Nexus", color: "#9fe8ff", text: NEXUS_DREAMS[0] ?? "Improve the network" });
  return ds;
}

const SEED_TEAMS = seed();

function updateAgent(teams: Team[], teamId: string, agentId: string, fn: (a: AgentNode) => AgentNode): Team[] {
  return teams.map((c) =>
    c.id !== teamId ? c : { ...c, agents: c.agents.map((a) => (a.id !== agentId ? a : fn(a))) }
  );
}
function updateTeam(teams: Team[], teamId: string, fn: (c: Team) => Team): Team[] {
  return teams.map((c) => (c.id !== teamId ? c : fn(c)));
}

interface NetworkState {
  teams: Team[];
  focusedTeamId: string | null;
  selectedAgentId: string | null;
  /** the agent currently "talking" (e.g. after you Ask a dream) — its orb animates. */
  talkingAgentId: string | null;
  /** which agent's radial action menu is open (from clicking its orb); null = none. */
  radialAgentId: string | null;
  /** which team's brain radial menu is open (from clicking its brain while focused); null = none. */
  radialTeamId: string | null;
  /** which team is currently being dragged (overview reposition); freezes camera parallax. null = none. */
  draggingTeamId: string | null;
  /** PM/Nexus daily improvement ideas awaiting your response (separate from operational approvals). */
  dreams: Dream[];
  /** world position the team strands emanate from — Nexus's crown (published by NexusViz on mount). */
  nexusHub: [number, number, number];
  /** shared time window for all financial metrics (team + Nexus rollup). */
  metricsWindow: MetricsWindow;

  focusTeam: (id: string | null) => void;
  selectAgent: (teamId: string, agentId: string | null) => void;
  setMetricsWindow: (w: MetricsWindow) => void;
  startTask: (teamId: string, agentId: string, title: string) => void;
  advanceTask: (teamId: string, agentId: string, taskId: string) => void;
  completeTask: (teamId: string, agentId: string, taskId: string) => void;
  addAgent: (teamId: string, role: AgentRole, label: string) => string | null;
  removeAgent: (teamId: string, agentId: string) => void;
  /** create a team (optionally with identity); returns the new team id */
  createTeam: (input?: { name?: string; mission?: string; solvingFor?: string }) => string;
  /** edit a team's identity (name / mission / what they're solving for) */
  updateTeam: (teamId: string, patch: { name?: string; mission?: string; solvingFor?: string }) => void;
  /** edit an agent's identity; a label change also syncs open chat threads */
  updateAgent: (
    teamId: string,
    agentId: string,
    patch: Partial<Pick<AgentNode, "label" | "client" | "openRouterPreset" | "soul" | "tools" | "skills">>
  ) => void;
  /** add an app / API-key grant to an agent (caller passes an already-masked keyHint, never the secret) */
  addAccess: (teamId: string, agentId: string, app: string, keyHint?: string) => void;
  /** remove an access grant */
  removeAccess: (teamId: string, agentId: string, grantId: string) => void;
  removeTeam: (teamId: string) => void;
  addApproval: (teamId: string, agentId: string, agentLabel: string, text: string) => void;
  resolveApproval: (teamId: string, approvalId: string) => void;
  runDreams: () => void;
  resolveDream: (dreamId: string) => void;
  askDream: (dreamId: string) => void;
  setTalkingAgent: (agentId: string | null) => void;
  setRadialAgent: (agentId: string | null) => void;
  setRadialTeam: (teamId: string | null) => void;
  /** move a team's brain in world space (drag-to-organize at the Nexus overview) */
  setTeamPosition: (teamId: string, position: [number, number, number]) => void;
  setDraggingTeam: (teamId: string | null) => void;
  setNexusHub: (p: [number, number, number]) => void;
}

export const useNetworkStore = create<NetworkState>((set, get) => ({
  teams: SEED_TEAMS,
  focusedTeamId: null,
  selectedAgentId: null,
  talkingAgentId: null,
  radialAgentId: null,
  radialTeamId: null,
  draggingTeamId: null,
  dreams: makeDreams(SEED_TEAMS),
  nexusHub: NEXUS_HUB,
  metricsWindow: 1,

  focusTeam: (id) => set({ focusedTeamId: id, selectedAgentId: null, talkingAgentId: null, radialAgentId: null, radialTeamId: null }),
  selectAgent: (teamId, agentId) => set({ focusedTeamId: teamId, selectedAgentId: agentId, talkingAgentId: null, radialAgentId: null, radialTeamId: null }),
  setMetricsWindow: (w) => set({ metricsWindow: w }),

  startTask: (teamId, agentId, title) =>
    set((st) => ({
      teams: updateAgent(st.teams, teamId, agentId, (a) =>
        a.tasks.length >= 3 ? a : { ...a, tasks: [...a.tasks, { id: newTaskId(), title, steps: 1 }] }
      ),
    })),

  advanceTask: (teamId, agentId, taskId) =>
    set((st) => ({
      teams: updateAgent(st.teams, teamId, agentId, (a) => ({
        ...a,
        tasks: a.tasks.map((t) => (t.id !== taskId ? t : { ...t, steps: Math.min(t.steps + 1, 6) })),
      })),
    })),

  completeTask: (teamId, agentId, taskId) =>
    set((st) => ({
      teams: updateAgent(st.teams, teamId, agentId, (a) => {
        const done = a.tasks.find((t) => t.id === taskId);
        return {
          ...a,
          tasks: a.tasks.filter((t) => t.id !== taskId),
          recent: done ? [done.title, ...a.recent].slice(0, 5) : a.recent,
        };
      }),
    })),

  addAgent: (teamId, role, label) => {
    const t = get().teams.find((c) => c.id === teamId);
    if (!t) return null;
    if (role === "pm" && t.agents.some((a) => a.role === "pm")) return null; // one PM per team
    // make the name unique within the team (Developer, Developer 2, Developer 3…)
    const n = t.agents.filter((a) => a.label === label || a.label.startsWith(`${label} `)).length;
    const finalLabel = n === 0 ? label : `${label} ${n + 1}`;
    const created = agent(role, finalLabel);
    set((st) => ({
      teams: updateTeam(st.teams, teamId, (c) => ({ ...c, agents: layoutAgents([...c.agents, created]) })),
    }));
    return created.id;
  },

  removeAgent: (teamId, agentId) => {
    const t = get().teams.find((c) => c.id === teamId);
    const target = t?.agents.find((a) => a.id === agentId);
    if (!target || target.role === "pm") return; // the PM can't be removed
    set((st) => ({
      teams: updateTeam(st.teams, teamId, (c) => ({ ...c, agents: layoutAgents(c.agents.filter((a) => a.id !== agentId)) })),
      selectedAgentId: st.selectedAgentId === agentId ? null : st.selectedAgentId,
    }));
    // close any open chat threads with this agent so they don't orphan
    useJovaStore.getState().closeConversation(teamId, agentId);
  },

  createTeam: (input) => {
    const k = addedCount++;
    const id = `co-${teamIdCounter++}`;
    const name = input?.name?.trim() || NEW_NAMES[k % NEW_NAMES.length] || `Team ${k + 1}`;
    const color = PALETTE[k % PALETTE.length] ?? "#9fe8ff";
    set((st) => {
      const co = team(
        id,
        name,
        randomTeamPosition(st.teams),
        color,
        [agent("pm", "Product Manager"), agent("developer", "Developer")],
        { tokensIn: 20000, tokensOut: 9000, tokenCost: 0.4, productCost: 0.2, revenue: 0 },
        0
      );
      co.mission = input?.mission ?? "";
      co.solvingFor = input?.solvingFor ?? "";
      return { teams: [...st.teams, co], focusedTeamId: id, selectedAgentId: null };
    });
    return id;
  },

  updateTeam: (teamId, patch) =>
    set((st) => ({ teams: updateTeam(st.teams, teamId, (c) => ({ ...c, ...patch })) })),

  updateAgent: (teamId, agentId, patch) => {
    set((st) => ({ teams: updateAgent(st.teams, teamId, agentId, (a) => ({ ...a, ...patch })) }));
    // a label change must propagate to any open chat threads (header, rail, composer, titles)
    if (patch.label) useJovaStore.getState().renameTarget(teamId, agentId, patch.label);
  },

  addAccess: (teamId, agentId, app, keyHint) =>
    set((st) => ({
      teams: updateAgent(st.teams, teamId, agentId, (a) => ({
        ...a,
        access: [...(a.access ?? []), { id: newAccessId(), app, keyHint }],
      })),
    })),

  removeAccess: (teamId, agentId, grantId) =>
    set((st) => ({
      teams: updateAgent(st.teams, teamId, agentId, (a) => ({
        ...a,
        access: (a.access ?? []).filter((g) => g.id !== grantId),
      })),
    })),

  removeTeam: (teamId) => {
    const c = get().teams.find((x) => x.id === teamId);
    if (!c || c.ageDays > 3) return; // only young teams (≤3 days) can be deleted
    set((st) => ({
      teams: st.teams.filter((x) => x.id !== teamId),
      focusedTeamId: st.focusedTeamId === teamId ? null : st.focusedTeamId,
      selectedAgentId: st.focusedTeamId === teamId ? null : st.selectedAgentId,
    }));
    // close any open chat threads with this team's agents
    for (const a of c.agents) useJovaStore.getState().closeConversation(teamId, a.id);
  },

  addApproval: (teamId, agentId, agentLabel, text) =>
    set((st) => ({
      teams: updateTeam(st.teams, teamId, (c) =>
        c.approvals.length >= 3 ? c : { ...c, approvals: [...c.approvals, { id: newApprovalId(), agentId, agentLabel, text }] }
      ),
    })),

  resolveApproval: (teamId, approvalId) =>
    set((st) => ({ teams: updateTeam(st.teams, teamId, (c) => ({ ...c, approvals: c.approvals.filter((a) => a.id !== approvalId) })) })),

  runDreams: () =>
    set((st) => ({
      dreams: [
        ...st.teams.map((t) => ({
          id: newDreamId(),
          teamId: t.id,
          title: t.name,
          color: t.color,
          text: TEAM_DREAMS[Math.floor(Math.random() * TEAM_DREAMS.length)] ?? "Improve the team",
        })),
        { id: newDreamId(), teamId: null, title: "Nexus", color: "#9fe8ff", text: NEXUS_DREAMS[Math.floor(Math.random() * NEXUS_DREAMS.length)] ?? "Improve the network" },
      ],
    })),

  resolveDream: (dreamId) => set((st) => ({ dreams: st.dreams.filter((d) => d.id !== dreamId) })),

  askDream: (dreamId) =>
    set((st) => {
      const d = st.dreams.find((x) => x.id === dreamId);
      if (!d || !d.teamId) return {}; // Nexus dream → the caller just opens chat at the overview
      const team = st.teams.find((x) => x.id === d.teamId);
      const pm = team?.agents.find((a) => a.role === "pm");
      if (!team || !pm) return {};
      return { focusedTeamId: team.id, selectedAgentId: pm.id, talkingAgentId: pm.id };
    }),

  setTalkingAgent: (agentId) => set({ talkingAgentId: agentId }),

  setRadialAgent: (agentId) => set({ radialAgentId: agentId, radialTeamId: null }),

  setRadialTeam: (teamId) => set({ radialTeamId: teamId, radialAgentId: null }),

  setTeamPosition: (teamId, position) => set((st) => ({ teams: updateTeam(st.teams, teamId, (c) => ({ ...c, position })) })),

  setDraggingTeam: (teamId) => set({ draggingTeamId: teamId }),

  setNexusHub: (p) => set({ nexusHub: p }),
}));

// Dev convenience: poke the network from the browser console.
if (typeof window !== "undefined") {
  (window as unknown as { __networkStore?: typeof useNetworkStore }).__networkStore = useNetworkStore;
}
