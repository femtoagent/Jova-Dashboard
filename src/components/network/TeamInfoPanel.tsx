"use client";

import { useState } from "react";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { useSettingsStore } from "@/lib/settings/useSettingsStore";
import type { AgentNode, Team } from "@/lib/network/types";
import { WindowPills, MetricRows } from "./metrics";
import { scaleMetrics } from "@/lib/network/ledger";

/**
 * "Team HQ" — a glassy bottom-left card. Viewing only: agents, initiatives, metrics, approvals,
 * and Talk. Authoring identity (rename, add/remove agents, edit team) lives in the Settings
 * surface; the actions here deep-link into it. Hidden in the Nexus overview.
 */
export function TeamInfoPanel() {
  const team = useNetworkStore((s) => s.teams.find((c) => c.id === s.focusedTeamId) ?? null);
  const selectedAgentId = useNetworkStore((s) => s.selectedAgentId);
  const selectAgent = useNetworkStore((s) => s.selectAgent);
  if (!team) return null;

  const agent = selectedAgentId ? team.agents.find((a) => a.id === selectedAgentId) ?? null : null;

  return (
    <div
      className="fixed bottom-2 left-2 z-10 max-h-[44dvh] w-[min(320px,calc(100vw-100px))] overflow-y-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-white/85 backdrop-blur-xl animate-[fadein_300ms_ease] sm:bottom-5 sm:left-4 sm:max-h-[80vh] sm:w-[min(320px,82vw)]"
      style={{ boxShadow: `0 0 50px ${team.color}22` }}
    >
      {agent ? (
        <AgentDetail team={team} agent={agent} onBack={() => selectAgent(team.id, null)} />
      ) : (
        <TeamView team={team} onSelect={(id) => selectAgent(team.id, id)} />
      )}

      <p className="mt-3 text-[10px] leading-snug text-white/35">Click empty space to zoom out · click Jova to talk</p>
    </div>
  );
}

