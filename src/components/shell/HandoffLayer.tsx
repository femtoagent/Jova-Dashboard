"use client";

import { useEffect, useRef, useState } from "react";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import type { FlowEvent, Team } from "@/lib/network/types";
import { characterFor, NEXUS_SENDER } from "@/lib/agents/roomCharacters";
import { NexusGlyph, roleIcon } from "@/lib/agents/roleGlyphs";
import { planWalk } from "./walkPlan";

export interface Anchor {
  x: number;
  y: number;
}

/** what the flight layer needs per agent: where the desk sits, and where the chest is */
export interface AgentSpot {
  desk: Anchor;
  chest: Anchor;
}

const FLIGHT_MS = 950;
const LAND_MS = 340;
/** how long the Nexus orb winds up outside the window before the toss */
export const NEXUS_WINDUP_MS = 550;

/**
 * The flying documents. Assigns toss straight from the PM's desk; handoffs launch AFTER the
 * sender has walked partway over (TeamRoom slides the crewmate on the same clock); Nexus-spawned
 * work is tossed in through the window by a Nexus orb that rises OUTSIDE the glass (see
 * NexusVisitors, rendered by TeamRoom below the desks so it reads as beyond the window).
 * Provenance is readable at every moment: sender-tinted, sender-stamped, comet trail, "from X"
 * tag — and the landed pile sheet keeps the color (see AgentDesk).
 */
export function HandoffLayer({
  team,
  spots,
  scale,
  nexusAnchor,
}: {
  team: Team;
  spots: Record<string, AgentSpot>;
  scale: number;
  nexusAnchor: Anchor;
}) {
  const flows = useNetworkStore((s) => s.flows);
  const mine = flows.filter((f) => f.teamId === team.id);
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 700 }} aria-hidden>
      {mine.map((f) => (
        <Packet key={f.id} flow={f} team={team} spots={spots} scale={scale} nexusAnchor={nexusAnchor} />
      ))}
    </div>
  );
}

