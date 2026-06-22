"use client";

import type { MemoryNode } from "@/lib/network/types";

const KIND_COLOR: Record<MemoryNode["kind"], string> = {
  persona_core: "#67e8f9",
  persona_growth: "#a78bfa",
  human: "#fbbf24",
  affect: "#f472b6",
  fact: "#7dd3fc",
};

/** Read-only "information web" of an agent's memory. Display-only for now. */
export function MemoryWeb({ memory }: { memory: MemoryNode[] }) {
  if (!memory.length) return <p className="text-[12px] text-white/40">No memory yet.</p>;

  const W = 340;
  const H = 200;
  const cx = W / 2;
  const cy = H / 2;
  const R = 70;
  const pos = new Map<string, { x: number; y: number }>();
  memory.forEach((n, i) => {
    if (i === 0) {
      pos.set(n.id, { x: cx, y: cy });
      return;
    }
    const ang = ((i - 1) / Math.max(1, memory.length - 1)) * Math.PI * 2 - Math.PI / 2;
    pos.set(n.id, { x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * R });
  });

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[380px]">
        {memory.flatMap((n) =>
          n.links.map((l) => {
            const a = pos.get(n.id);
            const b = pos.get(l);
            if (!a || !b) return null;
            return (
              <line key={`${n.id}-${l}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,0.14)" strokeWidth={1} />
            );
          })
        )}
        {memory.map((n) => {
          const p = pos.get(n.id);
          if (!p) return null;
          const c = KIND_COLOR[n.kind];
          return (
            <g key={n.id}>
              <circle cx={p.x} cy={p.y} r={6} fill={c} opacity={0.9}>
                <title>{n.kind}</title>
              </circle>
              <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.7)">
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-1 text-[10px] text-white/35">
        Read-only · future: Letta memory blocks (persona_core / persona_growth / human / affect).
      </p>
    </div>
  );
}
