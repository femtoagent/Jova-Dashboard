"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { AgentTask, Team } from "@/lib/network/types";
import { characterFor } from "@/lib/agents/roomCharacters";
import { X } from "@phosphor-icons/react";

/** how long a struck row stays on the board before it loses its stick and falls */
const STRIKE_MS = 1900;

/**
 * The initiatives GLASSBOARD — an object hanging on the office wall (standoff screws, marker
 * tray), not a toolbar. Rows are the features in flight (the PM's tasks): new ones pop on; a
 * finished one gets a marker line drawn across it, lingers a beat, then falls off the board.
 * It reads ambient at scene scale — TAP THE BOARD to zoom into a fully readable overlay.
 */
export function InitiativeBoard({ team, style, compact = false }: { team: Team; style?: CSSProperties; compact?: boolean }) {
  const pm = team.agents.find((a) => a.role === "pm");
  const tasks = pm?.tasks ?? [];
  const done = useStruckRows(tasks);
  const ownerAccent = pm ? characterFor(pm).accent : team.color;
  const [zoomed, setZoomed] = useState(false);

  const maxRows = compact ? 2 : 3;
  const rows: { key: string; title: string; steps: number; struck: boolean }[] = [
    ...tasks.map((t) => ({ key: t.id, title: t.title, steps: t.steps, struck: false })),
    ...done.map((g) => ({ key: g.key, title: g.task.title, steps: 6, struck: true })),
  ];
  const overflow = Math.max(rows.length - maxRows, 0);

  return (
    <>
      <button
        data-initiative-board
        onClick={(e) => {
          e.stopPropagation();
          setZoomed(true);
        }}
        title="Initiatives — tap to read the board"
        className="absolute block text-left"
        style={style}
      >
        {/* mounting standoffs */}
        <span className="absolute -top-1 left-2 h-2 w-2 rounded-full bg-[#2a3350] shadow-[0_1px_2px_rgba(0,0,0,0.6)]" aria-hidden />
        <span className="absolute -top-1 right-2 h-2 w-2 rounded-full bg-[#2a3350] shadow-[0_1px_2px_rgba(0,0,0,0.6)]" aria-hidden />

        {/* the glass */}
        <span
          className="flex h-full w-full flex-col overflow-hidden rounded-md border px-2 py-1.5 backdrop-blur-[1px]"
          style={{
            background: "linear-gradient(165deg, rgba(190,215,255,0.10) 0%, rgba(150,175,220,0.05) 45%, rgba(120,140,190,0.08) 100%)",
            borderColor: "rgba(190,215,255,0.22)",
            boxShadow: "inset 0 1px 0 rgba(220,235,255,0.18), 0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          <span className="mb-1 text-[8px] font-semibold uppercase tracking-[0.18em] text-mist">Initiatives</span>
          {rows.length === 0 ? (
            <span className="text-[9px] italic leading-snug text-faint">board&rsquo;s clear</span>
          ) : (
            <span className="flex min-h-0 flex-col gap-[3px]">
              {rows.slice(0, maxRows).map((r) => (
                <span key={r.key} data-initiative={r.struck ? "done" : "open"} className="relative flex min-w-0 items-center gap-1">
                  <span className="h-1 w-1 shrink-0 rounded-full" style={{ background: ownerAccent, boxShadow: `0 0 3px ${ownerAccent}` }} />
                  <span
                    className={`relative min-w-0 truncate text-[9px] leading-tight ${r.struck ? "text-faint" : "text-bright/80 animate-[fadein_300ms_ease]"}`}
                    style={
                      r.struck
                        ? { animation: `initiative-fall 500ms ease-in ${STRIKE_MS - 600}ms forwards` }
                        : undefined
                    }
                  >
                    {r.title}
                    {/* the marker stroke */}
                    {r.struck && (
                      <span
                        className="absolute left-0 top-1/2 h-[1.5px] w-full origin-left rounded-full"
                        style={{ background: ownerAccent, animation: "strike-line 350ms ease-out forwards" }}
                        aria-hidden
                      />
                    )}
                  </span>
                </span>
              ))}
            </span>
          )}
          {overflow > 0 && (
            <span
              className="absolute bottom-1 right-1.5 grid h-3.5 min-w-3.5 place-items-center rounded-full px-0.5 text-[8px] font-bold text-black"
              style={{ background: ownerAccent }}
            >
              +{overflow}
            </span>
          )}
        </span>

        {/* marker tray */}
        <span className="absolute -bottom-1 left-1/2 h-1.5 w-2/3 -translate-x-1/2 rounded-sm bg-[#1c2338] shadow-[0_2px_4px_rgba(0,0,0,0.5)]" aria-hidden>
          <span className="absolute left-2 top-[-2px] h-[3px] w-4 rounded-full" style={{ background: ownerAccent, opacity: 0.8 }} />
        </span>
      </button>

      {zoomed && <BoardOverlay team={team} ownerAccent={ownerAccent} tasks={tasks} onClose={() => setZoomed(false)} />}
    </>
  );
}

/** The readable version — the board, zoomed to you. */
function BoardOverlay({
  team,
  ownerAccent,
  tasks,
  onClose,
}: {
  team: Team;
  ownerAccent: string;
  tasks: AgentTask[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      data-initiative-overlay
      className="fixed inset-0 z-[900] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-[fade_150ms_ease]"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-[min(440px,94vw)] overflow-hidden rounded-2xl border p-0"
        style={{
          background: "linear-gradient(165deg, #131a2c 0%, #0e1322 100%)",
          borderColor: "rgba(190,215,255,0.25)",
          boxShadow: "inset 0 1px 0 rgba(220,235,255,0.15), 0 24px 60px rgba(0,0,0,0.55)",
        }}
      >
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="h-2 w-2 rounded-full" style={{ background: team.color, boxShadow: `0 0 6px ${team.color}` }} />
          <span className="text-sm font-semibold text-bright">{team.name} — initiatives</span>
          <button
            onClick={onClose}
            title="Close"
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-raise hover:text-mist"
          >
            <X size={15} weight="bold" />
          </button>
        </div>
        <div className="max-h-[56dvh] overflow-y-auto p-4">
          {tasks.length === 0 ? (
            <p className="text-[12px] italic text-faint">The board&rsquo;s clear — nothing in flight right now.</p>
          ) : (
            <ul className="space-y-2.5">
              {tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ownerAccent, boxShadow: `0 0 5px ${ownerAccent}` }} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-bright/90">{t.title}</span>
                  <span className="flex shrink-0 gap-[3px]" title={`${t.steps}/6 steps`} aria-label={`${t.steps} of 6 steps`}>
                    {Array.from({ length: 6 }, (_, i) => (
                      <span
                        key={i}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{ background: i < t.steps ? ownerAccent : "rgba(160,190,255,0.14)" }}
                      />
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Completed PM tasks linger (struck through) so the marker stroke + fall are visible. */
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
