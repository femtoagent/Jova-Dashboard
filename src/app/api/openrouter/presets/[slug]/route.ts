import type { PresetDetail } from "@/lib/jova/openrouter";
import { mockPresetDetail } from "@/lib/jova/openrouterMock";
import { getSecret } from "@/lib/server/secrets";

export const runtime = "nodejs";

/**
 * BFF: get one OpenRouter preset's config by slug (its designated version: system prompt + config).
 * Reads the UI-managed OpenRouter key (active) with .env fallback — same source as the list route, so a
 * key added in Settings resolves preset configs too. Mock fallback when absent or on failure.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const key = (await getSecret("openrouter"))?.key;
  const fallback = () => {
    const d = mockPresetDetail(slug);
    return d ? Response.json(d) : new Response("preset not found", { status: 404 });
  };
  if (!key) return fallback();

  try {
    const res = await fetch(`https://openrouter.ai/api/v1/presets/${encodeURIComponent(slug)}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) return fallback();
    const json = (await res.json()) as Record<string, unknown>;
    const p = ((json?.data as Record<string, unknown>) ?? json) ?? {};
    const v = (p.designated_version as Record<string, unknown> | undefined) ?? undefined;
    const detail: PresetDetail = {
      slug: String(p.slug ?? slug),
      name: String(p.name ?? slug),
      systemPrompt: (v?.system_prompt as string | null) ?? null,
      config: (v?.config as Record<string, unknown> | null) ?? null,
    };
    return Response.json(detail);
  } catch {
    return fallback();
  }
}
