"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { useSettingsStore } from "@/lib/settings/useSettingsStore";
import { NEXUS_CHAT_TARGET } from "@/lib/jova/types";
import type { AgentNode, Team } from "@/lib/network/types";
import { ChatCircle, PencilSimple, ArrowsOutSimple } from "@phosphor-icons/react";

/** World bounds the 3D canopy uses — the 2D board projects the same coordinates. */
const WX = 36; // |x| max
const WY_MIN = 6;
const WY_MAX = 42;

interface Box {
  w: number;
  h: number;
}

/** Project a team's (3D) world position onto the board in pixels. */
function toPx(pos: [number, number, number], box: Box): { x: number; y: number } {
  const padX = Math.max(28, box.w * 0.09);
  const padTop = 76;
  const usableH = box.h * 0.66;
  const x = padX + ((pos[0] + WX) / (2 * WX)) * (box.w - 2 * padX);
  const y = padTop + ((WY_MAX - pos[1]) / (WY_MAX - WY_MIN)) * Math.max(usableH - padTop, 40);
  return { x, y };
}

/** Inverse of toPx — turn a dragged pixel point back into world coordinates (z preserved). */
function toWorld(x: number, y: number, box: Box): { wx: number; wy: number } {
  const padX = Math.max(28, box.w * 0.09);
  const padTop = 76;
  const usableH = box.h * 0.66;
  const wx = ((x - padX) / Math.max(box.w - 2 * padX, 1)) * 2 * WX - WX;
  const wy = WY_MAX - ((y - padTop) / Math.max(usableH - padTop, 40)) * (WY_MAX - WY_MIN);
  return { wx: Math.max(-WX, Math.min(WX, wx)), wy: Math.max(WY_MIN, Math.min(WY_MAX, wy)) };
}

function nexusPx(box: Box): { x: number; y: number } {
  return { x: box.w / 2, y: box.h * 0.82 };
}

/**
 * The network on the default (2D) stage: the same teams, strands, and interactions as the 3D
 * world, drawn with DOM nodes + one SVG underlay. Overview: click a team to focus it, drag to
 * organize (writes the shared world positions, so the 3D view keeps your arrangement). Focused:
 * the team's agents fan out on an orbit — click one for its quick menu (Talk / Edit), exactly
 * the 3D radial. Selection, radial, and talking state all live in the same network store.
 */
export function NetworkBoard() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box>({ w: 0, h: 0 });
  const teams = useNetworkStore((s) => s.teams);
  const focusedTeamId = useNetworkStore((s) => s.focusedTeamId);
  const focused = teams.find((t) => t.id === focusedTeamId) ?? null;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} data-network-board className="absolute inset-0">
      {box.w > 0 && (
        <>
          <div
            className={`absolute inset-0 transition-all duration-500 ${
              focused ? "pointer-events-none scale-[0.97] opacity-15" : "opacity-100"
            }`}
          >
            <Strands teams={teams} box={box} />
            <NexusNode box={box} />
            {teams.map((t) => (
              <TeamDot key={t.id} team={t} box={box} />
            ))}
          </div>
          {focused && <TeamCloseUp team={focused} box={box} />}
        </>
      )}
    </div>
  );
}

