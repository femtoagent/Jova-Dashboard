"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAgentVoices, type AgentVoice } from "@/lib/settings/useAgentVoices";
import { useVoiceStatus } from "@/lib/settings/useVoiceStatus";
import { useVoicePrefs } from "@/lib/settings/useVoicePrefs";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { playPreview, stopPreview } from "@/lib/audio/preview";
import { unlockAudio, setOutputDevice } from "@/lib/audio/tts";
import { VOICE_MODELS, type VoiceModel, type VoiceOption } from "@/lib/voice/types";

/** Play/stop the catalog sample for a voice; one preview at a time, ▶/⏹ reflects state. Stops on unmount. */
function usePreview() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const ref = useRef<string | null>(null);
  ref.current = playingId;
  useEffect(() => () => { if (ref.current) stopPreview(); }, []);
  const toggle = (id: string, url: string) => {
    if (ref.current === id) stopPreview(); // onEnd clears playingId
    else if (url) {
      playPreview(url, () => setPlayingId((cur) => (cur === id ? null : cur)));
      setPlayingId(id);
    }
  };
  return { playingId, toggle };
}

/**
 * Voice studio — assign an ElevenLabs voice (on a specific key) + model to each agent and preview
 * them. A voice belongs to a key/account, so assignment pins both; the speaking agent's key is what
 * TTS uses. Previews play the catalog's `preview_url` (free — no TTS credits). Listing/assigning works
 * even when a key is out of credits; only actual speaking pauses.
 */
export function AgentVoicesPanel() {
  const roster = useAgentVoices((s) => s.roster);
  const addAgent = useAgentVoices((s) => s.addAgent);
  const elevenlabs = useVoiceStatus((s) => s.elevenlabs);
  const exhausted = useVoiceStatus((s) => s.exhausted);

  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const noKey = !elevenlabs;

  const picking = pickingFor ? roster.find((a) => a.id === pickingFor) ?? null : null;
  if (picking) return <VoiceBrowser agent={picking} onClose={() => setPickingFor(null)} />;

  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-white/85">Voices · per agent</h3>
      <p className="mb-3 text-[11px] text-white/40">
        Jova speaks today. Each voice lives on a specific key — TTS uses the speaking agent&apos;s key. Add agents and pre-assign now;
        their “Speak” stays off until provisioning is ready.
      </p>

      {noKey && <div className="mb-2 text-[11px] text-amber-200/60">Add an ElevenLabs key in the API keys tab to choose voices.</div>}
      {exhausted && <div className="mb-2 text-[11px] text-rose-300/70">Active key is out of credits — you can still browse/assign, but speaking is paused.</div>}

      <div className="grid gap-2 sm:grid-cols-2">
        {roster.map((a) => (
          <AgentCard key={a.id} agent={a} noKey={noKey} onChange={() => setPickingFor(a.id)} />
        ))}

        <div className="flex items-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) {
                addAgent(newName);
                setNewName("");
              }
            }}
            placeholder="Add an agent…"
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-white/85 outline-none focus:border-cyan-300/40"
          />
          <button
            onClick={() => {
              if (!newName.trim()) return;
              addAgent(newName);
              setNewName("");
            }}
            className="shrink-0 rounded-md border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] text-white/75 transition hover:bg-white/10"
          >
            + Add
          </button>
        </div>
      </div>
    </section>
  );
}

