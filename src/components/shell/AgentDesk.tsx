"use client";

import { useEffect, useRef, useState } from "react";
import type { AgentNode, AgentTask, Team } from "@/lib/network/types";
import { characterFor, NEXUS_SENDER } from "@/lib/agents/roomCharacters";
import { roleIcon } from "@/lib/agents/roleGlyphs";
import { AgentActor } from "./AgentActor";

/** Design-space size of one desk unit; TeamRoom scales the whole unit. */
export const DESK_W = 200;
export const DESK_H = 200;

/**
 * One workstation in the Team Room: the desk, its crewmate (idle = reclined + slow sway +
 * the occasional "z"; active = leaning in, lit visor, rising work motes), the provenance-
 * stamped paper pile (sheets pop in as tasks start, thicken as steps advance, fly off on
 * completion), selection ring, and label. Click selects the agent (detail in the sidebar).
 */
export function AgentDesk({
  team,
  agent,
  x,
  y,
  scale,
  z,
  selected,
  talking,
  onSelect,
}: {
  team: Team;
  agent: AgentNode;
  x: number;
  y: number;
  scale: number;
  z: number;
  selected: boolean;
  talking: boolean;
  onSelect: () => void;
}) {
  const c = characterFor(agent);
  const active = agent.tasks.length > 0;
  const Glyph = roleIcon(agent.role);
  const ghosts = useGhostSheets(agent.tasks);

  // provenance for a sheet: sender's character accent (or Nexus), owner's accent as fallback
  const sheetIdentity = (t: AgentTask) => {
    if (t.fromAgentId === null) return { color: NEXUS_SENDER.accent, from: NEXUS_SENDER.name };
    const sender = t.fromAgentId ? team.agents.find((a) => a.id === t.fromAgentId) : undefined;
    if (sender) return { color: characterFor(sender).accent, from: sender.label };
    return { color: c.accent, from: agent.label };
  };

  return (
    <button
      data-agent-desk
      data-agent-id={agent.id}
      data-active={active ? "true" : "false"}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      title={`${agent.label} — ${active ? `${agent.tasks.length} task${agent.tasks.length === 1 ? "" : "s"}` : "relaxing"}`}
      className="absolute block cursor-pointer"
      style={{
        left: x,
        top: y,
        width: DESK_W,
        height: DESK_H,
        transform: `translate(-50%, -100%) scale(${scale})`,
        transformOrigin: "50% 100%",
        zIndex: z,
      }}
    >
      {/* ground: shadow + selection/talking rings */}
      <svg width={DESK_W} height={DESK_H} className="absolute inset-0 overflow-visible" aria-hidden>
        <ellipse cx="100" cy="170" rx="80" ry="15" fill="rgba(0,0,0,0.45)" />
        {selected && <ellipse cx="100" cy="170" rx="86" ry="18" fill="none" stroke={team.color} strokeWidth="2" opacity="0.9" />}
        {talking && (
          <ellipse
            className="motion-safe-anim"
            cx="100"
            cy="170"
            rx="60"
            ry="13"
            fill="none"
            stroke={team.color}
            strokeWidth="2"
            style={{ transformOrigin: "100px 170px", animation: "presence-ripple 1.5s ease-out infinite" }}
          />
        )}
      </svg>

      {/* the crewmate — outer div = lean pose, inner = bob loop (compose, don't fight) */}
      <div className="absolute" style={{ left: 68, top: 38, width: 64, height: 80 }}>
        <div
          className="motion-safe-anim"
          style={{ animation: `actor-bob ${active ? "1.7s" : "4.2s"} ease-in-out infinite`, opacity: active ? 1 : 0.82 }}
        >
          <AgentActor character={c} active={active} width={64} />
        </div>
        {/* idle: the occasional drifting "z" */}
        {!active && (
          <span
            className="motion-safe-anim absolute -right-2 top-0 select-none text-[13px] font-semibold"
            style={{ color: c.accent, animation: "zz-drift 5.5s ease-in-out infinite", opacity: 0 }}
            aria-hidden
          >
            z
          </span>
        )}
      </div>

      {/* role badge on the chest */}
      <span
        className="absolute grid h-[17px] w-[17px] place-items-center rounded-full border"
        style={{ left: 91, top: 79, background: "#0d1018", borderColor: c.accent, color: c.accent }}
        aria-hidden
      >
        <Glyph size={10} weight="bold" />
      </span>

      {/* the desk (in front of the crewmate) */}
      <svg width={DESK_W} height={DESK_H} className="pointer-events-none absolute inset-0 overflow-visible" aria-hidden>
        {/* top */}
        <path
          d="M 25 132 L 100 110 L 175 132 L 100 154 Z"
          fill="#1b2136"
          stroke={active ? team.color : "rgba(160,190,255,0.18)"}
          strokeOpacity={active ? 0.6 : 1}
          strokeWidth="1.5"
        />
        {/* front faces */}
        <path d="M 25 132 L 100 154 L 100 168 L 25 146 Z" fill="#141a2c" />
        <path d="M 175 132 L 100 154 L 100 168 L 175 146 Z" fill="#10151f" />
        {/* monitor (back faces the viewer; it lights the crewmate when working) */}
        <path d="M 52 92 L 88 102 L 88 126 L 52 116 Z" fill="#0b0e18" stroke="rgba(160,190,255,0.22)" strokeWidth="1.2" />
        {active && <path d="M 55 95 L 85 104 L 85 123 L 55 114 Z" fill="none" stroke={team.color} strokeOpacity="0.75" strokeWidth="1.4" />}
        <line x1="70" y1="120" x2="70" y2="128" stroke="rgba(160,190,255,0.25)" strokeWidth="2" />
        {/* screen-light cast toward the crewmate */}
        {active && <ellipse cx="98" cy="100" rx="27" ry="15" fill={team.color} opacity="0.13" />}
        {/* a mug on the desk when relaxing */}
        {!active && (
          <g opacity="0.85">
            <rect x="128" y="128" width="9" height="9" rx="2" fill="#2a3350" stroke="rgba(160,190,255,0.25)" strokeWidth="1" />
            <path d="M 137 130 q 5 2 0 5" fill="none" stroke="rgba(160,190,255,0.35)" strokeWidth="1.2" />
          </g>
        )}
      </svg>

      {/* work pile — sheets keyed by task id (mount = drop-in); ghosts fly off */}
      <div className="absolute" style={{ left: 118, top: 84, width: 44, height: 44 }} data-pile-count={agent.tasks.length}>
        {agent.tasks.map((t, i) => {
          const id = sheetIdentity(t);
          const height = 4 + t.steps * 1.6;
          const below = agent.tasks.slice(0, i).reduce((s, x) => s + 4 + x.steps * 1.6 + 2, 0);
          return (
            <div
              key={t.id}
              data-sheet
              data-task-id={t.id}
              title={`“${t.title}” — from ${id.from} · ${t.steps}/6 steps`}
              className="absolute left-0 w-[38px] animate-[sheet-drop_450ms_ease-out]"
              style={{
                bottom: below,
                height,
                background: id.color,
                opacity: 0.92,
                border: "1px solid rgba(0,0,0,0.45)",
                borderRadius: 2,
                transform: "skewX(-24deg)",
                transition: "height 300ms ease, bottom 300ms ease",
                boxShadow: `0 0 8px ${id.color}55`,
              }}
            />
          );
        })}
        {ghosts.map((g) => {
          const id = sheetIdentity(g.task);
          return (
            <div
              key={g.key}
              className="absolute left-0 w-[38px] animate-[sheet-fly_650ms_ease-in_forwards]"
              style={{
                bottom: 8,
                height: 4 + g.task.steps * 1.6,
                background: id.color,
                border: "1px solid rgba(0,0,0,0.45)",
                borderRadius: 2,
                transform: "skewX(-24deg)",
              }}
              aria-hidden
            />
          );
        })}
      </div>

      {/* rising work motes while active */}
      {active && (
        <>
          <span
            className="motion-safe-anim absolute h-1.5 w-1.5 rounded-full"
            style={{ left: 88, top: 96, background: team.color, animation: "mote-rise 2.4s ease-out infinite", opacity: 0 }}
            aria-hidden
          />
          <span
            className="motion-safe-anim absolute h-1 w-1 rounded-full"
            style={{ left: 112, top: 100, background: c.accent, animation: "mote-rise 2.4s ease-out 1.1s infinite", opacity: 0 }}
            aria-hidden
          />
        </>
      )}

      {/* label */}
      <div className="pointer-events-none absolute inset-x-0 text-center" style={{ top: 176 }}>
        <div className="truncate text-[12px] font-semibold" style={{ color: c.accent }}>
          {agent.label}
        </div>
        <div className="text-[10px] text-faint">
          {active ? `${agent.tasks.length} task${agent.tasks.length === 1 ? "" : "s"} · ${agent.tasks.reduce((s, t) => s + t.steps, 0)} steps` : "relaxing"}
        </div>
      </div>
    </button>
  );
}

/** Sheets for just-completed tasks linger briefly to play the fly-off animation. */
function useGhostSheets(tasks: AgentTask[]) {
  const [ghosts, setGhosts] = useState<{ key: string; task: AgentTask }[]>([]);
  const prev = useRef<AgentTask[]>(tasks);
  useEffect(() => {
    const cur = new Set(tasks.map((t) => t.id));
    const removed = prev.current.filter((t) => !cur.has(t.id));
    prev.current = tasks;
    if (!removed.length) return;
    const keys = removed.map((t) => `${t.id}-ghost`);
    setGhosts((g) => [...g, ...removed.map((t) => ({ key: `${t.id}-ghost`, task: t }))]);
    const timer = window.setTimeout(() => setGhosts((g) => g.filter((x) => !keys.includes(x.key))), 700);
    return () => window.clearTimeout(timer);
  }, [tasks]);
  return ghosts;
}
