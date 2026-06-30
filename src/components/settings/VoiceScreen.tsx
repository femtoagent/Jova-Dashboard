"use client";

import { useEffect, useRef, useState } from "react";
import { useVoicePrefs, keyLabel, type TriggerMode, type FeedbackMode } from "@/lib/settings/useVoicePrefs";
import { useVoiceStatus } from "@/lib/settings/useVoiceStatus";
import { setOutputDevice } from "@/lib/audio/tts";
import { listAudioDevices, ensureDeviceLabels, canRouteOutput, type AudioDevice } from "@/lib/audio/devices";
import { VoiceKeysPanel } from "./VoiceKeysPanel";
import { AgentVoicesPanel } from "./AgentVoicesPanel";

const TRIGGERS: { key: TriggerMode; label: string; desc: string; hint: string }[] = [
  { key: "orb", label: "Floating voice orb", desc: "A small mic button, always visible. Click to toggle hands-free listening.", hint: "🎙 bottom-left" },
  { key: "always", label: "Always listening", desc: "Continuous capture with a mic-reactive indicator — just talk. Keeps the mic hot.", hint: "◍ she's hearing you" },
  { key: "ptt", label: "Keyboard push-to-talk", desc: "Hold a key anywhere on the page to talk, release to send.", hint: "hold a key" },
];

const FEEDBACKS: { key: FeedbackMode; label: string; desc: string }[] = [
  { key: "captions", label: "Floating captions", desc: "Your words + her reply drift over the scene, then fade." },
  { key: "wisp", label: "Just the wisp", desc: "Pure presence — she only animates and speaks, no text." },
  { key: "hud", label: "Minimal status HUD", desc: "A tiny line near her: listening / thinking / speaking." },
];

type TabKey = "interaction" | "keys" | "voices";
const TABS: { key: TabKey; label: string }[] = [
  { key: "interaction", label: "Interaction" },
  { key: "keys", label: "API keys" },
  { key: "voices", label: "Voices" },
];

