"use client";

import { useJovaStore } from "@/lib/state/useJovaStore";
import { useSettingsStore } from "@/lib/settings/useSettingsStore";
import { Graph, Sparkle } from "@phosphor-icons/react";

/**
 * Toggle between the lite "just Jova" default (cheap load — no Nexus, no team network) and the
 * full world. Expanding lazy-loads the heavy assets on demand. Rendered inside the top-centre
 * chrome group in CommandCenter.
 */
export function WorldToggle() {
  const fullMode = useJovaStore((s) => s.fullMode);
  const toggleFullMode = useJovaStore((s) => s.toggleFullMode);
  const onToggle = () => {
    if (fullMode) useSettingsStore.getState().closeSettings(); // don't leave Settings open to flash back on re-expand
    toggleFullMode();
  };
  return (
    <button
      onClick={onToggle}
      title={fullMode ? "Collapse to just Jova" : "Load the full network (Nexus + teams)"}
      className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] backdrop-blur-md transition ${
        fullMode
          ? "border-cyan-300/40 bg-cyan-400/20 text-cyan-50 hover:bg-cyan-400/30"
          : "border-white/15 bg-black/40 text-white/70 hover:bg-white/10"
      }`}
    >
      {fullMode ? <Sparkle size={13} weight="bold" /> : <Graph size={13} weight="bold" />}
      <span className="sm:hidden">{fullMode ? "Jova" : "Network"}</span>
      <span className="hidden sm:inline">{fullMode ? "Just Jova" : "Expand network"}</span>
    </button>
  );
}
