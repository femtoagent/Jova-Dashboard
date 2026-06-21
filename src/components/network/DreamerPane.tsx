"use client";

import { useState } from "react";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useJovaStore } from "@/lib/state/useJovaStore";
import type { Dream } from "@/lib/network/types";
import { NEXUS_CHAT_TARGET } from "@/lib/jova/types";

/**
 * The Dreamer's pane, decluttered to a small "dream cloud" in the top-right: it glows + shows a count
 * when PMs/Nexus have ideas waiting, and expands the feed on click. Each daily "how would I improve my
 * team / product?" reflection awaits Approve / Deny / Ask. Ask opens that PM's chat + sets its orb
 * talking. (The real daily cron that prompts live PMs is Step B; this is mock + a manual re-run.)
 */
export function DreamerPane() {
  const focusedTeamId = useNetworkStore((s) => s.focusedTeamId);
  const dreams = useNetworkStore((s) => s.dreams);
  const teams = useNetworkStore((s) => s.teams);
  const resolveDream = useNetworkStore((s) => s.resolveDream);
  const askDream = useNetworkStore((s) => s.askDream);
  const runDreams = useNetworkStore((s) => s.runDreams);
  const openChatWith = useJovaStore((s) => s.openChatWith);
  const addMessage = useJovaStore((s) => s.addMessage);
  const [open, setOpen] = useState(false);
  if (focusedTeamId) return null; // only at the Nexus overview

  const count = dreams.length;
  const active = count > 0;

  const ask = (d: Dream) => {
    askDream(d.id); // focuses the team + selects its PM + sets the orb talking (no-op for Nexus)
    let sid: string | null = null;
    if (d.teamId) {
      const team = teams.find((t) => t.id === d.teamId);
      const pm = team?.agents.find((a) => a.role === "pm");
      if (team && pm) sid = openChatWith({ teamId: team.id, agentId: pm.id, teamName: team.name, label: pm.label, color: team.color });
    } else {
      sid = openChatWith(NEXUS_CHAT_TARGET); // Nexus dream → talk to Nexus
    }
    // seed the conversation with the dream so you have the context as the first message
    if (sid) addMessage(sid, { id: crypto.randomUUID(), role: "assistant", content: d.text, createdAt: Date.now(), kind: "dream" });
  };

  return (
    <div className="fixed right-4 top-4 z-10 flex flex-col items-end gap-2">
      {/* the dream cloud — glows + counts when there are dreams; click to open the feed */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Dreams"
        className={`relative flex h-11 w-12 items-center justify-center rounded-2xl border backdrop-blur-md transition ${
          active ? "border-violet-300/40 bg-violet-400/15 hover:bg-violet-400/25" : "border-white/10 bg-black/40 hover:bg-white/10"
        }`}
      >
        <span className={`text-xl leading-none ${active ? "animate-pulse" : "opacity-50"}`} style={active ? { filter: "drop-shadow(0 0 6px #c9a8ff)" } : undefined}>
          ☁
        </span>
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-violet-400 px-1 text-[10px] font-semibold text-white shadow-[0_0_8px_#c9a8ff]">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="flex max-h-[72vh] w-[min(300px,82vw)] flex-col rounded-2xl border border-white/10 bg-black/40 p-4 text-white/85 backdrop-blur-xl animate-[fadein_200ms_ease]">
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-sm font-semibold tracking-wide text-violet-100">Dreams</span>
            <span className="ml-auto text-[10px] uppercase tracking-wider text-white/40">{count}</span>
          </div>
          <p className="mb-2 text-[10px] leading-snug text-white/35">Daily &ldquo;how would I improve my team / product?&rdquo; ideas.</p>

          <ul className="flex-1 space-y-2 overflow-y-auto pr-1">
            {dreams.map((d) => (
              <li key={d.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2.5">
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: d.color, boxShadow: `0 0 6px ${d.color}` }} />
                  <span className="truncate text-[11px] font-medium" style={{ color: d.color }}>{d.title}</span>
                  <span className="shrink-0 text-[10px] text-white/35">· {d.teamId ? "PM" : "network"}</span>
                </div>
                <div className="mb-2 text-[11px] leading-snug text-white/80">{d.text}</div>
                <div className="flex gap-1.5">
                  <button onClick={() => resolveDream(d.id)} className="rounded border border-emerald-300/30 bg-emerald-400/15 px-2 py-0.5 text-[10px] text-emerald-50 transition hover:bg-emerald-400/25">
                    Approve
                  </button>
                  <button onClick={() => resolveDream(d.id)} className="rounded border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-white/60 transition hover:bg-white/10">
                    Deny
                  </button>
                  <button onClick={() => ask(d)} className="rounded border border-violet-300/30 bg-violet-400/15 px-2 py-0.5 text-[10px] text-violet-50 transition hover:bg-violet-400/25">
                    Ask
                  </button>
                </div>
              </li>
            ))}
            {count === 0 && <li className="text-[11px] text-white/40">No dreams right now — run today&rsquo;s below.</li>}
          </ul>

          <button
            onClick={runDreams}
            className="mt-2 w-full rounded-md border border-violet-300/25 bg-violet-400/10 px-2 py-1 text-[11px] text-violet-50 transition hover:bg-violet-400/20"
          >
            ↻ Run today&rsquo;s dreams
          </button>
        </div>
      )}
    </div>
  );
}