function AgentCard({ agent, noKey, onChange }: { agent: AgentVoice; noKey: boolean; onChange: () => void }) {
  const setModel = useAgentVoices((s) => s.setModel);
  const setEnabled = useAgentVoices((s) => s.setEnabled);
  const setV3Tags = useAgentVoices((s) => s.setV3Tags);
  const rename = useAgentVoices((s) => s.rename);
  const removeAgent = useAgentVoices((s) => s.removeAgent);
  const setVoiceOn = useJovaStore((s) => s.setVoiceOn);
  const elevenlabs = useVoiceStatus((s) => s.elevenlabs);
  const loadVoices = useVoiceStatus((s) => s.loadVoices);
  const { playingId, toggle } = usePreview();

  // Enabling Speak should immediately make her audible — flip the speaker on (and unlock audio on this
  // click so autoplay allows it). Independent of the chat 🔊/🎤 toggles; disabling doesn't force it off.
  const onSpeak = (on: boolean) => {
    setEnabled(agent.id, on);
    if (on) {
      unlockAudio();
      setOutputDevice(useVoicePrefs.getState().outputDeviceId);
      setVoiceOn(true);
    }
  };

  const activeId = elevenlabs?.activeId ?? "";
  const keys = elevenlabs?.keys ?? [];
  // the key this agent's voice lives on — if its pinned key was removed, show via the active key
  const effKey = agent.keyId && keys.some((k) => k.id === agent.keyId) ? agent.keyId : activeId;
  const voices = useVoiceStatus((s) => (effKey ? s.voicesByKey[effKey] : undefined)) ?? [];

  useEffect(() => {
    if (effKey) void loadVoices(effKey);
  }, [effKey, loadVoices]);

  const voice = voices.find((v) => v.voiceId === agent.voiceId) ?? null;
  const keyName = elevenlabs?.keys.find((k) => k.id === effKey)?.name ?? "";
  const accent = agent.builtin ? "#67e8f9" : hueFor(agent.name);

  return (
    <div className={`rounded-xl border bg-white/[0.03] p-3 transition ${agent.enabled ? "border-cyan-300/25 shadow-[0_0_24px_rgba(34,211,238,0.08)]" : "border-white/10"}`}>
      <div className="flex items-start gap-2.5">
        <Avatar name={agent.name} color={accent} glow={agent.enabled} />
        <div className="min-w-0 flex-1">
          {agent.builtin ? (
            <div className="text-sm font-semibold text-white/90">{agent.name}</div>
          ) : (
            <input
              value={agent.name}
              onChange={(e) => rename(agent.id, e.target.value)}
              className="w-full rounded border border-transparent bg-transparent text-sm font-semibold text-white/90 outline-none hover:border-white/10 focus:border-cyan-300/40"
            />
          )}
          <div className="mt-0.5 truncate text-[12px] text-white/70">{voice ? voice.name : agent.voiceId ? "Saved voice (unavailable)" : "Account default voice"}</div>
          <div className="flex items-center gap-1.5 text-[10px] text-white/40">
            {voice?.language && <span>{voice.language}</span>}
            {keyName && <span className="rounded bg-white/8 px-1 py-0.5 text-white/45">🔑 {keyName}</span>}
          </div>
        </div>
        {!agent.builtin && (
          <button onClick={() => removeAgent(agent.id)} title="Remove agent" className="shrink-0 rounded px-1 text-white/30 transition hover:text-rose-300">
            ×
          </button>
        )}
      </div>

      {voice && <LabelChips labels={voice.labels} />}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-white/10">
          {VOICE_MODELS.map((m) => (
            <button
              key={m.id}
              title={m.hint}
              onClick={() => setModel(agent.id, m.id as VoiceModel)}
              className={`px-2 py-1 text-[11px] transition ${agent.model === m.id ? "bg-cyan-400/25 text-cyan-50" : "text-white/55 hover:bg-white/10"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <label
          className={`flex items-center gap-1.5 text-[11px] ${agent.builtin ? "text-white/70" : "cursor-not-allowed text-white/35"}`}
          title={agent.builtin ? "Jova speaks her replies" : "Speaking turns on once this agent is provisioned"}
        >
          <input
            type="checkbox"
            className="accent-cyan-400"
            checked={agent.enabled}
            disabled={!agent.builtin}
            onChange={(e) => onSpeak(e.target.checked)}
          />
          Speak
        </label>
      </div>

      {agent.model === "eleven_v3" && (
        <div className="mt-2">
          <input
            value={agent.v3Tags}
            onChange={(e) => setV3Tags(agent.id, e.target.value)}
            placeholder="[evil] [Operatic Modulation] [mockery] [higher pitch] [faster]"
            className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] text-white/85 outline-none focus:border-cyan-300/40"
          />
          <div className="mt-1 text-[10px] text-white/35">v3 audio tags — prepended to every reply to steer emotion/delivery.</div>
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={() => toggle(agent.id, voice?.previewUrl ?? "")}
          disabled={!voice?.previewUrl}
          title={voice?.previewUrl ? "Play a sample (free)" : "No preview for this voice"}
          className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/75 transition hover:bg-white/10 disabled:opacity-40"
        >
          {playingId === agent.id ? "⏹ Stop" : "▶ Preview"}
        </button>
        <button
          onClick={onChange}
          disabled={noKey}
          className="rounded-md border border-cyan-300/30 bg-cyan-400/15 px-2.5 py-1 text-[11px] text-cyan-50 transition hover:bg-cyan-400/25 disabled:opacity-40"
        >
          Change voice
        </button>
      </div>
    </div>
  );
}

/** Full-width voice browser for one agent: switch key, search, preview, assign. */
function VoiceBrowser({ agent, onClose }: { agent: AgentVoice; onClose: () => void }) {
  const setVoice = useAgentVoices((s) => s.setVoice);
  const elevenlabs = useVoiceStatus((s) => s.elevenlabs);
  const loadVoices = useVoiceStatus((s) => s.loadVoices);
  const activeId = elevenlabs?.activeId ?? "";
  const keys = elevenlabs?.keys ?? [];

  // seed to the agent's pinned key, but only if it still exists — else the active key
  const [selectedKey, setSelectedKey] = useState(() => (keys.some((k) => k.id === agent.keyId) ? agent.keyId : activeId));
  const [q, setQ] = useState("");

  const voices = useVoiceStatus((s) => (selectedKey ? s.voicesByKey[selectedKey] : undefined)) ?? [];
  const loading = useVoiceStatus((s) => (selectedKey ? s.loadingByKey[selectedKey] : false)) ?? false;
  const error = useVoiceStatus((s) => (selectedKey ? s.errorByKey[selectedKey] : "") ?? "");

  // if the selected key disappears (removed in the keys tab), fall back so the dropdown can't desync
  useEffect(() => {
    if (keys.length && selectedKey && !keys.some((k) => k.id === selectedKey)) setSelectedKey(activeId);
  }, [keys, activeId, selectedKey]);

  useEffect(() => {
    if (selectedKey) void loadVoices(selectedKey);
  }, [selectedKey, loadVoices]);

  const { playingId, toggle } = usePreview();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return voices;
    return voices.filter((v) => [v.name, v.description, v.language, ...Object.values(v.labels)].join(" ").toLowerCase().includes(needle));
  }, [q, voices]);

  const choose = (voiceId: string) => {
    setVoice(agent.id, voiceId, selectedKey);
    onClose();
  };

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <button onClick={onClose} className="rounded-lg px-2 py-1 text-white/55 transition hover:bg-white/10 hover:text-white/85">
          ‹ Back
        </button>
        <h3 className="text-sm font-semibold text-white/85">Choose a voice for {agent.name}</h3>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11px] text-white/50">
          Key
          <select
            value={selectedKey}
            onChange={(e) => setSelectedKey(e.target.value)}
            className="rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[12px] text-white/85 outline-none focus:border-cyan-300/40"
          >
            {keys.map((k) => (
              <option key={k.id} value={k.id} className="bg-[#0a0f14]">
                {k.name}
                {k.id === activeId ? " (active)" : ""}
              </option>
            ))}
          </select>
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, language, or label…"
          className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[13px] text-white/85 outline-none focus:border-cyan-300/40"
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <button
          onClick={() => choose("")}
          className={`rounded-xl border p-3 text-left transition ${agent.voiceId === "" ? "border-cyan-300/40 bg-cyan-400/10" : "border-white/10 bg-white/[0.03] hover:bg-white/10"}`}
        >
          <div className="text-sm font-medium text-white/85">Account default</div>
          <div className="text-[11px] text-white/45">Use this key&apos;s default voice.</div>
        </button>

        {filtered.map((v) => (
          <VoiceCard
            key={v.voiceId}
            voice={v}
            selected={v.voiceId === agent.voiceId}
            playing={playingId === v.voiceId}
            onPreview={() => toggle(v.voiceId, v.previewUrl)}
            onUse={() => choose(v.voiceId)}
          />
        ))}
      </div>
      {loading && !voices.length && <div className="mt-3 text-[12px] text-white/40">Loading voices…</div>}
      {error && !loading && <div className="mt-3 text-[12px] text-rose-300/80">Couldn&apos;t load this key&apos;s voices — {error}</div>}
      {!loading && !error && !filtered.length && <div className="mt-3 text-[12px] text-white/40">No voices{q ? ` match “${q}”` : " on this key"}.</div>}
    </section>
  );
}

function VoiceCard({
  voice,
  selected,
  playing,
  onPreview,
  onUse,
}: {
  voice: VoiceOption;
  selected: boolean;
  playing: boolean;
  onPreview: () => void;
  onUse: () => void;
}) {
  return (
    <div className={`rounded-xl border p-3 transition ${selected ? "border-cyan-300/40 bg-cyan-400/10" : "border-white/10 bg-white/[0.03]"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-white/90">{voice.name}</div>
          {voice.language && <div className="text-[10px] text-white/40">{voice.language}</div>}
        </div>
        {selected && <span className="shrink-0 rounded bg-cyan-400/20 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-cyan-100/80">current</span>}
      </div>
      {voice.description && <p className="mt-1 line-clamp-2 text-[11px] text-white/50">{voice.description}</p>}
      <LabelChips labels={voice.labels} />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={onPreview}
          disabled={!voice.previewUrl}
          title={voice.previewUrl ? "Play a sample (free)" : "No preview for this voice"}
          className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/75 transition hover:bg-white/10 disabled:opacity-40"
        >
          {playing ? "⏹ Stop" : "▶ Preview"}
        </button>
        <button onClick={onUse} className="rounded-md border border-cyan-300/30 bg-cyan-400/15 px-2.5 py-1 text-[11px] text-cyan-50 transition hover:bg-cyan-400/25">
          {selected ? "Selected" : "Use voice"}
        </button>
      </div>
    </div>
  );
}

const LABEL_ORDER = ["gender", "age", "accent", "descriptive", "use_case"];
function LabelChips({ labels }: { labels: Record<string, string> }) {
  const entries = LABEL_ORDER.map((k) => labels[k]).filter(Boolean).slice(0, 4);
  if (!entries.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {entries.map((v, i) => (
        <span key={i} className="rounded-full bg-white/8 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/50">
          {v}
        </span>
      ))}
    </div>
  );
}

function Avatar({ name, color, glow }: { name: string; color: string; glow: boolean }) {
  return (
    <div
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold text-black/80"
      style={{ background: `radial-gradient(circle at 30% 30%, ${color}, ${color}99)`, boxShadow: glow ? `0 0 14px ${color}66` : "none" }}
    >
      {(name.trim()[0] || "?").toUpperCase()}
    </div>
  );
}

/** Deterministic accent color for an added agent (Jova is handled separately). */
function hueFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 70% 65%)`;
}
