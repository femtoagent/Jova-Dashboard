"use client";

import { useJovaStore } from "@/lib/state/useJovaStore";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { JovaPresence } from "./JovaPresence";
import { NetworkBoard } from "./NetworkBoard";
import { StageAudio } from "./StageAudio";

/**
 * The default (2D) stage — everything the 3D scene shows, in CSS/SVG/DOM, light enough for
 * older devices. Lite mode: Jova's presence, centre stage. Full mode: the network board with
 * Jova tucked bottom-right (her 3D corner spot). Clicking empty space mirrors the canvas's
 * onPointerMissed: close an open quick menu first, otherwise zoom back out to the overview.
 */
export function DefaultStage() {
  const fullMode = useJovaStore((s) => s.fullMode);

  const onBackgroundClick = () => {
    const ns = useNetworkStore.getState();
    if (ns.radialAgentId || ns.radialTeamId) {
      ns.setRadialAgent(null);
      ns.setRadialTeam(null);
    } else ns.focusTeam(null);
  };

  return (
    <div data-stage="default" onClick={onBackgroundClick} className="absolute inset-0 overflow-hidden">
      {/* atmosphere — a still deep base with one slow-drifting aurora, transform-only */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% 108%, #0a1626 0%, #060d16 42%, #04070a 78%)",
        }}
      />
      <div
        aria-hidden
        className="motion-safe-anim absolute inset-[-12%]"
        style={{
          background:
            "radial-gradient(52% 38% at 32% 30%, rgba(34,150,220,0.13) 0%, transparent 70%), radial-gradient(44% 34% at 72% 62%, rgba(103,232,249,0.07) 0%, transparent 70%)",
          animation: "aurora-drift 26s ease-in-out infinite",
        }}
      />
      {/* faint starfield — two layered dot grids, no images */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-60"
        style={{
          backgroundImage:
            "radial-gradient(rgba(190,230,255,0.35) 0.6px, transparent 0.6px), radial-gradient(rgba(190,230,255,0.16) 0.5px, transparent 0.5px)",
          backgroundSize: "190px 190px, 97px 97px",
          backgroundPosition: "12px 8px, 51px 63px",
        }}
      />

      {fullMode ? (
        <>
          <NetworkBoard />
          <StageAudio />
          {/* Jova contracts to her corner while the network is up — same spot as the 3D scene */}
          <div className="absolute bottom-5 right-5 z-10 sm:bottom-7 sm:right-8">
            <JovaPresence docked />
          </div>
        </>
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          {/* lifted so her core stays visible above the open chat panel */}
          <div className="-translate-y-[12dvh]">
            <JovaPresence />
          </div>
        </div>
      )}
    </div>
  );
}
