"use client";

import { useSettingsStore } from "@/lib/settings/useSettingsStore";

/** Opens the Settings/Admin overlay. Sits in the top-right, below the Dreamer cloud. */
export function SettingsGear() {
  const openSettings = useSettingsStore((s) => s.openSettings);
  return (
    <button
      onClick={openSettings}
      title="Settings"
      className="fixed right-4 top-4 z-40 flex h-11 w-12 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-lg text-white/70 backdrop-blur-md transition hover:bg-white/10 hover:text-white/90"
    >
      ⚙
    </button>
  );
}
