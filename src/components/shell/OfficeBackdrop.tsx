"use client";

import type { OfficeTheme } from "@/lib/network/officeThemes";

/**
 * The Team Room's decorated office, drawn to the measured box from theme params: corner-lit
 * walls, an iso-gridded floor, a window on the void (with starfield — Nexus's work flies in
 * through it), a shelf, a plant that sways, a hanging lamp, and a team-tinted rug. Swapping
 * the office later = another OfficeTheme entry.
 */
export function OfficeBackdrop({
  w,
  h,
  wallH,
  theme,
  accent,
}: {
  w: number;
  h: number;
  wallH: number;
  theme: OfficeTheme;
  accent: string;
}) {
  const mid = w / 2;
  // window on the left wall, shelf + plant on the right
  const winW = Math.min(w * 0.2, 190);
  const winH = wallH * 0.62;
  const winX = w * 0.07;
  const winY = wallH * 0.16;
  const rugRx = Math.min(w * 0.34, 360);
  const rugRy = Math.min((h - wallH) * 0.4, 130);
  const rugCy = wallH + (h - wallH) * 0.58;

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
          <stop offset="0%" stopColor="rgba(200,225,255,0.14)" />
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
      <g>
        <rect x={winX - 5} y={winY - 5} width={winW + 10} height={winH + 10} rx="10" fill="rgba(0,0,0,0.4)" />
        <rect x={winX} y={winY} width={winW} height={winH} rx="6" fill="url(#or-win)" />
        {/* stars */}
        {Array.from({ length: 14 }, (_, i) => {
          const sx = winX + ((i * 37) % Math.max(winW - 10, 1)) + 5;
          const sy = winY + ((i * 53) % Math.max(winH - 10, 1)) + 5;
          return <circle key={i} cx={sx} cy={sy} r={i % 3 === 0 ? 1.4 : 0.8} fill="#cfe8ff" opacity={0.35 + (i % 4) * 0.16} />;
        })}
        {/* a far glimpse of Nexus */}
        <circle cx={winX + winW * 0.68} cy={winY + winH * 0.7} r={5} fill="#9fe8ff" opacity="0.8" />
        <circle cx={winX + winW * 0.68} cy={winY + winH * 0.7} r={11} fill="#9fe8ff" opacity="0.14" />
        {/* frame */}
        <rect x={winX} y={winY} width={winW} height={winH} rx="6" fill="none" stroke={theme.trim} strokeWidth="2" />
        <line x1={winX + winW / 2} y1={winY} x2={winX + winW / 2} y2={winY + winH} stroke={theme.trim} strokeWidth="1.5" />
        <line x1={winX} y1={winY + winH / 2} x2={winX + winW} y2={winY + winH / 2} stroke={theme.trim} strokeWidth="1.5" />
      </g>

      {/* shelf with a few books (one in team color) */}
      <g>
        <rect x={w * 0.72} y={wallH * 0.34} width={Math.min(w * 0.16, 150)} height="4" rx="2" fill={theme.trim} />
        <rect x={w * 0.72 + 8} y={wallH * 0.34 - 20} width="9" height="20" rx="1.5" fill="#3b4763" />
        <rect x={w * 0.72 + 20} y={wallH * 0.34 - 24} width="9" height="24" rx="1.5" fill={accent} opacity="0.75" />
        <rect x={w * 0.72 + 32} y={wallH * 0.34 - 17} width="9" height="17" rx="1.5" fill="#2c3550" />
        <rect x={w * 0.72 + 44} y={wallH * 0.34 - 21} width="9" height="21" rx="1.5" fill="#4a5878" />
      </g>

      {/* hanging lamp + light pool over the desks */}
      <g>
        <line x1={mid} y1="0" x2={mid} y2={wallH * 0.3} stroke={theme.trim} strokeWidth="1.5" />
        <path d={`M ${mid - 16} ${wallH * 0.3 + 12} Q ${mid} ${wallH * 0.3 - 10} ${mid + 16} ${wallH * 0.3 + 12} Z`} fill="#1c2338" stroke={theme.trim} strokeWidth="1" />
        <circle cx={mid} cy={wallH * 0.3 + 9} r="3" fill="#ffe9b8" opacity="0.9" />
        <ellipse cx={mid} cy={wallH * 0.9} rx={w * 0.2} ry={wallH * 0.55} fill="url(#or-lamp)" />
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
