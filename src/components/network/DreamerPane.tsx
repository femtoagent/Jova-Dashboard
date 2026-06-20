"use client";

import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useJovaStore } from "@/lib/state/useJovaStore";

/**
 * The Dreamer's pane — a right-edge feed at the Nexus overview. Each day's PM (and Nexus) "if I could
 * improve my team / product, what would I do?" reflections land here, awaiting Approve / Deny / Ask.
 * Ask flies you into that PM and sets their orb "talking". (The daily cron that prompts real PMs is
 * Step B; this is mock + a manual "Run today's dreams".)
 */
export function DreamerPane() {
  const focusedTeamId = useNetworkStore((s) => s.focusedTeamId);
  const dreams = useNetworkStore((s) => s.dreams);
  const resolveDream = useNetworkStore((s) => s.resolveDream);
  const askDream = useNetworkStore((s) => s.askDream);
  const runDreams = useNetworkStore((s) => s.runDreams);
  const setChatOpen = useJovaStore((s) => s.setChatOpen);
  if (focusedTeamId) return null; // only at the Nexus overview

  const ask = (id: string) => {
    askDream(id); // zooms into the PM + sets its orb talking (no-op for Nexus dreams)
    setChatOpen(true); // open the chat to reply
  };

  return (
    <div className="fixed right-4 top-4 z-10 flex max-h-[72vh] w-[min(300px,82vw)] flex-col rounded-2xl border border-white/10 bg-black/40 p-4 text-white/85 backdrop-blur-xl">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "#c9a8ff", boxShadow: "0 0 10px #c9a8ff" }} />
        <span className="text-sm font-semibold tracking-wide text-violet-100">Dreams</span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-white/40">{dreams.length}</span>
      </div>
      <p className="mb-2 text-[10px] leading-snug text-white/35">
        Daily &ldquo;how would I improve my team / product?&rdquo; ideas. Approve, deny, or ask.
      </p>

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
              <button onClick={() => ask(d.id)} className="rounded border border-violet-300/30 bg-violet-400/15 px-2 py-0.5 text-[10px] text-violet-50 transition hover:bg-violet-400/25">
                Ask
              </button>
            </div>
          </li>
        ))}
        {dreams.length === 0 && <li className="text-[11px] text-white/40">No dreams right now — run today&rsquo;s below.</li>}
      </ul>

      <button
        onClick={runDreams}
        className="mt-2 w-full rounded-md border border-violet-300/25 bg-violet-400/10 px-2 py-1 text-[11px] text-violet-50 transition hover:bg-violet-400/20"
      >
        ↻ Run today&rsquo;s dreams
      </button>
    </div>
  );
}
