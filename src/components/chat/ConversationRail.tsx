"use client";

import { useEffect, useRef, useState } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import type { ChatSession } from "@/lib/jova/types";
import { SessionsView } from "./SessionSwitcher";

/** A stable key per PERSON (entity) so multiple threads with the same person collapse to one row. */
function personKey(s: ChatSession): string {
  return s.target ? `${s.target.teamId}:${s.target.agentId}` : "jova";
}
function shortCode(s: ChatSession): string {
  if (!s.target) return "J";
  if (s.target.teamName === "Nexus") return "Nx";
  const words = s.target.label.replace(/[^a-zA-Z0-9 ]/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2 && words[0] && words[1]) return (words[0][0] + words[1][0]).toUpperCase();
  return s.target.label.slice(0, 2).toUpperCase();
}

/** The left rail: one row per PERSON (Jova + each agent + Nexus) for quick switching. A "Sessions ›"
 *  toggle takes over the rail to show the current person's threads. */
export function ConversationRail() {
  const sessions = useJovaStore((s) => s.sessions);
  const activeId = useJovaStore((s) => s.activeSessionId);
  const switchSession = useJovaStore((s) => s.switchSession);
  const closeConversation = useJovaStore((s) => s.closeConversation);
  const unread = useJovaStore((s) => s.unread);
  const [mode, setMode] = useState<"conversations" | "sessions">("conversations");
  const listRef = useRef<HTMLUListElement>(null);
  const [canScrollDown, setCanScrollDown] = useState(false);

  // collapse to one row per person (most-recent thread represents them); roll up each person's
  // thread count and unread total across their threads
  const byKey = new Map<string, ChatSession>();
  const counts = new Map<string, number>();
  const unreadByKey = new Map<string, number>();
  for (const s of sessions) {
    const k = personKey(s);
    counts.set(k, (counts.get(k) ?? 0) + 1);
    unreadByKey.set(k, (unreadByKey.get(k) ?? 0) + (unread[s.id] ?? 0));
    const cur = byKey.get(k);
    if (!cur || s.updatedAt > cur.updatedAt) byKey.set(k, s);
  }
  const persons = [...byKey.values()].sort((a, b) => {
    const aj = a.target ? 0 : 1;
    const bj = b.target ? 0 : 1;
    if (aj !== bj) return bj - aj; // Jova first
    return b.updatedAt - a.updatedAt;
  });
  const activeSession = sessions.find((s) => s.id === activeId);
  const activeKey = activeSession ? personKey(activeSession) : null;
  const activeCount = activeKey ? counts.get(activeKey) ?? 0 : 0;

  const check = () => {
    const el = listRef.current;
    if (!el) return;
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
  };
  useEffect(() => {
    check();
  }, [persons.length, mode]);

  if (mode === "sessions") return <SessionsView onBack={() => setMode("conversations")} />;

  return (
    <div className="flex w-[200px] shrink-0 flex-col border-r border-white/10">
      <div className="flex items-center justify-between border-b border-white/10 py-2 pl-3 pr-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Conversations</span>
        <button
          onClick={() => setMode("sessions")}
          title="This person's sessions"
          className="rounded px-1.5 py-0.5 text-[10px] text-white/40 transition hover:bg-white/10 hover:text-white/70"
        >
          Sessions{activeCount > 1 ? ` · ${activeCount}` : ""} ›
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <ul ref={listRef} onScroll={check} className="no-scrollbar h-full space-y-0.5 overflow-y-auto p-1.5">
          {persons.map((s) => {
            const t = s.target;
            const c = t?.color ?? "#67e8f9";
            const k = personKey(s);
            const isActive = activeKey === k;
            const unreadCount = unreadByKey.get(k) ?? 0;
            return (
              <li key={k} className="group relative">
                <button
                  onClick={() => switchSession(s.id)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 pr-5 text-left transition hover:bg-white/10 ${isActive ? "bg-white/10" : ""}`}
                >
                  <span
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold"
                    style={{ background: `${c}22`, color: c, border: `1px solid ${isActive ? c : `${c}55`}`, boxShadow: isActive ? `0 0 8px ${c}88` : "none" }}
                  >
                    {shortCode(s)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium" style={{ color: isActive ? c : "rgba(255,255,255,0.85)" }}>
                      {t ? t.teamName : "Jova"}
                    </span>
                    <span className="block truncate text-[10px] text-white/40">{t ? t.label : "your companion"}</span>
                  </span>
                  {unreadCount > 0 && (
                    <span
                      className="shrink-0 rounded-full px-1.5 text-[9px] font-semibold text-black/90"
                      style={{ background: c, boxShadow: `0 0 8px ${c}` }}
                      title={`${unreadCount} new message${unreadCount === 1 ? "" : "s"}`}
                    >
                      {unreadCount}
                    </span>
                  )}
                </button>
                {t && (
                  <button
                    onClick={() => closeConversation(t.teamId, t.agentId)}
                    title="Close conversation"
                    className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded px-1 text-[12px] leading-none text-white/40 transition hover:text-rose-300 group-hover:block"
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {canScrollDown && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-7 items-end justify-center bg-gradient-to-t from-black/80 to-transparent">
            <span className="pb-0.5 text-[10px] text-white/45">▾ more</span>
          </div>
        )}
      </div>
    </div>
  );
}
