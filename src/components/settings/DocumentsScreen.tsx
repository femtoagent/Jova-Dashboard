"use client";

import { useEffect, useState } from "react";
import { listAgents, setAgentPreset, type AgentInfo } from "@/lib/jova/agents";
import { listPresets, type PresetSummary } from "@/lib/jova/openrouter";

const selectCls =
  "rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/40";

/**
 * Documents — pick the OpenRouter preset each agent's brain routes through. The choice is persisted
 * to Letta as the agent's model handle (`openai-proxy/<slug>`), which the proxy maps to `@preset/<slug>`.
 * Image and file turns still auto-route to the vision/file presets at the proxy regardless of this.
 * Presets come live from OpenRouter (/api/openrouter/presets); new presets appear on next open.
 */
export function DocumentsScreen() {
  const [agents, setAgents] = useState<AgentInfo[] | null>(null);
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listAgents(), listPresets()])
      .then(([a, p]) => {
        if (alive) {
          setAgents(a);
          setPresets(p);
        }
      })
      .catch((e) => {
        if (alive) {
          setErr(String(e));
          setAgents([]);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const change = async (agent: AgentInfo, preset: string) => {
    setSavingId(agent.id);
    setSavedId(null);
    setErr(null);
    setAgents((prev) => prev?.map((a) => (a.id === agent.id ? { ...a, preset } : a)) ?? prev); // optimistic
    try {
      const updated = await setAgentPreset(agent.id, preset);
      setAgents((prev) => prev?.map((a) => (a.id === agent.id ? updated : a)) ?? prev);
      setSavedId(agent.id);
      setTimeout(() => setSavedId((id) => (id === agent.id ? null : id)), 1500);
    } catch (e) {
      setErr(String(e));
      setAgents((prev) => prev?.map((a) => (a.id === agent.id ? agent : a)) ?? prev); // revert
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-cyan-100">Documents</h2>
        <p className="text-[12px] text-white/40">
          The OpenRouter preset each agent&rsquo;s brain routes through. Image and file turns still auto-route to the
          vision / file presets.
        </p>
      </div>

      {err && (
        <p className="mb-3 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-[12px] text-amber-200/80">
          {err}
        </p>
      )}

      {agents === null && !err && <p className="text-sm text-white/40">Loading agents…</p>}
      {agents && agents.length === 0 && !err && <p className="text-sm text-white/40">No agents found.</p>}

      <div className="grid gap-2">
        {agents?.map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
          >
            <div className="min-w-0">
              <div className="truncate text-sm text-white/90">{a.name || a.id}</div>
              <div className="text-[11px] text-white/35">
                {a.preset ? `preset: ${a.preset}` : "default · jova-conversation"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {savingId === a.id && <span className="text-[11px] text-white/40">saving…</span>}
              {savedId === a.id && <span className="text-[11px] text-emerald-300/80">saved</span>}
              <select
                value={a.preset}
                disabled={savingId === a.id}
                onChange={(e) => change(a, e.target.value)}
                className={selectCls}
              >
                <option value="" className="bg-[#0a0f14]">
                  Default · jova-conversation
                </option>
                {presets.map((p) => (
                  <option key={p.slug} value={p.slug} className="bg-[#0a0f14]">
                    {p.name}
                    {p.slug !== p.name ? ` (${p.slug})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