function Packet({
  flow,
  team,
  spots,
  scale,
  nexusAnchor,
}: {
  flow: FlowEvent;
  team: Team;
  spots: Record<string, AgentSpot>;
  scale: number;
  nexusAnchor: Anchor;
}) {
  const packetRef = useRef<HTMLDivElement>(null);
  const trailA = useRef<HTMLDivElement>(null);
  const trailB = useRef<HTMLDivElement>(null);
  const [landing, setLanding] = useState(false);
  const [airborne, setAirborne] = useState(false);

  const sender = flow.fromAgentId ? team.agents.find((a) => a.id === flow.fromAgentId) : undefined;
  const accent = flow.fromAgentId === null ? NEXUS_SENDER.accent : sender ? characterFor(sender).accent : team.color;
  const fromName = flow.fromAgentId === null ? NEXUS_SENDER.name : sender?.label ?? "?";
  const Glyph = flow.fromAgentId === null ? NexusGlyph : sender ? roleIcon(sender.role) : NexusGlyph;

  const senderSpot = flow.fromAgentId ? spots[flow.fromAgentId] : undefined;
  const targetSpot = spots[flow.toAgentId];
  const to = targetSpot?.chest;
  // ANY flow with a visible sender walks: the packet launches from the walk plan's toss point,
  // on the plan's clock (both sides compute the identical plan). Nexus tosses from the window.
  const plan = senderSpot && targetSpot ? planWalk(senderSpot.desk, targetSpot.desk, scale) : null;
  const from = plan ? plan.toss : flow.fromAgentId === null ? nexusAnchor : senderSpot?.chest;
  const delay = plan ? plan.duration + 90 : flow.fromAgentId === null ? NEXUS_WINDUP_MS : 0;

  useEffect(() => {
    const clear = () => useNetworkStore.getState().clearFlow(flow.id);
    // missing endpoints (agent removed mid-flight) or reduced motion: skip the flight —
    // the pile's drop-in animation still shows the arrival
    if (!from || !to || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      clear();
      return;
    }
    const ctrl = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 72 };
    const hist: Anchor[] = [];
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min((now - start) / FLIGHT_MS, 1);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad
      const inv = 1 - e;
      const x = inv * inv * from.x + 2 * inv * e * ctrl.x + e * e * to.x;
      const y = inv * inv * from.y + 2 * inv * e * ctrl.y + e * e * to.y;
      hist.push({ x, y });
      if (hist.length > 10) hist.shift();
      if (packetRef.current) packetRef.current.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      const a = hist[Math.max(hist.length - 5, 0)]!;
      const b = hist[Math.max(hist.length - 9, 0)]!;
      if (trailA.current) trailA.current.style.transform = `translate(${a.x}px, ${a.y}px) translate(-50%, -50%)`;
      if (trailB.current) trailB.current.style.transform = `translate(${b.x}px, ${b.y}px) translate(-50%, -50%)`;
      if (p < 1) raf = requestAnimationFrame(tick);
      else {
        setLanding(true);
        window.setTimeout(clear, LAND_MS);
      }
    };
    const timer = window.setTimeout(() => {
      setAirborne(true);
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
    // one flight per packet — endpoints are captured at launch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!from || !to) return null;

  if (landing) {
    return (
      <span
        className="motion-safe-anim absolute h-9 w-9 rounded-full border-2"
        style={{
          left: to.x,
          top: to.y,
          borderColor: accent,
          transform: "translate(-50%, -50%)",
          animation: `presence-ripple ${LAND_MS}ms ease-out forwards`,
        }}
      />
    );
  }
  if (!airborne) return null; // waiting for the walk / the Nexus wind-up

  return (
    <>
      {/* comet trail in the sender's color */}
      <div ref={trailB} className="absolute h-1.5 w-1.5 rounded-full" style={{ background: accent, opacity: 0.25 }} />
      <div ref={trailA} className="absolute h-2 w-2 rounded-full" style={{ background: accent, opacity: 0.45 }} />

      {/* the document itself — sender-tinted, sender-stamped */}
      <div ref={packetRef} data-flow-packet data-from={fromName} className="absolute" style={{ left: 0, top: 0 }}>
        <div
          className="relative grid h-6 w-5 place-items-center rounded-[3px] border-2 bg-[#f4f7ff]"
          style={{ borderColor: accent, boxShadow: `0 0 12px ${accent}aa`, color: shadeDark(accent) }}
        >
          {/* folded corner */}
          <span className="absolute -right-px -top-px h-2 w-2 rounded-bl-[3px]" style={{ background: accent }} />
          <Glyph size={11} weight="bold" />
        </div>
        <span
          className="absolute left-1/2 top-7 -translate-x-1/2 whitespace-nowrap rounded-full border px-1.5 py-px text-[9px] font-medium"
          style={{ borderColor: `${accent}66`, background: "rgba(10,13,20,0.85)", color: accent }}
        >
          from {fromName}
        </span>
      </div>
    </>
  );
}

/**
 * Nexus at the window: while a Nexus-spawned flow is live, a small orb rises OUTSIDE the glass
 * (TeamRoom renders this layer BELOW the desks, over the backdrop, so it reads as beyond the
 * window), winds up with a bob, glows on the toss, then sinks back into the void.
 */
export function NexusVisitors({ team, nexusAnchor }: { team: Team; nexusAnchor: Anchor }) {
  const flows = useNetworkStore((s) => s.flows);
  const visiting = flows.some((f) => f.teamId === team.id && f.fromAgentId === null);
  return (
    <div className="pointer-events-none absolute inset-0" style={{ zIndex: 5 }} aria-hidden>
      {visiting && (
        <div
          data-nexus-visitor
          className="absolute animate-[fadein_300ms_ease]"
          style={{ left: nexusAnchor.x, top: nexusAnchor.y, transform: "translate(-50%, -50%)" }}
        >
          <span
            className="motion-safe-anim relative block h-7 w-7 rounded-full"
            style={{
              background: "radial-gradient(circle at 36% 32%, #e6fbff 0%, #9fe8ff 48%, rgba(95,208,255,0.5) 78%, transparent 100%)",
              boxShadow: "0 0 16px rgba(159,232,255,0.8), 0 0 40px rgba(159,232,255,0.35)",
              opacity: 0.85, // a touch dimmed — she's behind the glass
              animation: "presence-breathe 0.9s ease-in-out infinite",
            }}
          />
        </div>
      )}
    </div>
  );
}

/** A dark, readable version of the accent for the glyph on the light paper. */
function shadeDark(hex: string): string {
  const n = hex.replace("#", "");
  const num = parseInt(n.length === 3 ? n.split("").map((c) => c + c).join("") : n, 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * 0.45)));
  return `#${((f((num >> 16) & 255) << 16) | (f((num >> 8) & 255) << 8) | f(num & 255)).toString(16).padStart(6, "0")}`;
}
