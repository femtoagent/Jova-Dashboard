"use client";

import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { WindowPills, MetricRows } from "./metrics";
import { rollup, scaleMetrics, net as netOf } from "@/lib/network/ledger";

/**
 * The Nexus layer (shown in overview): a network-wide roll-up of all teams' financials (from the
 * Nexus ledger), the team list (click to fly in), and controls to add a team (or delete a
 * young one ≤ 3 days old).
 */
export function NexusInfoPanel() {
  const focusedTeamId = useNetworkStore((s) => s.focusedTeamId);
  const teams = useNetworkStore((s) => s.teams);
  const metricsWindow = useNetworkStore((s) => s.metricsWindow);
  const focusTeam = useNetworkStore((s) => s.focusTeam);
  const addTeam = useNetworkStore((s) => s.addTeam);
  const removeTeam = useNetworkStore((s) => s.removeTeam);
  if (focusedTeamId) return null; // the Team HQ panel takes over when one is focused

  const totals = rollup(teams, metricsWindow);
  return (
    <div className="fixed bottom-5 left-4 z-10 max-h-[80vh] w-[min(320px,82vw)] overflow-y-auto rounded-2xl border border-white/10 bg-black/40 p-4 text-white/85 backdrop-blur-xl">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#9fe8ff", boxShadow: "0 0 10px #9fe8ff" }} />
        <span className="text-sm font-semibold tracking-wide text-cyan-100">Network</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-white/40">{teams.length} teams</span>
      </div>

      <WindowPills />
      <div className="mb-3">
        <MetricRows metrics={totals} />
      </div>

      <div className="mb-1 text-[10px] uppercase tracking-wider text-white/35">Teams</div>
      <ul className="max-h-52 space-y-1 overflow-y-auto pr-1">
        {teams.map((c) => {
          const n = netOf(scaleMetrics(c.metrics, metricsWindow, c.ageDays));
          const needs = c.approvals.length > 0;
          return (
            <li key={c.id} className="flex items-center gap-1">
              <button
                onClick={() => focusTeam(c.id)}
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-xs transition hover:bg-white/10"
              >
                <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: c.color, boxShadow: `0 0 8px ${c.color}` }} />
                <span className="truncate text-white/80">{c.name}</span>
                {needs && <span className="shrink-0 text-[10px] text-amber-300/90" title="needs your sign-off">⚠</span>}
                <span className={`ml-auto shrink-0 text-[10px] ${n >= 0 ? "text-emerald-300/80" : "text-rose-300/80"}`}>
                  {n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}
                </span>
              </button>
              {c.ageDays <= 3 ? (
                <button
                  onClick={() => removeTeam(c.id)}
                  title={`Delete ${c.name} (allowed while ≤ 3 days old)`}
                  className="shrink-0 rounded px-1 text-[11px] text-rose-300/50 transition hover:text-rose-300/90"
                >
                  ✕
                </button>
              ) : (
                <span className="w-3 shrink-0" />
              )}
            </li>
          );
        })}
      </ul>

      <button
        onClick={addTeam}
        className="mt-2 w-full rounded-md border border-cyan-300/25 bg-cyan-400/10 px-2 py-1 text-[11px] text-cyan-50 transition hover:bg-cyan-400/20"
      >
        + Add team
      </button>

      <p className="mt-3 text-[10px] leading-snug text-white/35">Click a team to fly there · click Jova to talk</p>
    </div>
  );
}
