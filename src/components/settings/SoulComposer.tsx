"use client";

import { useEffect, useRef, useState } from "react";
import { streamSoul } from "@/lib/jova/client";
import type { AgentRole } from "@/lib/network/types";

/** Soul editor with a "Have Nexus write it" button that streams generated prose into the textarea. */
export function SoulComposer({
  value,
  onChange,
  role,
  name,
}: {
  value: string;
  onChange: (v: string) => void;
  role: AgentRole;
  name: string;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const ctrlRef = useRef<AbortController | null>(null);

  // abort any in-flight generation if the editor unmounts (e.g. switching agents / closing settings)
  useEffect(() => () => ctrlRef.current?.abort(), []);

  const generate = async () => {
    if (busy) return;
    setError(false);
    setBusy(true);
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    let acc = "";
    onChange(""); // clear, then stream fresh
    try {
      await streamSoul({
        prompt: prompt.trim(),
        role,
        name,
        signal: ctrl.signal,
        onEvent: (e) => {
          if (ctrl.signal.aborted) return;
          if (e.type === "token") {
            acc += e.text;
            onChange(acc);
          } else if (e.type === "error") {
            setError(true);
          }
        },
      });
    } catch {
      if (!ctrl.signal.aborted) setError(true);
    } finally {
      if (ctrlRef.current === ctrl) ctrlRef.current = null;
      if (!ctrl.signal.aborted) setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-2 flex gap-2">
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void generate();
            }
          }}
          placeholder="Tell Nexus what this agent should be…"
          className="min-w-0 flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/40"
        />
        <button
          onClick={() => void generate()}
          disabled={busy}
          className={`shrink-0 rounded-lg border px-3 py-2 text-sm transition ${
            busy
              ? "cursor-wait border-white/10 bg-white/5 text-white/40"
              : "border-cyan-300/30 bg-cyan-400/20 text-cyan-50 hover:bg-cyan-400/30"
          }`}
        >
          {busy ? "Nexus is writing…" : "Have Nexus write it"}
        </button>
      </div>
      {error && <p className="mb-1.5 text-[11px] text-rose-300/80">Nexus couldn&rsquo;t write that — try again.</p>}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        placeholder="The agent's soul — its persona, voice, and what it cares about."
        className="w-full resize-y rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[13px] leading-relaxed text-white outline-none focus:border-cyan-300/40"
      />
    </div>
  );
}
