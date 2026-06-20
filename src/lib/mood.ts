// The "affect" seam. Today the demo drives this from simple UI / canned responses.
// Later, Gavin's external affect engine (PAD + trust/familiarity) writes Jova's mood into
// Letta's reserved `affect` block; the BFF surfaces it and we call setMood(...) here.
// Nothing about the wisp's look should be hardcoded so rigidly that mood can't drive it.

export type WispType = "flame" | "orb";

export interface Mood {
  /** -1 (down/cool) .. 1 (up/warm) */
  valence: number;
  /** 0 (calm, slow) .. 1 (excited, fast) */
  arousal: number;
  /** 0 (distant) .. 1 (deeply bonded) — reserved for the affect engine */
  familiarity: number;
}

export const NEUTRAL_MOOD: Mood = { valence: 0.2, arousal: 0.35, familiarity: 0.6 };

export interface WispVisualParams {
  /** hot inner color, linear-ish rgb 0..1 */
  coreColor: [number, number, number];
  /** outer flame / mote color */
  edgeColor: [number, number, number];
  /** overall brightness multiplier */
  intensity: number;
  /** particle emission multiplier (embers / spores) */
  emberRate: number;
  /** animation speed multiplier */
  speed: number;
  /** size multiplier */
  scale: number;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const mix3 = (
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/**
 * Map a mood to wisp visual parameters. This is the one place that decides how she "looks"
 * for a given emotional state, so the future affect engine has a single, clean target.
 */
export function moodToWispParams(mood: Mood, type: WispType): WispVisualParams {
  const arousal = clamp01(mood.arousal);
  const warm = clamp01((mood.valence + 1) / 2); // -1..1 -> 0..1

  if (type === "flame") {
    // deep electric blue (calm/down) -> bright cyan-white (excited/up)
    const coreColor = mix3([0.45, 0.85, 1.0], [0.85, 0.98, 1.0], warm);
    const edgeColor = mix3([0.04, 0.16, 0.7], [0.12, 0.55, 1.0], warm);
    return {
      coreColor,
      edgeColor,
      intensity: lerp(0.75, 1.3, arousal),
      emberRate: lerp(0.4, 1.6, arousal),
      speed: lerp(0.65, 1.9, arousal),
      scale: lerp(0.94, 1.12, arousal),
    };
  }

  // orb: warm gold mote-of-light
  const coreColor = mix3([1.0, 0.93, 0.72], [1.0, 1.0, 0.95], warm);
  const edgeColor = mix3([0.85, 0.5, 0.12], [1.0, 0.8, 0.32], warm);
  return {
    coreColor,
    edgeColor,
    intensity: lerp(0.75, 1.55, arousal),
    emberRate: lerp(0.4, 1.5, arousal),
    speed: lerp(0.5, 1.6, arousal),
    scale: lerp(0.94, 1.1, arousal),
  };
}
