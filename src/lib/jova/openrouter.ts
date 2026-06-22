/**
 * Client → BFF helpers for OpenRouter "presets". The browser only ever calls our own
 * /api/openrouter/* routes; the OpenRouter API key lives server-side. Those routes fall back to
 * mock data when no key is configured, so the demo works offline.
 */

export interface PresetSummary {
  slug: string;
  name: string;
  description?: string | null;
  status?: string | null;
}

export interface PresetDetail {
  slug: string;
  name: string;
  /** the preset's system prompt (from its designated version), if any */
  systemPrompt?: string | null;
  /** model / provider routing / generation params, etc. */
  config?: Record<string, unknown> | null;
}

/** List the workspace's presets (most-recently-updated first). */
export async function listPresets(): Promise<PresetSummary[]> {
  const res = await fetch("/api/openrouter/presets", { cache: "no-store" });
  if (!res.ok) throw new Error(`presets ${res.status}`);
  const json = (await res.json()) as { presets?: PresetSummary[] };
  return json.presets ?? [];
}

/** Get one preset's config by slug. */
export async function getPreset(slug: string): Promise<PresetDetail> {
  const res = await fetch(`/api/openrouter/presets/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`preset ${res.status}`);
  return (await res.json()) as PresetDetail;
}
