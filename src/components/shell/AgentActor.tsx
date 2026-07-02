"use client";

import type { RoomCharacter } from "@/lib/agents/roomCharacters";

/**
 * A Team Room crewmate — the illustrated character itself, drawn as code SVG from its palette +
 * accessory so the whole cast stays consistent and weightless. Pure and reusable: the room wraps
 * it in desk/animation layers, and the settings character picker renders it as a preview.
 *
 * Poses (via `active`): idle = reclined, visor dim; active = leaning in, visor lit.
 * All animation is applied by the PARENT (CSS classes on a wrapper) — this file is just the body.
 */
export function AgentActor({
  character,
  active,
  width = 64,
}: {
  character: RoomCharacter;
  active: boolean;
  width?: number;
}) {
  const c = character;
  const h = Math.round(width * 1.25);
  // idle leans back a touch; active leans toward the desk (viewer)
  const lean = active ? -4 : 3;

  return (
    <svg width={width} height={h} viewBox="0 0 64 80" aria-hidden style={{ display: "block", overflow: "visible" }}>
      <defs>
        <linearGradient id={`body-${c.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c.accent} stopOpacity="0.9" />
          <stop offset="28%" stopColor={c.body} />
          <stop offset="100%" stopColor={shade(c.body, -0.45)} />
        </linearGradient>
        <radialGradient id={`visor-${c.id}`} cx="0.35" cy="0.3" r="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={active ? 0.95 : 0.5} />
          <stop offset="55%" stopColor={c.visor} stopOpacity={active ? 0.9 : 0.45} />
          <stop offset="100%" stopColor={shade(c.body, -0.3)} />
        </radialGradient>
      </defs>

      <g transform={`rotate(${lean} 32 76)`}>
        {/* little legs */}
        <rect x="20" y="64" width="10" height="12" rx="5" fill={shade(c.body, -0.5)} />
        <rect x="34" y="64" width="10" height="12" rx="5" fill={shade(c.body, -0.55)} />

        {/* arms — active: reaching forward to the desk; idle: resting down */}
        {active ? (
          <>
            <rect x="4" y="40" width="12" height="8" rx="4" fill={shade(c.body, -0.35)} transform="rotate(18 10 44)" />
            <rect x="48" y="40" width="12" height="8" rx="4" fill={shade(c.body, -0.4)} transform="rotate(-18 54 44)" />
          </>
        ) : (
          <>
            <rect x="7" y="42" width="8" height="14" rx="4" fill={shade(c.body, -0.35)} />
            <rect x="49" y="42" width="8" height="14" rx="4" fill={shade(c.body, -0.4)} />
          </>
        )}

        {/* body capsule */}
        <rect x="13" y="14" width="38" height="56" rx="19" fill={`url(#body-${c.id})`} stroke={shade(c.body, -0.6)} strokeWidth="1" />
        {/* belt / trim */}
        <rect x="13" y="50" width="38" height="4" rx="2" fill={c.accent} opacity="0.55" />

        {/* visor */}
        <rect x="19" y="22" width="30" height="16" rx="8" fill={`url(#visor-${c.id})`} stroke={shade(c.body, -0.55)} strokeWidth="1" />
        {/* visor highlight */}
        <rect x="23" y="25" width="9" height="4" rx="2" fill="#ffffff" opacity={active ? 0.85 : 0.4} />
        {/* focused "eyes" only when working */}
        {active && (
          <>
            <circle cx="30" cy="31" r="1.8" fill={shade(c.body, -0.7)} />
            <circle cx="38" cy="31" r="1.8" fill={shade(c.body, -0.7)} />
          </>
        )}

        {/* accessory — the silhouette that tells characters apart at a glance */}
        <Accessory character={c} active={active} />
      </g>
    </svg>
  );
}

function Accessory({ character: c, active }: { character: RoomCharacter; active: boolean }) {
  switch (c.accessory) {
    case "antenna":
      return (
        <g>
          <line x1="32" y1="14" x2="32" y2="5" stroke={shade(c.body, -0.4)} strokeWidth="2" />
          <circle cx="32" cy="4" r="3.2" fill={c.accent} opacity={active ? 1 : 0.6} />
        </g>
      );
    case "cap":
      return (
        <g>
          <path d="M 15 18 Q 32 4 49 18 L 49 21 L 15 21 Z" fill={shade(c.body, -0.35)} stroke={shade(c.body, -0.6)} strokeWidth="1" />
          <rect x="40" y="16" width="16" height="4" rx="2" fill={shade(c.body, -0.45)} />
        </g>
      );
    case "headphones":
      return (
        <g>
          <path d="M 15 20 Q 32 4 49 20" fill="none" stroke={c.accent} strokeWidth="3" strokeLinecap="round" />
          <rect x="11" y="22" width="7" height="12" rx="3.5" fill={c.accent} />
          <rect x="46" y="22" width="7" height="12" rx="3.5" fill={c.accent} />
        </g>
      );
    case "sprout":
      return (
        <g>
          <path d="M 32 14 Q 31 8 32 5" fill="none" stroke="#2f7d55" strokeWidth="2" strokeLinecap="round" />
          <ellipse cx="36" cy="6" rx="5" ry="3" fill="#3fd68f" transform="rotate(-24 36 6)" />
          <ellipse cx="28" cy="7" rx="4" ry="2.4" fill="#2f9d68" transform="rotate(28 28 7)" />
        </g>
      );
    case "band":
      return (
        <g>
          <path d="M 14 19 Q 32 6 50 19 L 50 23 L 14 23 Z" fill={c.accent} opacity="0.9" />
          <rect x="28" y="8" width="8" height="5" rx="2" fill={c.accent} />
        </g>
      );
    case "ears":
      return (
        <g>
          <path d="M 18 18 L 14 6 L 26 13 Z" fill={shade(c.body, -0.25)} stroke={shade(c.body, -0.55)} strokeWidth="1" />
          <path d="M 46 18 L 50 6 L 38 13 Z" fill={shade(c.body, -0.25)} stroke={shade(c.body, -0.55)} strokeWidth="1" />
          <path d="M 18.5 15 L 16.5 9 L 23 13 Z" fill={c.accent} opacity="0.7" />
          <path d="M 45.5 15 L 47.5 9 L 41 13 Z" fill={c.accent} opacity="0.7" />
        </g>
      );
    case "halo":
      return <ellipse cx="32" cy="7" rx="12" ry="3.4" fill="none" stroke={c.accent} strokeWidth="2.4" opacity={active ? 0.95 : 0.55} />;
    case "spike":
      return <path d="M 26 16 Q 32 -2 40 15 Q 33 8 26 16 Z" fill={c.accent} opacity="0.85" />;
    default:
      return null;
  }
}

/** Darken (negative) / lighten a hex color by a fraction — tiny local helper, no deps. */
function shade(hex: string, amt: number): string {
  const n = hex.replace("#", "");
  const num = parseInt(n.length === 3 ? n.split("").map((c) => c + c).join("") : n, 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  const r = f((num >> 16) & 255);
  const g = f((num >> 8) & 255);
  const b = f(num & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