/** Energy strands from Nexus's crown to every team, with a slow travelling pulse. */
function Strands({ teams, box }: { teams: Team[]; box: Box }) {
  const n = nexusPx(box);
  return (
    <svg className="absolute inset-0 h-full w-full" width={box.w} height={box.h} aria-hidden>
      {teams.map((t, i) => {
        const p = toPx(t.position, box);
        const d = `M ${n.x} ${n.y - 26} Q ${(n.x + p.x) / 2} ${p.y + (n.y - p.y) * 0.3} ${p.x} ${p.y}`;
        const busy = t.agents.reduce((s, a) => s + a.tasks.length, 0);
        const dur = Math.max(3.5, 8.5 - busy * 1.2);
        return (
          <g key={t.id}>
            <path d={d} fill="none" stroke={t.color} strokeOpacity={0.22} strokeWidth={1.5} />
            <path
              className="motion-safe-anim"
              d={d}
              fill="none"
              stroke={t.color}
              strokeOpacity={0.8}
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray="4 46"
              style={{ animation: `strand-pulse ${dur}s linear infinite`, animationDelay: `${i * 0.7}s` }}
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Nexus — the orchestrator's core at the base of the canopy. Click to talk to her. */
function NexusNode({ box }: { box: Box }) {
  const nexusActive = useJovaStore((s) => s.nexusActive);
  const openChatWith = useJovaStore((s) => s.openChatWith);
  const p = nexusPx(box);
  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: p.x, top: p.y }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          openChatWith(NEXUS_CHAT_TARGET);
        }}
        title="Talk to Nexus"
        className="group relative grid h-16 w-16 place-items-center rounded-full"
      >
        {nexusActive && (
          <span
            aria-hidden
            className="motion-safe-anim absolute inset-0 rounded-full border border-cyan-200/60"
            style={{ animation: "presence-ripple 1.6s ease-out infinite" }}
          />
        )}
        <span
          aria-hidden
          className="motion-safe-anim absolute inset-[-70%] rounded-full transition-opacity duration-500"
          style={{
            background: "radial-gradient(circle, rgba(159,232,255,0.4) 0%, rgba(159,232,255,0.08) 45%, transparent 70%)",
            opacity: nexusActive ? 1 : 0.55,
            animation: "presence-breathe 5.5s ease-in-out infinite",
          }}
        />
        <span
          aria-hidden
          className="relative block h-9 w-9 rounded-full transition-shadow duration-500"
          style={{
            background: "radial-gradient(circle at 36% 32%, #e6fbff 0%, #9fe8ff 45%, rgba(95,208,255,0.6) 75%, transparent 100%)",
            boxShadow: nexusActive
              ? "0 0 30px rgba(95,208,255,0.9), 0 0 90px rgba(95,208,255,0.5)"
              : "0 0 18px rgba(95,208,255,0.55), 0 0 50px rgba(95,208,255,0.25)",
          }}
        />
      </button>
      <div className="pointer-events-none mt-1 text-center text-[11px] font-medium tracking-wide text-cyan-100/85">Nexus</div>
    </div>
  );
}

/** A team in the overview — click to focus, drag to organize (shared with the 3D world). */
function TeamDot({ team, box }: { team: Team; box: Box }) {
  const focusTeam = useNetworkStore((s) => s.focusTeam);
  const setTeamPosition = useNetworkStore((s) => s.setTeamPosition);
  const setDraggingTeam = useNetworkStore((s) => s.setDraggingTeam);
  const drag = useRef<{ id: number; startX: number; startY: number; moved: boolean } | null>(null);
  const p = toPx(team.position, box);
  const busy = team.agents.reduce((s, a) => s + a.tasks.length, 0);
  const needs = team.approvals.length;

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 5) return;
    if (!d.moved) {
      d.moved = true;
      setDraggingTeam(team.id);
    }
    const host = (e.currentTarget.closest("[data-network-board]") as HTMLElement | null)?.getBoundingClientRect();
    if (!host) return;
    const { wx, wy } = toWorld(e.clientX - host.left, e.clientY - host.top, box);
    setTeamPosition(team.id, [wx, wy, team.position[2]]);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) setDraggingTeam(null);
    else focusTeam(team.id);
  };
  // a cancelled pointer (touch scroll / system gesture) ends a drag but is NOT a click
  const onPointerCancel = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) setDraggingTeam(null);
  };

  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: p.x, top: p.y }}>
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={(e) => e.stopPropagation()}
        title={`${team.name} — ${team.agents.length} agents${needs ? `, ${needs} awaiting sign-off` : ""}`}
        className="relative grid h-11 w-11 cursor-pointer touch-none place-items-center rounded-full"
      >
        <span
          aria-hidden
          className="motion-safe-anim absolute inset-[-55%] rounded-full"
          style={{
            background: `radial-gradient(circle, ${team.color}52 0%, ${team.color}14 48%, transparent 72%)`,
            animation: busy > 0 ? "presence-breathe 3.6s ease-in-out infinite" : undefined,
          }}
        />
        <span
          aria-hidden
          className="relative block h-4 w-4 rounded-full"
          style={{
            background: `radial-gradient(circle at 36% 32%, #ffffff 0%, ${team.color} 55%, transparent 100%)`,
            boxShadow: `0 0 14px ${team.color}cc, 0 0 40px ${team.color}55`,
          }}
        />
        {needs > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-amber-300 px-0.5 text-[9px] font-bold text-black"
            title={`${needs} awaiting your sign-off`}
          >
            {needs}
          </span>
        )}
      </button>
      <div className="pointer-events-none mt-0.5 text-center">
        <div className="text-[12px] font-medium" style={{ color: team.color }}>
          {team.name}
        </div>
        <div className="text-[10px] text-white/40">
          {team.agents.length} agents{busy > 0 ? ` · ${busy} task${busy === 1 ? "" : "s"}` : ""}
        </div>
      </div>
    </div>
  );
}

