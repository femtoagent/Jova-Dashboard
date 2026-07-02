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
import { AgentsScreen } from "./AgentsScreen";
import { CreateAgentScreen } from "./CreateAgentScreen";
import { EditAgentScreen } from "./EditAgentScreen";
import { ChatScreen } from "./ChatScreen";
import { VoiceScreen } from "./VoiceScreen";
import { DisplayScreen } from "./DisplayScreen";
import { LlmPresetsScreen } from "./LlmPresetsScreen";
import { MemoryReviewScreen } from "./MemoryReviewScreen";
import { ScrollMore, useScrollMore } from "./ScrollMore";

/** Sits above drei's <Html> z-index range (~16.7M) so 3D labels/radial popups can't bleed through. */
const OVERLAY_Z = 2_000_000_000;

const AGENT_NAV: { key: AgentSection; label: string }[] = [
  { key: "identity", label: "Identity" },
  { key: "tools", label: "Tools" },
  { key: "skills", label: "Skills" },
  { key: "memory", label: "Memory" },
  { key: "access", label: "Access" },
];

/** Full-screen Settings/Admin overlay (classic 3D mode). Mounted always; renders null until opened. */
export function SettingsOverlay() {
  const open = useSettingsStore((s) => s.open);
  const closeSettings = useSettingsStore((s) => s.closeSettings);
  const downOnScrim = useRef(false);

  if (!open) return null;

  return (
    <div
      style={{ zIndex: OVERLAY_Z }}
      className="fixed inset-0 flex items-center justify-center bg-black/70 p-0 backdrop-blur-sm animate-[fade_200ms_ease] sm:p-4"
      onMouseDown={(e) => {
        downOnScrim.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (downOnScrim.current && e.target === e.currentTarget) closeSettings();
        downOnScrim.current = false;
      }}
    >
      {/* full-screen sheet on phones; floating modal from sm up */}
      <div className="relative flex h-dvh w-screen flex-col overflow-hidden bg-black/60 pt-[env(safe-area-inset-top)] text-white/85 shadow-[0_0_80px_rgba(0,180,255,0.08)] backdrop-blur-xl sm:h-[min(760px,92vh)] sm:w-[min(1040px,96vw)] sm:flex-row sm:rounded-2xl sm:border sm:border-white/10 sm:pt-0">
        <SettingsPanel />
      </div>
    </div>
  );
}

/**
 * The settings sheet itself — nav rail (horizontal chip row on phones) + the active screen.
 * Shared by the classic overlay above and the Default shell's Settings view. The parent
 * supplies the frame; this fills it. Escape closes wherever it's mounted.
 */
