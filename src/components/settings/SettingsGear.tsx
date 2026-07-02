"use client";

import { useSettingsStore, type SettingsScreen } from "@/lib/settings/useSettingsStore";
import { GearSix } from "@phosphor-icons/react";

/**
 * Opens the Settings/Admin overlay. Sits in the top-right. `to` picks which screen it opens to
 * (the full network uses the default Teams root; the "just Jova" screen opens straight to her editor).
 */
export function SettingsGear({ to = "teams", title = "Settings" }: { to?: SettingsScreen; title?: string }) {
  const openSettings = useSettingsStore((s) => s.openSettings);
  return (
    <button
      onClick={() => openSettings(to)}
      title={title}
      className="fixed right-4 top-[max(1rem,env(safe-area-inset-top))] z-40 flex h-11 w-12 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-white/70 backdrop-blur-md transition hover:bg-white/10 hover:text-white/90"
    >
      <GearSix size={19} weight="bold" />
    </button>
  );
}