/** The focused team — agents fan out on an orbit, each with the 3D radial's quick menu. */
function TeamCloseUp({ team, box }: { team: Team; box: Box }) {
  const selectedAgentId = useNetworkStore((s) => s.selectedAgentId);
  const talkingAgentId = useNetworkStore((s) => s.talkingAgentId);
  const radialAgentId = useNetworkStore((s) => s.radialAgentId);
  const radialTeamId = useNetworkStore((s) => s.radialTeamId);
  const setRadialTeam = useNetworkStore((s) => s.setRadialTeam);
  const focusTeam = useNetworkStore((s) => s.focusTeam);
  const openTeam = useSettingsStore((s) => s.openTeam);

  // orbit sized to the stage but clear of the bottom panels / chat
  const cx = box.w / 2;
  const cy = Math.max(box.h * 0.42, 200);
  const rx = Math.min(box.w * 0.34, 250);
  const ry = Math.min(box.h * 0.24, 185);

  // agents fan across the UPPER arc only (PM top-centre, others alternating outward), so none
  // land behind the chat pane / bottom panels that overlay the lower half of the stage
  const agents = team.agents;
  const pos = useMemo(
    () =>
      agents.map((_, i) => {
        const step = Math.min(50, 170 / Math.max(agents.length - 1, 1));
        const deg = -90 + (i === 0 ? 0 : Math.ceil(i / 2) * step * (i % 2 === 1 ? 1 : -1));
        const a = (deg * Math.PI) / 180;
        return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
      }),
    [agents, cx, cy, rx, ry],
  );

  return (
    <div className="absolute inset-0 animate-[fade_400ms_ease]">
      {/* orbit ring */}
      <div
        aria-hidden
        className="absolute rounded-[50%] border border-white/10"
        style={{ left: cx - rx, top: cy - ry, width: rx * 2, height: ry * 2 }}
      />

      {/* team core (the “brain”) — click for its quick menu, same as the 3D radial */}
      <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: cx, top: cy }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setRadialTeam(radialTeamId === team.id ? null : team.id);
          }}
          title={team.name}
          className="relative grid h-20 w-20 place-items-center rounded-full"
        >
          <span
            aria-hidden
            className="motion-safe-anim absolute inset-[-45%] rounded-full"
            style={{
              background: `radial-gradient(circle, ${team.color}5c 0%, ${team.color}18 48%, transparent 72%)`,
              animation: "presence-breathe 5s ease-in-out infinite",
            }}
          />
          <span
            aria-hidden
            className="relative block h-10 w-10 rounded-full"
            style={{
              background: `radial-gradient(circle at 36% 32%, #ffffff 0%, ${team.color} 52%, transparent 100%)`,
              boxShadow: `0 0 22px ${team.color}dd, 0 0 70px ${team.color}66`,
            }}
          />
        </button>
        <div className="pointer-events-none mt-1 text-center text-sm font-semibold" style={{ color: team.color }}>
          {team.name}
        </div>

        {radialTeamId === team.id && (
          <QuickMenu
            color={team.color}
            items={[
              { icon: <PencilSimple size={15} weight="bold" />, label: "Edit team", action: () => { setRadialTeam(null); openTeam(team.id); } },
              { icon: <ArrowsOutSimple size={15} weight="bold" />, label: "Zoom out", action: () => { setRadialTeam(null); focusTeam(null); } },
            ]}
          />
        )}
      </div>

      {agents.map((a, i) => (
        <AgentChip
          key={a.id}
          agent={a}
          team={team}
          x={pos[i]?.x ?? cx}
          y={pos[i]?.y ?? cy}
          selected={selectedAgentId === a.id}
          talking={talkingAgentId === a.id}
          radialOpen={radialAgentId === a.id}
        />
      ))}
    </div>
  );
}