function TeamView({ team, onSelect }: { team: Team; onSelect: (agentId: string) => void }) {
  const resolveApproval = useNetworkStore((s) => s.resolveApproval);
  const metricsWindow = useNetworkStore((s) => s.metricsWindow);
  const openTeam = useSettingsStore((s) => s.openTeam);
  const [approvalsOpen, setApprovalsOpen] = useState(false);

  const pm = team.agents.find((a) => a.role === "pm");

  return (
    <>
      <Header team={team} />

      <button
        onClick={() => openTeam(team.id)}
        className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70 transition hover:bg-white/10"
      >
        ✎ Edit team identity
      </button>

      {/* financials — windowed (1D/3D/7D/1M/All) */}
      <WindowPills />
      <div className="mb-3">
        <MetricRows metrics={scaleMetrics(team.metrics, metricsWindow, team.ageDays)} />
      </div>

      {/* approvals — only shown when something needs sign-off */}
      {team.approvals.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-300/25 bg-amber-400/10">
          <button
            onClick={() => setApprovalsOpen((v) => !v)}
            className="flex w-full items-center justify-between px-2.5 py-1.5 text-[11px] text-amber-100/90"
          >
            <span>⚠ {team.approvals.length} need your sign-off</span>
            <span className="text-amber-100/50">{approvalsOpen ? "▾" : "▸"}</span>
          </button>
          {approvalsOpen && (
            <ul className="space-y-1.5 px-2.5 pb-2.5">
              {team.approvals.map((ap) => (
                <li key={ap.id} className="rounded-md bg-black/20 p-2">
                  <div className="text-[11px] text-white/80">{ap.text}</div>
                  <div className="mb-1.5 text-[9px] uppercase tracking-wide text-white/35">{ap.agentLabel}</div>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => resolveApproval(team.id, ap.id)}
                      className="rounded border border-emerald-300/30 bg-emerald-400/20 px-2 py-0.5 text-[10px] text-emerald-50 hover:bg-emerald-400/30"
                    >
                      Approve
                    </button>
                    <button
                      onClick={() => resolveApproval(team.id, ap.id)}
                      className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-white/60 hover:bg-white/10"
                    >
                      Dismiss
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {pm && pm.tasks.length > 0 && (
        <div className="mb-3">
          <Section label="Initiatives" />
          <ul className="space-y-0.5">
            {pm.tasks.map((t) => (
              <li key={t.id} className="truncate text-[11px] text-white/70">
                <span style={{ color: team.color }}>›</span> {t.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Section label="Agents" />
      <ul className="max-h-44 space-y-1 overflow-y-auto pr-1">
        {team.agents.map((a) => (
          <li key={a.id}>
            <button
              onClick={() => onSelect(a.id)}
              className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left text-xs transition hover:bg-white/10"
            >
              <span className="flex items-center gap-1.5">
                <Dot color={team.color} on={a.tasks.length > 0} />
                <span className={a.role === "pm" ? "font-medium text-white/90" : "text-white/75"}>{a.label}</span>
              </span>
              <span className="text-[10px] text-white/45">
                {a.tasks.length > 0 ? `${a.tasks.length} task${a.tasks.length === 1 ? "" : "s"}` : "idle"}
                <span className="ml-1 text-white/30">›</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function AgentDetail({ team, agent, onBack }: { team: Team; agent: AgentNode; onBack: () => void }) {
  const setTalkingAgent = useNetworkStore((s) => s.setTalkingAgent);
  const openChatWith = useJovaStore((s) => s.openChatWith);
  const openAgent = useSettingsStore((s) => s.openAgent);

  const talk = () => {
    setTalkingAgent(agent.id);
    openChatWith({ teamId: team.id, agentId: agent.id, teamName: team.name, label: agent.label, color: team.color });
  };

  return (
    <>
      <button onClick={onBack} className="mb-2 text-[11px] text-white/50 transition hover:text-white/80">
        ‹ {team.name}
      </button>

      <div className="mb-3 flex items-center gap-2">
        <Dot color={team.color} on={agent.tasks.length > 0} />
        <span className="flex-1 truncate text-sm font-semibold" style={{ color: team.color }}>
          {agent.label}
        </span>
        <button onClick={talk} title="Talk" className="rounded px-1.5 py-1 text-sm text-white/60 transition hover:bg-white/10">
          💬
        </button>
        <button onClick={() => openAgent(team.id, agent.id)} title="Edit identity" className="rounded px-1.5 py-1 text-sm text-white/60 transition hover:bg-white/10">
          ✎
        </button>
      </div>

      <Section label="Working on" />
      {agent.tasks.length > 0 ? (
        <ul className="mb-3 space-y-1">
          {agent.tasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate text-white/75">{t.title}</span>
              <span className="shrink-0 text-[10px] text-white/45">
                {t.steps} step{t.steps === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-[11px] text-white/40">Idle — no active workflows.</p>
      )}

      <Section label="Recently accomplished" />
      {agent.recent.length > 0 ? (
        <ul className="space-y-0.5">
          {agent.recent.map((title, i) => (
            <li key={i} className="truncate text-[11px] text-white/55">
              <span className="text-white/30">✓</span> {title}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-white/40">Nothing yet.</p>
      )}
    </>
  );
}

function Header({ team }: { team: Team }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Dot color={team.color} on glow />
      <span className="text-sm font-semibold tracking-wide" style={{ color: team.color }}>
        {team.name}
      </span>
      <span className="ml-auto text-[10px] uppercase tracking-wider text-white/40">{team.agents.length} agents</span>
    </div>
  );
}

function Section({ label }: { label: string }) {
  return <div className="mb-1 text-[10px] uppercase tracking-wider text-white/35">{label}</div>;
}

function Dot({ color, on, glow }: { color: string; on: boolean; glow?: boolean }) {
  return (
    <span
      className={`inline-block rounded-full ${glow ? "h-2.5 w-2.5" : "h-1.5 w-1.5"}`}
      style={{
        background: on ? color : "rgba(255,255,255,0.25)",
        boxShadow: on ? `0 0 ${glow ? 10 : 8}px ${color}` : "none",
      }}
    />
  );
}
