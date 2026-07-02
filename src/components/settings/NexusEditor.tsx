"use client";

import { useJovaStore, type NexusStyle } from "@/lib/state/useJovaStore";
import { NEXUS_CHAT_TARGET } from "@/lib/jova/types";

const SKINS: { key: NexusStyle; label: string; desc: string }[] = [
  { key: "brain", label: "Brain", desc: "Glowing core in nested wireframe shells" },
  { key: "neuron", label: "Neuron", desc: "Core wrapped in a node cluster + dendrites" },
  { key: "rings", label: "Rings", desc: "A neon gyroscope of three spinning tori" },
  { key: "galaxy", label: "Galaxy", desc: "A tilted spiral-arm particle disc" },
  { key: "vortex", label: "Vortex", desc: "Counter-rotating woven torus-knots" },
];

/** Notes that the procedural skins render in the 3D scene only. */
function NexusSkinHint() {
  const viewMode = useJovaStore((s) => s.viewMode);
  if (viewMode === "3d") return null;
  return (
    <p className="mb-1.5 text-[11px] text-white/35">
      These skins render in the 3D scene — switch the view (Settings → Jova) to see them.
    </p>
  );
}

/** Nexus's edit panel — pick her skin (and talk to her). */
export function NexusEditor() {
  const nexusStyle = useJovaStore((s) => s.nexusStyle);
  const setNexusStyle = useJovaStore((s) => s.setNexusStyle);
  const openChatWith = useJovaStore((s) => s.openChatWith);

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#9fe8ff", boxShadow: "0 0 8px #9fe8ff" }} />
          <h2 className="text-lg font-semibold text-cyan-100">Nexus</h2>
        </div>
        <p className="text-[12px] text-white/40">The orchestrator</p>
      </div>

      <button
        onClick={() => openChatWith(NEXUS_CHAT_TARGET)}
        className="mb-5 rounded-lg border border-cyan-300/30 bg-cyan-400/20 px-3 py-1.5 text-sm text-cyan-50 transition hover:bg-cyan-400/30"
      >
        💬 Talk to Nexus
      </button>

      <div className="mb-1 text-[10px] uppercase tracking-wider text-white/40">Skin · 3D view</div>
      <NexusSkinHint />
      <div className="grid gap-1.5 sm:grid-cols-2">
        {SKINS.map((s) => {
          const active = nexusStyle === s.key;
          return (
            <button
              key={s.key}
              onClick={() => setNexusStyle(s.key)}
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
