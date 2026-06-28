/** Shared (client + server) voice types. No runtime/server imports here so clients can use it freely. */

export type VoiceModel = "eleven_flash_v2_5" | "eleven_v3";

/** Selectable TTS models for the per-agent toggle. */
export const VOICE_MODELS: { id: VoiceModel; label: string; hint: string }[] = [
  { id: "eleven_flash_v2_5", label: "Flash v2.5", hint: "fast · low-latency" },
  { id: "eleven_v3", label: "v3", hint: "most expressive" },
];

/** A voice from the ElevenLabs catalog, surfaced to the picker. */
export type VoiceOption = {
  voiceId: string;
  name: string;
  description: string;
  language: string;
  labels: Record<string, string>;
  category: string;
  /** ElevenLabs-hosted sample clip — play this for previews (free; does NOT spend TTS credits). */
  previewUrl: string;
};

/** One stored key, masked for the UI — never the full key. */
export type KeyMeta = { id: string; name: string; masked: string };

/** A provider's keys + which one is active. `envOnly` = the lone .env fallback (read-only in UI). */
export type ProviderStatus = { activeId: string; keys: KeyMeta[]; envOnly?: boolean } | null;

export type Credits = { used: number; limit: number; remaining: number; exhausted: boolean };
