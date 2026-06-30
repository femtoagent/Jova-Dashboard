/**
 * BFF: OpenRouter account balance. Reads the UI-managed OpenRouter key (active, else .env fallback) and
 * GETs https://openrouter.ai/api/v1/credits → { data: { total_credits, total_usage } } (USD). Returns the
 * derived remaining balance; never exposes the key. `credits: null` when there's no key or the call fails.
 * OpenRouter has no push/stream for this, so the client polls it.
 */
export const runtime = "nodejs";

import { getSecret } from "@/lib/server/secrets";

export interface OpenRouterCreditsDTO {
  total: number;
  usage: number;
  remaining: number;
}

export async function GET() {
  const key = (await getSecret("openrouter"))?.key;
  if (!key) return Response.json({ credits: null });
  try {
    const res = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    if (!res.ok) return Response.json({ credits: null, error: `credits ${res.status}` });
    const json = (await res.json()) as { data?: { total_credits?: unknown; total_usage?: unknown } };
    const d = json?.data ?? {};
    const total = Number(d.total_credits ?? 0);
    const usage = Number(d.total_usage ?? 0);
    if (!Number.isFinite(total) || !Number.isFinite(usage)) return Response.json({ credits: null });
    const credits: OpenRouterCreditsDTO = { total, usage, remaining: total - usage };
    return Response.json({ credits });
  } catch {
    return Response.json({ credits: null, error: "unreachable" });
  }
}
