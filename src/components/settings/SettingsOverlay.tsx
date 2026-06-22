"use client";

import { useEffect, useRef } from "react";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { useSettingsStore, type AgentSection } from "@/lib/settings/useSettingsStore";
import { roleHasSkills } from "@/lib/settings/options";
import { TeamsAdmin } from "./TeamsAdmin";
import { TeamEditor } from "./TeamEditor";
import { AgentEditor } from "./AgentEditor";
import { LogsScreen } from "./LogsScreen";
import { HistoryScreen } from "./HistoryScreen";
import { NexusEditor } from "./NexusEditor";
import { JovaEditor } from "./JovaEditor";

/** Sits above drei's <Html> z-index range (~16.7M) so 3D labels/radial popups can't bleed through. */
const OVERLAY_Z = 2_000_000_000;

const AGENT_NAV: { key: AgentSection; label: string }[] = [
  { key: "identity", label: "Identity" },
  { key: "tools", label: "Tools" },
  { key: "skills", label: "Skills" },
  { key: "memory", label: "Memory" },
  { key: "access", label: "Access" },
];

/** Full-screen Settings/Admin overlay. Mounted always; renders null until opened. */
export function SettingsOverlay() {
  const open = useSettingsStore((s) => s.open);
  const screen = useSettingsStore((s) => s.screen);
  const closeSettings = useSettingsStore((s) => s.closeSettings);
  const downOnScrim = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSettings();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeSettings]);

  if (!open) return null;

  return (
    <div
      style={{ zIndex: OVERLAY_Z }}
      className="fixed inset-0 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-[fade_200ms_ease]"
      onMouseDown={(e) => {
        downOnScrim.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (downOnScrim.current && e.target === e.currentTarget) closeSettings();
        downOnScrim.current = false;
      }}
    >
      <div className="flex h-[min(760px,92vh)] w-[min(1040px,96vw)] overflow-hidden rounded-2xl border border-white/10 bg-black/60 text-white/85 shadow-[0_0_80px_rgba(0,180,255,0.08)] backdrop-blur-xl">
        {screen === "agent" ? <AgentNav /> : <TopNav />}

        <div className="relative flex min-w-0 flex-1 flex-col">
          <button
            onClick={closeSettings}
            title="Close (Esc)"
            className="absolute right-3 top-3 z-10 rounded-lg px-2 py-1 text-white/50 transition hover:bg-white/10 hover:text-white/80"
          >
            ✕
          </button>
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {screen === "teams" && <TeamsAdmin />}
            {screen === "team" && <TeamEditor />}
            {screen === "agent" && <AgentEditor />}
            {screen === "logs" && <LogsScreen />}
            {screen === "history" && <HistoryScreen />}
            {screen === "nexus" && <NexusEditor />}
            {screen === "jova" && <JovaEditor />}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Top-level nav (Teams / Logs / Chat history). */
function TopNav() {
  const screen = useSettingsStore((s) => s.screen);
  const showTeams = useSettingsStore((s) => s.showTeams);
  const showLogs = useSettingsStore((s) => s.showLogs);
  const showHistory = useSettingsStore((s) => s.showHistory);
  const showNexus = useSettingsStore((s) => s.showNexus);
  const showJova = useSettingsStore((s) => s.showJova);
  // On the "just Jova" screen the network isn't loaded, so only her appearance editor applies.
  const fullMode = useJovaStore((s) => s.fullMode);
  return (
    <nav className="flex w-[132px] shrink-0 flex-col gap-1 border-r border-white/10 p-3 sm:w-[180px]">
      <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-white/40">Settings</div>
      {fullMode && <NavItem active={screen === "teams" || screen === "team"} onClick={showTeams} label="Teams" />}
      <NavItem active={screen === "jova"} onClick={showJova} label="Jova" />
      {fullMode && <NavItem active={screen === "nexus"} onClick={showNexus} label="Nexus" />}
      {fullMode && <NavItem active={screen === "logs"} onClick={showLogs} label="Logs" />}
      {fullMode && <NavItem active={screen === "history"} onClick={showHistory} label="Chat history" />}
    </nav>
  );
}

/** Agent-scoped nav — replaces the top-level nav while drilled into an agent. */
function AgentNav() {
  const teamId = useSettingsStore((s) => s.teamId);
  const agentId = useSettingsStore((s) => s.agentId);
  const section = useSettingsStore((s) => s.agentSection);
  const setAgentSection = useSettingsStore((s) => s.setAgentSection);
  const showTeam = useSettingsStore((s) => s.showTeam);
  const showTeams = useSettingsStore((s) => s.showTeams);
  const team = useNetworkStore((s) => s.teams.find((t) => t.id === teamId) ?? null);
  const agent = team?.agents.find((a) => a.id === agentId) ?? null;

  return (
    <nav className="flex w-[132px] shrink-0 flex-col gap-1 border-r border-white/10 p-3 sm:w-[180px]">
      <button
        onClick={showTeams}
        className="mb-0.5 self-start rounded px-1 text-[10px] font-semibold uppercase tracking-wider text-white/35 transition hover:text-white/60"
      >
        ‹ Teams
      </button>
      <button
        onClick={() => team && showTeam(team.id)}
        title={team?.name}
        className="mb-1 truncate rounded px-2 py-1 text-left text-[12px] text-white/65 transition hover:bg-white/10"
      >
        ‹ {team?.name ?? "Team"}
      </button>
      <div className="mb-2 truncate px-2 text-sm font-semibold" style={{ color: team?.color ?? "#a5f3fc" }}>
        {agent?.label ?? "Agent"}
      </div>
      {AGENT_NAV.filter((s) => s.key !== "skills" || !agent || roleHasSkills(agent.role)).map((s) => (
        <button
          key={s.key}
          onClick={() => setAgentSection(s.key)}
          className={`rounded-lg px-3 py-2 text-left text-sm transition ${
            section === s.key ? "bg-white/10 text-white/90" : "text-white/60 hover:bg-white/10"
          }`}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}

function NavItem({
  active,
  disabled,
  onClick,
  label,
  badge,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  label: string;
  badge?: string;
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${
        disabled ? "cursor-not-allowed text-white/25" : active ? "bg-white/10 text-white/90" : "text-white/60 hover:bg-white/10"
      }`}
    >
      <span>{label}</span>
      {badge && <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/40">{badge}</span>}
    </button>
  );
}
