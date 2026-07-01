"use client";

import { useState } from "react";
import {
  MEMORY_TIERS,
  MEMORY_FUNCTIONS,
  RECALL_MODES,
  REFLECTION_MODES,
  profileForTier,
  tierOf,
  clampReflectMinutes,
  DEFAULT_REFLECT_MINUTES,
  REFLECT_MIN_MINUTES,
  REFLECT_MAX_MINUTES,
  type MemoryProfile,
  type MemoryFunction,
  type RecallMode,
  type ReflectionMode,
} from "@/lib/agents/memoryProfile";
import { PresetSelect } from "./agentForm";

const ACCENT = "#67e8f9"; // the wisp's cyan — matches AgentGlyph's accent-lit treatment

/**
 * Memory-profile editor — configures how the "Jova Memory" (ranked) engine behaves for one agent.
 * The three cognitive TIERS (Light / Standard / Deep) are the hero: pick a tier and the four controls
 * below snap to it; hand-tune any control and the tier reads "Custom". Everything stays inside the app's
 * accent-lit dark glass so it's one surface with the rest of the agent form.
 */
export function MemoryProfileEditor({ value, onChange }: { value: MemoryProfile; onChange: (p: MemoryProfile) => void }) {
  const tier = tierOf(value);

  const toggleFn = (f: MemoryFunction) => {
    const on = value.functions.includes(f);
    onChange({ ...value, functions: on ? value.functions.filter((x) => x !== f) : [...value.functions, f] });
  };

  // picking "Every…" seeds a sensible default period so the stepper never opens blank
  const setReflection = (r: ReflectionMode) =>
    onChange({ ...value, reflection: r, ...(r === "interval" && value.reflectEveryMinutes == null ? { reflectEveryMinutes: DEFAULT_REFLECT_MINUTES } : {}) });

  return (
    <div className="grid gap-5">
      {/* the hero: three cognitive tiers as accent-lit cards, depth read from a rising signal glyph */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-white/35">Tier</span>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide transition-colors"
            style={
              tier === "custom"
                ? { color: ACCENT, background: `${ACCENT}1a`, boxShadow: `0 0 14px ${ACCENT}22` }
                : { color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.04)" }
            }
          >
            Custom
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {MEMORY_TIERS.map((t) => {
            const selected = tier === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  // apply the preset, but keep the chosen reflection model when the new tier still reflects
                  const p = profileForTier(t.id);
                  if (value.reflectPreset && p.reflection !== "off") p.reflectPreset = value.reflectPreset;
                  onChange(p);
                }}
                className="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left outline-none transition-all duration-300 hover:border-white/20 focus-visible:border-cyan-300/50 motion-reduce:transition-none"
                style={selected ? { background: `${ACCENT}16`, borderColor: `${ACCENT}55`, boxShadow: `0 0 22px ${ACCENT}22` } : undefined}
              >
                <DepthBars depth={t.depth} active={selected} />
                <span className="text-[13px] font-semibold" style={{ color: selected ? ACCENT : "rgba(255,255,255,0.85)" }}>
                  {t.label}
                </span>
                <span className="text-[11px] leading-snug text-white/45">{t.blurb}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* granular controls — quiet by design; touching any of them flips the tier to Custom */}
      <div className="grid gap-4">
        <ControlBlock label="Retains">
          <div className="flex flex-wrap gap-1.5">
            {MEMORY_FUNCTIONS.map((f) => (
              <Chip key={f.id} label={f.label} hint={`${f.label} ${f.hint}`} on={value.functions.includes(f.id)} onToggle={() => toggleFn(f.id)} />
            ))}
          </div>
          {/* always-visible legend — teaches all three types; each line lit when kept, dim when off */}
          <div className="mt-2 grid gap-0.5">
            {MEMORY_FUNCTIONS.map((f) => {
              const kept = value.functions.includes(f.id);
              return (
                <div key={f.id} className="text-[11px] leading-snug transition-opacity duration-200 motion-reduce:transition-none" style={{ opacity: kept ? 1 : 0.4 }}>
                  <span className="font-medium" style={{ color: kept ? ACCENT : "rgba(255,255,255,0.6)" }}>
                    {f.label}
                  </span>{" "}
                  <span className="text-white/40">{f.hint}</span>
                </div>
              );
            })}
          </div>
        </ControlBlock>

        {/* Recall + Reflection stack full-width — Reflection carries sub-controls (period, model), so a
            fixed single column avoids any reflow when they appear (no jumping to a new row). */}
        <div className="grid gap-4">
          <ControlBlock label="Recall" hint={RECALL_MODES.find((m) => m.id === value.recall)?.hint}>
            <Segmented options={RECALL_MODES} value={value.recall} onChange={(v) => onChange({ ...value, recall: v as RecallMode })} ariaLabel="Recall mode" />
          </ControlBlock>
          <ControlBlock label="Reflection">
            <Segmented options={REFLECTION_MODES} value={value.reflection} onChange={(v) => setReflection(v as ReflectionMode)} ariaLabel="Reflection mode" />
            {value.reflection === "interval" ? (
              <ReflectEvery minutes={value.reflectEveryMinutes ?? DEFAULT_REFLECT_MINUTES} onChange={(m) => onChange({ ...value, reflectEveryMinutes: m })} />
            ) : (
              <p className="mt-1.5 text-[11px] leading-snug text-white/35">{REFLECTION_MODES.find((m) => m.id === value.reflection)?.hint}</p>
            )}
            {value.reflection !== "off" && (
              <div className="mt-2.5">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-white/35">Model</div>
                <PresetSelect value={value.reflectPreset ?? ""} onChange={(v) => onChange({ ...value, reflectPreset: v })} />
                <p className="mt-1 text-[11px] leading-snug text-white/35">Which model runs the reflection pass — a cheaper one is usually fine.</p>
              </div>
            )}
          </ControlBlock>
        </div>

        <ControlBlock label="Trend feed" hint="Regularly pulls in outside news from its field — market shifts, competitor moves — so outward-facing agents stay current.">
          <Switch on={value.feed} onToggle={() => onChange({ ...value, feed: !value.feed })} label="Follow trends in its field" />
        </ControlBlock>
      </div>
    </div>
  );
}

/** A rising set of bars — 1..3 lit to the tier's depth. The signature glyph: memory as a ranked, layered
 *  thing rather than an on/off switch. */
function DepthBars({ depth, active }: { depth: number; active: boolean }) {
  return (
    <div className="flex h-4 items-end gap-[3px]" aria-hidden>
      {[1, 2, 3].map((i) => {
        const lit = i <= depth;
        return (
          <span
            key={i}
            className="w-1 rounded-sm transition-colors duration-300 motion-reduce:transition-none"
            style={{ height: 4 + i * 4, background: lit ? (active ? ACCENT : "rgba(255,255,255,0.5)") : "rgba(255,255,255,0.12)" }}
          />
        );
      })}
    </div>
  );
}

function ControlBlock({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-1.5 text-[10px] uppercase tracking-wider text-white/35">{label}</div>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-snug text-white/35">{hint}</p>}
    </div>
  );
}

