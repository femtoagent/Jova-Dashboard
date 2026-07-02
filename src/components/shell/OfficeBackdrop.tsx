"use client";

import type { OfficeTheme } from "@/lib/network/officeThemes";

/** Where the window sits on the left wall — shared with the Nexus visitor + flight anchors. */
export function windowRect(w: number, wallH: number) {
  const winW = Math.min(w * 0.2, 190);
  return { x: w * 0.07, y: wallH * 0.16, w: winW, h: wallH * 0.62 };
}

/**
 * The Team Room's decorated office, drawn to the measured box from theme params: corner-lit
 * walls, an iso-gridded floor, a window on the void (with starfield — Nexus tosses work in
 * from outside it), a plant that sways, a hanging lamp, and a team-tinted rug.
 *
 * The room LIGHTS with the team's activity: `busy` (0..1 = share of agents working) drives the
 * lamp pool and window glow — a slammed office runs bright, an all-idle one dims to cozy night.
 * `flareTick` flares the lamp for a beat (an initiative just shipped).
 */
export function OfficeBackdrop({
  w,
  h,
  wallH,
  theme,
  accent,
  busy = 0,
  flareTick = 0,
}: {
  w: number;
  h: number;
  wallH: number;
  theme: OfficeTheme;
  accent: string;
  busy?: number;
  flareTick?: number;
}) {
  const mid = w / 2;
  const win = windowRect(w, wallH);
  const rugRx = Math.min(w * 0.34, 360);
  const rugRy = Math.min((h - wallH) * 0.4, 130);
  const rugCy = wallH + (h - wallH) * 0.58;
  const lampX = w * 0.36;
  const lampGlow = 0.55 + busy * 0.45; // idle office = dimmer pool
  const winGlow = 0.6 + busy * 0.4;

  return (
    <svg data-office-backdrop width={w} height={h} className="absolute inset-0" aria-hidden>
      <defs>
        <linearGradient id="or-wallL" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={theme.wallLeft} />
          <stop offset="100%" stopColor={theme.wallRight} />
        </linearGradient>
        <linearGradient id="or-wallR" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={theme.wallRight} />
          <stop offset="100%" stopColor={theme.wallLeft} />
        </linearGradient>
        <radialGradient id="or-win" cx="0.4" cy="0.35" r="1">
          <stop offset="0%" stopColor={theme.windowGlow} />
          <stop offset="60%" stopColor="rgba(20,40,70,0.55)" />
          <stop offset="100%" stopColor="#060a14" />
        </radialGradient>
        <radialGradient id="or-lamp" cx="0.5" cy="0" r="1">
          <stop offset="0%" stopColor="rgba(200,225,255,0.16)" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
        <radialGradient id="or-rug" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={accent} stopOpacity="0.1" />
          <stop offset="75%" stopColor={accent} stopOpacity="0.05" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* walls (corner seam at centre) + floor */}
      <rect x="0" y="0" width={mid} height={wallH} fill="url(#or-wallL)" />
      <rect x={mid} y="0" width={w - mid} height={wallH} fill="url(#or-wallR)" />
      <line x1={mid} y1="0" x2={mid} y2={wallH} stroke="rgba(0,0,0,0.35)" strokeWidth="1.5" />
      <rect x="0" y={wallH} width={w} height={h - wallH} fill={theme.floor} />
      {/* baseboard */}
      <line x1="0" y1={wallH} x2={w} y2={wallH} stroke={theme.trim} strokeWidth="2" />

      {/* iso floor grid — two diagonal line families */}
      <g stroke={theme.floorLine} strokeWidth="1">
        {Array.from({ length: Math.ceil((w + h) / 90) }, (_, i) => {
          const off = i * 90;
          return <line key={`a${i}`} x1={-h + off} y1={h} x2={off + (h - wallH) * 1.8 - h} y2={wallH} />;
        })}
        {Array.from({ length: Math.ceil((w + h) / 90) }, (_, i) => {
          const off = i * 90;
          return <line key={`b${i}`} x1={w + h - off} y1={h} x2={w + h - off - (h - wallH) * 1.8} y2={wallH} />;
        })}
      </g>

      {/* team rug */}
      <ellipse cx={mid} cy={rugCy} rx={rugRx} ry={rugRy} fill="url(#or-rug)" />
      <ellipse cx={mid} cy={rugCy} rx={rugRx} ry={rugRy} fill="none" stroke={accent} strokeOpacity="0.14" strokeWidth="1.5" />

      {/* window on the void */}
      <g style={{ opacity: winGlow, transition: "opacity 1.2s ease" }}>
        <rect x={win.x - 5} y={win.y - 5} width={win.w + 10} height={win.h + 10} rx="10" fill="rgba(0,0,0,0.4)" />
        <rect x={win.x} y={win.y} width={win.w} height={win.h} rx="6" fill="url(#or-win)" />
        {/* stars */}
        {Array.from({ length: 14 }, (_, i) => {
          const sx = win.x + ((i * 37) % Math.max(win.w - 10, 1)) + 5;
          const sy = win.y + ((i * 53) % Math.max(win.h - 10, 1)) + 5;
          return <circle key={i} cx={sx} cy={sy} r={i % 3 === 0 ? 1.4 : 0.8} fill="#cfe8ff" opacity={0.35 + (i % 4) * 0.16} />;
        })}
        {/* frame */}
        <rect x={win.x} y={win.y} width={win.w} height={win.h} rx="6" fill="none" stroke={theme.trim} strokeWidth="2" />
        <line x1={win.x + win.w / 2} y1={win.y} x2={win.x + win.w / 2} y2={win.y + win.h} stroke={theme.trim} strokeWidth="1.5" />
        <line x1={win.x} y1={win.y + win.h / 2} x2={win.x + win.w} y2={win.y + win.h / 2} stroke={theme.trim} strokeWidth="1.5" />
      </g>

      {/* hanging lamp + light pool over the desks (brightness = how busy the room is) */}
      <g>
        <line x1={lampX} y1="0" x2={lampX} y2={wallH * 0.3} stroke={theme.trim} strokeWidth="1.5" />
        <path d={`M ${lampX - 16} ${wallH * 0.3 + 12} Q ${lampX} ${wallH * 0.3 - 10} ${lampX + 16} ${wallH * 0.3 + 12} Z`} fill="#1c2338" stroke={theme.trim} strokeWidth="1" />
        <circle cx={lampX} cy={wallH * 0.3 + 9} r="3" fill="#ffe9b8" style={{ opacity: 0.4 + busy * 0.6, transition: "opacity 1.2s ease" }} />
        <ellipse
          cx={lampX}
          cy={wallH * 0.95}
          rx={w * 0.2}
          ry={wallH * 0.6}
          fill="url(#or-lamp)"
          style={{ opacity: lampGlow, transition: "opacity 1.2s ease" }}
        />
        {/* an initiative just shipped — the lamp flares for a beat */}
        {flareTick > 0 && (
          <ellipse
            key={flareTick}
            className="motion-safe-anim"
            cx={lampX}
            cy={wallH * 0.95}
            rx={w * 0.26}
            ry={wallH * 0.75}
            fill="url(#or-lamp)"
            style={{ animation: "fade 900ms ease-out reverse forwards" }}
          />
        )}
      </g>

      {/* plant (sways gently; stilled under reduced motion) */}
      <g
        className="motion-safe-anim"
        style={{ transformOrigin: `${w * 0.9}px ${wallH + 26}px`, animation: "plant-sway 7s ease-in-out infinite" }}
      >
        <path d={`M ${w * 0.9} ${wallH + 10} q -10 -26 -20 -34`} fill="none" stroke="#2f7d55" strokeWidth="3" strokeLinecap="round" />
        <path d={`M ${w * 0.9} ${wallH + 10} q 2 -30 14 -40`} fill="none" stroke="#37936a" strokeWidth="3" strokeLinecap="round" />
        <path d={`M ${w * 0.9} ${wallH + 8} q -2 -20 4 -26`} fill="none" stroke="#2f9d68" strokeWidth="2.5" strokeLinecap="round" />
        <ellipse cx={w * 0.9 - 21} cy={wallH - 26} rx="7" ry="4" fill="#3fd68f" transform={`rotate(-34 ${w * 0.9 - 21} ${wallH - 26})`} />
        <ellipse cx={w * 0.9 + 15} cy={wallH - 32} rx="7" ry="4" fill="#35b97c" transform={`rotate(28 ${w * 0.9 + 15} ${wallH - 32})`} />
        <ellipse cx={w * 0.9 + 5} cy={wallH - 20} rx="5.5" ry="3.2" fill="#3fd68f" transform={`rotate(10 ${w * 0.9 + 5} ${wallH - 20})`} />
      </g>
      {/* pot (static, in front of the sway group) */}
      <path d={`M ${w * 0.9 - 13} ${wallH + 8} L ${w * 0.9 + 13} ${wallH + 8} L ${w * 0.9 + 9} ${wallH + 26} L ${w * 0.9 - 9} ${wallH + 26} Z`} fill="#232b42" stroke={theme.trim} strokeWidth="1" />
    </svg>
  );
}
