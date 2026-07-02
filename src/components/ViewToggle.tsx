"use client";

import { useJovaStore, type ViewMode } from "@/lib/state/useJovaStore";
import { Cube, CircleDashed } from "@phosphor-icons/react";

const OPTIONS: { key: ViewMode; label: string; icon: React.ReactNode; hint: string }[] = [
  { key: "default", label: "Default", icon: <CircleDashed size={13} weight="bold" />, hint: "Light 2D view — works great on any device" },
  { key: "3d", label: "3D", icon: <Cube size={13} weight="bold" />, hint: "The WebGL scene — needs a beefier device" },
];

/** Renderer switch: the light Default view or the original 3D scene. Persisted. */
export function ViewToggle() {
  const viewMode = useJovaStore((s) => s.viewMode);
  const setViewMode = useJovaStore((s) => s.setViewMode);
  return (
    <div
      data-view-toggle
      className="flex items-center rounded-full border border-white/15 bg-black/40 p-0.5 backdrop-blur-md"
      role="group"
      aria-label="Stage renderer"
    >
      {OPTIONS.map((o) => {
        const active = viewMode === o.key;
        return (
          <button
            key={o.key}
            onClick={() => setViewMode(o.key)}
            title={o.hint}
            aria-pressed={active}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[12px] transition sm:py-1 ${
              active ? "bg-cyan-400/25 text-cyan-50" : "text-white/50 hover:text-white/80"
            }`}
          >
            {o.icon}
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
