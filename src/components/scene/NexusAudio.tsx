"use client";

import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { NEXUS_MASTER, loadNexusBuffer, startNexusLoop, stopNexusLoop } from "@/lib/audio/nexusLoop";

// Nexus core world position (matches SceneCanvas: NEXUS_POS [0,-3,-22] + scale 3 * model core y≈3.03)
const CORE: [number, number, number] = [0, 6, -22];

interface Graph {
  ctx: AudioContext;
  master: GainNode;
  pan: PannerNode;
  buffer: AudioBuffer | null;
  src: AudioBufferSourceNode | null;
  vg: GainNode | null;
  playing: boolean;
}

function setPannerPos(p: PannerNode, x: number, y: number, z: number) {
  if (p.positionX) {
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
  } else {
    p.setPosition(x, y, z);
  }
}

/**
 * Nexus's voice in the 3D scene. SILENT at rest — nothing plays. When she activates (and sound is
 * on), the reference bass (shared loop in lib/audio/nexusLoop) plays through a positional panner:
 * the full hard hit on the activation edge, then looping its loud growling region while she
 * processes, fading out when she settles. Gated by soundOn (autoplay needs a user gesture — the
 * Sound toggle).
 */
export function NexusAudio() {
  const camera = useThree((s) => s.camera);
  const graph = useRef<Graph | null>(null);
  const fwd = useRef(new THREE.Vector3());

  useEffect(() => {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = NEXUS_MASTER;
    master.connect(ctx.destination);
    const pan = ctx.createPanner();
    pan.panningModel = "equalpower";
    pan.distanceModel = "inverse";
    pan.refDistance = 8;
    pan.rolloffFactor = 0.5;
    setPannerPos(pan, CORE[0], CORE[1], CORE[2]);
    pan.connect(master);

    const g: Graph = { ctx, master, pan, buffer: null, src: null, vg: null, playing: false };
    graph.current = g;

    let cancelled = false;
    void loadNexusBuffer(ctx).then((buf) => {
      if (!cancelled && buf) g.buffer = buf;
    });

    return () => {
      cancelled = true;
      try { g.src?.stop(); } catch {}
      void ctx.close();
      graph.current = null;
    };
  }, []);

  useFrame(() => {
    const g = graph.current;
    if (!g) return;
    const { ctx } = g;
    const s = useJovaStore.getState();
    if (s.soundOn && ctx.state === "suspended") void ctx.resume();

    const want = s.soundOn && s.nexusActive && !!g.buffer;

    if (want && !g.playing) {
      const h = startNexusLoop(ctx, g.buffer!, g.pan);
      g.src = h.src;
      g.vg = h.vg;
      g.playing = true;
    } else if (!want && g.playing) {
      if (g.src && g.vg) stopNexusLoop(ctx, { src: g.src, vg: g.vg });
      g.playing = false;
      g.src = null;
      g.vg = null;
    }

    // listener tracks the camera so the panner spatialises
    const lis = ctx.listener;
    const p = camera.position;
    camera.getWorldDirection(fwd.current);
    if (lis.positionX) {
      lis.positionX.value = p.x;
      lis.positionY.value = p.y;
      lis.positionZ.value = p.z;
      lis.forwardX.value = fwd.current.x;
      lis.forwardY.value = fwd.current.y;
      lis.forwardZ.value = fwd.current.z;
      lis.upX.value = 0;
      lis.upY.value = 1;
      lis.upZ.value = 0;
    } else {
      lis.setPosition(p.x, p.y, p.z);
      lis.setOrientation(fwd.current.x, fwd.current.y, fwd.current.z, 0, 1, 0);
    }
  });

  return null;
}
