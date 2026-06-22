"use client";

import { useEffect, useState } from "react";
import { useJovaStore, type JovaStyle } from "@/lib/state/useJovaStore";
import { setSpeaking } from "@/lib/audio/amplitude";

const JOVA_VIEWS: { key: JovaStyle; label: string }[] = [
  { key: "mycelium", label: "Mycelium" },
  { key: "glyph", label: "Glyph" },
  { key: "medusa", label: "Medusa" },
  { key: "cocoon", label: "Cocoon" },
  { key: "resonance", label: "Resonance" },
  { key: "mothership", label: "Mothership" },
  { key: "corona", label: "Corona" },
  { key: "plasma", label: "Plasma" },
  { key: "singularity", label: "Singularity" },
];

/**
 * Demo-only panel: trigger a "speaking" pulse and exercise the affect hook (valence/arousal) that
 * drives Jova's look. Remove (or gate behind a debug flag) once we're past the demo.
 */
export function DemoControls() {
  const wispState = useJovaStore((s) => s.wispState);
  const mood = useJovaStore((s) => s.mood);
  const setWispState = useJovaStore((s) => s.setWispState);
  const mergeMood = useJovaStore((s) => s.mergeMood);
  const nexusActive = useJovaStore((s) => s.nexusActive);
  const setNexusActive = useJovaStore((s) => s.setNexusActive);
  const soundOn = useJovaStore((s) => s.soundOn);
  const setSoundOn = useJovaStore((s) => s.setSoundOn);
  const fullMode = useJovaStore((s) => s.fullMode);
  const jovaStyle = useJovaStore((s) => s.jovaStyle);
  const setJovaStyle = useJovaStore((s) => s.setJovaStyle);
  const [open, setOpen] = useState(true);

  // this is a dev panel — fold it away by default on phones so it doesn't cover the scene
  useEffect(() => {
    if (window.matchMedia("(max-width: 640px)").matches) setOpen(false);
  }, []);

  const speakTest = () => {
    setWispState("speaking");
    setSpeaking(true);
    setTimeout(() => {
      setSpeaking(false);
      useJovaStore.getState().setWispState("present");
    }, 3500);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed left-4 top-4 z-10 rounded-xl border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] text-white/70 backdrop-blur-md transition hover:bg-white/10"
      >
        ⚙ Demo
      </button>
    );
  }

  return (
    <div className="fixed left-4 top-4 z-10 w-56 max-w-[calc(100vw-2rem)] rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-white/80 backdrop-blur-md">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-white/90">Demo controls</span>
        <div className="flex items-center gap-1.5">
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-200/80">
            {wispState}
          </span>
          <button
            onClick={() => setOpen(false)}
            title="Collapse"
            className="rounded px-1 text-white/40 transition hover:bg-white/10 hover:text-white/70"
          >
            ▾
          </button>
        </div>
      </div>

      <button
        onClick={speakTest}
        className="mb-2 w-full rounded-md border border-amber-300/30 bg-amber-400/20 px-2 py-1 text-[11px] text-amber-50 transition hover:bg-amber-400/30"
      >
        Speak
      </button>

      {/* Jova's hero forms — only the "just Jova" screen renders the big stage */}
      {!fullMode && (
        <div className="mb-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">Jova view</div>
          <div className="grid grid-cols-2 gap-1">
            {JOVA_VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => setJovaStyle(v.key)}
                title={v.key}
                className={`truncate rounded-md border px-1 py-1 text-[10px] transition ${
                  jovaStyle === v.key
                    ? "border-cyan-300/40 bg-cyan-400/25 text-cyan-50"
                    : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Nexus + Sound only do something once the full network is loaded */}
      {fullMode && (
        <>
          <button
            onClick={() => setNexusActive(!nexusActive)}
            className={`mb-2 w-full rounded-md border px-2 py-1 text-[11px] transition ${
              nexusActive
                ? "border-cyan-300/40 bg-cyan-400/30 text-cyan-50"
                : "border-cyan-300/20 bg-cyan-400/10 text-cyan-100/80 hover:bg-cyan-400/20"
            }`}
          >
            {nexusActive ? "Nexus: Active ●" : "Nexus: Idle ○"}
          </button>

          <button
            onClick={() => setSoundOn(!soundOn)}
            className={`mb-3 w-full rounded-md border px-2 py-1 text-[11px] transition ${
              soundOn
                ? "border-emerald-300/40 bg-emerald-400/25 text-emerald-50"
                : "border-white/15 bg-white/5 text-white/70 hover:bg-white/10"
            }`}
          >
            {soundOn ? "Sound: On 🔊" : "Sound: Off 🔇"}
          </button>

        </>
      )}

      <Slider label="Valence" value={mood.valence} min={-1} max={1} onChange={(v) => mergeMood({ valence: v })} />
      <Slider label="Arousal" value={mood.arousal} min={0} max={1} onChange={(v) => mergeMood({ arousal: v })} />
      <p className="mt-2 text-[10px] leading-snug text-white/35">
        Affect hook — the future mood engine drives her colour/intensity/motion through these.
      </p>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mb-1.5 block">
      <span className="mb-0.5 flex justify-between text-white/50">
        <span>{label}</span>
        <span>{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-amber-400"
      />
    </label>
  );
}