/** A segmented control — one active segment, state visible at a glance (no dropdown to open). */
function Segmented({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex gap-0.5 rounded-lg border border-white/10 bg-white/[0.03] p-0.5">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={`flex-1 rounded-md px-2 py-1.5 text-[11px] outline-none transition focus-visible:ring-1 focus-visible:ring-cyan-300/40 ${
              on ? "bg-cyan-400/20 text-cyan-50" : "text-white/55 hover:text-white/85"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** The custom reflection period — "every N minutes/hours", clamped to a sane range. Appears when Reflection
 *  is set to "Every…", so the user can dial in their own cadence down to the minute. Canonical value is
 *  minutes; the unit is a display convenience (switching to hours snaps to a whole hour). */
function ReflectEvery({ minutes, onChange }: { minutes: number; onChange: (m: number) => void }) {
  // default the display unit to hours when the period is a clean number of hours, else minutes
  const [unit, setUnit] = useState<"minutes" | "hours">(minutes % 60 === 0 && minutes >= 60 ? "hours" : "minutes");
  const display = unit === "hours" ? Math.max(1, Math.round(minutes / 60)) : minutes;
  const stepBy = unit === "hours" ? 1 : 5;
  const commit = (n: number, u: "minutes" | "hours" = unit) => onChange(clampReflectMinutes(u === "hours" ? n * 60 : n));
  const switchUnit = (u: "minutes" | "hours") => {
    setUnit(u);
    commit(u === "hours" ? Math.max(1, Math.round(minutes / 60)) : minutes, u);
  };
  return (
    <div className="mt-2 flex items-center gap-2 text-[11px] text-white/50">
      <span>Every</span>
      <div className="flex items-center rounded-md border border-white/12 bg-white/[0.03]">
        <button type="button" aria-label="Shorter period" onClick={() => commit(display - stepBy)} className="px-2 py-1 text-white/60 outline-none transition hover:text-white/90 focus-visible:text-cyan-200">
          −
        </button>
        <input
          type="number"
          value={display}
          min={unit === "hours" ? 1 : REFLECT_MIN_MINUTES}
          max={unit === "hours" ? Math.floor(REFLECT_MAX_MINUTES / 60) : REFLECT_MAX_MINUTES}
          onChange={(e) => commit(Number(e.target.value))}
          aria-label={`Reflection period in ${unit}`}
          className="w-12 bg-transparent text-center text-[12px] text-white outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button type="button" aria-label="Longer period" onClick={() => commit(display + stepBy)} className="px-2 py-1 text-white/60 outline-none transition hover:text-white/90 focus-visible:text-cyan-200">
          +
        </button>
      </div>
      <select
        value={unit}
        onChange={(e) => switchUnit(e.target.value as "minutes" | "hours")}
        aria-label="Period unit"
        className="rounded-md border border-white/12 bg-white/[0.03] px-1.5 py-1 text-white/70 outline-none focus-visible:border-cyan-300/40"
      >
        <option value="minutes" className="bg-[#0a0f14]">minutes</option>
        <option value="hours" className="bg-[#0a0f14]">hours</option>
      </select>
    </div>
  );
}

/** A pill toggle for a memory function — lit cyan when kept. */
function Chip({ label, hint, on, onToggle }: { label: string; hint: string; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      title={hint}
      onClick={onToggle}
      className={`rounded-full border px-3 py-1 text-[11px] outline-none transition focus-visible:border-cyan-300/50 ${
        on ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-50" : "border-white/12 bg-white/[0.03] text-white/55 hover:border-white/25 hover:text-white/80"
      }`}
    >
      {label}
    </button>
  );
}

/** A small on/off switch for the trend feed. */
function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onToggle} className="flex items-center gap-2.5 outline-none">
      <span
        className="relative h-4 w-7 shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none"
        style={{ background: on ? `${ACCENT}99` : "rgba(255,255,255,0.15)" }}
      >
        <span
          className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all duration-200 motion-reduce:transition-none"
          style={{ left: on ? 14 : 2 }}
        />
      </span>
      <span className="text-[12px] text-white/70">{label}</span>
    </button>
  );
}
