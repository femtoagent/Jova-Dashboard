"use client";

import { useEffect, useMemo, useState } from "react";
import { listPresets } from "@/lib/jova/openrouter";
import type { PresetSummary } from "@/lib/jova/openrouter";
import { useChatPrefs } from "@/lib/settings/useChatPrefs";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { AGENT_FRAMEWORKS } from "@/lib/agents/frameworks";
import { AGENT_MEMORIES } from "@/lib/agents/memory";
import { characterByName } from "@/lib/agents/characters";

/** A grouped section with a ruled eyebrow — encodes the agent's anatomy (Soul / Voice & routing). */
export function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
        {label}
        <span className="h-px flex-1 bg-white/10" />
      </h3>
      {children}
    </section>
  );
}

/** The agent's "face": its character glyph (emoji) or initial, lit in its accent color. Dim until named. */
export function AgentGlyph({ name, size = 44 }: { name: string; size?: number }) {
  const meta = characterByName(name);
  const accent = meta?.color ?? "#67e8f9";
  const glyph = meta?.emoji ?? name.trim()[0]?.toUpperCase() ?? "·";
  const lit = !!name.trim();
  return (
    <div
      aria-hidden
      className="grid shrink-0 place-items-center rounded-full font-semibold transition-all duration-300 motion-reduce:transition-none"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: lit ? `${accent}22` : "rgba(255,255,255,0.04)",
        color: lit ? accent : "rgba(255,255,255,0.3)",
        border: `1px solid ${lit ? `${accent}55` : "rgba(255,255,255,0.1)"}`,
        boxShadow: lit ? `0 0 22px ${accent}33` : "none",
      }}
    >
      {glyph}
    </div>
  );
}

/** A compact labeled control for the identity header's spec line (framework / team). */
export function SpecField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block w-44 max-w-[45vw]">
      <span className="mb-1 block text-[10px] uppercase tracking-wider text-white/35">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/40";
export const selectCls = "rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[13px] text-white outline-none focus:border-cyan-300/40";

/** Team dropdown — existing network teams by name, plus "none". Keeps an out-of-list value selectable. */
export function TeamPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const teams = useNetworkStore((s) => s.teams);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      <option value="" className="bg-[#0a0f14]">— none —</option>
      {teams.map((t) => (
        <option key={t.id} value={t.name} className="bg-[#0a0f14]">
          {t.name}
        </option>
      ))}
      {value && !teams.some((t) => t.name === value) && (
        <option value={value} className="bg-[#0a0f14]">
          {value}
        </option>
      )}
    </select>
  );
}

/** Framework dropdown (Create only) — the runtime an agent runs on. Only "creatable" frameworks are
 *  selectable; the rest show disabled as "set up separately" so the future surface is visible. */
export function FrameworkPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {AGENT_FRAMEWORKS.map((f) => (
        <option key={f.id} value={f.id} disabled={!f.creatable} className="bg-[#0a0f14]">
          {f.label}
          {f.creatable ? "" : " — set up separately (soon)"}
        </option>
      ))}
    </select>
  );
}

/** Memory-backend dropdown — which long-term memory the agent uses. Mutable (unlike framework). */
export function MemoryPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {AGENT_MEMORIES.map((m) => (
        <option key={m.id} value={m.id} title={m.description} className="bg-[#0a0f14]">
          {m.label}
        </option>
      ))}
    </select>
  );
}

/** OpenRouter preset dropdown — fetched presets ∪ user-added custom slugs. Mirrors the Agents list select. */
export function PresetSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const customPresets = useChatPrefs((s) => s.customPresets);
  const hydrate = useChatPrefs((s) => s.hydrate);

  useEffect(() => {
    hydrate();
  }, [hydrate]);
  useEffect(() => {
    listPresets(customPresets).then(setPresets).catch(() => {});
  }, [customPresets]);

  const all = useMemo(() => {
    const merged = [...presets, ...customPresets.filter((s) => !presets.some((p) => p.slug === s)).map((s) => ({ slug: s, name: s }))];
    // keep the agent's current preset selectable even if it isn't in the fetched list (else the control
    // would mis-show "Default" and a click could silently overwrite the real slug)
    if (value && !merged.some((p) => p.slug === value)) merged.push({ slug: value, name: value });
    return merged;
  }, [presets, customPresets, value]);

  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={selectCls}>
      <option value="" className="bg-[#0a0f14]">Default · jova-conversation</option>
      {all.map((p) => (
        <option key={p.slug} value={p.slug} className="bg-[#0a0f14]">
          {p.name}
          {p.slug !== p.name ? ` (${p.slug})` : ""}
        </option>
      ))}
    </select>
  );
}

/** Labelled field wrapper used by the Create/Edit screens. */
export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-white/35">{hint}</span>}
    </label>
  );
}
