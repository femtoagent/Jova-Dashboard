"use client";

import { useEffect, useState } from "react";
import { useAgentVoices } from "@/lib/settings/useAgentVoices";
import { useVoiceStatus } from "@/lib/settings/useVoiceStatus";
import { VOICE_MODELS } from "@/lib/voice/types";
import { AgentCard, VoiceBrowser } from "./AgentVoicesPanel";

/**
 * Dedicated voice editor for ONE agent — the Voice studio's `AgentCard` (+ its `VoiceBrowser`) on its
 * own full-area view, reused by both Create and Edit. The host (Create/Edit) renders this as a takeover
 * via a local flag instead of a separate settings route, so the in-progress form (persona drafts,
 * identity) survives the round-trip. Binds to the roster entry keyed by `voiceKey` — Jova's built-in
 * "jova" entry, a real agent's id, or a `draft-…` id during create.
 */
export function AgentVoiceScreen({ voiceKey, onBack }: { voiceKey: string; onBack: () => void }) {
  const av = useAgentVoices((s) => s.roster.find((r) => r.id === voiceKey));
  const elevenlabs = useVoiceStatus((s) => s.elevenlabs);
  const [picking, setPicking] = useState(false);

  // browsing the catalog takes over the whole view (it brings its own ‹ Back → the card).
  if (picking && av) return <VoiceBrowser agent={av} onClose={() => setPicking(false)} />;

  return (
    <div>
      <div className="mb-4 flex items-center gap-2 pr-10">
        <button onClick={onBack} className="rounded px-1 text-[12px] text-white/50 transition hover:text-white/80">
          ‹ Back
        </button>
      </div>
      <h2 className="mb-3 text-lg font-semibold text-cyan-100">Voice{av ? ` — ${av.name}` : ""}</h2>
      {av ? (
        <div className="max-w-md">
          <AgentCard agent={av} noKey={!elevenlabs} onChange={() => setPicking(true)} />
        </div>
      ) : (
        <p className="text-sm text-white/40">No voice entry for this agent yet.</p>
      )}
    </div>
  );
}

/**
 * Compact voice summary + a button that opens the dedicated screen — lives in the Create/Edit form
 * where the full card used to be. Resolves the assigned voice's display name from its key's catalog
 * (lazy-loaded, mirroring the Agents list).
 */
export function VoiceSummaryButton({ voiceKey, onOpen }: { voiceKey: string; onOpen: () => void }) {
  const av = useAgentVoices((s) => s.roster.find((r) => r.id === voiceKey));
  const elevenlabs = useVoiceStatus((s) => s.elevenlabs);
  const loadVoices = useVoiceStatus((s) => s.loadVoices);
  const activeId = elevenlabs?.activeId ?? "";
  const effKey = av?.keyId && elevenlabs?.keys.some((k) => k.id === av.keyId) ? av.keyId : activeId;
  const voiceList = useVoiceStatus((s) => (effKey ? s.voicesByKey[effKey] : undefined)) ?? [];
  useEffect(() => {
    if (effKey) void loadVoices(effKey);
  }, [effKey, loadVoices]);

  const modelLabel = av ? VOICE_MODELS.find((m) => m.id === av.model)?.label ?? av.model : "";
  const voiceName = av?.voiceId ? voiceList.find((v) => v.voiceId === av.voiceId)?.name ?? "saved voice" : "account default";
  const summary = !av
    ? "No voice set"
    : av.enabled
      ? `🔊 ${voiceName} · ${modelLabel}`
      : av.voiceId
        ? `🔈 ${voiceName} · muted`
        : "🔇 account default voice";

  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-[12px] text-white/70">{summary}</span>
      <button
        onClick={onOpen}
        className="shrink-0 rounded-md border border-cyan-300/30 bg-cyan-400/15 px-2.5 py-1 text-[12px] text-cyan-50 transition hover:bg-cyan-400/25"
      >
        {av?.voiceId ? "Change voice ›" : "Set voice ›"}
      </button>
    </div>
  );
}