/** An agent on the orbit. Click = show in the panel + toggle its quick menu (3D parity). */
function AgentChip({
  agent,
  team,
  x,
  y,
  selected,
  talking,
  radialOpen,
}: {
  agent: AgentNode;
  team: Team;
  x: number;
  y: number;
  selected: boolean;
  talking: boolean;
  radialOpen: boolean;
}) {
  const selectAgent = useNetworkStore((s) => s.selectAgent);
  const setRadialAgent = useNetworkStore((s) => s.setRadialAgent);
  const setTalkingAgent = useNetworkStore((s) => s.setTalkingAgent);
  const openChatWith = useJovaStore((s) => s.openChatWith);
  const openAgent = useSettingsStore((s) => s.openAgent);
  const busy = agent.tasks.length;

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const wasOpen = radialOpen;
    selectAgent(team.id, agent.id); // show in the bottom-left panel (clears radials)
    if (!wasOpen) setRadialAgent(agent.id);
  };

  return (
    <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: x, top: y }}>
      <button onClick={onClick} title={agent.label} className="relative grid h-11 w-11 place-items-center rounded-full">
        {talking && (
          <span
            aria-hidden
            className="motion-safe-anim absolute inset-0 rounded-full border"
            style={{ borderColor: `${team.color}99`, animation: "presence-ripple 1.4s ease-out infinite" }}
          />
        )}
        <span
          aria-hidden
          className="relative block h-3.5 w-3.5 rounded-full transition-transform"
          style={{
            background: busy > 0 ? team.color : `${team.color}88`,
            boxShadow: `0 0 ${selected || radialOpen ? 18 : 10}px ${team.color}${busy > 0 ? "cc" : "77"}`,
            transform: selected || radialOpen ? "scale(1.35)" : undefined,
          }}
        />
      </button>
      <div className="pointer-events-none mt-0.5 whitespace-nowrap text-center">
        <div className={`text-[11px] ${selected ? "font-semibold" : "font-medium"}`} style={{ color: team.color }}>
          {agent.label}
        </div>
        <div className="text-[10px] text-white/40">{busy > 0 ? `${busy} task${busy === 1 ? "" : "s"}` : "idle"}</div>
      </div>

      {radialOpen && (
        <QuickMenu
          color={team.color}
          items={[
            {
              icon: <ChatCircle size={15} weight="bold" />,
              label: "Talk",
              action: () => {
                setRadialAgent(null);
                setTalkingAgent(agent.id);
                openChatWith({ teamId: team.id, agentId: agent.id, teamName: team.name, label: agent.label, color: team.color });
              },
            },
            {
              icon: <PencilSimple size={15} weight="bold" />,
              label: "Edit",
              action: () => {
                setRadialAgent(null);
                openAgent(team.id, agent.id);
              },
            },
          ]}
        />
      )}
    </div>
  );
}

/** The 3D radial menu's 2D twin — actions fanned above the node. */
function QuickMenu({ color, items }: { color: string; items: { icon: React.ReactNode; label: string; action: () => void }[] }) {
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2" style={{ width: 0, height: 0 }}>
      {items.map((o, i, arr) => {
        const spread = 56;
        const ang = -90 - (spread * (arr.length - 1)) / 2 + i * spread;
        const r = 52;
        const x = Math.cos((ang * Math.PI) / 180) * r;
        const y = Math.sin((ang * Math.PI) / 180) * r;
        return (
          <button
            key={o.label}
            onClick={(e) => {
              e.stopPropagation();
              o.action();
            }}
            title={o.label}
            className="pointer-events-auto absolute flex h-9 w-9 items-center justify-center rounded-full border backdrop-blur-md transition hover:brightness-125"
            style={{
              left: x,
              top: y,
              transform: "translate(-50%, -50%)",
              borderColor: `${color}aa`,
              background: `${color}30`,
              color,
              boxShadow: `0 0 10px ${color}55`,
              animation: "radial-pop 240ms cubic-bezier(0.34, 1.56, 0.64, 1) backwards",
              animationDelay: `${i * 45}ms`,
            }}
          >
            {o.icon}
          </button>
        );
      })}
    </div>
  );
}
