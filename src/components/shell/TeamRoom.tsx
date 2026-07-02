"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useDisplayPrefs } from "@/lib/settings/useDisplayPrefs";
import { officeTheme } from "@/lib/network/officeThemes";
import type { Team } from "@/lib/network/types";
import { OfficeBackdrop } from "./OfficeBackdrop";
import { AgentDesk, DESK_W, DESK_H } from "./AgentDesk";
import { HandoffLayer, type Anchor } from "./HandoffLayer";
import { InitiativeBoard } from "./InitiativeBoard";
import { DemoBoard } from "./DemoBoard";
import { ArrowLeft } from "@phosphor-icons/react";

interface Box {
  w: number;
  h: number;
}

/**
 * The Team Room: a decorated isometric office for the focused team. Each agent gets a desk +
 * crewmate; the wall carries the Initiatives board and the Demo board; the HandoffLayer flies
 * documents between desks (in through the window when Nexus spawned the work). Desks lay out
 * on an iso grid that grows with the roster and scales to fit the container — no fixed cap.
 * Tap a crewmate to select it (detail lands in the docked sidebar); tap the floor to deselect;
 * "< Map" returns to the constellation.
 */
export function TeamRoom({ team }: { team: Team }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box>({ w: 0, h: 0 });
  const selectedAgentId = useNetworkStore((s) => s.selectedAgentId);
  const talkingAgentId = useNetworkStore((s) => s.talkingAgentId);
  const selectAgent = useNetworkStore((s) => s.selectAgent);
  const focusTeam = useNetworkStore((s) => s.focusTeam);
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

  // iso grid that grows with the roster, then scales to fit the floor
  const layout = useMemo(() => {
    const n = team.agents.length;
    if (!n || box.w < 40 || box.h < 40) return { spots: [], scale: 1 };
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

    const stepXBase = DESK_W * 0.62; // px per ux unit at scale 1
    const stepYBase = DESK_H * 0.46;
    const availW = box.w - 24;
    const floorH = box.h - wallH - 16;
    const sW = availW / ((uxMax - uxMin) * stepXBase + DESK_W);
    const sH = floorH / (uyMax * stepYBase + DESK_H);
    const scale = Math.min(Math.max(Math.min(sW, sH), 0.42), 1.05);

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
    return { spots, scale };
  }, [team.agents, box.w, box.h, wallH]);

  // flight anchors: each crewmate's chest; Nexus's work flies in through the window
  const anchors = useMemo(() => {
    const map: Record<string, Anchor> = {};
    for (const s of layout.spots) map[s.agent.id] = { x: s.x, y: s.y - 105 * layout.scale };
    return map;
  }, [layout]);
  const nexusAnchor: Anchor = { x: box.w * 0.07 + Math.min(box.w * 0.2, 190) / 2, y: wallH * 0.16 + (wallH * 0.62) / 2 };

  return (
    <div
      ref={ref}
      data-team-room
      onClick={() => selectAgent(team.id, null)}
      className="relative h-full w-full overflow-hidden"
    >
      {box.w > 0 && (
        <>
          <OfficeBackdrop w={box.w} h={box.h} wallH={wallH} theme={theme} accent={team.color} />

          {/* the wall: back chip + initiatives board + demo board */}
          <div className="absolute left-2 right-2 top-2 z-[600] flex items-stretch gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                focusTeam(null);
              }}
              title="Back to the network map"
              className="flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-line bg-[#0d1120]/90 px-2.5 py-1.5 text-[11px] text-mist transition hover:bg-raise hover:text-bright"
            >
              <ArrowLeft size={13} weight="bold" />
              Map
            </button>
            <InitiativeBoard team={team} />
            <DemoBoard team={team} />
          </div>

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
              onSelect={() => selectAgent(team.id, s.agent.id)}
            />
          ))}

          <HandoffLayer team={team} anchors={anchors} nexusAnchor={nexusAnchor} />
        </>
      )}
    </div>
  );
}
