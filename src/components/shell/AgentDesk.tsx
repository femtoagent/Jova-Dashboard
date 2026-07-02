"use client";

import { useEffect, useRef, useState } from "react";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import type { AgentNode, AgentTask, Team } from "@/lib/network/types";
import { characterFor, NEXUS_SENDER } from "@/lib/agents/roomCharacters";
import { roleIcon } from "@/lib/agents/roleGlyphs";
import { Wrench } from "@phosphor-icons/react";
import { AgentActor } from "./AgentActor";

/** Design-space size of one desk unit; TeamRoom scales the whole unit. */
export const DESK_W = 200;
export const DESK_H = 200;

/**
 * One workstation in the Team Room: the desk, its crewmate (idle = reclined + a role-flavored
 * relaxing beat, or a generic one for custom roles; active = leaning in, lit visor, work motes),
 * the provenance-stamped paper pile (sheets pop in as tasks start — synced to land WITH the
 * flying document — thicken as steps advance, fly off with a hop + confetti on completion),
 * speech bubbles, selection ring, and label. `walkX/walkY` slide the crewmate toward a teammate
 * during a handoff; `celebrateTick` makes everyone hop when an initiative ships.
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
  hideActor = false,
  celebrateTick = 0,
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
  /** true while this crewmate is out walking a delivery (the WalkerLayer draws it instead) */
  hideActor?: boolean;
  celebrateTick?: number;
  onSelect: () => void;
}) {
  const c = characterFor(agent);
  const active = agent.tasks.length > 0;
  const Glyph = roleIcon(agent.role);
  const flows = useNetworkStore((s) => s.flows);
  const { ghosts, hopTick } = useGhostSheets(agent.tasks);
  const [bang, setBang] = useState(false); // the "!" when handed work lands

  // provenance for a sheet: sender's character accent (or Nexus), owner's accent as fallback
  const sheetIdentity = (t: AgentTask) => {
    if (t.fromAgentId === null) return { color: NEXUS_SENDER.accent, from: NEXUS_SENDER.name };
    const sender = t.fromAgentId ? team.agents.find((a) => a.id === t.fromAgentId) : undefined;
    if (sender) return { color: characterFor(sender).accent, from: sender.label };
    return { color: c.accent, from: agent.label };
  };

  const onLanded = () => {
    setBang(true);
    window.setTimeout(() => setBang(false), 1400);
  };

  const idle = !active ? idleBeatFor(agent, c.accent) : null;
  const hopKey = hopTick + celebrateTick * 1000;
  const walking = hideActor;

  return (
    <button
      data-agent-desk
      data-agent-id={agent.id}
      data-active={active ? "true" : "false"}
      data-walking={walking ? "true" : "false"}
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

      {/* the crewmate — hidden while out on a delivery (the WalkerLayer draws it walking) */}
      <div
        className="absolute"
        style={{
          left: 68,
          top: 38,
          width: 64,
          height: 80,
          visibility: walking ? "hidden" : "visible",
          zIndex: 2,
        }}
      >
        <div key={hopKey} className="motion-safe-anim" style={hopKey > 0 ? { animation: "actor-hop 550ms ease-out" } : undefined}>
          <div
            className="motion-safe-anim"
            style={{
              animation: `actor-bob ${active ? "1.7s" : "4.2s"} ease-in-out infinite${idle?.wrapperAnim ? `, ${idle.wrapperAnim}` : ""}`,
              opacity: active ? 1 : 0.85,
            }}
          >
            <AgentActor character={c} active={active} width={64} />
          </div>
        </div>

        {/* speech bubbles */}
        {talking && (
          <span className="absolute -right-7 -top-4 flex items-center gap-[3px] rounded-lg rounded-bl-none border border-line bg-panel px-1.5 py-1" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="motion-safe-anim h-1 w-1 rounded-full bg-mist"
                style={{ animation: `typing-bounce 1.2s ease-in-out ${i * 0.15}s infinite` }}
              />
            ))}
          </span>
        )}
        {bang && (
          <span
            className="absolute -right-5 -top-6 grid h-5 w-5 origin-bottom-left place-items-center rounded-full rounded-bl-none border border-amber-300/60 bg-amber-400/20 text-[11px] font-bold text-amber-200 animate-[pop-in_240ms_ease-out]"
            aria-hidden
          >
            !
          </span>
        )}

        {/* idle: the occasional drifting "z" (every idler dozes now and then, whatever their beat) */}
        {!active && !walking && (
          <span
            className="motion-safe-anim absolute -right-2 top-0 select-none text-[13px] font-semibold"
            style={{ color: c.accent, animation: "zz-drift 5.5s ease-in-out infinite", opacity: 0 }}
            aria-hidden
          >
            z
          </span>
        )}
        {/* idle: role-flavored (or generic) relaxing beat */}
        {!walking && idle?.deco}
      </div>

      {/* role badge on the chest */}
      <span
        className="absolute grid h-[17px] w-[17px] place-items-center rounded-full border"
        style={{
          left: 91,
          top: 79,
          background: "#0d1018",
          borderColor: c.accent,
          color: c.accent,
          zIndex: 2,
          visibility: walking ? "hidden" : "visible",
        }}
        aria-hidden
      >
        <Glyph size={10} weight="bold" />
      </span>

      {/* the desk (in front of the crewmate) */}
      <svg width={DESK_W} height={DESK_H} className="pointer-events-none absolute inset-0 overflow-visible" style={{ zIndex: 3 }} aria-hidden>
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
        {/* screen light: a cone rising from the monitor to the crewmate's face, fading upward */}
        {active && (
          <>
            <defs>
              <linearGradient id={`cast-${agent.id}`} x1="0" y1="1" x2="0.4" y2="0">
                <stop offset="0%" stopColor={team.color} stopOpacity="0.22" />
                <stop offset="100%" stopColor={team.color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={`M 54 94 L 88 103 L 108 62 L 74 50 Z`} fill={`url(#cast-${agent.id})`} />
          </>
        )}
        {/* a mug on the desk when relaxing */}
        {!active && (
          <g opacity="0.85">
            <rect x="128" y="128" width="9" height="9" rx="2" fill="#2a3350" stroke="rgba(160,190,255,0.25)" strokeWidth="1" />
            <path d="M 137 130 q 5 2 0 5" fill="none" stroke="rgba(160,190,255,0.35)" strokeWidth="1.2" />
          </g>
        )}
      </svg>

      {/* work pile — sheets keyed by task id (mount = drop-in, delayed to land WITH the flight) */}
      <div className="absolute" style={{ left: 118, top: 84, width: 44, height: 44, zIndex: 4 }} data-pile-count={agent.tasks.length}>
        {agent.tasks.map((t, i) => {
          const id = sheetIdentity(t);
          const below = agent.tasks.slice(0, i).reduce((s, x) => s + 4 + x.steps * 1.6 + 2, 0);
          return (
            <Sheet
              key={t.id}
              task={t}
              color={id.color}
              from={id.from}
              bottom={below}
              inFlight={flows.some((f) => f.taskId === t.id)}
              onLanded={onLanded}
            />
          );
        })}
        {ghosts.map((g) => {
          const id = sheetIdentity(g.task);
          return (
            <div key={g.key} aria-hidden>
              <div
                className="motion-safe-anim absolute left-0 w-[38px] animate-[sheet-fly_650ms_ease-in_forwards]"
                style={{
                  bottom: 8,
                  height: 4 + g.task.steps * 1.6,
                  background: id.color,
                  border: "1px solid rgba(0,0,0,0.45)",
                  borderRadius: 2,
                  transform: "skewX(-24deg)",
                }}
              />
              {/* confetti! */}
              {Array.from({ length: 6 }, (_, i) => {
                const ang = (i / 6) * Math.PI * 2;
                return (
                  <span
                    key={i}
                    className="motion-safe-anim absolute h-1.5 w-1 rounded-[1px]"
                    style={
                      {
                        left: 14,
                        bottom: 14,
                        background: i % 3 === 0 ? team.color : i % 3 === 1 ? c.accent : "#f4f7ff",
                        "--dx": `${Math.cos(ang) * (18 + (i % 2) * 12)}px`,
                        "--dy": `${-24 - Math.abs(Math.sin(ang)) * 22}px`,
                        animation: `confetti-burst 650ms ease-out ${i * 30}ms forwards`,
                        opacity: 0,
                      } as React.CSSProperties
                    }
                  />
                );
              })}
            </div>
          );
        })}
      </div>

      {/* work sparks rising OFF THE SCREEN while active (they read as output, not decoration) */}
      {active && (
        <>
          <span
            className="motion-safe-anim absolute h-1.5 w-1.5 rounded-full"
            style={{ left: 62, top: 88, background: team.color, animation: "mote-rise 2.4s ease-out infinite", opacity: 0, zIndex: 4 }}
            aria-hidden
          />
          <span
            className="motion-safe-anim absolute h-1 w-1 rounded-full"
            style={{ left: 78, top: 92, background: c.accent, animation: "mote-rise 2.4s ease-out 1.1s infinite", opacity: 0, zIndex: 4 }}
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

/**
 * One pile sheet. If its task arrived on a flight, the sheet WAITS (invisible) and drops in the
 * moment the flight clears — true event sync, so walks of any length land the paper exactly when
 * the flying document does. Tasks with no flight (direct starts) drop immediately on mount.
 */
function Sheet({
  task,
  color,
  from,
  bottom,
  inFlight,
  onLanded,
}: {
  task: AgentTask;
  color: string;
  from: string;
  bottom: number;
  inFlight: boolean;
  onLanded: () => void;
}) {
  const [arrived, setArrived] = useState(() => !inFlight);
  useEffect(() => {
    if (arrived || inFlight) return;
    setArrived(true);
    onLanded();
    // fires exactly once, when this sheet's flight clears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFlight, arrived]);

  return (
    <div
      data-sheet
      data-task-id={task.id}
      title={`“${task.title}” — from ${from} · ${task.steps}/6 steps`}
      className="motion-safe-anim absolute left-0 w-[38px]"
      style={{
        bottom,
        height: 4 + task.steps * 1.6,
        background: color,
        opacity: arrived ? 0.92 : 0,
        border: "1px solid rgba(0,0,0,0.45)",
        borderRadius: 2,
        transform: "skewX(-24deg)",
        transition: "height 300ms ease, bottom 300ms ease",
        boxShadow: `0 0 8px ${color}55`,
        animation: arrived ? "sheet-drop 450ms ease-out" : "none",
      }}
    />
  );
}

/** Sheets for just-completed tasks linger briefly (fly-off + confetti); each batch bumps hopTick. */
function useGhostSheets(tasks: AgentTask[]) {
  const [ghosts, setGhosts] = useState<{ key: string; task: AgentTask }[]>([]);
  const [hopTick, setHopTick] = useState(0);
  const prev = useRef<AgentTask[]>(tasks);
  useEffect(() => {
    const cur = new Set(tasks.map((t) => t.id));
    const removed = prev.current.filter((t) => !cur.has(t.id));
    prev.current = tasks;
    if (!removed.length) return;
    const keys = removed.map((t) => `${t.id}-ghost`);
    setGhosts((g) => [...g, ...removed.map((t) => ({ key: `${t.id}-ghost`, task: t }))]);
    setHopTick((n) => n + 1);
    const timer = window.setTimeout(() => setGhosts((g) => g.filter((x) => !keys.includes(x.key))), 800);
    return () => window.clearTimeout(timer);
  }, [tasks]);
  return { ghosts, hopTick };
}

/** A relaxing beat: role-flavored when we know the role, else a generic one picked per agent. */
function idleBeatFor(agent: AgentNode, accent: string): { deco?: React.ReactNode; wrapperAnim?: string } {
  switch (agent.role) {
    case "qa":
      return {
        deco: (
          <span aria-hidden>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="motion-safe-anim absolute h-1.5 w-1.5 rounded-full"
                style={{ left: -6 + i * 9, top: 26, background: accent, animation: `bug-juggle 1.9s ease-in-out ${i * 0.63}s infinite` }}
              />
            ))}
          </span>
        ),
      };
    case "marketing":
      return {
        deco: (
          <span
            aria-hidden
            className="motion-safe-anim absolute"
            style={{
              left: 52,
              top: 18,
              width: 0,
              height: 0,
              borderLeft: `9px solid ${accent}`,
              borderTop: "3px solid transparent",
              borderBottom: "3px solid transparent",
              animation: "plane-glide 8s ease-in-out infinite",
              opacity: 0,
            }}
          />
        ),
      };
    case "developer":
      return {
        deco: (
          <span
            aria-hidden
            className="motion-safe-anim absolute select-none font-mono text-[11px] font-bold"
            style={{ left: -14, top: 14, color: accent, animation: "brace-float 3.4s ease-in-out infinite" }}
          >
            {"{ }"}
          </span>
        ),
      };
    case "cx":
      return {
        deco: (
          <span
            aria-hidden
            className="motion-safe-anim absolute rounded-full rounded-bl-none border"
            style={{
              left: 50,
              top: 8,
              width: 13,
              height: 10,
              borderColor: accent,
              background: `${accent}22`,
              animation: "cx-bubble 6s ease-in-out infinite",
              opacity: 0,
            }}
          />
        ),
      };
    case "devops":
      return {
        deco: (
          <span
            aria-hidden
            className="motion-safe-anim absolute"
            style={{ left: -13, top: 30, color: accent, animation: "wrench-turn 3.2s ease-in-out infinite", transformOrigin: "70% 70%" }}
          >
            <Wrench size={12} weight="fill" />
          </span>
        ),
      };
    case "pm":
      return {
        deco: (
          <span aria-hidden>
            {[0, 1].map((i) => (
              <span
                key={i}
                className="motion-safe-anim absolute h-2 w-[2px] rounded-full"
                style={{
                  left: 63 + i * 4,
                  top: 76,
                  background: "rgba(200,225,255,0.5)",
                  animation: `steam-rise 2.6s ease-out ${i * 1.1}s infinite`,
                  opacity: 0,
                }}
              />
            ))}
          </span>
        ),
      };
    default: {
      // GENERIC pool — agents created with custom roles still relax, deterministically per agent
      const pick = ["idle-stretch 7s ease-in-out infinite", "idle-sway 5s ease-in-out infinite", "idle-glance 8s ease-in-out infinite"][
        agent.seed % 3
      ];
      return { wrapperAnim: pick };
    }
  }
}