export function SettingsPanel() {
  const screen = useSettingsStore((s) => s.screen);
  const closeSettings = useSettingsStore((s) => s.closeSettings);
  // "▾ more" hint on the shared scroll container — covers every plain-flow screen. The two screens with
  // their own inner scroll (Logs, LLM Presets) are h-full here, so this container doesn't scroll for them
  // (no double hint); they carry their own via the same helper.
  const { scrollRef, more } = useScrollMore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSettings();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeSettings]);

  return (
    <>
      <button
        onClick={closeSettings}
        title="Close (Esc)"
        className="absolute right-2 top-[max(0.5rem,env(safe-area-inset-top))] z-10 grid h-9 w-9 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white/80 sm:right-3 sm:top-3 sm:h-8 sm:w-8"
      >
        ✕
      </button>
      {screen === "agent" ? <AgentNav /> : <TopNav />}

      <div className="relative flex min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {screen === "teams" && <TeamsAdmin />}
          {screen === "team" && <TeamEditor />}
          {screen === "agent" && <AgentEditor />}
          {screen === "logs" && <LogsScreen />}
          {screen === "history" && <HistoryScreen />}
          {screen === "nexus" && <NexusEditor />}
          {screen === "jova" && <JovaEditor />}
          {screen === "agents" && <AgentsScreen />}
          {screen === "agentCreate" && <CreateAgentScreen />}
          {screen === "agentEdit" && <EditAgentScreen />}
          {screen === "presets" && <LlmPresetsScreen />}
          {screen === "memoryReview" && <MemoryReviewScreen />}
          {screen === "chat" && <ChatScreen />}
          {screen === "voice" && <VoiceScreen />}
          {screen === "display" && <DisplayScreen />}
        </div>
        <ScrollMore show={more} />
      </div>
    </>
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
  const showAgents = useSettingsStore((s) => s.showAgents);
  const showChat = useSettingsStore((s) => s.showChat);
  const showVoice = useSettingsStore((s) => s.showVoice);
  const showPresets = useSettingsStore((s) => s.showPresets);
  const showMemoryReview = useSettingsStore((s) => s.showMemoryReview);
  const showDisplay = useSettingsStore((s) => s.showDisplay);
  // On the "just Jova" screen the network isn't loaded, so only her appearance editor applies.
  const fullMode = useJovaStore((s) => s.fullMode);
  return (
    <nav className="no-scrollbar flex w-full shrink-0 flex-row items-center gap-1 overflow-x-auto border-b border-white/10 p-2 pr-12 sm:w-[180px] sm:flex-col sm:items-stretch sm:overflow-visible sm:border-b-0 sm:border-r sm:p-3 sm:pr-3">
      <div className="mb-0 hidden px-2 text-[11px] font-semibold uppercase tracking-wider text-white/40 sm:mb-2 sm:block">Settings</div>
      {fullMode && <NavItem active={screen === "teams" || screen === "team"} onClick={showTeams} label="Teams" />}
      <NavItem active={screen === "jova"} onClick={showJova} label="Jova" />
      <NavItem active={screen === "display"} onClick={showDisplay} label="Display" />
      <NavItem active={screen === "chat"} onClick={showChat} label="Chat" />
      <NavItem active={screen === "voice"} onClick={showVoice} label="Voice" />
      <NavItem active={screen === "agents" || screen === "agentCreate" || screen === "agentEdit"} onClick={showAgents} label="Agents" />
      <NavItem active={screen === "presets"} onClick={showPresets} label="LLM Presets" />
      <NavItem active={screen === "memoryReview"} onClick={showMemoryReview} label="Memory" />

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
    <nav className="no-scrollbar flex w-full shrink-0 flex-row items-center gap-1 overflow-x-auto border-b border-white/10 p-2 pr-12 sm:w-[180px] sm:flex-col sm:items-stretch sm:overflow-visible sm:border-b-0 sm:border-r sm:p-3 sm:pr-3">
      <button
        onClick={showTeams}
        className="mb-0 shrink-0 self-auto whitespace-nowrap rounded px-1 text-[10px] font-semibold uppercase tracking-wider text-white/35 transition hover:text-white/60 sm:mb-0.5 sm:self-start"
      >
        ‹ Teams
      </button>
      <button
        onClick={() => team && showTeam(team.id)}
        title={team?.name}
        className="mb-0 max-w-28 shrink-0 truncate whitespace-nowrap rounded px-2 py-1 text-left text-[12px] text-white/65 transition hover:bg-white/10 sm:mb-1 sm:max-w-none"
      >
        ‹ {team?.name ?? "Team"}
      </button>
      <div className="mb-0 max-w-28 shrink-0 truncate px-2 text-sm font-semibold sm:mb-2 sm:max-w-none" style={{ color: team?.color ?? "#a5f3fc" }}>
        {agent?.label ?? "Agent"}
      </div>
      {AGENT_NAV.filter((s) => s.key !== "skills" || !agent || roleHasSkills(agent.role)).map((s) => (
        <button
          key={s.key}
          onClick={() => setAgentSection(s.key)}
          className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition ${
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
      className={`flex shrink-0 items-center justify-between gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm transition ${
        disabled ? "cursor-not-allowed text-white/25" : active ? "bg-white/10 text-white/90" : "text-white/60 hover:bg-white/10"
      }`}
    >
      <span>{label}</span>
      {badge && <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/40">{badge}</span>}
    </button>
  );
}
