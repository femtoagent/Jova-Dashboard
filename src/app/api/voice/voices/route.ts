/**
 * Lists the ElevenLabs voices on the configured account (name, description, language, labels) and the
 * account's remaining credits, so the UI can populate the per-agent voice pickers and gray them out
 * when the account is out of credits. The key stays server-side; the browser gets only the catalog.
 */
export const runtime = "nodejs";

import { getSecretById } from "@/lib/server/secrets";
import type { VoiceOption } from "@/lib/voice/types";

type VerifiedLang = { language?: string; accent?: string; locale?: string };
type RawVoice = {
  voice_id: string;
  name?: string;
  description?: string | null;
  category?: string;
  labels?: Record<string, string> | null;
  verified_languages?: VerifiedLang[];
  preview_url?: string | null;
};

/** Best-effort human language for a voice: its verified language(s), else a `language` label. */
function languageOf(v: RawVoice): string {
  const langs = (v.verified_languages ?? [])
    .map((l) => [l.language, l.accent].filter(Boolean).join(" · "))
    .filter(Boolean);
  if (langs.length) return Array.from(new Set(langs)).slice(0, 3).join(", ");
  return v.labels?.language ?? v.labels?.accent ?? "";
}

export async function GET(req: Request) {
  // which stored key's catalog to list (empty → active); lets the picker browse per-key voices
  const keyId = new URL(req.url).searchParams.get("keyId");
  const secret = await getSecretById("elevenlabs", keyId);
  if (!secret) return Response.json({ error: "ElevenLabs key not set" }, { status: 503 });
  const headers = { "xi-api-key": secret.key };

  // voices (paginate defensively; most accounts have < 100)
  const voices: VoiceOption[] = [];
  try {
    let pageToken: string | null = null;
    for (let page = 0; page < 5; page++) {
      const url = new URL("https://api.elevenlabs.io/v2/voices");
      url.searchParams.set("page_size", "100");
      if (pageToken) url.searchParams.set("next_page_token", pageToken);
      const r = await fetch(url, { headers, cache: "no-store" });
      if (!r.ok) {
        const detail = (await r.text().catch(() => "")).slice(0, 200);
        return Response.json({ error: `ElevenLabs voices ${r.status}: ${detail}` }, { status: r.status === 401 ? 401 : 502 });
      }
      const j = (await r.json()) as { voices?: RawVoice[]; has_more?: boolean; next_page_token?: string | null };
      for (const v of j.voices ?? []) {
        voices.push({
          voiceId: v.voice_id,
          name: v.name ?? "Unnamed",
          description: (v.description ?? "").trim(),
          language: languageOf(v),
          labels: v.labels ?? {},
          category: v.category ?? "",
          previewUrl: v.preview_url ?? "",
        });
      }
      if (!j.has_more || !j.next_page_token) break;
      pageToken = j.next_page_token;
    }
  } catch (e) {
    return Response.json({ error: `voices fetch failed: ${String(e).slice(0, 160)}` }, { status: 502 });
  }

  // credits (don't fail the whole request if this part errors)
  let credits: { used: number; limit: number; remaining: number; exhausted: boolean } | null = null;
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/user/subscription", { headers, cache: "no-store" });
    if (r.ok) {
      const j = (await r.json()) as { character_count?: number; character_limit?: number };
      const used = j.character_count ?? 0;
      const limit = j.character_limit ?? 0;
      const remaining = Math.max(0, limit - used);
      credits = { used, limit, remaining, exhausted: limit > 0 && remaining <= 0 };
    }
  } catch {
    /* leave credits null */
  }

  return Response.json({ voices, credits });
}
