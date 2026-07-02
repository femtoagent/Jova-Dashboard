"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentTask, Team } from "@/lib/network/types";
import { characterFor } from "@/lib/agents/roomCharacters";

const MAX_ROWS = 4;
/** how long a completed row lingers, struck through, before dropping off the board */
const STRIKE_MS = 1600;

/**
 * The board on the wall: the initiatives (features) this team is working on — the PM's task
 * list, matching how the docked Team detail already frames "Initiatives". New ones pop on;
 * completed ones get crossed out, linger a beat, then drop off.
 */
export function InitiativeBoard({ team }: { team: Team }) {
  const pm = team.agents.find((a) => a.role === "pm");
  const tasks = pm?.tasks ?? [];
  const done = useStruckRows(tasks);
  const ownerAccent = pm ? characterFor(pm).accent : team.color;

  const rows: { key: string; title: string; steps: number; struck: boolean }[] = [
    ...tasks.map((t) => ({ key: t.id, title: t.title, steps: t.steps, struck: false })),
    ...done.map((g) => ({ key: g.key, title: g.task.title, steps: 6, struck: true })),
  ];
  const overflow = Math.max(rows.length - MAX_ROWS, 0);

  return (
    <div
      data-initiative-board
      className="min-w-0 flex-1 rounded-lg border bg-[#0d1120]/90 px-2.5 py-1.5"
      style={{ borderColor: "rgba(160,190,255,0.16)", boxShadow: "0 3px 14px rgba(0,0,0,0.35)" }}
    >
      <div className="mb-1 flex items-baseline gap-2">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-mist">Initiatives</span>
        <span className="truncate text-[9px] text-faint">{team.name}</span>
      </div>
      {rows.length === 0 ? (
        <div className="pb-0.5 text-[10px] italic text-faint">Nothing on the board — the room is catching its breath.</div>
      ) : (
        <ul className="space-y-0.5">
          {rows.slice(0, MAX_ROWS).map((r) => (
            <li
              key={r.key}
              data-initiative={r.struck ? "done" : "open"}
              className={`flex items-center gap-1.5 text-[10px] leading-tight ${r.struck ? "text-faint line-through opacity-60" : "text-bright/85 animate-[fadein_300ms_ease]"}`}
            >
              <span className="h-1 w-1 shrink-0 rounded-full" style={{ background: ownerAccent, boxShadow: `0 0 4px ${ownerAccent}` }} />
              <span className="truncate">{r.title}</span>
              {!r.struck && <span className="ml-auto shrink-0 font-mono text-[9px] text-faint">{r.steps}/6</span>}
            </li>
          ))}
          {overflow > 0 && <li className="text-[9px] text-faint">+{overflow} more</li>}
        </ul>
      )}
    </div>
  );
}

/** Completed PM tasks linger briefly (struck through) so "crossed out" is visible before dropping. */
function useStruckRows(tasks: AgentTask[]) {
  const [ghosts, setGhosts] = useState<{ key: string; task: AgentTask }[]>([]);
  const prev = useRef<AgentTask[]>(tasks);
  useEffect(() => {
    const cur = new Set(tasks.map((t) => t.id));
    const removed = prev.current.filter((t) => !cur.has(t.id));
    prev.current = tasks;
    if (!removed.length) return;
    const keys = removed.map((t) => `${t.id}-done`);
    setGhosts((g) => [...g, ...removed.map((t) => ({ key: `${t.id}-done`, task: t }))]);
    const timer = window.setTimeout(() => setGhosts((g) => g.filter((x) => !keys.includes(x.key))), STRIKE_MS);
    return () => window.clearTimeout(timer);
  }, [tasks]);
  return ghosts;
}
