"use client";

import { useState, type ReactNode } from "react";
import { useVoiceStatus } from "@/lib/settings/useVoiceStatus";
import { resetVoiceAvailability } from "@/lib/audio/tts";
import type { ProviderStatus } from "@/lib/voice/types";

type Provider = "deepgram" | "elevenlabs";

/** Manage multiple named API keys per provider. Keys live server-side; this panel only ever sees the
 *  masked form. One key per provider is "active" (used for requests); ElevenLabs also shows credits. */
export function VoiceKeysPanel() {
  const deepgram = useVoiceStatus((s) => s.deepgram);
  const elevenlabs = useVoiceStatus((s) => s.elevenlabs);
  const exhausted = useVoiceStatus((s) => s.exhausted);
  const refreshAll = useVoiceStatus((s) => s.refreshAll);
  const loadVoices = useVoiceStatus((s) => s.loadVoices);
  const activeId = elevenlabs?.activeId ?? "";
  const voices = useVoiceStatus((s) => (activeId ? s.voicesByKey[activeId] : undefined)) ?? [];
  const credits = useVoiceStatus((s) => (activeId ? s.creditsByKey[activeId] : null)) ?? null;
  const loadingVoices = useVoiceStatus((s) => (activeId ? s.loadingByKey[activeId] : false)) ?? false;

  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-white/85">API keys</h3>
      <p className="mb-3 text-[11px] text-white/40">Stored on the server, never shown in full. Add several and pick which one is active.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <ProviderCard provider="deepgram" title="Deepgram" subtitle="Speech-to-text (your mic)" status={deepgram} onChange={refreshAll} />
        <ProviderCard provider="elevenlabs" title="ElevenLabs" subtitle="Text-to-speech (her voice)" status={elevenlabs} onChange={refreshAll}>
          {elevenlabs && (
            <div className="mt-2 border-t border-white/5 pt-2 text-[11px]">
              {exhausted ? (
                <div className="font-medium text-rose-300/90">Active key is out of credits — switch keys or top up.</div>
              ) : credits ? (
                <div className="text-white/50">{credits.remaining.toLocaleString()} of {credits.limit.toLocaleString()} credits left</div>
              ) : (
                <div className="text-white/35">credits unknown</div>
              )}
              <div className="mt-1 flex items-center gap-2 text-white/45">
                <span>{loadingVoices ? "loading voices…" : `${voices.length} voice${voices.length === 1 ? "" : "s"} on active key`}</span>
                <button onClick={() => activeId && void loadVoices(activeId, true)} className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/60 transition hover:bg-white/10">
                  Refresh
                </button>
              </div>
            </div>
          )}
        </ProviderCard>
      </div>
    </section>
  );
}

function ProviderCard({
  provider,
  title,
  subtitle,
  status,
  onChange,
  children,
}: {
  provider: Provider;
  title: string;
  subtitle: string;
  status: ProviderStatus;
  onChange: () => Promise<void> | void;
  children?: ReactNode;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const post = async (payload: object) => {
    const r = await fetch("/api/voice/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return r;
  };

  const save = async () => {
    if (!key.trim()) return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      const r = await post({ provider, key: key.trim(), name: name.trim() });
      const j = (await r.json().catch(() => ({}))) as { error?: string; verified?: boolean };
      if (!r.ok) {
        setError(j.error || `Couldn't save (${r.status}).`);
        return;
      }
      setKey("");
      setName("");
      setAdding(false);
      setNote(j.verified ? "Saved & verified." : "Saved (couldn't verify — will try when used).");
      resetVoiceAvailability();
      await onChange();
    } catch (e) {
      setError(String(e).slice(0, 140));
    } finally {
      setBusy(false);
    }
  };

  const activate = async (id: string) => {
    setBusy(true);
    try {
      await post({ provider, activateId: id });
      resetVoiceAvailability();
      await onChange();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await fetch(`/api/voice/keys?provider=${provider}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
      resetVoiceAvailability();
      await onChange();
    } finally {
      setBusy(false);
    }
  };

  const envOnly = status?.envOnly;

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-white/85">{title}</div>
          <div className="text-[11px] text-white/40">{subtitle}</div>
        </div>
        {status && <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/40">{envOnly ? ".env" : `${status.keys.length} key${status.keys.length === 1 ? "" : "s"}`}</span>}
      </div>

      {/* stored keys */}
      {status && (
        <div className="mt-2 space-y-1">
          {status.keys.map((k) => {
            const active = k.id === status.activeId;
            return (
              <div key={k.id} className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 ${active ? "bg-cyan-400/10 ring-1 ring-cyan-300/25" : "bg-black/30"}`}>
                {!envOnly && (
                  <button
                    onClick={() => !active && void activate(k.id)}
                    disabled={busy || active}
                    title={active ? "Active key" : "Use this key"}
                    className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border transition ${active ? "border-cyan-300 bg-cyan-300/30" : "border-white/25 hover:border-cyan-300/60"}`}
                  >
                    {active && <span className="h-1.5 w-1.5 rounded-full bg-cyan-200" />}
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] text-white/80">{k.name}</span>
                    {active && !envOnly && <span className="shrink-0 rounded bg-cyan-400/20 px-1 text-[9px] uppercase tracking-wide text-cyan-100/80">active</span>}
                  </div>
                  <div className="font-mono text-[11px] text-white/40">{k.masked}</div>
                </div>
                {!envOnly && (
                  <button onClick={() => void remove(k.id)} disabled={busy} title="Remove key" className="shrink-0 rounded px-1.5 text-white/35 transition hover:text-rose-300">
                    ×
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* add form */}
      {adding ? (
        <div className="mt-2 space-y-1.5">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`Name (e.g. "${title} – personal")`}
            className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-white/85 outline-none focus:border-cyan-300/40"
          />
          <input
            value={key}
            onChange={(e) => setKey(e.target.value)}
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste API key"
            className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-[12px] text-white/85 outline-none focus:border-cyan-300/40"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={save}
              disabled={busy || !key.trim()}
              className="rounded-md border border-cyan-300/30 bg-cyan-400/20 px-3 py-1.5 text-[12px] text-cyan-50 transition hover:bg-cyan-400/30 disabled:opacity-40"
            >
              {busy ? "Saving…" : "Save key"}
            </button>
            <button onClick={() => { setAdding(false); setKey(""); setName(""); setError(""); }} className="text-[11px] text-white/45 hover:text-white/70">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)} className="mt-2 rounded-md border border-dashed border-white/15 px-2.5 py-1.5 text-[12px] text-white/60 transition hover:bg-white/5">
          + Add{status ? " another" : ""} key
        </button>
      )}

      {error && <div className="mt-1.5 text-[11px] text-rose-300/80">{error}</div>}
      {note && !error && <div className="mt-1.5 text-[11px] text-emerald-300/70">{note}</div>}
      {children}
    </div>
  );
}
