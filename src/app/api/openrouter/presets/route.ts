import type { PresetSummary } from "@/lib/jova/openrouter";
import { MOCK_PRESETS } from "@/lib/jova/openrouterMock";

export const runtime = "nodejs";

// OpenRouter has NO "list my presets" endpoint (that path returns the website HTML, not JSON), so we
// fetch a known set of slugs individually. Override/extend via OPENROUTER_PRESET_SLUGS (comma-sep)
// when you create new presets in the OpenRouter dashboard.
const PRESET_SLUGS = (process.env.OPENROUTER_PRESET_SLUGS ?? "file-medium,image-light,jova-memory,jova-conversation")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function fetchSummary(slug: string, key: string): Promise<PresetSummary | null> {
  try {
    const res = await fetch(`https://openrouter.ai/api/v1/presets/${encodeURIComponent(slug)}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: Record<string, unknown> };
    const p = (json?.data ?? json) as Record<string, unknown>;
    if (!p?.slug && !p?.name) return null;
    return {
      slug: String(p.slug ?? slug),
      name: String(p.name ?? slug),
      description: (p.description as string | null) ?? null,
      status: (p.status as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * BFF: list OpenRouter presets. Reads OPENROUTER_API_KEY server-side (never the client). Fetches each
 * configured slug by slug (no list API exists). Falls back to mock presets when the key is absent or
 * every fetch fails, so the demo always works.
 */
export async function GET() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return Response.json({ presets: MOCK_PRESETS, mock: true });
  const results = await Promise.all(PRESET_SLUGS.map((slug) => fetchSummary(slug, key)));
  const presets = results.filter((p): p is PresetSummary => p !== null);
  return presets.length ? Response.json({ presets }) : Response.json({ presets: MOCK_PRESETS, mock: true });
}
