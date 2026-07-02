"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useDisplayPrefs } from "@/lib/settings/useDisplayPrefs";
import { officeTheme } from "@/lib/network/officeThemes";
import type { Team } from "@/lib/network/types";
import { OfficeBackdrop, windowRect } from "./OfficeBackdrop";
import { AgentDesk, DESK_W, DESK_H } from "./AgentDesk";
import { HandoffLayer, NexusVisitors, walkVector, WALK_MS, type Anchor } from "./HandoffLayer";
import { InitiativeBoard } from "./InitiativeBoard";
import { DemoBoard } from "./DemoBoard";
import { ArrowLeft, CornersIn, CornersOut } from "@phosphor-icons/react";

interface Box {
  w: number;
  h: number;
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
  const [fitAll, setFitAll] = useState(false);

  // iso grid that grows with the roster; pannable instead of unreadable for big teams
  const layout = useMemo(() => {
    const n = team.agents.length;
    if (!n || box.w < 40 || box.h < 40)
      return { spots: [] as { agent: Team["agents"][number]; x: number; y: number; z: number }[], scale: 1, pannable: false, bounds: null as null | { minX: number; maxX: number; minY: number; maxY: number } };
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
    const scale = pannable ? (fitAll ? Math.max(fitScale, 0.24) : MIN_READABLE) : Math.min(fitScale, 1.05);

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
        z: 10 + u.uy * 2,
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
    return { spots, scale, pannable, bounds };
  }, [team.agents, box.w, box.h, wallH, fitAll]);

  // ---- pan (big rosters) ----
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panDrag = useRef<{ id: number; startX: number; startY: number; baseX: number; baseY: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const panning = layout.pannable && !fitAll;
  useEffect(() => setPan({ x: 0, y: 0 }), [team.id, panning]);

  const clampPan = (p: { x: number; y: number }) => {
    const b = layout.bounds;
    if (!b) return { x: 0, y: 0 };
    const clampAxis = (v: number, lo: number, hi: number) => (lo > hi ? 0 : Math.min(Math.max(v, lo), hi));
    return {
      x: clampAxis(p.x, box.w - b.maxX - 12, 12 - b.minX),
      y: clampAxis(p.y, box.h - b.maxY - 12, wallH - b.minY),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!panning) return;
    if ((e.target as HTMLElement).closest("[data-agent-desk],button")) return; // desks/chrome handle themselves
    try {
      ref.current?.setPointerCapture(e.pointerId);
    } catch {}
    panDrag.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, baseX: pan.x, baseY: pan.y, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = panDrag.current;
    if (!d || e.pointerId !== d.id) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < 5) return;
    d.moved = true;
    setPan(clampPan({ x: d.baseX + dx, y: d.baseY + dy }));
  };
  const onPointerUp = () => {
    if (panDrag.current?.moved) suppressClick.current = true;
    panDrag.current = null;
  };

  // ---- room celebration: an initiative (PM task) just shipped ----
  const pm = team.agents.find((a) => a.role === "pm");
  const [celebrateTick, setCelebrateTick] = useState(0);
  const prevPmTasks = useRef<string[]>(pm?.tasks.map((t) => t.id) ?? []);
  useEffect(() => {
    const cur = pm?.tasks.map((t) => t.id) ?? [];
    const finished = prevPmTasks.current.some((id) => !cur.includes(id));
    prevPmTasks.current = cur;
    if (finished) setCelebrateTick((n) => n + 1);
  }, [pm?.tasks, pm]);

  // ---- walking handoffs: slide the sender partway on the flight's clock ----
  const [walks, setWalks] = useState<Record<string, Anchor>>({});
  const seenFlows = useRef(new Set<string>());
  const walkTimers = useRef<number[]>([]);

  // flight anchors: each crewmate's chest (in the pannable content's coordinate space)
  const anchors = useMemo(() => {
    const map: Record<string, Anchor> = {};
    for (const s of layout.spots) map[s.agent.id] = { x: s.x, y: s.y - 105 * layout.scale };
    return map;
  }, [layout]);
  const win = windowRect(box.w, wallH);
  const winCenter: Anchor = { x: win.x + win.w / 2, y: win.y + win.h / 2 };
  // the window is fixed while the content pans — convert its anchor into content coordinates
  const nexusAnchor: Anchor = { x: winCenter.x - pan.x, y: winCenter.y - pan.y };

  useEffect(() => {
    for (const f of flows) {
      if (f.teamId !== team.id || f.kind !== "handoff" || !f.fromAgentId || seenFlows.current.has(f.id)) continue;
      seenFlows.current.add(f.id);
      const from = anchors[f.fromAgentId];
      const to = anchors[f.toAgentId];
      if (!from || !to) continue;
      const v = walkVector(from, to);
      const sender = f.fromAgentId;
      setWalks((w) => ({ ...w, [sender]: v }));
      // start walking back right after the toss
      walkTimers.current.push(
        window.setTimeout(() => {
          setWalks((w) => {
            const next = { ...w };
            delete next[sender];
            return next;
          });
        }, WALK_MS + 220),
      );
    }
  }, [flows, team.id, anchors]);
  useEffect(
    () => () => {
      for (const t of walkTimers.current) window.clearTimeout(t);
    },
    [],
  );

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
                setFitAll((v) => !v);
              }}
              title={fitAll ? "Zoom back in (drag to pan)" : "Fit the whole room"}
              className="absolute bottom-2 right-2 z-[650] flex items-center gap-1.5 rounded-lg border border-line bg-[#0d1120]/90 px-2.5 py-1.5 text-[11px] text-mist transition hover:bg-raise hover:text-bright"
            >
              {fitAll ? <CornersOut size={13} weight="bold" /> : <CornersIn size={13} weight="bold" />}
              {fitAll ? "Zoom" : "Fit"}
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
                walkX={walks[s.agent.id]?.x ?? 0}
                walkY={walks[s.agent.id]?.y ?? 0}
                celebrateTick={celebrateTick}
                onSelect={() => selectAgent(team.id, s.agent.id)}
              />
            ))}
            <HandoffLayer team={team} anchors={anchors} nexusAnchor={nexusAnchor} />
          </div>
        </>
      )}
    </div>
  );
}
