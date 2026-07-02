"use client";

import { useEffect, useMemo, useState } from "react";
import { listAgents, type AgentInfo } from "@/lib/jova/agents";
import { useJovaStore } from "@/lib/state/useJovaStore";
import type { ChatTarget } from "@/lib/jova/types";
import { characterByName, isSystemAgent, matchSecretCode, JOVA_AGENT_NAME } from "@/lib/agents/characters";
import { useSecretAgents, useIsHidden } from "@/lib/agents/useSecretAgents";

/** Build a chat target for a live agent. teamId "character" marks it as a real Letta agent (so the
 *  header doesn't deep-link to the mock network editor); lettaId carries the routable id. */
function targetFor(a: AgentInfo): ChatTarget {
  const meta = characterByName(a.name);
  return {
    teamId: "character",
    agentId: a.id,
    teamName: meta?.display ?? a.name,
    label: a.role || meta?.label || "", // the subtitle = the agent's Role
    color: meta?.color ?? "#67e8f9",
    team: a.team || undefined,
    lettaId: a.id,
  };
}

function glyph(a: AgentInfo): string {
  const meta = characterByName(a.name);
  return meta?.emoji ?? (a.name.trim()[0] ?? "?").toUpperCase();
}

/**
 * New-chat picker — type a name to find someone to talk to. Discoverability is deliberately low:
 * nothing shows until you type, so characters aren't advertised. Secret characters (e.g. Mira) stay
 * hidden until their code is typed here (e.g. "=^.^="), which unlocks them for this session across the
 * chat picker, the Voice studio, and Routing. Selecting an agent opens a thread routed to its real id.
 */
export function NewChatPicker({ onClose }: { onClose: () => void }) {
  const [agents, setAgents] = useState<AgentInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const openChatWith = useJovaStore((s) => s.openChatWith);
  const openJovaChat = useJovaStore((s) => s.openJovaChat);
  const unlock = useSecretAgents((s) => s.unlock);
  const hidden = useIsHidden();

  useEffect(() => {
    let alive = true;
    listAgents()
      .then((a) => { if (alive) setAgents(a); })
      .catch((e) => { if (alive) { setError(String(e)); setAgents([]); } });
    return () => { alive = false; };
  }, []);

  // typing the secret code reveals the character in THIS picker only; she isn't unlocked into the
  // Voice studio / Agents settings until you actually click her name to start a chat (see pick()).
  const codeMatch = q.trim() ? matchSecretCode(q) : null;

  const needle = q.trim().toLowerCase();
  const results = useMemo(() => {
    return (agents ?? []).filter((a) => {
      const name = a.name.toLowerCase();
      if (name === JOVA_AGENT_NAME) return false; // Jova has her own row
      if (isSystemAgent(a.name)) return false; // hide specialists (e.g. jova-docs)
      if (hidden(a.name) && name !== codeMatch) return false; // secret + still locked
      if (!needle) return false; // empty query: stay non-apparent
      if (name === codeMatch) return true; // revealed by its code
      const meta = characterByName(a.name);
      return `${a.name} ${meta?.display ?? ""} ${meta?.label ?? ""}`.toLowerCase().includes(needle);
    });
  }, [agents, needle, hidden, codeMatch]);

  const showJova = !needle || "jova".includes(needle);

  const pick = (a: AgentInfo) => {
    // clicking the name is what "engages" a secret character — NOW reveal her in Voice + Agents
    if (characterByName(a.name)?.secret) unlock(a.name);
    openChatWith(targetFor(a));
    onClose();
  };
  const pickJova = () => { openJovaChat(); onClose(); };

  return (
    <div className="flex w-[210px] shrink-0 flex-col border-r border-white/10 sm:w-[200px]">
      <div className="flex items-center gap-1 border-b border-white/10 px-2 py-2">
        <button onClick={onClose} title="Back" className="rounded px-1 text-[12px] text-white/50 transition hover:bg-white/10 hover:text-white/80">
          ‹
        </button>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">New chat</div>
      </div>

      <div className="p-1.5">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type a name…"
          className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-white/85 outline-none focus:border-cyan-300/40"
        />
      </div>

      <ul className="no-scrollbar min-h-0 flex-1 space-y-0.5 overflow-y-auto p-1.5 pt-0">
        {showJova && (
          <li>
            <button
              onClick={pickJova}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/10"
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                style={{ background: "#67e8f922", color: "#67e8f9", border: "1px solid #67e8f955" }}
              >
                J
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium text-white/85">Jova</span>
                <span className="block truncate text-[10px] text-white/40">your companion</span>
              </span>
            </button>
          </li>
        )}

        {results.map((a) => {
          const meta = characterByName(a.name);
          const c = meta?.color ?? "#67e8f9";
          return (
            <li key={a.id}>
              <button
                onClick={() => pick(a)}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/10"
              >
                <span
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                  style={{ background: `${c}22`, color: c, border: `1px solid ${c}55` }}
                >
                  {glyph(a)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium" style={{ color: c }}>
                    {meta?.display ?? a.name}
                  </span>
                  {meta?.label && <span className="block truncate text-[10px] text-white/40">{meta.label}</span>}
                </span>
              </button>
            </li>
          );
        })}

        {agents === null && !error && <li className="px-2 py-1.5 text-[11px] text-white/35">Loading…</li>}
        {error && <li className="px-2 py-1.5 text-[11px] text-rose-300/70">Couldn&apos;t load agents.</li>}
        {agents && needle && !results.length && !showJova && (
          <li className="px-2 py-2 text-[11px] text-white/35">No one by that name.</li>
        )}
        {agents && !needle && (
          <li className="px-2 py-2 text-[11px] text-white/30">Type a name to find someone to talk to.</li>
        )}
      </ul>
    </div>
  );
}