/** Voice interaction settings — how you talk to Jova (chat closed), what you see, and devices. */
export function VoiceScreen() {
  const triggerMode = useVoicePrefs((s) => s.triggerMode);
  const feedbackMode = useVoicePrefs((s) => s.feedbackMode);
  const pttKey = useVoicePrefs((s) => s.pttKey);
  const inputDeviceId = useVoicePrefs((s) => s.inputDeviceId);
  const outputDeviceId = useVoicePrefs((s) => s.outputDeviceId);
  const setTriggerMode = useVoicePrefs((s) => s.setTriggerMode);
  const setFeedbackMode = useVoicePrefs((s) => s.setFeedbackMode);
  const setPttKey = useVoicePrefs((s) => s.setPttKey);
  const setInputDevice = useVoicePrefs((s) => s.setInputDevice);
  const setOutputDeviceId = useVoicePrefs((s) => s.setOutputDevice);
  const hydrate = useVoicePrefs((s) => s.hydrate);

  const refreshVoiceStatus = useVoiceStatus((s) => s.refreshAll);

  const [tab, setTab] = useState<TabKey>("interaction");
  const [devices, setDevices] = useState<{ inputs: AudioDevice[]; outputs: AudioDevice[] }>({ inputs: [], outputs: [] });
  const [capturing, setCapturing] = useState(false);
  const outputSupported = canRouteOutput();

  useEffect(() => {
    hydrate();
    void refreshVoiceStatus(); // pull current key status + voice catalog when the screen opens
  }, [hydrate, refreshVoiceStatus]);

  // populate device lists (asking for mic permission first so the labels aren't blank). Only when the
  // Interaction tab is showing, so opening straight to Keys/Voices doesn't trigger a mic prompt.
  useEffect(() => {
    if (tab !== "interaction") return;
    let alive = true;
    const refresh = async () => {
      await ensureDeviceLabels();
      const d = await listAudioDevices();
      if (alive) setDevices(d);
    };
    void refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      alive = false;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
    };
  }, [tab]);

  // capture the next keypress as the push-to-talk key
  const capRef = useRef(false);
  capRef.current = capturing;
  useEffect(() => {
    if (!capturing) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.code !== "Escape") setPttKey(e.code);
      setCapturing(false);
    };
    window.addEventListener("keydown", onKey, { once: true });
    return () => window.removeEventListener("keydown", onKey);
  }, [capturing, setPttKey]);

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#7ad7ff", boxShadow: "0 0 8px #7ad7ff" }} />
          <h2 className="text-lg font-semibold text-cyan-100">Voice</h2>
        </div>
        <p className="text-[12px] text-white/40">Talk to Jova without opening the chat. She speaks back; the other agents stay text-only.</p>
      </div>

      {/* sub-nav */}
      <div className="mb-5 flex gap-1 border-b border-white/10">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] transition ${
              tab === t.key ? "border-cyan-300/70 text-cyan-100" : "border-transparent text-white/50 hover:text-white/80"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "keys" && <VoiceKeysPanel />}
      {tab === "voices" && <AgentVoicesPanel />}

      {tab === "interaction" && (
        <>
      {/* How you talk */}
      <section className="mb-6">
        <h3 className="mb-2 text-sm font-semibold text-white/85">How you start talking</h3>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {TRIGGERS.map((t) => {
            const active = triggerMode === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTriggerMode(t.key)}
                className={`rounded-lg border p-2.5 text-left transition ${
                  active ? "border-cyan-300/40 bg-cyan-400/15" : "border-white/10 bg-white/[0.03] hover:bg-white/10"
                }`}
              >
                <div className={`text-sm font-medium ${active ? "text-cyan-50" : "text-white/85"}`}>{t.label}</div>
                <div className="text-[11px] text-white/45">{t.desc}</div>
                <div className="mt-1 font-mono text-[10px] text-cyan-200/40">{t.hint}</div>
              </button>
            );
          })}
        </div>
        {triggerMode === "ptt" && (
          <div className="mt-2 flex items-center gap-2 text-[12px] text-white/60">
            <span>Push-to-talk key:</span>
            <button
              onClick={() => setCapturing(true)}
              className={`rounded-md border px-2.5 py-1 font-mono text-[12px] transition ${
                capturing ? "border-cyan-300/50 bg-cyan-400/20 text-cyan-50" : "border-white/15 bg-white/5 text-white/80 hover:bg-white/10"
              }`}
            >
              {capturing ? "Press a key…" : keyLabel(pttKey)}
            </button>
            {capturing && <span className="text-[11px] text-white/35">Esc to cancel</span>}
          </div>
        )}
        {triggerMode === "always" && (
          <p className="mt-2 text-[11px] text-amber-200/60">Heads up: always-listening keeps your mic open while this app is in front. Pause it from the indicator any time.</p>
        )}
      </section>

      {/* What you see */}
      <section className="mb-6">
        <h3 className="mb-2 text-sm font-semibold text-white/85">What you see while talking</h3>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {FEEDBACKS.map((f) => {
            const active = feedbackMode === f.key;
            // The HUD duplicates the always-on control's own status line, so it's unavailable there.
            const disabled = f.key === "hud" && triggerMode === "always";
            return (
              <button
                key={f.key}
                disabled={disabled}
                onClick={() => setFeedbackMode(f.key)}
                className={`rounded-lg border p-2.5 text-left transition ${
                  disabled
                    ? "cursor-not-allowed border-white/5 bg-white/[0.02] opacity-40"
                    : active
                      ? "border-cyan-300/40 bg-cyan-400/15"
                      : "border-white/10 bg-white/[0.03] hover:bg-white/10"
                }`}
              >
                <div className={`text-sm font-medium ${active && !disabled ? "text-cyan-50" : "text-white/85"}`}>{f.label}</div>
                <div className="text-[11px] text-white/45">{disabled ? "Unavailable with Always listening — its indicator already shows status." : f.desc}</div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Devices */}
      <section>
        <h3 className="mb-2 text-sm font-semibold text-white/85">Devices</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">Microphone</span>
            <DeviceSelect value={inputDeviceId} onChange={setInputDevice} options={devices.inputs} fallback="Default microphone" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">Output</span>
            <DeviceSelect
              value={outputDeviceId}
              onChange={(id) => {
                setOutputDeviceId(id);
                setOutputDevice(id); // apply live
              }}
              options={devices.outputs}
              fallback="Default output"
              disabled={!outputSupported}
            />
            {!outputSupported && <span className="mt-1 block text-[10px] text-white/35">Output routing isn&apos;t supported in this browser; uses the system default.</span>}
          </label>
        </div>
        <p className="mt-2 text-[11px] text-white/35">Mic labels appear after you grant microphone permission once.</p>
      </section>
        </>
      )}
    </div>
  );
}

function DeviceSelect({
  value,
  onChange,
  options,
  fallback,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  options: AudioDevice[];
  fallback: string;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-white/10 bg-white/5 px-2.5 py-2 text-[13px] text-white/85 outline-none transition focus:border-cyan-300/40 disabled:opacity-40"
    >
      <option value="" className="bg-[#0a0f14]">{fallback}</option>
      {options.map((d) => (
        <option key={d.deviceId} value={d.deviceId} className="bg-[#0a0f14]">
          {d.label}
        </option>
      ))}
    </select>
  );
}
