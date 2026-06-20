"use client";

import { useJovaStore } from "@/lib/state/useJovaStore";

export function SessionSwitcher() {
  const sessions = useJovaStore((s) => s.sessions);
  const activeId = useJovaStore((s) => s.activeSessionId);
  const switchSession = useJovaStore((s) => s.switchSession);
  const createSession = useJovaStore((s) => s.createSession);

  return (
    <div className="flex items-center gap-2">
      <select
        value={activeId ?? ""}
        onChange={(e) => switchSession(e.target.value)}
        className="max-w-[170px] truncate rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/80 outline-none"
      >
        {sessions.map((s) => (
          <option key={s.id} value={s.id} className="bg-[#0a1014]">
            {s.title}
          </option>
        ))}
      </select>
      <button
        onClick={() => createSession()}
        title="New session"
        className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 hover:bg-white/10"
      >
        ＋
      </button>
    </div>
  );
}
