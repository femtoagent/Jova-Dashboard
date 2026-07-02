"use client";

import { useJovaStore } from "@/lib/state/useJovaStore";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useSettingsStore } from "@/lib/settings/useSettingsStore";
import { JovaView } from "./JovaView";
import { NetworkView } from "./NetworkView";
import { SettingsPanel } from "@/components/settings/SettingsOverlay";
import { DocPanel } from "@/components/docs/DocPanel";
import { VoiceLayer } from "@/components/voice/VoiceLayer";
import { DemoControls } from "@/components/demo/DemoControls";
import { Graph, GearSix, Cube } from "@phosphor-icons/react";

/**
 * The Default shell: a slim rail (left on desktop, bottom tab bar on phones) switching between
 * three full views — Jova, Network, Settings. Nothing floats over anything. The active view is
 * DERIVED from existing state (settings open > fullMode > lite), so every openSettings /
 * openTeam / openAgent / openChatWith call in the app keeps landing exactly where it used to.
 */
export function AppShell() {
  const settingsOpen = useSettingsStore((s) => s.open);
  const fullMode = useJovaStore((s) => s.fullMode);
  const view = settingsOpen ? "settings" : fullMode ? "network" : "jova";

  return (
    <div data-shell className="shell-chrome flex h-dvh w-full flex-col-reverse bg-void font-sans text-bright sm:flex-row">
      <Rail view={view} />
      <div className="relative min-h-0 min-w-0 flex-1">
        {view === "jova" && <JovaView />}
        {view === "network" && <NetworkView />}
        {view === "settings" && (
          <div data-view="settings" className="relative flex h-full w-full flex-col overflow-hidden bg-panel pt-[env(safe-area-inset-top)] text-white/85 sm:flex-row sm:pt-0">
            <SettingsPanel />
          </div>
        )}
      </div>

      {/* renderer-agnostic chrome: voice triggers (stage captions replace its feedback), docs, demo */}
      <VoiceLayer feedback={false} />
      <DocPanel />
      <DemoControls />
    </div>
  );
}

function Rail({ view }: { view: "jova" | "network" | "settings" }) {
  const fullMode = useJovaStore((s) => s.fullMode);
  const setFullMode = useJovaStore((s) => s.setFullMode);
  const setViewMode = useJovaStore((s) => s.setViewMode);
  const speaking = useJovaStore((s) => s.wispState === "speaking");
  const totalUnread = useJovaStore((s) => Object.values(s.unread).reduce((a, b) => a + b, 0));
  const approvals = useNetworkStore((s) => s.teams.reduce((n, t) => n + t.approvals.length, 0));
  const openSettings = useSettingsStore((s) => s.openSettings);
  const closeSettings = useSettingsStore((s) => s.closeSettings);

  return (
    <nav
      aria-label="Views"
      className="z-30 flex h-14 w-full shrink-0 flex-row items-center justify-around border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] sm:h-auto sm:w-14 sm:flex-col sm:justify-start sm:gap-1.5 sm:border-r sm:border-t-0 sm:pb-0 sm:pt-3"
    >
      {/* Jova — her live mini-orb; pulses while she speaks even from other views */}
      <RailButton
        active={view === "jova"}
        onClick={() => {
          closeSettings();
          setFullMode(false);
        }}
        label="Jova"
        badge={totalUnread}
      >
        <span className="relative grid h-6 w-6 place-items-center">
          {speaking && (
            <span
              aria-hidden
              className="motion-safe-anim absolute inset-0 rounded-full border border-jova/70"
              style={{ animation: "presence-ripple 1.6s ease-out infinite" }}
            />
          )}
          <span
            className="block h-4 w-4 rounded-full"
            style={{
              background: "radial-gradient(circle at 36% 32%, #dff4ff 0%, #4cc9ff 55%, rgba(76,201,255,0.35) 100%)",
              boxShadow: speaking ? "0 0 14px rgba(76,201,255,0.9)" : "0 0 8px rgba(76,201,255,0.45)",
            }}
          />
        </span>
      </RailButton>

      <RailButton
        active={view === "network"}
        onClick={() => {
          closeSettings();
          setFullMode(true);
        }}
        label="Network"
        badge={approvals}
        badgeTone="amber"
      >
        <Graph size={19} weight={view === "network" ? "fill" : "regular"} />
      </RailButton>

      <span className="hidden sm:block sm:flex-1" />

      <RailButton onClick={() => setViewMode("3d")} label="3D scene" title="Switch to the original 3D world">
        <Cube size={18} weight="regular" />
      </RailButton>

      <RailButton
        active={view === "settings"}
        onClick={() => openSettings(fullMode ? "teams" : "jova")}
        label="Settings"
      >
        <GearSix size={19} weight={view === "settings" ? "fill" : "regular"} />
      </RailButton>
    </nav>
  );
}

function RailButton({
  active = false,
  onClick,
  label,
  title,
  badge = 0,
  badgeTone = "jova",
  children,
}: {
  active?: boolean;
  onClick: () => void;
  label: string;
  title?: string;
  badge?: number;
  badgeTone?: "jova" | "amber";
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title ?? label}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`relative grid h-11 w-11 place-items-center rounded-xl transition sm:mx-auto ${
        active ? "bg-raise text-bright" : "text-faint hover:bg-raise/60 hover:text-mist"
      }`}
    >
      {children}
      {badge > 0 && (
        <span
          className={`absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[9px] font-bold text-black ${
            badgeTone === "amber" ? "bg-amber-300" : "bg-jova"
          }`}
        >
          {badge}
        </span>
      )}
      {/* active edge — bottom on the phone bar, left on the desktop rail */}
      {active && (
        <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-jova sm:inset-x-auto sm:inset-y-3 sm:left-[-9px] sm:h-auto sm:w-0.5" />
      )}
    </button>
  );
}
