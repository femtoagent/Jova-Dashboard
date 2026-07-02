"use client";

import { useEffect, useRef, useState } from "react";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { NEXUS_CHAT_TARGET } from "@/lib/jova/types";
import type { Team } from "@/lib/network/types";

/** World bounds the 3D canopy uses — the map projects the same coordinates. */
const WX = 36; // |x| max
const WY_MIN = 6;
const WY_MAX = 42;

interface Box {
  w: number;
  h: number;
}

/** Project a team's (3D) world position onto the map in pixels. */
function toPx(pos: [number, number, number], box: Box): { x: number; y: number } {
  const padX = Math.max(36, box.w * 0.1);
  const padTop = 48;
  const usableH = box.h * 0.72;
  const x = padX + ((pos[0] + WX) / (2 * WX)) * (box.w - 2 * padX);
  const y = padTop + ((WY_MAX - pos[1]) / (WY_MAX - WY_MIN)) * Math.max(usableH - padTop, 40);
  return { x, y };
}

/** Inverse of toPx — turn a dragged pixel point back into world coordinates (z preserved). */
function toWorld(x: number, y: number, box: Box): { wx: number; wy: number } {
  const padX = Math.max(36, box.w * 0.1);
  const padTop = 48;
  const usableH = box.h * 0.72;
  const wx = ((x - padX) / Math.max(box.w - 2 * padX, 1)) * 2 * WX - WX;
  const wy = WY_MAX - ((y - padTop) / Math.max(usableH - padTop, 40)) * (WY_MAX - WY_MIN);
  return { wx: Math.max(-WX, Math.min(WX, wx)), wy: Math.max(WY_MIN, Math.min(WY_MAX, wy)) };
}

function nexusPx(box: Box): { x: number; y: number } {
  return { x: box.w / 2, y: box.h * 0.86 };
}

/**
 * The constellation: teams on the canopy, strands from Nexus's core, activity pulses. The SAME
 * world coordinates as the 3D view, so drag-to-organize carries across renderers. Click a team
 * to focus it (detail lands in the docked sidebar — the map itself never gets covered). Click
 * empty space to return to the network overview.
 */
export function NetworkMap() {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box>({ w: 0, h: 0 });
  const teams = useNetworkStore((s) => s.teams);
  const focusedTeamId = useNetworkStore((s) => s.focusedTeamId);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      data-network-map
      onClick={() => useNetworkStore.getState().focusTeam(null)}
      className="relative h-full w-full overflow-hidden"
    >
      {/* a quieter cut of the void backdrop */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 100% at 50% 112%, #0a1220 0%, #080c14 48%, #07080c 82%)" }}
      />
      <div
        aria-hidden
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(rgba(190,230,255,0.3) 0.6px, transparent 0.6px)",
          backgroundSize: "170px 170px",
        }}
      />

      {box.w > 0 && (
        <>
          <Strands teams={teams} box={box} />
          <NexusNode box={box} />
          {teams.map((t) => (
            <TeamDot key={t.id} team={t} box={box} focused={focusedTeamId === t.id} dimmed={!!focusedTeamId && focusedTeamId !== t.id} />
          ))}
        </>
      )}
    </div>
  );
}

/** Energy strands from Nexus's core to every team, with a slow travelling pulse. */
function Strands({ teams, box }: { teams: Team[]; box: Box }) {
  const n = nexusPx(box);
  return (
    <svg className="absolute inset-0 h-full w-full" width={box.w} height={box.h} aria-hidden>
      {teams.map((t, i) => {
        const p = toPx(t.position, box);
        const d = `M ${n.x} ${n.y - 22} Q ${(n.x + p.x) / 2} ${p.y + (n.y - p.y) * 0.3} ${p.x} ${p.y}`;
        const busy = t.agents.reduce((s, a) => s + a.tasks.length, 0);
        const dur = Math.max(3.5, 8.5 - busy * 1.2);
        return (
          <g key={t.id}>
            <path d={d} fill="none" stroke={t.color} strokeOpacity={0.2} strokeWidth={1.5} />
            <path
              className="motion-safe-anim"
              d={d}
              fill="none"
              stroke={t.color}
              strokeOpacity={0.75}
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray="4 46"
              style={{ animation: `strand-pulse ${dur}s linear ${i * 0.7}s infinite` }}
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
            background: "radial-gradient(circle, rgba(159,232,255,0.38) 0%, rgba(159,232,255,0.07) 45%, transparent 70%)",
            opacity: nexusActive ? 1 : 0.5,
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
      {/* label is absolute (top-full) so it doesn't inflate the wrapper — the orb stays centered on
          the point where the strands terminate */}
      <div className="pointer-events-none absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap text-center text-[11px] font-medium tracking-wide text-cyan-100/85">
        Nexus
      </div>
    </div>
  );
}

/** A team on the map — click to focus, drag to organize (shared with the 3D world). */
function TeamDot({ team, box, focused, dimmed }: { team: Team; box: Box; focused: boolean; dimmed: boolean }) {
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
    const host = (e.currentTarget.closest("[data-network-map]") as HTMLElement | null)?.getBoundingClientRect();
    if (!host) return;
    const { wx, wy } = toWorld(e.clientX - host.left, e.clientY - host.top, box);
    setTeamPosition(team.id, [wx, wy, team.position[2]]);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) setDraggingTeam(null);
    else focusTeam(focused ? null : team.id);
  };
  // a cancelled pointer (touch scroll / system gesture) ends a drag but is NOT a click
  const onPointerCancel = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved) setDraggingTeam(null);
  };

  return (
    <div
      className={`absolute -translate-x-1/2 -translate-y-1/2 transition-opacity duration-300 ${dimmed ? "opacity-45" : ""}`}
      style={{ left: p.x, top: p.y }}
    >
      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={(e) => e.stopPropagation()}
        title={`${team.name} — ${team.agents.length} agents${needs ? `, ${needs} awaiting sign-off` : ""}`}
        className="relative grid h-11 w-11 cursor-pointer touch-none place-items-center rounded-full"
      >
        {focused && (
          <span aria-hidden className="absolute inset-0 rounded-full border" style={{ borderColor: `${team.color}88` }} />
        )}
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
          className="relative block rounded-full transition-all duration-300"
          style={{
            width: focused ? 20 : 16,
            height: focused ? 20 : 16,
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
      {/* label is absolute (top-full) so the wrapper's height is just the orb — that keeps the orb
          centered exactly on (p.x, p.y), where each strand terminates */}
      <div className="pointer-events-none absolute left-1/2 top-full mt-0.5 -translate-x-1/2 whitespace-nowrap text-center">
        <div className="text-[12px] font-medium" style={{ color: team.color }}>
          {team.name}
        </div>
        <div className="text-[10px] text-faint">
          {team.agents.length} agents{busy > 0 ? ` · ${busy} task${busy === 1 ? "" : "s"}` : ""}
        </div>
      </div>
    </div>
  );
}
