"use client";

/**
 * Nexus's voice, shared between renderers: the reference bass hit + growl loop
 * (public/audio/nexus-bass.wav). The 3D scene plays it through a positional panner
 * (NexusAudio); the default 2D stage through a plain gain (StageAudio). Both use the
 * same loop region and the same seam crossfade.
 */

export const NEXUS_BASS_URL = "/audio/nexus-bass.wav";
export const NEXUS_MASTER = 0.8; // overall volume when sound is on
// loop the loud, growling region of the reference (~first 1.9s); the rest is a long quiet decay tail
export const LOOP_START = 1.05;
export const LOOP_END = 2.1;
export const LOOP_XF = 0.08; // crossfade (seconds) baked into the loop seam so it doesn't pop

/**
 * Make the loop seam seamless: equal-power crossfade the loop's tail [loopEnd-XF, loopEnd) with the
 * material just before loopStart, so when it wraps loopEnd -> loopStart the waveform is continuous
 * (no step = no pop). Mutates the buffer in place.
 */
export function crossfadeLoop(buffer: AudioBuffer, loopStart: number, loopEnd: number, xf: number) {
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
      d[tail] = d[tail]! * fadeOut + d[lead]! * fadeIn;
    }
  }
}

/** Fetch + decode + seam-fix the Nexus bass into the given context. Resolves null on failure. */
export async function loadNexusBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
  try {
    const ab = await (await fetch(NEXUS_BASS_URL)).arrayBuffer();
    const buf = await ctx.decodeAudioData(ab);
    crossfadeLoop(buf, LOOP_START, LOOP_END, LOOP_XF);
    return buf;
  } catch {
    return null;
  }
}

/** Start the hit-then-growl loop into `out`; returns handles to stop it. */
export function startNexusLoop(ctx: AudioContext, buffer: AudioBuffer, out: AudioNode) {
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.loopStart = LOOP_START;
  src.loopEnd = LOOP_END;
  const vg = ctx.createGain();
  vg.gain.value = 0.0001;
  src.connect(vg).connect(out);
  src.start(0, 0); // from 0 so the hard attack hits, then loop the growl while held active
  vg.gain.setTargetAtTime(1, ctx.currentTime, 0.04);
  return { src, vg };
}

/** Fade out + stop a running loop started by startNexusLoop. */
export function stopNexusLoop(ctx: AudioContext, h: { src: AudioBufferSourceNode; vg: GainNode }) {
  const now = ctx.currentTime;
  h.vg.gain.setTargetAtTime(0.0001, now, 0.18);
  try {
    h.src.stop(now + 0.7);
  } catch {}
}
