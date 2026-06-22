import type { PresetSummary } from "@/lib/jova/openrouter";
import { MOCK_PRESETS } from "@/lib/jova/openrouterMock";

export const runtime = "nodejs";

/**
 * BFF: list OpenRouter presets. Reads OPENROUTER_API_KEY server-side (never the client). Falls back
 * to mock presets when the key is absent or the call fails, so the demo always works.
 */
export async function GET() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return Response.json({ presets: MOCK_PRESETS, mock: true });

  try {
    const res = await fetch("https://openrouter.ai/api/v1/presets", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error(`openrouter presets ${res.status}`);
      return Response.json({ presets: MOCK_PRESETS, mock: true });
    }
    const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
    const presets: PresetSummary[] = (json?.data ?? [])
      .map((p) => ({
        slug: String(p.slug ?? p.id ?? ""),
        name: String(p.name ?? p.slug ?? "preset"),
        description: (p.description as string | null) ?? null,
        status: (p.status as string | null) ?? null,
      }))
      .filter((p) => p.slug);
    return Response.json({ presets });
  } catch (e) {
    console.error(e);
    return Response.json({ presets: MOCK_PRESETS, mock: true });
  }
}
