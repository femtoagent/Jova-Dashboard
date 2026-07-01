/**
 * Memory PROFILE — how an agent's memory behaves, independent of which engine stores it (see memory.ts).
 * The engine is where memories live; the profile is the shape of the mind that uses them. It's what the
 * "Jova Memory" (ranked) sidecar reads to gate behavior per-agent: which kinds of memory it keeps, when it
 * recalls, whether it reflects (the learning loop), and whether it pulls an outward trend feed.
 *
 * Framework-agnostic by design: no Letta (or any runtime) concepts leak in here. It's persisted as a JSON
 * string in the agent's Letta `metadata.memoryProfile` and mutable from the Edit screen.
 *
 * Roles map onto the named tiers: Product & Marketing run **Deep** (+ trend feed); QA runs **Standard**
 * (often + Procedural for its house-rules checklist → Custom); Customer Experience runs **Light**. The
 * Developer is a code agent — it uses the repo + CLAUDE.md as its memory and isn't wired to the sidecar.
 */

/** The kinds of memory an agent retains. */
export type MemoryFunction = "episodic" | "semantic" | "procedural";
/** When the agent pulls long-term memory into context. */
export type RecallMode = "off" | "agent" | "every-turn";
/** How lived experience distills into durable insight — the learning loop. `interval` = a period you set
 *  (see `reflectEveryMinutes`). */
export type ReflectionMode = "off" | "nightly" | "continuous" | "interval";
/** A named preset over the four controls, or "custom" once any control is hand-tuned. */
export type MemoryTier = "light" | "standard" | "deep" | "custom";

export interface MemoryProfile {
  /** which kinds of memory this agent keeps */
  functions: MemoryFunction[];
  /** when it recalls */
  recall: RecallMode;
  /** how it reflects (episodic → semantic) */
  reflection: ReflectionMode;
  /** the period, in minutes, when reflection === "interval" (ignored otherwise) — supports sub-hour cadences */
  reflectEveryMinutes?: number;
  /** OpenRouter preset slug that runs the reflection pass ("" / undefined = default). Only meaningful when
   *  reflection is on. Orthogonal to the tier — picking a cheaper model here doesn't change the tier badge. */
  reflectPreset?: string;
  /** outward "what's hot" research feed (Marketing / PM) */
  feed: boolean;
}

/** Bounds + default for a custom reflection period, in minutes (5 minutes … 1 week). */
export const REFLECT_MIN_MINUTES = 5;
export const REFLECT_MAX_MINUTES = 10080;
export const DEFAULT_REFLECT_MINUTES = 360; // 6 hours

/** Clamp an arbitrary number to a whole-minute period in range (defaulting junk to DEFAULT_REFLECT_MINUTES). */
export function clampReflectMinutes(m: unknown): number {
  const n = Math.round(Number(m));
  if (!Number.isFinite(n)) return DEFAULT_REFLECT_MINUTES;
  return Math.min(REFLECT_MAX_MINUTES, Math.max(REFLECT_MIN_MINUTES, n));
}

/** Option metadata for the editor — labels + one-line, end-user-facing hints. */
export const MEMORY_FUNCTIONS: { id: MemoryFunction; label: string; hint: string }[] = [
  { id: "episodic", label: "Episodic", hint: "keeps events and interactions as they happen." },
  { id: "semantic", label: "Semantic", hint: "distills durable facts and insight." },
  { id: "procedural", label: "Procedural", hint: "builds reusable how-tos and checklists." },
];

export const RECALL_MODES: { id: RecallMode; label: string; hint: string }[] = [
  { id: "off", label: "Off", hint: "Never pulls from long-term memory." },
  { id: "agent", label: "When needed", hint: "Searches memory when the moment calls for it." },
  { id: "every-turn", label: "Every turn", hint: "Recalls before every reply — richer, but ~1.5k more tokens per turn." },
];

export const REFLECTION_MODES: { id: ReflectionMode; label: string; hint: string }[] = [
  { id: "off", label: "Off", hint: "Stores memories as-is; never revisits them." },
  { id: "nightly", label: "Nightly", hint: "Reviews the day and distills lasting insight." },
  { id: "continuous", label: "Continuous", hint: "Reflects as it goes — always learning." },
  { id: "interval", label: "Every…", hint: "Reviews and distills on a period you set." },
];

/** The three named tiers, in ascending depth. `depth` drives the signal-bars glyph (1–3). */
export const MEMORY_TIERS: { id: Exclude<MemoryTier, "custom">; label: string; blurb: string; depth: number; profile: MemoryProfile }[] = [
  {
    id: "light",
    label: "Light",
    blurb: "Remembers key moments; recalls when asked.",
    depth: 1,
    profile: { functions: ["episodic"], recall: "agent", reflection: "off", feed: false },
  },
  {
    id: "standard",
    label: "Standard",
    blurb: "Distills facts and reflects nightly.",
    depth: 2,
    profile: { functions: ["episodic", "semantic"], recall: "agent", reflection: "nightly", feed: false },
  },
  {
    id: "deep",
    label: "Deep",
    blurb: "Always recalls, learns continuously, tracks trends.",
    depth: 3,
    profile: { functions: ["episodic", "semantic", "procedural"], recall: "every-turn", reflection: "continuous", feed: true },
  },
];

