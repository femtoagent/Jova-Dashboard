"use client";

import { useEffect, useRef, useState } from "react";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useSettingsStore } from "@/lib/settings/useSettingsStore";
import { scaleMetrics, net as netOf } from "@/lib/network/ledger";
import { WindowPills } from "../network/metrics";
import { ConfirmRemoveDialog } from "./ConfirmRemoveDialog";

type SortBy = "performance" | "created";

/** Admin screen: every team in the network. Create, edit, sort, and (within 3 days) remove. */
export function TeamsAdmin() {
  const teams = useNetworkStore((s) => s.teams);
  const metricsWindow = useNetworkStore((s) => s.metricsWindow);
  const removeTeam = useNetworkStore((s) => s.removeTeam);
  const showTeam = useSettingsStore((s) => s.showTeam);
  const showNewTeam = useSettingsStore((s) => s.showNewTeam);
  const [removing, setRemoving] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortBy>("performance");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const listRef = useRef<HTMLUListElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const check = () => {
    const el = listRef.current;
    if (!el) return;
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  };

  // metric ascending: performance = net earnings; created = recency (newer ranks higher → -ageDays)
  const sorted = [...teams].sort((a, b) => {
    const va = sortBy === "performance" ? netOf(scaleMetrics(a.metrics, metricsWindow, a.ageDays)) : -a.ageDays;
    const vb = sortBy === "performance" ? netOf(scaleMetrics(b.metrics, metricsWindow, b.ageDays)) : -b.ageDays;
    return dir === "asc" ? va - vb : vb - va;
  });

  useEffect(() => {
    check();
  }, [teams.length, sortBy, dir, metricsWindow]);

  const removingTeam = teams.find((t) => t.id === removing) ?? null;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 flex items-center justify-between pr-10">
        <div>
          <h2 className="text-lg font-semibold text-white/90">Teams</h2>
          <p className="text-[12px] text-white/45">
            {teams.length} team{teams.length === 1 ? "" : "s"} in the network
          </p>
        </div>
        <button
          onClick={showNewTeam}
          className="rounded-lg border border-cyan-300/30 bg-cyan-400/20 px-3 py-1.5 text-sm text-cyan-50 transition hover:bg-cyan-400/30"
        >
          + Create team
        </button>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-white/35">Sort</span>
        <div className="flex gap-1">
          {(["performance", "created"] as SortBy[]).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={`rounded px-2 py-0.5 text-[11px] transition ${
                sortBy === s ? "bg-white/20 text-white" : "text-white/45 hover:bg-white/10"
              }`}
            >
              {s === "performance" ? "Performance" : "Created"}
            </button>
          ))}
        </div>
        <button
          onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}
          title={dir === "asc" ? "Ascending" : "Descending"}
          className="rounded px-2 py-0.5 text-[11px] text-white/60 transition hover:bg-white/10"
        >
          {dir === "asc" ? "▲ Asc" : "▼ Desc"}
        </button>
      </div>

      {/* window basis — drives the Performance sort AND the per-row net figures (shared window) */}
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-white/35">Window</span>
        <WindowPills />
      </div>

      <div className="relative min-h-0 flex-1">
        <ul ref={listRef} onScroll={check} className="no-scrollbar h-full space-y-1.5 overflow-y-auto pr-0.5">
          {sorted.map((t) => {
            const n = netOf(scaleMetrics(t.metrics, metricsWindow, t.ageDays));
            const youngEnough = t.ageDays <= 3;
            return (
              <li key={t.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: t.color, boxShadow: `0 0 8px ${t.color}` }} />
                <button onClick={() => showTeam(t.id)} className="min-w-0 flex-1 text-left">
                  <div className="truncate text-sm font-medium" style={{ color: t.color }}>
                    {t.name}
                  </div>
                  <div className="truncate text-[11px] text-white/45">
                    {t.agents.length} agents · {t.ageDays}d old{t.mission ? ` · ${t.mission}` : ""}
                  </div>
                </button>
                <span className={`shrink-0 text-[11px] ${n >= 0 ? "text-emerald-300/80" : "text-rose-300/80"}`}>
                  {n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}
                </span>
                <button
                  onClick={() => showTeam(t.id)}
                  className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[12px] text-white/70 transition hover:bg-white/10"
                >
                  Edit
                </button>
                {youngEnough ? (
                  <button
                    onClick={() => setRemoving(t.id)}
                    title="Remove team"
                    className="shrink-0 rounded-lg px-2 py-1 text-[12px] text-rose-300/60 transition hover:bg-white/10 hover:text-rose-300"
                  >
                    Remove
                  </button>
                ) : (
                  <span title="Teams can only be removed within 3 days of creation" className="shrink-0 cursor-help px-2 py-1 text-[12px] text-white/20">
                    Locked
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {canScrollDown && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-8 items-end justify-center bg-gradient-to-t from-black/80 to-transparent">
            <span className="pb-1 text-[10px] text-white/45">▾ more</span>
          </div>
        )}
      </div>

      {removingTeam && (
        <ConfirmRemoveDialog
          kind="team"
          name={removingTeam.name}
          impact={
            <>
              <p>
                Removes <b>{removingTeam.agents.length}</b> agent{removingTeam.agents.length === 1 ? "" : "s"} and the team&rsquo;s node from the scene.
              </p>
              <p>Closes any open chat threads with this team&rsquo;s agents.</p>
              <p>This can&rsquo;t be undone.</p>
            </>
          }
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            removeTeam(removingTeam.id);
            setRemoving(null);
          }}
        />
      )}
    </div>
  );
}
