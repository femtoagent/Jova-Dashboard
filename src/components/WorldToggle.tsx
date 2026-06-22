"use client";

import { useJovaStore } from "@/lib/state/useJovaStore";
import { useSettingsStore } from "@/lib/settings/useSettingsStore";

/**
 * Top toggle between the lite "just Jova" default (cheap load — no Nexus, no team network) and the
 * full world. Expanding lazy-loads the heavy assets on demand.
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
      className={`fixed left-1/2 top-4 z-20 -translate-x-1/2 rounded-full border px-4 py-1.5 text-[12px] backdrop-blur-md transition ${
        fullMode
          ? "border-cyan-300/40 bg-cyan-400/20 text-cyan-50 hover:bg-cyan-400/30"
          : "border-white/15 bg-black/40 text-white/70 hover:bg-white/10"
      }`}
    >
      {fullMode ? "◆ Just Jova" : "◇ Expand network"}
    </button>
  );
}