/** The profile a fresh ranked-memory agent starts with. */
export const DEFAULT_MEMORY_PROFILE: MemoryProfile = MEMORY_TIERS[1].profile;

const FN_ORDER: MemoryFunction[] = ["episodic", "semantic", "procedural"];

/** Canonical ordering + de-dupe of a function set, so equality checks are stable regardless of input order. */
function normFns(fns: MemoryFunction[]): MemoryFunction[] {
  return FN_ORDER.filter((f) => fns.includes(f));
}

function sameProfile(a: MemoryProfile, b: MemoryProfile): boolean {
  const fa = normFns(a.functions);
  const fb = normFns(b.functions);
  return (
    fa.length === fb.length &&
    fa.every((f, i) => f === fb[i]) &&
    a.recall === b.recall &&
    a.reflection === b.reflection &&
    (a.reflection !== "interval" || clampReflectMinutes(a.reflectEveryMinutes) === clampReflectMinutes(b.reflectEveryMinutes)) &&
    a.feed === b.feed
  );
}

/** Which named tier a profile matches, or "custom" if it's been hand-tuned off every preset. */
export function tierOf(profile: MemoryProfile): MemoryTier {
  return MEMORY_TIERS.find((t) => sameProfile(t.profile, profile))?.id ?? "custom";
}

/** The preset profile for a named tier (a fresh copy so callers can't mutate the registry). */
export function profileForTier(tier: Exclude<MemoryTier, "custom">): MemoryProfile {
  const p = MEMORY_TIERS.find((t) => t.id === tier)!.profile;
  return { functions: [...p.functions], recall: p.recall, reflection: p.reflection, feed: p.feed };
}

/** A starting tier suggested from an agent's role text (best-effort keyword match; defaults to Standard). */
export function suggestTierForRole(role: string): Exclude<MemoryTier, "custom"> {
  const r = (role ?? "").toLowerCase();
  if (/(market|growth|content|brand|pm\b|product|founder|strateg)/.test(r)) return "deep";
  if (/(support|customer|cx|success|concierge|greeter)/.test(r)) return "light";
  return "standard"; // QA / analyst / everything else — moderate baseline
}

/** Serialize to the JSON string stored in `metadata.memoryProfile`. Reflection extras (the interval period,
 *  the model preset) are only carried when they're meaningful, so simpler modes stay clean. */
export function serializeMemoryProfile(p: MemoryProfile): string {
  const o: Record<string, unknown> = { functions: normFns(p.functions), recall: p.recall, reflection: p.reflection, feed: !!p.feed };
  if (p.reflection === "interval") o.reflectEveryMinutes = clampReflectMinutes(p.reflectEveryMinutes);
  if (p.reflection !== "off" && p.reflectPreset) o.reflectPreset = p.reflectPreset;
  return JSON.stringify(o);
}

/** Tolerant parse of whatever's in metadata (JSON string, object, or nothing) → a valid profile. Any
 *  missing/garbage field falls back to the default's, so a partial or hand-edited value never throws. */
export function parseMemoryProfile(raw: unknown): MemoryProfile {
  let o: Record<string, unknown> | null = null;
  if (typeof raw === "string" && raw.trim()) {
    try {
      o = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      o = null;
    }
  } else if (raw && typeof raw === "object") {
    o = raw as Record<string, unknown>;
  }
  if (!o) return { ...DEFAULT_MEMORY_PROFILE, functions: [...DEFAULT_MEMORY_PROFILE.functions] };

  const fns = Array.isArray(o.functions) ? o.functions.filter((f): f is MemoryFunction => FN_ORDER.includes(f as MemoryFunction)) : DEFAULT_MEMORY_PROFILE.functions;
  const recall = RECALL_MODES.some((m) => m.id === o!.recall) ? (o.recall as RecallMode) : DEFAULT_MEMORY_PROFILE.recall;
  const reflection = REFLECTION_MODES.some((m) => m.id === o!.reflection) ? (o.reflection as ReflectionMode) : DEFAULT_MEMORY_PROFILE.reflection;
  const feed = typeof o.feed === "boolean" ? o.feed : DEFAULT_MEMORY_PROFILE.feed;
  const profile: MemoryProfile = { functions: normFns(fns), recall, reflection, feed };
  if (reflection === "interval") {
    // canonical is minutes; tolerate a legacy `reflectEveryHours` value by converting it
    const mins = o.reflectEveryMinutes != null ? o.reflectEveryMinutes : o.reflectEveryHours != null ? Number(o.reflectEveryHours) * 60 : undefined;
    profile.reflectEveryMinutes = clampReflectMinutes(mins);
  }
  if (reflection !== "off" && typeof o.reflectPreset === "string" && o.reflectPreset.trim()) profile.reflectPreset = o.reflectPreset.trim();
  return profile;
}
