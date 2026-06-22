"use client";

import { useEffect, useState } from "react";
import { getPreset, listPresets, type PresetDetail, type PresetSummary } from "@/lib/jova/openrouter";

const inputCls = "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/40";

/** OpenRouter preset dropdown (populated from the BFF) + a read-only view of the selected config. */
export function PresetPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [detail, setDetail] = useState<PresetDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    listPresets()
      .then((p) => {
        if (alive) setPresets(p);
      })
      .catch(() => {
        if (alive) setErr("Couldn't load presets");
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!value) {
      setDetail(null);
      return;
    }
    let alive = true;
    setLoading(true);
    getPreset(value)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .catch(() => {
        if (alive) setDetail(null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [value]);

  // keep the stored slug selectable even if it isn't in the fetched list
  const slugs = new Set(presets.map((p) => p.slug));
  const options = value && !slugs.has(value) ? [{ slug: value, name: value } as PresetSummary, ...presets] : presets;

  return (
    <div>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="" className="bg-[#0a0f14]">
          None
        </option>
        {options.map((p) => (
          <option key={p.slug} value={p.slug} className="bg-[#0a0f14]">
            {p.name}
            {p.slug !== p.name ? ` (${p.slug})` : ""}
          </option>
        ))}
      </select>
      {err && <p className="mt-1 text-[11px] text-amber-300/80">{err} — using fallback presets.</p>}
      {value && (
        <div className="mt-2 rounded-lg border border-white/10 bg-white/[0.02] p-2 text-[11px] leading-relaxed text-white/70">
          {loading ? (
            <span className="text-white/40">Loading config…</span>
          ) : detail ? (
            <>
              {detail.systemPrompt && (
                <div className="mb-1">
                  <span className="text-white/40">System prompt: </span>
                  <span className="text-white/75">{detail.systemPrompt}</span>
                </div>
              )}
              {detail.config &&
                Object.entries(detail.config).map(([k, v]) => (
                  <div key={k} className="flex gap-2">
                    <span className="shrink-0 text-white/40">{k}</span>
                    <span className="break-all text-white/75">{typeof v === "string" ? v : JSON.stringify(v)}</span>
                  </div>
                ))}
            </>
          ) : (
            <span className="text-white/40">No config available.</span>
          )}
        </div>
      )}
    </div>
  );
}
