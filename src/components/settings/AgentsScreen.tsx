"use client";

import { useEffect, useMemo, useState } from "react";
import { listAgents, type AgentInfo } from "@/lib/jova/agents";
import { useAgentVoices, type AgentVoice } from "@/lib/settings/useAgentVoices";
import { useVoiceStatus } from "@/lib/settings/useVoiceStatus";
import { useSettingsStore } from "@/lib/settings/useSettingsStore";
import { useIsHidden } from "@/lib/agents/useSecretAgents";
import { characterByName, isProtectedAgent } from "@/lib/agents/characters";

function glyph(name: string): string {
  const meta = characterByName(name);
  return meta?.emoji ?? (name.trim()[0] ?? "?").toUpperCase();
}
function accentFor(name: string): string {
  return characterByName(name)?.color ?? "#67e8f9";
}

type View = "compact" | "detailed";

/**
 * Agents — browse + manage the real Letta agents. The list is read-only here (compact / detailed views,
 * team filter, name/role/team search); creating and editing (preset, voice, persona/human, delete) happen
 * in their own screens. Secret characters stay hidden until unlocked this session.
 */
export function AgentsScreen() {
  const [agents, setAgents] = useState<AgentInfo[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<View>("compact");
  const [teamFilter, setTeamFilter] = useState(""); // "" all · "__none__" no team · else team name
  const [query, setQuery] = useState("");

  const hidden = useIsHidden();
  const pruneStale = useAgentVoices((s) => s.pruneStale);
  const roster = useAgentVoices((s) => s.roster);
  const refreshVoiceStatus = useVoiceStatus((s) => s.refreshAll);
  const showAgentCreate = useSettingsStore((s) => s.showAgentCreate);
  const showAgentEdit = useSettingsStore((s) => s.showAgentEdit);

  useEffect(() => {
    void refreshVoiceStatus(); // load key status + the active key's voice catalog (for the detailed view)
  }, [refreshVoiceStatus]);

  useEffect(() => {
    let alive = true;
    listAgents()
      .then((a) => {
        if (!alive) return;
        setAgents(a);
        pruneStale(a.map((x) => x.id));
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
  }, [pruneStale]);

  const visible = useMemo(() => (agents ?? []).filter((a) => !hidden(a.name)), [agents, hidden]);
  const teams = useMemo(() => Array.from(new Set(visible.map((a) => a.team).filter(Boolean))).sort(), [visible]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return visible.filter((a) => {
      if (teamFilter === "__none__" && a.team) return false;
      if (teamFilter && teamFilter !== "__none__" && a.team !== teamFilter) return false;
      if (!q) return true;
      return `${a.name} ${characterByName(a.name)?.display ?? ""} ${a.role} ${a.team}`.toLowerCase().includes(q);
    });
  }, [visible, teamFilter, query]);

  return (
    <div>
      <div className="mb-3 pr-10">
        <h2 className="text-lg font-semibold text-cyan-100">Agents</h2>
        <p className="text-[12px] text-white/40">Browse your agents. Open one to edit its identity, persona, routing, and voice.</p>
      </div>

      {/* controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={showAgentCreate}
          className="rounded-lg border border-cyan-300/30 bg-cyan-400/15 px-3 py-1.5 text-[13px] text-cyan-50 transition hover:bg-cyan-400/25"
        >
          + Create agent
        </button>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, role, team…"
          className="min-w-[150px] flex-1 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] text-white outline-none focus:border-cyan-300/40"
        />

        <select
          value={teamFilter}
          onChange={(e) => setTeamFilter(e.target.value)}
          className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-cyan-300/40"
        >
          <option value="" className="bg-[#0a0f14]">All teams</option>
          <option value="__none__" className="bg-[#0a0f14]">No team</option>
          {teams.map((t) => (
            <option key={t} value={t} className="bg-[#0a0f14]">
              {t}
            </option>
          ))}
        </select>

        <div className="flex overflow-hidden rounded-lg border border-white/10">
          {(["compact", "detailed"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2.5 py-1.5 text-[12px] capitalize transition ${view === v ? "bg-cyan-400/20 text-cyan-50" : "text-white/55 hover:bg-white/10"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {err && <p className="mb-3 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-[12px] text-amber-200/80">{err}</p>}
      {agents === null && !err && <p className="text-sm text-white/40">Loading agents…</p>}
      {agents !== null && filtered.length === 0 && !err && (
        <p className="text-sm text-white/40">{visible.length === 0 ? "No agents found." : "No agents match."}</p>
      )}

      <div className="grid gap-2">
        {filtered.map((a) => (
          <AgentRow key={a.id} agent={a} view={view} voice={roster.find((r) => r.id === a.id)} onEdit={() => showAgentEdit(a.id)} />
        ))}
      </div>
    </div>
  );
}

function AgentRow({ agent, view, voice, onEdit }: { agent: AgentInfo; view: View; voice?: AgentVoice; onEdit: () => void }) {
  const meta = characterByName(agent.name);
  const accent = accentFor(agent.name);
  const display = meta?.display ?? agent.name;
  const role = agent.role || meta?.label || "";
  const protectedAgent = isProtectedAgent(agent.name);

  // resolve the assigned voice's display name from the catalog of its key (or the active key)
  const elevenlabs = useVoiceStatus((s) => s.elevenlabs);
  const loadVoices = useVoiceStatus((s) => s.loadVoices);
  const activeId = elevenlabs?.activeId ?? "";
  const effKey = voice?.keyId && elevenlabs?.keys.some((k) => k.id === voice.keyId) ? voice.keyId : activeId;
  const voiceList = useVoiceStatus((s) => (effKey ? s.voicesByKey[effKey] : undefined)) ?? [];
  useEffect(() => {
    if (effKey) void loadVoices(effKey); // lazily load this agent's key catalog (no-op if cached/active)
  }, [effKey, loadVoices]);
  const voiceName = voice?.voiceId ? voiceList.find((v) => v.voiceId === voice.voiceId)?.name ?? "saved voice" : "account default";
  const voiceLabel = voice?.enabled ? `🔊 ${voiceName}` : voice?.voiceId ? `🔈 ${voiceName} · muted` : "🔇 no voice";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
      <div
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-semibold"
        style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}55` }}
      >
        {glyph(agent.name)}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-white/90">{display}</span>
          {agent.team && (
            <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/55">{agent.team}</span>
          )}
          {protectedAgent && <span className="shrink-0 rounded bg-white/8 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/40">core</span>}
        </div>
        {role && <div className="truncate text-[11px] text-white/40">{role}</div>}

        {view === "detailed" && (
          <>
            {agent.personaSnippet && <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/45">{agent.personaSnippet}</div>}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-white/40">
              <span className="rounded bg-white/8 px-1.5 py-0.5">{agent.preset || "default · jova-conversation"}</span>
              <span>{voiceLabel}</span>
            </div>
          </>
        )}
      </div>

      <button
        onClick={onEdit}
        className="shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-[12px] text-white/80 transition hover:bg-white/10"
      >
        Edit
      </button>
    </div>
  );
}
