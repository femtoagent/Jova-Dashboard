"use client";

import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import { useJovaStore } from "@/lib/state/useJovaStore";

// Nexus core world position (matches SceneCanvas: NEXUS_POS [0,-3,-22] + scale 3 * model core y≈3.03)
const CORE: [number, number, number] = [0, 6, -22];
const MASTER = 0.8; // overall volume when sound is on
const URL = "/audio/nexus-bass.wav";
// loop the loud, growling region of the reference (~first 1.9s); the rest is a long quiet decay tail
const LOOP_START = 1.05;
const LOOP_END = 2.1;
const XF = 0.08; // crossfade (seconds) baked into the loop seam so it doesn't pop

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
 * Make the loop seam seamless: equal-power crossfade the loop's tail [loopEnd-XF, loopEnd) with the
 * material just before loopStart, so when it wraps loopEnd -> loopStart the waveform is continuous
 * (no step = no pop). Mutates the buffer in place.
 */
function crossfadeLoop(buffer: AudioBuffer, loopStart: number, loopEnd: number, xf: number) {
  const sr = buffer.sampleRate;
  const a = Math.floor(loopStart * sr);
  const b = Math.floor(loopEnd * sr);
  const n = Math.min(Math.floor(xf * sr), a, b - a);
  if (n <= 0) return;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const d = buffer.getChannelData(ch);
    for (let k = 0; k < n; k++) {
      const x = (k / n) * (Math.PI / 2);
      const fadeOut = Math.cos(x); // 1 -> 0
      const fadeIn = Math.sin(x); // 0 -> 1
      const tail = b - n + k;
      const lead = a - n + k;
      d[tail] = d[tail] * fadeOut + d[lead] * fadeIn;
    }
  }
}

/**
 * Nexus's voice. SILENT at rest — nothing plays. When she activates (and sound is on), the actual
 * reference bass (public/audio/nexus-bass.wav) plays through a positional panner: the full hard hit on
 * the activation edge, then looping its loud growling region so it sustains while she processes, fading
 * out when she settles. Gated by soundOn (autoplay needs a user gesture — the Sound toggle).
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
    master.gain.value = MASTER;
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
    fetch(URL)
      .then((r) => r.arrayBuffer())
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => { if (!cancelled) { crossfadeLoop(buf, LOOP_START, LOOP_END, XF); g.buffer = buf; } })
      .catch(() => {});

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
    const now = ctx.currentTime;

    if (want && !g.playing) {
      // start from 0 so the hard attack hits, then loop the loud growl region while held active
      const src = ctx.createBufferSource();
      src.buffer = g.buffer;
      src.loop = true;
      src.loopStart = LOOP_START;
      src.loopEnd = LOOP_END;
      const vg = ctx.createGain();
      vg.gain.value = 0.0001;
      src.connect(vg).connect(g.pan);
      src.start(0, 0);
      vg.gain.setTargetAtTime(1, now, 0.04);
      g.src = src;
      g.vg = vg;
      g.playing = true;
    } else if (!want && g.playing) {
      g.vg?.gain.setTargetAtTime(0.0001, now, 0.18);
      try { g.src?.stop(now + 0.7); } catch {}
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
