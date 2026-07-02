/**
 * Walk planning for the Team Room: agents walk the AISLES between desk bands (out from behind
 * their desk, along the corridor, up to the receiver's desk front) at constant speed — no more
 * straight lines through furniture. Shared by TeamRoom's WalkerLayer (which moves the crewmate)
 * and HandoffLayer (which must launch the packet from where the walk ends, when it ends), so
 * both sides compute the identical plan with no coordination.
 */

export interface Point {
  x: number;
  y: number;
}

export interface WalkPlan {
  /** the polyline the walker follows (feet positions) */
  points: Point[];
  /** cumulative arc length at each point (px) */
  lengths: number[];
  /** total path length (px) */
  total: number;
  /** outbound walking time (ms) — constant speed, clamped */
  duration: number;
  /** where the toss happens: the walker's chest at the end of the walk */
  toss: Point;
}

/** walking speed in px/ms (screen space) */
const SPEED = 0.24;
const MIN_MS = 420;
const MAX_MS = 1800;
/** how long the walker holds at the receiver's desk before the toss */
export const TOSS_HOLD_MS = 240;

/** seated feet position for a desk unit anchored (center-bottom) at `desk` with unit `scale` */
export function seatedFeet(desk: Point, scale: number): Point {
  return { x: desk.x, y: desk.y - 82 * scale };
}

export function planWalk(fromDesk: Point, toDesk: Point, scale: number): WalkPlan {
  const start = seatedFeet(fromDesk, scale);
  const senderAisle = { x: fromDesk.x, y: fromDesk.y + 16 * scale };
  const targetAisle = { x: toDesk.x, y: toDesk.y + 16 * scale };

  // out from behind the desk → along the sender's aisle → down/up the corridor to the target
  const raw: Point[] = [start, senderAisle, { x: targetAisle.x, y: senderAisle.y }, targetAisle];
  const points: Point[] = [];
  for (const p of raw) {
    const last = points[points.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 1) points.push(p);
  }

  const lengths: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    lengths.push(lengths[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
  }
  const total = lengths[lengths.length - 1] ?? 0;
  const duration = Math.min(Math.max(total / SPEED, MIN_MS), MAX_MS);
  const end = points[points.length - 1] ?? start;
  return { points, lengths, total, duration, toss: { x: end.x, y: end.y - 58 * scale } };
}

/** position along the plan at progress p ∈ [0,1] (arc-length parameterised) */
export function pointAt(plan: WalkPlan, p: number): Point {
  const d = Math.max(0, Math.min(1, p)) * plan.total;
  for (let i = 1; i < plan.points.length; i++) {
    if (d <= plan.lengths[i]!) {
      const a = plan.points[i - 1]!;
      const b = plan.points[i]!;
      const seg = plan.lengths[i]! - plan.lengths[i - 1]!;
      const t = seg > 0 ? (d - plan.lengths[i - 1]!) / seg : 1;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
  }
  return plan.points[plan.points.length - 1] ?? { x: 0, y: 0 };
}
