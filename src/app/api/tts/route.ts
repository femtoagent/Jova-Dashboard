/**
 * TTS BFF — proxies text to ElevenLabs and streams the audio back. The key stays server-side (UI-
 * managed via lib/server/secrets, with .env fallback); the browser only ever receives audio.
 *   - 503 when no key is configured (client degrades quietly)
 *   - 402 when the account is out of credits (quota_exceeded) so the client can disable voice + warn
 * The caller picks the voice + model per request (per-agent assignment); both are validated/defaulted.
 */
export const runtime = "nodejs";

import { getSecretById } from "@/lib/server/secrets";

// Default voice = ElevenLabs "Rachel" (warm, neutral). Override with ELEVENLABS_VOICE_ID or per-request.
const DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";
const MODELS = new Set(["eleven_flash_v2_5", "eleven_v3", "eleven_turbo_v2_5", "eleven_multilingual_v2", "eleven_flash_v2"]);

export async function POST(req: Request) {
  let text = "";
  let voiceId = "";
  let model = "";
  let keyId = "";
  try {
    const body = await req.json();
    text = typeof body?.text === "string" ? body.text : "";
    voiceId = typeof body?.voiceId === "string" ? body.voiceId : "";
    model = typeof body?.model === "string" ? body.model : "";
    keyId = typeof body?.keyId === "string" ? body.keyId : "";
  } catch {
    /* empty */
  }

  // resolve the speaking agent's pinned key (falls back to active/env when empty or stale)
  const secret = await getSecretById("elevenlabs", keyId);
  if (!secret) return new Response("voice not configured", { status: 503 });
  const key = secret.key;
  // if we fell back from a requested key, the paired voiceId belongs to a different account — drop it
  // and let the fallback key's default voice speak rather than fail with a "voice not found".
  if (secret.fallback) voiceId = "";
  text = text.trim();
  if (!text) return new Response("empty text", { status: 400 });

  const voice = voiceId || process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
  const modelId = MODELS.has(model) ? model : process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5";

  // Eleven v3 is NOT supported on the realtime /stream endpoint (that's the 400) and has a tighter
  // char limit — use the plain convert endpoint with default voice settings. The client buffers the
  // whole clip before playback either way, so nothing changes for the listener.
  const isV3 = modelId === "eleven_v3";
  if (text.length > (isV3 ? 2900 : 5000)) text = text.slice(0, isV3 ? 2900 : 5000);
  const url = isV3
    ? `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`
    : `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}/stream?optimize_streaming_latency=3&output_format=mp3_44100_128`;
  const payload: Record<string, unknown> = { text, model_id: modelId };
  // v3 rejects some v2 voice_settings; let it use the voice's defaults. Flash/Turbo keep our tuning.
  if (!isV3) payload.voice_settings = { stability: 0.45, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true };

  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify(payload),
      signal: req.signal,
    });
  } catch (e) {
    return new Response(`tts upstream error: ${String(e).slice(0, 200)}`, { status: 502 });
  }

  if (!r.ok || !r.body) {
    const detail = (await r.text().catch(() => "")).slice(0, 400);
    // out of credits → 402 so the client flips into the "exhausted" state and stops trying
    if (r.status === 401 && /quota_exceeded/i.test(detail)) {
      return new Response("quota_exceeded", { status: 402 });
    }
    return new Response(`ElevenLabs ${r.status}${detail ? `: ${detail}` : ""}`, { status: r.status === 401 ? 401 : 502 });
  }

  // Stream the audio straight through to the browser.
  return new Response(r.body, {
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}
