"use client";

import { useEffect, useRef, useState } from "react";
import { useHistoryStore, type HistoryEntry } from "@/lib/logs/useHistoryStore";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { DateRangeBar, inRange, type DateRange } from "./DateRangeBar";

const fmtTime = (ts: number) => new Date(ts).toLocaleString();
/** lower-case + treat a middot like a hyphen, so search is forgiving of the separator. */
const norm = (s: string) => s.toLowerCase().replace(/·/g, "-");
const selCls = "rounded-lg border border-white/15 bg-white/5 px-2 py-1.5 text-[12px] text-white outline-none focus:border-cyan-300/40";

/** Chat / prompt history: every prompt + reply, filterable by team, agent, date range, and text. */
export function HistoryScreen() {
  const entries = useHistoryStore((s) => s.entries);
  const teams = useNetworkStore((s) => s.teams);
  const [range, setRange] = useState<DateRange>({ from: null, to: null });
  const [q, setQ] = useState("");
  const [teamFilter, setTeamFilter] = useState("all"); // all | jova | nexus | <teamId>
  const [agentFilter, setAgentFilter] = useState("all"); // all | <agentId>
  const listRef = useRef<HTMLUListElement>(null);
  const [more, setMore] = useState(false);
  const check = () => {
    const el = listRef.current;
    if (!el) return;
    setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  };

  const realTeam = teams.find((t) => t.id === teamFilter) ?? null;
  const ql = norm(q.trim());

  const matchTeam = (e: HistoryEntry) => {
    if (teamFilter === "all") return true;
    if (teamFilter === "jova") return e.teamId == null;
    if (teamFilter === "nexus") return e.teamId === "nexus";
    if (e.teamId !== teamFilter) return false;
    return agentFilter === "all" || e.agentId === agentFilter;
  };

  const filtered = entries
    .filter((e) => inRange(e.ts, range) && matchTeam(e) && (!ql || norm(e.content).includes(ql) || norm(e.who).includes(ql)))
    .slice()
    .reverse(); // newest first (store keeps chronological)

  useEffect(() => {
    check();
  }, [filtered.length, q, teamFilter, agentFilter, range.from, range.to]);

  const onTeam = (v: string) => {
    setTeamFilter(v);
    setAgentFilter("all"); // reset agent when the team changes
  };

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 pr-10">
        <h2 className="text-lg font-semibold text-white/90">Chat history</h2>
        <p className="text-[12px] text-white/45">Every prompt + reply, for issue tracking · {filtered.length} shown</p>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search prompts, replies, people…"
          className="min-w-[160px] flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-sm text-white outline-none focus:border-cyan-300/40"
        />
        <select value={teamFilter} onChange={(e) => onTeam(e.target.value)} className={selCls}>
          <option value="all" className="bg-[#0a0f14]">All teams</option>
          <option value="jova" className="bg-[#0a0f14]">Jova</option>
          <option value="nexus" className="bg-[#0a0f14]">Nexus</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id} className="bg-[#0a0f14]">
              {t.name}
            </option>
          ))}
        </select>
        {realTeam && (
          <select value={agentFilter} onChange={(e) => setAgentFilter(e.target.value)} className={selCls}>
            <option value="all" className="bg-[#0a0f14]">All agents</option>
            {realTeam.agents.map((a) => (
              <option key={a.id} value={a.id} className="bg-[#0a0f14]">
                {a.label}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="mb-2">
        <DateRangeBar value={range} onChange={setRange} />
      </div>

      <div className="relative min-h-0 flex-1">
        <ul ref={listRef} onScroll={check} className="no-scrollbar h-full space-y-1.5 overflow-y-auto pr-0.5">
          {filtered.length === 0 && <li className="text-[12px] text-white/30">No messages match.</li>}
          {filtered.map((e) => (
            <li key={e.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="mb-0.5 flex items-center gap-2 text-[10px] text-white/35">
                <span className={`rounded px-1 ${e.role === "user" ? "bg-cyan-400/15 text-cyan-200/80" : "bg-white/10 text-white/60"}`}>{e.role}</span>
                <span className="truncate">{e.who}</span>
                {e.kind === "dream" && <span className="text-violet-300/70">dream</span>}
                <span className="ml-auto shrink-0">{fmtTime(e.ts)}</span>
              </div>
              <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-white/80">
                {e.content || <span className="text-white/30">(empty)</span>}
              </div>
            </li>
          ))}
        </ul>
        {more && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-8 items-end justify-center bg-gradient-to-t from-black/80 to-transparent">
            <span className="pb-1 text-[10px] text-white/45">▾ more</span>
          </div>
        )}
      </div>
    </div>
  );
}
