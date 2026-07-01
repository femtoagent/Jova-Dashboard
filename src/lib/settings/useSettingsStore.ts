"use client";

import { create } from "zustand";
import { useNetworkStore } from "@/lib/network/useNetworkStore";

/** Which settings screen is showing. */
export type SettingsScreen =
  | "teams"
  | "team"
  | "agent"
  | "logs"
  | "history"
  | "nexus"
  | "jova"
  | "agents"
  | "agentCreate"
  | "agentEdit"
  | "chat"
  | "voice"
  | "presets"
  | "memoryReview";

/** Sections of the per-agent screen (its own left-nav while drilled into an agent). */
export type AgentSection = "identity" | "tools" | "skills" | "memory" | "access";

interface SettingsState {
  open: boolean;
  screen: SettingsScreen;
  /** team in focus for the team/agent screens */
  teamId: string | null;
  /** agent in focus for the (network) agent screen */
  agentId: string | null;
  /** which section of the agent screen is showing */
  agentSection: AgentSection;
  /** the real Letta agent id being edited in the agentEdit screen */
  focusAgentId: string | null;

  openSettings: (screen?: SettingsScreen) => void;
  closeSettings: () => void;
  showTeams: () => void;
  showLogs: () => void;
  showHistory: () => void;
  showNexus: () => void;
  showJova: () => void;
  showAgents: () => void;
  showChat: () => void;
  showVoice: () => void;
  showPresets: () => void;
  showMemoryReview: () => void;
  /** open the Create-agent screen (rail kept) */
  showAgentCreate: () => void;
  /** open the Edit screen for a real Letta agent (rail kept) */
  showAgentEdit: (agentId: string) => void;
  showTeam: (teamId: string) => void;
  /** open a blank Team editor in create mode (no team exists until the user saves) */
  showNewTeam: () => void;
  showAgent: (teamId: string, agentId: string) => void;
  setAgentSection: (section: AgentSection) => void;
  /** open the overlay straight to a team's editor (also focuses the team in the scene) */
  openTeam: (teamId: string) => void;
  /** open the overlay straight to an agent's editor (also focuses the team in the scene) */
  openAgent: (teamId: string, agentId: string) => void;
  /** step back one level; from the teams root, close the overlay */
  back: () => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  open: false,
  screen: "teams",
  teamId: null,
  agentId: null,
  agentSection: "identity",
  focusAgentId: null,

  openSettings: (screen = "teams") => set({ open: true, screen, teamId: null, agentId: null }),
  closeSettings: () => set({ open: false }),
  showTeams: () => set({ screen: "teams" }),
  showLogs: () => set({ screen: "logs" }),
  showHistory: () => set({ screen: "history" }),
  showNexus: () => set({ screen: "nexus" }),
  showJova: () => set({ screen: "jova" }),
  showAgents: () => set({ screen: "agents" }),
  showChat: () => set({ screen: "chat" }),
  showVoice: () => set({ screen: "voice" }),
  showPresets: () => set({ screen: "presets" }),
  showMemoryReview: () => set({ screen: "memoryReview" }),
  showAgentCreate: () => set({ screen: "agentCreate", focusAgentId: null }),
  showAgentEdit: (agentId) => set({ screen: "agentEdit", focusAgentId: agentId }),
  showTeam: (teamId) => set({ screen: "team", teamId, agentId: null }),
  showNewTeam: () => set({ screen: "team", teamId: null, agentId: null }),
  showAgent: (teamId, agentId) => set({ screen: "agent", teamId, agentId, agentSection: "identity" }),
  setAgentSection: (section) => set({ agentSection: section }),
  openTeam: (teamId) => {
    useNetworkStore.getState().focusTeam(teamId);
    set({ open: true, screen: "team", teamId, agentId: null });
  },
  openAgent: (teamId, agentId) => {
    // also select in the scene, so closing Settings returns to this agent's detail (not the roster)
    useNetworkStore.getState().selectAgent(teamId, agentId);
    set({ open: true, screen: "agent", teamId, agentId, agentSection: "identity" });
  },
  back: () =>
    set((st) =>
      st.screen === "agent"
        ? { screen: "team" }
        : st.screen === "team"
          ? { screen: "teams" }
          : st.screen === "agentCreate" || st.screen === "agentEdit"
            ? { screen: "agents" }
            : { open: false }
    ),
}));

// Dev convenience: poke the settings nav from the browser console.
if (typeof window !== "undefined") {
  (window as unknown as { __settingsStore?: typeof useSettingsStore }).__settingsStore = useSettingsStore;
}
