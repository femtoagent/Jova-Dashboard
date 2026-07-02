"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useSettingsStore } from "@/lib/settings/useSettingsStore";
import { CLIENTS, ROLE_LABEL, roleHasSkills } from "@/lib/settings/options";
import type { AgentClient } from "@/lib/network/types";
import { ROOM_CHARACTERS, DEFAULT_CHARACTER_BY_ROLE } from "@/lib/agents/roomCharacters";
import { AgentActor } from "@/components/shell/AgentActor";
import { SoulComposer } from "./SoulComposer";
import { MemoryWeb } from "./MemoryWeb";
import { PresetPicker } from "./PresetPicker";
import { AccessSection } from "./AccessSection";

const inputCls = "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/40";

const SECTION_TITLE = {
  identity: "Identity",
  tools: "Tools",
  skills: "Skills",
  memory: "Memory",
  access: "Access",
} as const;

/**
 * Agent editor. The active section is driven by the agent sidebar (useSettingsStore.agentSection):
 * Identity / Tools / Skills / Memory / Access. Identity/Tools/Skills are a shared draft saved by the
 * footer; Memory is read-only; Access self-manages (add/remove) via the store.
 */
export function AgentEditor() {
  const teamId = useSettingsStore((s) => s.teamId);
  const agentId = useSettingsStore((s) => s.agentId);
  const section = useSettingsStore((s) => s.agentSection);
  const showTeam = useSettingsStore((s) => s.showTeam);
  const team = useNetworkStore((s) => s.teams.find((t) => t.id === teamId) ?? null);
  const updateAgent = useNetworkStore((s) => s.updateAgent);
  const agent = team?.agents.find((a) => a.id === agentId) ?? null;

  const [label, setLabel] = useState("");
  const [client, setClient] = useState<AgentClient>("letta");
  const [preset, setPreset] = useState("");
  const [soul, setSoul] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [character, setCharacter] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (agent) {
      setLabel(agent.label);
      setClient(agent.client ?? "letta");
      setPreset(agent.openRouterPreset ?? "");
      setSoul(agent.soul ?? "");
      setTools(agent.tools ?? []);
      setSkills(agent.skills ?? []);
      setCharacter(agent.character ?? DEFAULT_CHARACTER_BY_ROLE[agent.role]);
    }
    setSaved(false); // don't let a prior agent's "Saved" badge leak across a switch
    // re-sync only when switching to a different agent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id]);

  if (!team || !agent) {
    return (
      <div>
        <button onClick={() => (team ? showTeam(team.id) : undefined)} className="mb-3 text-[12px] text-white/50 transition hover:text-white/80">
          ‹ Back
        </button>
        <p className="text-sm text-white/50">Agent not found.</p>
      </div>
    );
  }

  const dirty =
    label !== agent.label ||
    client !== (agent.client ?? "letta") ||
    preset !== (agent.openRouterPreset ?? "") ||
    soul !== (agent.soul ?? "") ||
    JSON.stringify(tools) !== JSON.stringify(agent.tools ?? []) ||
    JSON.stringify(skills) !== JSON.stringify(agent.skills ?? []) ||
    character !== (agent.character ?? DEFAULT_CHARACTER_BY_ROLE[agent.role]);

  const save = () => {
    const finalLabel = label.trim() || agent.label;
    updateAgent(team.id, agent.id, { label: finalLabel, client, openRouterPreset: preset, soul, tools, skills, character });
    setLabel(finalLabel);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const showSave = section === "identity" || section === "tools" || (section === "skills" && roleHasSkills(agent.role));

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-semibold" style={{ color: team.color }}>
          {SECTION_TITLE[section]}
        </h2>
        <p className="text-[12px] text-white/40">
          {agent.label} - {ROLE_LABEL[agent.role]}
        </p>
      </div>

      {section === "identity" && (
        <div className="grid gap-4">
          <Field label="Name">
            <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Team Room character">
            <div data-character-picker className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
              {ROOM_CHARACTERS.map((c) => {
                const active = character === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCharacter(c.id)}
                    title={`${c.name} — ${c.desc}`}
                    className={`flex flex-col items-center gap-0.5 rounded-lg border p-1.5 transition ${
                      active ? "border-cyan-300/50 bg-cyan-400/15" : "border-white/10 bg-white/[0.03] hover:bg-white/10"
                    }`}
                  >
                    <AgentActor character={c} active={active} width={34} />
                    <span className={`text-[10px] ${active ? "text-cyan-50" : "text-white/60"}`}>{c.name}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1 text-[11px] text-white/35">Who sits at this agent&rsquo;s desk in the team&rsquo;s office.</p>
          </Field>
          <Field label="Role">
            <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/55">
              {ROLE_LABEL[agent.role]}
              {agent.role === "pm" ? " · lead (cannot change)" : ""}
            </div>
          </Field>
          <Field label="Client">
            <select value={client} onChange={(e) => setClient(e.target.value as AgentClient)} className={inputCls}>
              {CLIENTS.map((c) => (
                <option key={c.value} value={c.value} className="bg-[#0a0f14]">
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="OpenRouter preset">
            <PresetPicker value={preset} onChange={setPreset} />
          </Field>
          <Field label="Soul">
            <SoulComposer key={agent.id} value={soul} onChange={setSoul} role={agent.role} name={label || agent.label} />
          </Field>
        </div>
      )}

      {section === "tools" && (
        <Field label="Tools">
          <ChipEditor items={tools} onChange={setTools} placeholder="add a tool…" />
        </Field>
      )}

      {section === "skills" &&
        (roleHasSkills(agent.role) ? (
          <Field label="Skills">
            <ChipEditor items={skills} onChange={setSkills} placeholder="add a skill…" />
          </Field>
        ) : (
          <p className="text-[12px] text-white/40">Skills don&rsquo;t apply to this role.</p>
        ))}

      {section === "memory" && <MemoryWeb memory={agent.memory ?? []} />}

      {section === "access" && <AccessSection teamId={team.id} agent={agent} />}

      {showSave && (
        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={save}
            disabled={!dirty}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              dirty ? "border-cyan-300/30 bg-cyan-400/20 text-cyan-50 hover:bg-cyan-400/30" : "cursor-default border-white/10 bg-white/5 text-white/30"
            }`}
          >
            Save
          </button>
          {saved ? (
            <span className="text-[12px] text-emerald-300/80">Saved</span>
          ) : (
            dirty && <span className="text-[12px] text-amber-300/70">Unsaved changes</span>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">{label}</span>
      {children}
    </label>
  );
}

function ChipEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setDraft("");
  };
  return (
    <div className="rounded-lg border border-white/15 bg-white/5 p-2">
      <div className="mb-1.5 flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span key={it} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[12px] text-white/80">
            {it}
            <button onClick={() => onChange(items.filter((x) => x !== it))} className="text-white/40 transition hover:text-rose-300">
              ×
            </button>
          </span>
        ))}
        {items.length === 0 && <span className="text-[12px] text-white/30">none</span>}
      </div>
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        placeholder={placeholder}
        className="w-full bg-transparent px-1 text-[13px] text-white outline-none placeholder:text-white/30"
      />
    </div>
  );
}
