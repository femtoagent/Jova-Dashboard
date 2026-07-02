"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useDisplayPrefs } from "@/lib/settings/useDisplayPrefs";
import { officeTheme } from "@/lib/network/officeThemes";
import type { Team } from "@/lib/network/types";
import { OfficeBackdrop, windowRect } from "./OfficeBackdrop";
import { AgentDesk, DESK_W, DESK_H } from "./AgentDesk";
import { HandoffLayer, NexusVisitors, type AgentSpot, type Anchor } from "./HandoffLayer";
import { WalkerLayer, deskZ, type WalkRecord } from "./WalkerLayer";
import { planWalk } from "./walkPlan";
import { InitiativeBoard } from "./InitiativeBoard";
import { DemoBoard } from "./DemoBoard";
import { ArrowLeft, CornersIn, CornersOut } from "@phosphor-icons/react";

interface Box {
  w: number;
  h: number;
}

/**
 * The PM's confetti bomb — an initiative just shipped, so the whole room gets showered:
 * a burst of flecks fires from the PM's desk, arcs OVER the team, and rains down. One-shot
 * (keyed by celebrateTick), colors from the team + white/amber, angles derived per fleck.
 */
function ConfettiBomb({
  origin,
  fallbackX,
  fallbackY,
  spreadX,
  color,
}: {
  origin?: { x: number; y: number };
  fallbackX: number;
  fallbackY: number;
  spreadX: number;
  color: string;
}) {
  const ox = origin?.x ?? fallbackX;
  const oy = (origin?.y ?? fallbackY) - 24;
  const COLORS = [color, "#f4f7ff", "#ffd27f", "#9fe8ff"];
  return (
    <div data-confetti-bomb className="pointer-events-none absolute inset-0" style={{ zIndex: 720 }} aria-hidden>
      {/* the pop at the PM */}
      <span
        className="motion-safe-anim absolute h-10 w-10 rounded-full border-2"
        style={{
          left: ox,
          top: oy,
          borderColor: color,
          transform: "translate(-50%, -50%)",
          animation: "presence-ripple 500ms ease-out forwards",
        }}
      />
      {Array.from({ length: 26 }, (_, i) => {
        // deterministic fan: spread across the room, varied peaks and falls
        const t = i / 25; // 0..1 across the fan
        const dx = (t - 0.5) * 2 * spreadX * (0.7 + ((i * 37) % 10) / 33);
        const peak = -(90 + ((i * 53) % 90));
        const fall = 90 + ((i * 29) % 130);
        return (
          <span
            key={i}
            className="motion-safe-anim absolute"
            style={
              {
                left: ox,
                top: oy,
                width: i % 2 ? 5 : 4,
                height: i % 2 ? 3 : 7,
                borderRadius: 1,
                background: COLORS[i % COLORS.length],
                "--dx": `${dx}px`,
                "--peak": `${peak}px`,
                "--fall": `${fall}px`,
                animation: `confetti-bomb ${1200 + ((i * 41) % 500)}ms ease-out ${i * 22}ms forwards`,
                opacity: 0,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

/** below this desk scale the room stops shrinking and becomes pannable instead */
const MIN_READABLE = 0.6;

/**
 * The Team Room: a decorated isometric office for the focused team. Desks lay out on an iso
 * grid that grows with the roster; when a big roster would shrink desks below readability the
 * room becomes PANNABLE (drag; "Fit" toggles the whole-room overview). The wall carries the
 * initiatives glassboard and the demo TV as scene objects; handoff documents fly desk-to-desk
 * (the sender walking partway first), and Nexus-spawned work is tossed in by an orb that rises
 * outside the window. The lighting follows how busy the team is, and the whole room celebrates
 * when an initiative ships.
 */
export function TeamRoom({ team }: { team: Team }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box>({ w: 0, h: 0 });
  const selectedAgentId = useNetworkStore((s) => s.selectedAgentId);
  const talkingAgentId = useNetworkStore((s) => s.talkingAgentId);
  const selectAgent = useNetworkStore((s) => s.selectAgent);
  const focusTeam = useNetworkStore((s) => s.focusTeam);
  const flows = useNetworkStore((s) => s.flows);
  const theme = officeTheme(useDisplayPrefs((s) => s.officeTheme));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const wallH = Math.max(Math.min(box.h * 0.3, 210), 96);
  // pannable rooms are also ZOOMABLE: pinch (or ctrl+wheel) between whole-room and readable
  const [zoom, setZoom] = useState(MIN_READABLE);

  // iso grid that grows with the roster; pannable instead of unreadable for big teams
  const layout = useMemo(() => {
    const n = team.agents.length;
    if (!n || box.w < 40 || box.h < 40)
      return {
        spots: [] as { agent: Team["agents"][number]; x: number; y: number; z: number }[],
        scale: 1,
        pannable: false,
        minZoom: MIN_READABLE,
        bounds: null as null | { minX: number; maxX: number; minY: number; maxY: number },
        depth: { firstRowBottom: 0, stepY: 1 },
      };
    const cols = Math.ceil(Math.sqrt(n));
    const rows = Math.ceil(n / cols);
    const units = team.agents.map((a, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      return { agent: a, ux: col - row, uy: col + row };
    });
    const uxs = units.map((u) => u.ux);
    const uys = units.map((u) => u.uy);
    const uxMin = Math.min(...uxs);
    const uxMax = Math.max(...uxs);
    const uyMax = Math.max(...uys);

    const stepXBase = DESK_W * 0.62;
    const stepYBase = DESK_H * 0.46;
    const availW = box.w - 24;
    const floorH = box.h - wallH - 16;
    const fitScale = Math.min(availW / ((uxMax - uxMin) * stepXBase + DESK_W), floorH / (uyMax * stepYBase + DESK_H));
    const pannable = fitScale < MIN_READABLE;
    const minZoom = Math.max(fitScale, 0.24); // fully zoomed out = the whole room
    const scale = pannable ? Math.min(Math.max(zoom, minZoom), 1.1) : Math.min(fitScale, 1.05);

    const stepX = stepXBase * scale;
    const stepY = stepYBase * scale;
    const contentH = uyMax * stepY + DESK_H * scale;
    const firstRowBottom = wallH + Math.max((floorH - contentH) / 2, 6) + DESK_H * scale;
    const cx = box.w / 2 - ((uxMin + uxMax) / 2) * stepX;

    const spots = units
      .map((u) => ({
        agent: u.agent,
        x: cx + u.ux * stepX,
        y: firstRowBottom + u.uy * stepY,
        z: deskZ(u.uy),
      }))
      .sort((a, b) => a.z - b.z);

    const xs = spots.map((s) => s.x);
    const ys = spots.map((s) => s.y);
    const halfW = (DESK_W * scale) / 2;
    const bounds = {
      minX: Math.min(...xs) - halfW,
      maxX: Math.max(...xs) + halfW,
      minY: Math.min(...ys) - DESK_H * scale,
      maxY: Math.max(...ys),
    };
    // depth scale for the walkers' painter's-algorithm z (shared coordinate system with desks)
    const depth = { firstRowBottom, stepY };
    return { spots, scale, pannable, minZoom, bounds, depth };
  }, [team.agents, box.w, box.h, wallH, zoom]);

  // ---- pan + pinch-zoom (big rosters) ----
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panDrag = useRef<{ id: number; startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d0: number; z0: number; panX: number; panY: number } | null>(null);
  const suppressClick = useRef(false);
  const panning = layout.pannable;
  useEffect(() => {
    setPan({ x: 0, y: 0 });
    setZoom(MIN_READABLE);
  }, [team.id]);
  // zoom changed the content extents — keep the pan inside them
  useEffect(() => {
    setPan((p) => clampPan(p));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout.bounds?.minX, layout.bounds?.maxX, layout.bounds?.minY, layout.bounds?.maxY]);

  const clampPan = (p: { x: number; y: number }) => {
    const b = layout.bounds;
    if (!b) return { x: 0, y: 0 };
    const clampAxis = (v: number, lo: number, hi: number) => (lo > hi ? 0 : Math.min(Math.max(v, lo), hi));
    return {
      x: clampAxis(p.x, box.w - b.maxX - 12, 12 - b.minX),
      y: clampAxis(p.y, box.h - b.maxY - 12, wallH - b.minY),
    };
  };

  const pinchDist = () => {
    const pts = [...pointers.current.values()];
    return pts.length >= 2 ? Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y) : 0;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panning) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try {
      ref.current?.setPointerCapture(e.pointerId);
    } catch {}
    if (pointers.current.size === 2) {
      // second finger down → pinch takes over (works even if a finger started on a desk)
      pinch.current = { d0: pinchDist(), z0: layout.scale, panX: pan.x, panY: pan.y };
      panDrag.current = null;
      return;
    }
    if ((e.target as HTMLElement).closest("[data-agent-desk],button")) return; // desks/chrome handle their own taps
    panDrag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, baseX: pan.x, baseY: pan.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pz = pinch.current;
    if (pz && pointers.current.size >= 2) {
      const d = pinchDist();
      if (pz.d0 > 0 && d > 0) {
        const next = Math.min(Math.max(pz.z0 * (d / pz.d0), layout.minZoom), 1.1);
        setZoom(next);
        // scale the pan with the zoom so the view roughly holds its spot (then clamp)
        const k = next / pz.z0;
        setPan({ x: pz.panX * k, y: pz.panY * k });
      }
      return;
    }
    const drag = panDrag.current;
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    setPan(clampPan({ x: drag.baseX + dx, y: drag.baseY + dy }));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pinch.current && pointers.current.size < 2) {
      pinch.current = null;
      suppressClick.current = true; // a pinch is not a tap
    }
    if (panDrag.current?.moved) suppressClick.current = true;
    if (panDrag.current?.id === e.pointerId) panDrag.current = null;
  };

  // trackpad/desktop zoom: ctrl+wheel (native non-passive listener so preventDefault works)
  const zoomRef = useRef({ pannable: layout.pannable, minZoom: layout.minZoom });
  zoomRef.current = { pannable: layout.pannable, minZoom: layout.minZoom };
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!zoomRef.current.pannable || !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((zc) => Math.min(Math.max(zc * Math.exp(-e.deltaY * 0.0022), zoomRef.current.minZoom), 1.1));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ---- room celebration: an initiative (PM task) just shipped ----
  const pm = team.agents.find((a) => a.role === "pm");
  const [celebrateTick, setCelebrateTick] = useState(0);
  const [bombLive, setBombLive] = useState(false); // the confetti layer unmounts after the shower
  const prevPmTasks = useRef<string[]>(pm?.tasks.map((t) => t.id) ?? []);
  useEffect(() => {
    const cur = pm?.tasks.map((t) => t.id) ?? [];
    const finished = prevPmTasks.current.some((id) => !cur.includes(id));
    prevPmTasks.current = cur;
    if (!finished) return;
    setCelebrateTick((n) => n + 1);
    setBombLive(true);
    const t = window.setTimeout(() => setBombLive(false), 2500);
    return () => window.clearTimeout(t);
  }, [pm?.tasks, pm]);

  // ---- walking deliveries: any sender leaves its seat and walks the aisles ----
  const [walks, setWalks] = useState<WalkRecord[]>([]);
  const seenFlows = useRef(new Set<string>());

  // per-agent geometry for flights + walk plans (in the pannable content's coordinate space)
  const spotsById = useMemo(() => {
    const map: Record<string, AgentSpot> = {};
    for (const s of layout.spots) map[s.agent.id] = { desk: { x: s.x, y: s.y }, chest: { x: s.x, y: s.y - 105 * layout.scale } };
    return map;
  }, [layout]);
  const win = windowRect(box.w, wallH);
  const winCenter: Anchor = { x: win.x + win.w / 2, y: win.y + win.h / 2 };
  // the window is fixed while the content pans — convert its anchor into content coordinates
  const nexusAnchor: Anchor = { x: winCenter.x - pan.x, y: winCenter.y - pan.y };

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return; // flights skip too
    for (const f of flows) {
      // ANY flow with a visible sender walks — assigns and handoffs alike (Nexus stays outside)
      if (f.teamId !== team.id || !f.fromAgentId || seenFlows.current.has(f.id)) continue;
      seenFlows.current.add(f.id);
      const senderSpot = spotsById[f.fromAgentId];
      const targetSpot = spotsById[f.toAgentId];
      const agent = team.agents.find((a) => a.id === f.fromAgentId);
      if (!senderSpot || !targetSpot || !agent) continue;
      const sender = f.fromAgentId;
      setWalks((ws) =>
        // one trip at a time per crewmate — a rapid second send tosses from the desk instead
        ws.some((w) => w.agent.id === sender) ? ws : [...ws, { flowId: f.id, agent, plan: planWalk(senderSpot.desk, targetSpot.desk, layout.scale) }],
      );
    }
  }, [flows, team.id, team.agents, spotsById, layout.scale]);
  const walkDone = (flowId: string) => setWalks((ws) => ws.filter((w) => w.flowId !== flowId));
  const walkingIds = new Set(walks.map((w) => w.agent.id));

  const busy = team.agents.length ? team.agents.filter((a) => a.tasks.length > 0).length / team.agents.length : 0;

  // wall furniture placement (kept clear of the window + lamp; TV hugs the right)
  const boardW = Math.min(Math.max(box.w * 0.26, 118), 260);
  const boardLeft = box.w * 0.42;
  const tvW = Math.min(Math.max(box.w * 0.13, 64), 150);
  const tvLeft = Math.min(Math.max(box.w * 0.76, boardLeft + boardW + 10), box.w - tvW - 8);

  return (
    <div
      ref={ref}
      data-team-room
      data-pannable={panning ? "true" : "false"}
      data-zoom={layout.scale.toFixed(2)}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        selectAgent(team.id, null);
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      className={`relative h-full w-full overflow-hidden ${panning ? "cursor-grab touch-none" : ""}`}
    >
      {box.w > 0 && (
        <>
          <OfficeBackdrop w={box.w} h={box.h} wallH={wallH} theme={theme} accent={team.color} busy={busy} flareTick={celebrateTick} />

          {/* Nexus at the window (outside the glass — below the desks in stacking order) */}
          <NexusVisitors team={team} nexusAnchor={winCenter} />

          {/* wall furniture */}
          <InitiativeBoard team={team} style={{ left: boardLeft, top: wallH * 0.14, width: boardW, height: wallH * 0.6, zIndex: 6 }} compact={wallH < 150} />
          <DemoBoard team={team} style={{ left: tvLeft, top: wallH * 0.22, width: tvW, height: wallH * 0.46, zIndex: 6 }} />

          {/* navigation chrome (not scenery) */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              focusTeam(null);
            }}
            title="Back to the network map"
            className="absolute left-2 top-2 z-[650] flex items-center gap-1.5 rounded-lg border border-line bg-[#0d1120]/90 px-2.5 py-1.5 text-[11px] text-mist transition hover:bg-raise hover:text-bright"
          >
            <ArrowLeft size={13} weight="bold" />
            Map
          </button>
          {layout.pannable && (
            <button
              data-room-fit
              onClick={(e) => {
                e.stopPropagation();
                setZoom(layout.scale <= layout.minZoom + 0.02 ? MIN_READABLE : layout.minZoom);
              }}
              title={
                layout.scale <= layout.minZoom + 0.02
                  ? "Zoom back in (drag to pan, pinch to zoom)"
                  : "Fit the whole room"
              }
              className="absolute bottom-2 right-2 z-[650] flex items-center gap-1.5 rounded-lg border border-line bg-[#0d1120]/90 px-2.5 py-1.5 text-[11px] text-mist transition hover:bg-raise hover:text-bright"
            >
              {layout.scale <= layout.minZoom + 0.02 ? <CornersOut size={13} weight="bold" /> : <CornersIn size={13} weight="bold" />}
              {layout.scale <= layout.minZoom + 0.02 ? "Zoom" : "Fit"}
            </button>
          )}

          {/* the pannable content: desks + flights share one coordinate space */}
          <div className="absolute inset-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
            {layout.spots.map((s) => (
              <AgentDesk
                key={s.agent.id}
                team={team}
                agent={s.agent}
                x={s.x}
                y={s.y}
                scale={layout.scale}
                z={s.z}
                selected={selectedAgentId === s.agent.id}
                talking={talkingAgentId === s.agent.id}
                hideActor={walkingIds.has(s.agent.id)}
                celebrateTick={celebrateTick}
                onSelect={() => selectAgent(team.id, s.agent.id)}
              />
            ))}
            <WalkerLayer team={team} walks={walks} scale={layout.scale} depth={layout.depth} onDone={walkDone} />
            <HandoffLayer team={team} spots={spotsById} scale={layout.scale} nexusAnchor={nexusAnchor} />
            {bombLive && (
              <ConfettiBomb
                key={celebrateTick}
                origin={pm ? spotsById[pm.id]?.chest : undefined}
                fallbackX={box.w / 2}
                fallbackY={wallH + (box.h - wallH) / 2}
                spreadX={box.w * 0.36}
                color={team.color}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
