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

export interface PresetListResult {
  presets: PresetSummary[];
  /** true when no OpenRouter key is configured (server returned the mock list) — prompt for a key. */
  mock: boolean;
}

/** Fetch preset summaries. `extraSlugs` (the user's added slugs) are verified + named alongside the
 *  server's configured defaults. Returns the `mock` flag so the UI can prompt for an API key. */
export async function fetchPresets(extraSlugs: string[] = []): Promise<PresetListResult> {
  const qs = extraSlugs.length ? `?slugs=${encodeURIComponent(extraSlugs.join(","))}` : "";
  const res = await fetch(`/api/openrouter/presets${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`presets ${res.status}`);
  const json = (await res.json()) as { presets?: PresetSummary[]; mock?: boolean };
  return { presets: json.presets ?? [], mock: !!json.mock };
}

/** List the workspace's presets (most-recently-updated first). Thin wrapper used by the agent dropdowns. */
export async function listPresets(extraSlugs: string[] = []): Promise<PresetSummary[]> {
  return (await fetchPresets(extraSlugs)).presets;
}

// ── OpenRouter API key management (mirrors the ElevenLabs key UI; keys live server-side) ──────────────
export interface OpenRouterKeyMeta {
  id: string;
  name: string;
  masked: string;
}
export interface OpenRouterKeyStatus {
  activeId: string;
  keys: OpenRouterKeyMeta[];
  /** the only "key" is the .env fallback (read-only) */
  envOnly?: boolean;
}

export async function getOpenRouterKeys(): Promise<OpenRouterKeyStatus | null> {
  try {
    const res = await fetch("/api/openrouter/keys", { cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as { openrouter?: OpenRouterKeyStatus | null };
    return j.openrouter ?? null;
  } catch {
    return null;
  }
}

export async function addOpenRouterKey(key: string, name: string): Promise<{ ok: boolean; verified?: boolean; error?: string; status: OpenRouterKeyStatus | null }> {
  try {
    const res = await fetch("/api/openrouter/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, name }),
    });
    const j = (await res.json().catch(() => ({}))) as { openrouter?: OpenRouterKeyStatus | null; verified?: boolean; error?: string };
    return { ok: res.ok, verified: j.verified, error: j.error, status: j.openrouter ?? null };
  } catch {
    return { ok: false, error: "Couldn't reach the server.", status: null };
  }
}

export async function activateOpenRouterKey(id: string): Promise<OpenRouterKeyStatus | null> {
  try {
    const res = await fetch("/api/openrouter/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activateId: id }),
    });
    const j = (await res.json().catch(() => ({}))) as { openrouter?: OpenRouterKeyStatus | null };
    return j.openrouter ?? null;
  } catch {
    return null;
  }
}

export async function removeOpenRouterKey(id: string): Promise<OpenRouterKeyStatus | null> {
  try {
    const res = await fetch(`/api/openrouter/keys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const j = (await res.json().catch(() => ({}))) as { openrouter?: OpenRouterKeyStatus | null };
    return j.openrouter ?? null;
  } catch {
    return null;
  }
}

/** OpenRouter account balance (USD). `remaining = total - usage`. */
export interface OpenRouterCredits {
  total: number;
  usage: number;
  remaining: number;
}

/** Fetch the OpenRouter balance for the active key. null when no key / unreachable. OpenRouter has no
 *  push API for this, so poll this on an interval for near-real-time. */
export async function getOpenRouterCredits(): Promise<OpenRouterCredits | null> {
  try {
    const res = await fetch("/api/openrouter/credits", { cache: "no-store" });
    if (!res.ok) return null;
    const j = (await res.json()) as { credits?: OpenRouterCredits | null };
    return j.credits ?? null;
  } catch {
    return null;
  }
}

/** Get one preset's config by slug. */
export async function getPreset(slug: string): Promise<PresetDetail> {
  const res = await fetch(`/api/openrouter/presets/${encodeURIComponent(slug)}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`preset ${res.status}`);
  return (await res.json()) as PresetDetail;
}
