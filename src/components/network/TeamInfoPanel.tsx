"use client";

import { useState } from "react";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import type { AgentNode, AgentRole, Team } from "@/lib/network/types";
import { WindowPills, MetricRows } from "./metrics";
import { scaleMetrics } from "@/lib/network/ledger";

const ROLE_LABEL: Record<string, string> = {
  pm: "Product Manager",
  developer: "Developer",
  qa: "QA / DevOps",
  devops: "DevOps",
  marketing: "Marketing",
  cx: "Customer Experience",
};

// roles you can add (one PM per team, so it's not offered here)
const ADDABLE: { role: AgentRole; label: string }[] = [
  { role: "developer", label: "Developer" },
  { role: "qa", label: "QA / DevOps" },
  { role: "devops", label: "DevOps" },
  { role: "marketing", label: "Marketing" },
  { role: "cx", label: "Customer Experience" },
];

/**
 * "Team HQ" — a glassy bottom-left card (opposite Jova in the bottom-right). Progressive
 * disclosure: agents + initiatives are shown; metrics are a compact strip; approvals only appear
 * when an agent needs sign-off; managing agents is tucked behind a toggle. Hidden in overview.
 */
export function TeamInfoPanel() {
  const team = useNetworkStore((s) => s.teams.find((c) => c.id === s.focusedTeamId) ?? null);
  const selectedAgentId = useNetworkStore((s) => s.selectedAgentId);
  const selectAgent = useNetworkStore((s) => s.selectAgent);
  if (!team) return null;

  const agent = selectedAgentId ? team.agents.find((a) => a.id === selectedAgentId) ?? null : null;

  return (
    <div
      className="fixed bottom-5 left-4 z-10 max-h-[80vh] w-[min(320px,82vw)] overflow-y-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-white/85 backdrop-blur-xl animate-[fadein_300ms_ease]"
      style={{ boxShadow: `0 0 50px ${team.color}22` }}
    >
      {agent ? (
        <AgentDetail team={team} agent={agent} onBack={() => selectAgent(team.id, null)} />
      ) : (
        <TeamView team={team} onSelect={(id) => selectAgent(team.id, id)} />
      )}

      <p className="mt-3 text-[10px] leading-snug text-white/35">
        Click empty space to zoom out · click Jova to talk
      </p>
    </div>
  );
}

function TeamView({ team, onSelect }: { team: Team; onSelect: (agentId: string) => void }) {
  const addAgent = useNetworkStore((s) => s.addAgent);
  const resolveApproval = useNetworkStore((s) => s.resolveApproval);
  const metricsWindow = useNetworkStore((s) => s.metricsWindow);
  const [approvalsOpen, setApprovalsOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  const pm = team.agents.find((a) => a.role === "pm");

  return (
    <>
      <Header team={team} />

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
                <span className={a.role === "pm" ? "font-medium text-white/90" : "text-white/75"}>
                  {ROLE_LABEL[a.role] ?? a.label}
                </span>
              </span>
              <span className="text-[10px] text-white/45">
                {a.tasks.length > 0 ? `${a.tasks.length} task${a.tasks.length === 1 ? "" : "s"}` : "idle"}
                <span className="ml-1 text-white/30">›</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {/* manage — tucked behind a toggle so it never clutters */}
      <button
        onClick={() => setManageOpen((v) => !v)}
        className="mt-2 text-[10px] uppercase tracking-wider text-white/35 transition hover:text-white/60"
      >
        {manageOpen ? "▾ Manage" : "▸ Manage"}
      </button>
      {manageOpen && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {ADDABLE.map((r) => (
            <button
              key={r.role}
              onClick={() => addAgent(team.id, r.role, r.label)}
              className="rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-white/70 transition hover:bg-white/10"
            >
              + {r.label}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function AgentDetail({ team, agent, onBack }: { team: Team; agent: AgentNode; onBack: () => void }) {
  const removeAgent = useNetworkStore((s) => s.removeAgent);
  return (
    <>
      <button onClick={onBack} className="mb-2 text-[11px] text-white/50 transition hover:text-white/80">
        ‹ {team.name}
      </button>
      <div className="mb-3 flex items-center gap-2">
        <Dot color={team.color} on={agent.tasks.length > 0} />
        <span className="text-sm font-semibold" style={{ color: team.color }}>
          {ROLE_LABEL[agent.role] ?? agent.label}
        </span>
      </div>

      <Section label="Working on" />
      {agent.tasks.length > 0 ? (
        <ul className="mb-3 space-y-1">
          {agent.tasks.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate text-white/75">{t.title}</span>
              <span className="shrink-0 text-[10px] text-white/45">{t.steps} step{t.steps === 1 ? "" : "s"}</span>
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

      {agent.role !== "pm" && (
        <button
          onClick={() => {
            removeAgent(team.id, agent.id);
            onBack();
          }}
          className="mt-3 text-[10px] text-rose-300/60 transition hover:text-rose-300/90"
        >
          Remove agent
        </button>
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
