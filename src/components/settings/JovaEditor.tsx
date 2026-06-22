"use client";

import { useJovaStore, type JovaStyle } from "@/lib/state/useJovaStore";

/** The hero forms Jova can take on the "just Jova" screen. Picking one here sets the saved preference. */
const STYLES: { key: JovaStyle; label: string; desc: string }[] = [
  { key: "mycelium", label: "Mycelium", desc: "Branching neural network that grows and fires" },
  { key: "glyph", label: "Glyph", desc: "Concentric alien glyph rings — a mothership UI" },
  { key: "medusa", label: "Medusa", desc: "Bioluminescent jellyfish: bell + drifting tendrils" },
  { key: "cocoon", label: "Cocoon", desc: "Organic egg, veined shell around a stirring core" },
  { key: "resonance", label: "Resonance", desc: "Sonar voice-orb: radial spikes + sonar rings" },
  { key: "mothership", label: "Mothership", desc: "Layered rotating craft with running lights" },
  { key: "corona", label: "Corona", desc: "A living star throwing long coronal ejections" },
  { key: "plasma", label: "Plasma", desc: "Writhing electric filaments — the protomolecule" },
  { key: "singularity", label: "Singularity", desc: "Accretion disk spiraling into a bright core" },
];

/** Jova's appearance preference — pick which hero form she takes on the "just Jova" screen. */
export function JovaEditor() {
  const jovaStyle = useJovaStore((s) => s.jovaStyle);
  const setJovaStyle = useJovaStore((s) => s.setJovaStyle);

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#7ad7ff", boxShadow: "0 0 8px #7ad7ff" }} />
          <h2 className="text-lg font-semibold text-cyan-100">Jova</h2>
        </div>
        <p className="text-[12px] text-white/40">Her form on the &ldquo;just Jova&rdquo; screen — saved as your preference.</p>
      </div>

      <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">Style</div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {STYLES.map((s) => {
          const active = jovaStyle === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setJovaStyle(s.key)}
              className={`rounded-lg border p-2.5 text-left transition ${
                active ? "border-cyan-300/40 bg-cyan-400/15" : "border-white/10 bg-white/[0.03] hover:bg-white/10"
              }`}
            >
              <div className={`text-sm font-medium ${active ? "text-cyan-50" : "text-white/85"}`}>{s.label}</div>
              <div className="text-[11px] text-white/45">{s.desc}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
