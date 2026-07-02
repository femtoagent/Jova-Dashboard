"use client";

import { useEffect } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { NEXUS_MASTER, loadNexusBuffer, startNexusLoop, stopNexusLoop } from "@/lib/audio/nexusLoop";

/**
 * Nexus's voice on the default (2D) stage — the same hit-then-growl loop the 3D scene
 * plays, minus the spatial panner (there's no camera to spatialise against). Same gating:
 * silent at rest, plays while soundOn && nexusActive, fades out when she settles.
 */
export function StageAudio() {
  useEffect(() => {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = NEXUS_MASTER * 0.75; // no distance falloff here, so trim a touch
    master.connect(ctx.destination);

    let buffer: AudioBuffer | null = null;
    let handle: { src: AudioBufferSourceNode; vg: GainNode } | null = null;
    let cancelled = false;

    void loadNexusBuffer(ctx).then((buf) => {
      if (!cancelled && buf) {
        buffer = buf;
        sync();
      }
    });

    const sync = () => {
      const s = useJovaStore.getState();
      if (s.soundOn && ctx.state === "suspended") void ctx.resume();
      const want = s.soundOn && s.nexusActive && !!buffer;
      if (want && !handle) {
        handle = startNexusLoop(ctx, buffer!, master);
      } else if (!want && handle) {
        stopNexusLoop(ctx, handle);
        handle = null;
      }
    };

    sync();
    const unsub = useJovaStore.subscribe(sync);

    return () => {
      cancelled = true;
      unsub();
      try { handle?.src.stop(); } catch {}
      void ctx.close();
    };
  }, []);

  return null;
}
