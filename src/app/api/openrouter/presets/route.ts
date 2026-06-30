import type { PresetSummary } from "@/lib/jova/openrouter";
import { MOCK_PRESETS } from "@/lib/jova/openrouterMock";
import { getSecret } from "@/lib/server/secrets";

export const runtime = "nodejs";

// OpenRouter has NO "list my presets" endpoint (that path returns the website HTML, not JSON), so we
// fetch a known set of slugs individually. Defaults come from OPENROUTER_PRESET_SLUGS (comma-sep); the
// client also passes its user-added slugs via ?slugs= so they're verified + named against OpenRouter.
const ENV_SLUGS = (process.env.OPENROUTER_PRESET_SLUGS ?? "file-medium,image-light,jova-memory,jova-conversation,min,fren")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function parseSlugs(req: Request): string[] {
  const extra = (new URL(req.url).searchParams.get("slugs") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^[a-z0-9_-]+$/.test(s))
    .slice(0, 64); // cap user-supplied slugs so a long list can't fan out into unbounded OpenRouter calls
  return [...new Set([...ENV_SLUGS, ...extra])];
}

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
 * BFF: list OpenRouter presets. Reads the OpenRouter key from the UI-managed secret store (active key),
 * falling back to OPENROUTER_API_KEY in .env.local — never exposed to the client. Fetches each slug by
 * slug (no list API exists). With NO key it returns the sample (mock) list so the demo works and the UI
 * knows to prompt for one (`mock: true`); with a key it returns the real list as-is — even if empty
 * (so a misconfigured/revoked key isn't masked behind sample data).
 */
export async function GET(req: Request) {
  const sec = await getSecret("openrouter");
  const key = sec?.key;
  const slugs = parseSlugs(req);
  // No key → sample presets so the demo works AND the UI knows to prompt for one (mock: true).
  if (!key) return Response.json({ presets: MOCK_PRESETS, mock: true });
  // Key present → the real list, even if empty (don't mask a misconfigured key behind sample data).
  const results = await Promise.all(slugs.map((slug) => fetchSummary(slug, key)));
  const presets = results.filter((p): p is PresetSummary => p !== null);
  return Response.json({ presets });
}
