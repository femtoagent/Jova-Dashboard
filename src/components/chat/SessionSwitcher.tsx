"use client";

import { useJovaStore } from "@/lib/state/useJovaStore";
import type { ChatSession } from "@/lib/jova/types";
import { characterByName } from "@/lib/agents/characters";

/** A stable key per person (entity). */
function personKey(s: ChatSession): string {
  return s.target ? `${s.target.teamId}:${s.target.agentId}` : "jova";
}
function shortCode(s: ChatSession): string {
  if (!s.target) return "J";
  if (s.target.teamName === "Nexus") return "Nx";
  const emoji = characterByName(s.target.teamName)?.emoji;
  if (emoji) return emoji;
  const base = s.target.teamId === "character" || !s.target.label ? s.target.teamName : s.target.label;
  const words = base.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words[0] && words[1]) return (words[0][0] + words[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}
function relTime(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

/** The Sessions view — only the threads for the person you're currently on. New chat starts another
 *  thread with that same person. (Repurposed from the old SessionSwitcher.) */
export function SessionsView({ onBack }: { onBack: () => void }) {
  const sessions = useJovaStore((s) => s.sessions);
  const activeId = useJovaStore((s) => s.activeSessionId);
  const switchSession = useJovaStore((s) => s.switchSession);
  const closeSession = useJovaStore((s) => s.closeSession);
  const createSession = useJovaStore((s) => s.createSession);
  const unread = useJovaStore((s) => s.unread);

  const active = sessions.find((s) => s.id === activeId) ?? null;
  const key = active ? personKey(active) : "jova";
  const currentTarget = active?.target;
  const personName = currentTarget
    ? currentTarget.label
      ? `${currentTarget.teamName} - ${currentTarget.label}`
      : currentTarget.teamName
    : "Jova";
  const threads = sessions.filter((s) => personKey(s) === key).sort((a, b) => b.updatedAt - a.updatedAt);
  const c = currentTarget?.color ?? "#67e8f9";

  return (
    <div className="flex w-[150px] shrink-0 flex-col border-r border-white/10 sm:w-[168px]">
      <div className="flex items-center gap-1 border-b border-white/10 px-2 py-2">
        <button onClick={onBack} title="Back" className="rounded px-1 text-[12px] text-white/50 transition hover:bg-white/10 hover:text-white/80">
          ‹
        </button>
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Sessions</div>
          <div className="truncate text-[10px]" style={{ color: c }}>{personName}</div>
        </div>
      </div>

      <ul className="no-scrollbar flex-1 space-y-0.5 overflow-y-auto p-1.5">
        {threads.map((s) => {
          const isActive = s.id === activeId;
          return (
            <li key={s.id} className="group relative">
              <button
                onClick={() => switchSession(s.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 pr-5 text-left transition hover:bg-white/10 ${isActive ? "bg-white/10" : ""}`}
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none"
                  style={{ background: `${c}22`, color: c, border: `1px solid ${isActive ? c : `${c}55`}` }}
                >
                  {shortCode(s)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs" style={{ color: isActive ? c : "rgba(255,255,255,0.8)" }}>
                    {s.title}
                  </span>
                  <span className="block text-[10px] text-white/35">{relTime(s.updatedAt)}</span>
                </span>
                {(unread[s.id] ?? 0) > 0 && (
                  <span
                    className="shrink-0 rounded-full px-1.5 text-[9px] font-semibold text-black/90"
                    style={{ background: c, boxShadow: `0 0 8px ${c}` }}
                    title={`${unread[s.id]} new message${unread[s.id] === 1 ? "" : "s"}`}
                  >
                    {unread[s.id]}
                  </span>
                )}
              </button>
              <button
                onClick={() => closeSession(s.id)}
                title="Close thread"
                className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded px-1 text-[12px] leading-none text-white/40 transition hover:text-rose-300 group-hover:block"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>

      <button
        onClick={() => createSession("New chat", currentTarget)}
        className="m-1.5 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-white/70 transition hover:bg-white/10"
      >
        + New chat
      </button>
    </div>
  );
}
