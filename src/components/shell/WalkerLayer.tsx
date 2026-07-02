"use client";

import { useEffect, useRef } from "react";
import type { AgentNode, Team } from "@/lib/network/types";
import { characterFor } from "@/lib/agents/roomCharacters";
import { AgentActor } from "./AgentActor";
import { planWalk, pointAt, TOSS_HOLD_MS, type Point, type WalkPlan } from "./walkPlan";

export interface WalkRecord {
  flowId: string;
  agent: AgentNode;
  plan: WalkPlan;
}

/** z-index scale shared with the desks: 100 + 20 per aisle band, walkers offset +12 */
export interface DepthScale {
  firstRowBottom: number;
  stepY: number;
}
export function deskZ(uy: number): number {
  return 100 + uy * 20;
}
function walkerZ(y: number, d: DepthScale): number {
  return Math.round(100 + ((y - d.firstRowBottom) / Math.max(d.stepY, 1)) * 20 + 12);
}

/**
 * The crewmates that are OUT of their seats: while a flow's sender walks, its seated actor
 * hides and this overlay draws it moving along the aisle plan — with its z-index recomputed
 * from its feet every frame (painter's algorithm), so it passes IN FRONT of desks below it and
 * BEHIND desks above it, including its own. Carries the document in hand until the toss.
 */
export function WalkerLayer({
  team,
  walks,
  scale,
  depth,
  onDone,
}: {
  team: Team;
  walks: WalkRecord[];
  scale: number;
  depth: DepthScale;
  onDone: (flowId: string) => void;
}) {
  return (
    <>
      {walks.map((w) => (
        <WalkingActor key={w.flowId} team={team} record={w} scale={scale} depth={depth} onDone={() => onDone(w.flowId)} />
      ))}
    </>
  );
}

function WalkingActor({
  team,
  record,
  scale,
  depth,
  onDone,
}: {
  team: Team;
  record: WalkRecord;
  scale: number;
  depth: DepthScale;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const docRef = useRef<HTMLSpanElement>(null);
  const c = characterFor(record.agent);
  const { plan } = record;
  const w = 64 * scale;
  const h = 80 * scale;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const D = plan.duration;
    const BACK = D * 0.85; // walking home is a touch quicker (no package)
    const TOTAL = D + TOSS_HOLD_MS + BACK;
    let raf = 0;
    let start = 0;
    const place = (pt: Point) => {
      el.style.transform = `translate(${pt.x - w / 2}px, ${pt.y - h}px)`;
      el.style.zIndex = String(walkerZ(pt.y, depth));
    };
    const tick = (now: number) => {
      if (!start) start = now;
      const t = now - start;
      if (t <= D) {
        place(pointAt(plan, t / D));
      } else if (t <= D + TOSS_HOLD_MS) {
        place(pointAt(plan, 1));
        // the document leaves the hand as the flight starts
        if (docRef.current && t - D > 90) docRef.current.style.opacity = "0";
      } else if (t <= TOTAL) {
        place(pointAt(plan, 1 - (t - D - TOSS_HOLD_MS) / BACK));
      } else {
        onDone();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    place(pointAt(plan, 0));
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // a walk runs once, parameters fixed at launch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={ref} data-walker data-agent-id={record.agent.id} className="pointer-events-none absolute left-0 top-0" aria-hidden>
      {/* waddle bob while on the move */}
      <div className="motion-safe-anim" style={{ animation: "actor-bob 0.45s ease-in-out infinite" }}>
        <AgentActor character={c} active width={w} />
        {/* the document in hand — sender-tinted, tossed at the end of the walk */}
        <span
          ref={docRef}
          className="absolute rounded-[2px] border"
          style={{
            right: -4 * scale,
            top: 42 * scale,
            width: 9 * scale,
            height: 12 * scale,
            background: "#f4f7ff",
            borderColor: c.accent,
            boxShadow: `0 0 6px ${c.accent}88`,
            transition: "opacity 150ms ease",
          }}
        />
      </div>
      {/* soft moving shadow keeps him grounded */}
      <span
        className="absolute rounded-[50%]"
        style={{ left: w * 0.12, top: h - 4 * scale, width: w * 0.76, height: 10 * scale, background: "rgba(0,0,0,0.35)" }}
      />
      <span className="sr-only">{`${record.agent.label} delivering to a teammate (${team.name})`}</span>
    </div>
  );
}
