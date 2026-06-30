"use client";

import { useState } from "react";
import { useLogStore, type LogKind, type LogLevel } from "@/lib/logs/useLogStore";
import { DateRangeBar, inRange, type DateRange } from "./DateRangeBar";
import { ScrollMore, useScrollMore } from "./ScrollMore";

const LEVEL_COLOR: Record<LogLevel, string> = {
  info: "text-white/55",
  warn: "text-amber-300/80",
  error: "text-rose-300/80",
};
const KIND_LABEL: Record<LogKind, string> = { server: "Server", mesh: "Mesh" };

const fmtTime = (ts: number) => new Date(ts).toLocaleString();

/** Logs: server + AI/mesh activity, filterable by type and a calendar date-time range. */
export function LogsScreen() {
  const entries = useLogStore((s) => s.entries);
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [kind, setKind] = useState<"all" | LogKind>("all");
  const [q, setQ] = useState("");
  const { scrollRef, more } = useScrollMore();

  const ql = q.trim().toLowerCase();
  const filtered = entries.filter(
    (e) =>
      (kind === "all" || e.kind === kind) &&
      inRange(e.ts, range) &&
      (!ql || e.source.toLowerCase().includes(ql) || e.message.toLowerCase().includes(ql))
  );

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 pr-10">
        <h2 className="text-lg font-semibold text-white/90">Logs</h2>
        <p className="text-[12px] text-white/45">Server + mesh activity · {filtered.length} shown</p>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-white/35">Type</span>
        <div className="flex gap-1">
          {(["all", "server", "mesh"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`rounded px-2 py-0.5 text-[11px] transition ${kind === k ? "bg-white/20 text-white" : "text-white/45 hover:bg-white/10"}`}
            >
              {k === "all" ? "All" : KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search logs…"
          className="min-w-[140px] flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-1 text-[12px] text-white outline-none focus:border-cyan-300/40"
        />
      </div>
      <div className="mb-2">
        <DateRangeBar value={range} onChange={setRange} />
      </div>

      <div className="relative min-h-0 flex-1">
        <ul ref={scrollRef} className="no-scrollbar h-full space-y-1 overflow-y-auto pr-0.5 font-mono text-[11px]">
          {filtered.length === 0 && <li className="font-sans text-[12px] text-white/30">No logs in this range.</li>}
          {filtered.map((e) => (
            <li key={e.id} className="flex gap-2 rounded border border-white/5 bg-white/[0.02] px-2 py-1">
              <span className="shrink-0 text-white/30">{fmtTime(e.ts)}</span>
              <span className={`shrink-0 rounded px-1 ${e.kind === "server" ? "bg-cyan-400/15 text-cyan-200/80" : "bg-violet-400/15 text-violet-200/80"}`}>
                {KIND_LABEL[e.kind]}
              </span>
              <span className="shrink-0 text-white/40">{e.source}</span>
              <span className={`min-w-0 flex-1 ${LEVEL_COLOR[e.level]}`}>{e.message}</span>
            </li>
          ))}
        </ul>
        <ScrollMore show={more} />
      </div>
    </div>
  );
}
