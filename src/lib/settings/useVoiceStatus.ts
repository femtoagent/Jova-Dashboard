"use client";

import { create } from "zustand";
import type { VoiceOption, ProviderStatus, Credits } from "@/lib/voice/types";
import { resetVoiceAvailability } from "@/lib/audio/tts";

/**
 * Live status of the voice API keys + ElevenLabs catalogs. Voices/credits/errors are cached PER KEY
 * because each stored key is a different account — agents pin a key, and the picker can switch keys.
 * Playback is gated per the SPEAKING agent's key (read `creditsByKey[keyId]?.exhausted` at speak
 * time); `exhausted` here is just the ACTIVE key's state, for the settings banners.
 */
interface VoiceStatusState {
  deepgram: ProviderStatus;
  elevenlabs: ProviderStatus;
  voicesByKey: Record<string, VoiceOption[]>;
  creditsByKey: Record<string, Credits | null>;
  loadingByKey: Record<string, boolean>;
  errorByKey: Record<string, string>;
  exhausted: boolean; // ACTIVE key out of credits (settings display only)
  loadedOnce: boolean;
  refreshKeys: () => Promise<void>;
  loadVoices: (keyId: string, force?: boolean) => Promise<void>;
  refreshAll: () => Promise<void>;
  /** mark one key out of credits (from a 402 on TTS) so the gate + UI reflect it without a refetch. */
  markKeyExhausted: (keyId: string) => void;
}

export const useVoiceStatus = create<VoiceStatusState>((set, get) => ({
  deepgram: null,
  elevenlabs: null,
  voicesByKey: {},
  creditsByKey: {},
  loadingByKey: {},
  errorByKey: {},
  exhausted: false,
  loadedOnce: false,

  refreshKeys: async () => {
    try {
      const r = await fetch("/api/voice/keys", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { deepgram: ProviderStatus; elevenlabs: ProviderStatus };
      set({ deepgram: j.deepgram ?? null, elevenlabs: j.elevenlabs ?? null });
    } catch {
      /* offline — leave as-is */
    }
  },

  loadVoices: async (keyId, force = false) => {
    const st = get();
    if (!force && (st.voicesByKey[keyId] || st.loadingByKey[keyId])) return; // cached / in-flight
    set((s) => ({ loadingByKey: { ...s.loadingByKey, [keyId]: true }, errorByKey: clearKey(s.errorByKey, keyId) }));
    try {
      const r = await fetch(`/api/voice/voices?keyId=${encodeURIComponent(keyId)}`, { cache: "no-store" });
      if (r.status === 503) {
        set((s) => ({
          voicesByKey: { ...s.voicesByKey, [keyId]: [] },
          creditsByKey: { ...s.creditsByKey, [keyId]: null },
          loadingByKey: { ...s.loadingByKey, [keyId]: false },
        }));
        return;
      }
      const j = (await r.json()) as { voices?: VoiceOption[]; credits?: Credits | null; error?: string };
      if (!r.ok) {
        set((s) => ({ errorByKey: { ...s.errorByKey, [keyId]: j.error || `voices ${r.status}` }, loadingByKey: { ...s.loadingByKey, [keyId]: false } }));
        return;
      }
      const credits = j.credits ?? null;
      // the settings banner follows the ACTIVE key — if it has credits, let TTS retry
      if (keyId === get().elevenlabs?.activeId) {
        const ex = !!credits?.exhausted;
        if (!ex) resetVoiceAvailability();
        set({ exhausted: ex });
      }
      set((s) => ({
        voicesByKey: { ...s.voicesByKey, [keyId]: j.voices ?? [] },
        creditsByKey: { ...s.creditsByKey, [keyId]: credits },
        loadingByKey: { ...s.loadingByKey, [keyId]: false },
        errorByKey: clearKey(s.errorByKey, keyId),
      }));
    } catch (e) {
      set((s) => ({ errorByKey: { ...s.errorByKey, [keyId]: String(e).slice(0, 120) }, loadingByKey: { ...s.loadingByKey, [keyId]: false } }));
    }
  },

  refreshAll: async () => {
    await get().refreshKeys();
    const active = get().elevenlabs?.activeId;
    if (active) await get().loadVoices(active, true);
    set({ loadedOnce: true });
  },

  markKeyExhausted: (keyId) =>
    set((s) => {
      const prev = s.creditsByKey[keyId] ?? { used: 0, limit: 0, remaining: 0, exhausted: true };
      return {
        creditsByKey: { ...s.creditsByKey, [keyId]: { ...prev, remaining: 0, exhausted: true } },
        exhausted: keyId === s.elevenlabs?.activeId ? true : s.exhausted,
      };
    }),
}));

function clearKey(map: Record<string, string>, keyId: string): Record<string, string> {
  if (!map[keyId]) return map;
  const next = { ...map };
  delete next[keyId];
  return next;
}
