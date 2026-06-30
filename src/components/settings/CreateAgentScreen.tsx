"use client";

import { useEffect, useRef, useState } from "react";
import { useSettingsStore } from "@/lib/settings/useSettingsStore";
import { createAgent } from "@/lib/jova/agents";
import { claimDraft, setCurrentVersion, type KindHistory } from "@/lib/jova/agentVersions";
import { useAgentVoices } from "@/lib/settings/useAgentVoices";
import { DEFAULT_FRAMEWORK } from "@/lib/agents/frameworks";
import { DEFAULT_MEMORY } from "@/lib/agents/memory";
import { VersionedComposer } from "./VersionedComposer";
import { Field, FrameworkPicker, MemoryPicker, PresetSelect, TeamPicker, Section, AgentGlyph, SpecField } from "./agentForm";
import { AgentVoiceScreen, VoiceSummaryButton } from "./AgentVoiceScreen";
import { ScrollMore, useScrollMore } from "./ScrollMore";

const EMPTY: KindHistory = { current: "", versions: [] };

/** Create a new agent — its own screen (the settings rail stays). Identity + Nexus-authored persona/human
 *  (versioned) + routing preset + optional voice. Versions are stored under a draft id until the agent
 *  exists, then migrated onto its real id. */
export function CreateAgentScreen() {
  const showAgents = useSettingsStore((s) => s.showAgents);
  const showAgentEdit = useSettingsStore((s) => s.showAgentEdit);

  // a stable draft key for the version store until the agent is created
  const [draftId] = useState(() => `draft-${crypto.randomUUID()}`);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [team, setTeam] = useState("");
  const [framework, setFramework] = useState(DEFAULT_FRAMEWORK);
  const [memory, setMemory] = useState(DEFAULT_MEMORY);
  const [preset, setPreset] = useState("");
  const [persona, setPersona] = useState("");
  const [human, setHuman] = useState("");
  const [personaHist, setPersonaHist] = useState<KindHistory>(EMPTY);
  const [humanHist, setHumanHist] = useState<KindHistory>(EMPTY);

  // voice — edited on the dedicated voice screen, bound to the draft id and migrated onto the real agent
  // on create. A roster entry under the draft key gives the editor + summary something to bind to.
  const ensureAgent = useAgentVoices((s) => s.ensureAgent);
  const claimVoiceDraft = useAgentVoices((s) => s.claimDraft);
  const removeVoiceDraft = useAgentVoices((s) => s.removeAgent);

  const [voiceOpen, setVoiceOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { scrollRef, more } = useScrollMore();

  // Drop an unclaimed draft voice entry when leaving Create without submitting — reliable cleanup that
  // doesn't depend on the (backend-gated) pruneStale, so an abandoned draft never lingers/leaks.
  const claimed = useRef(false);
  useEffect(() => () => { if (!claimed.current) removeVoiceDraft(draftId); }, [draftId, removeVoiceDraft]);

  const openVoice = () => {
    ensureAgent(draftId, name.trim() || "New agent"); // keep the entry's name in sync with the form
    setVoiceOpen(true);
  };

  const submit = async () => {
    if (!name.trim() || !persona.trim()) {
      setErr("Name and persona are required.");
      return;
    }
    setCreating(true);
    setErr(null);
    try {
      const agent = await createAgent({ name: name.trim(), role: role.trim(), team, framework, memory, persona, human: human.trim() || undefined, preset: preset || undefined });
      await claimDraft(draftId, agent.id); // migrate the draft version history onto the real id
      // align the stored "current" with exactly what we wrote to the live blocks, so opening Edit on the
      // brand-new agent doesn't show a spurious mismatch (the draft `current` may be trimmed/older)
      await setCurrentVersion(agent.id, "persona", persona);
      if (human.trim()) await setCurrentVersion(agent.id, "human", human);
      claimVoiceDraft(draftId, agent.id, agent.name); // migrate any voice set on the draft (no-op if none)
      claimed.current = true; // draft is now the real agent — don't let the unmount cleanup delete it
      showAgentEdit(agent.id); // land on the new agent's Edit screen
    } catch (e) {
      setErr(String(e));
    } finally {
      setCreating(false);
    }
  };

  // the voice editor takes over the whole screen — this component stays mounted, so the form below keeps
  // its in-progress state (name, persona drafts…) while the user picks a voice.
  if (voiceOpen) return <AgentVoiceScreen voiceKey={draftId} onBack={() => setVoiceOpen(false)} />;

  return (
    <div className="flex h-full flex-col">
      {/* identity header — the agent's face takes shape as you name + role it */}
      <div className="max-w-3xl shrink-0 pr-10">
        <button onClick={showAgents} className="rounded px-1 text-[12px] text-white/50 transition hover:text-white/80">
          ‹ Agents
        </button>
        <div className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-200/55">New agent</div>
        <div className="mt-2 flex items-start gap-3.5">
          <AgentGlyph name={name} />
          <div className="min-w-0 flex-1">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name your agent"
              aria-label="Agent name"
              className="w-full border-b border-transparent bg-transparent text-xl font-semibold text-cyan-100 outline-none transition placeholder:font-normal placeholder:text-white/25 focus:border-white/15"
            />
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="Role — e.g. nekomimi"
              aria-label="Agent role"
              className="mt-1 w-full bg-transparent text-[13px] text-white/60 outline-none placeholder:text-white/25"
            />
            <div className="mt-2.5 flex flex-wrap items-end gap-3">
              <SpecField label="Framework">
                <FrameworkPicker value={framework} onChange={setFramework} />
              </SpecField>
              <SpecField label="Team">
                <TeamPicker value={team} onChange={setTeam} />
              </SpecField>
              <SpecField label="Memory">
                <MemoryPicker value={memory} onChange={setMemory} />
              </SpecField>
            </div>
          </div>
        </div>
      </div>

      {/* body — scrolls between the pinned header and action bar */}
      <div className="relative mt-4 min-h-0 flex-1">
        <div ref={scrollRef} className="no-scrollbar h-full overflow-y-auto pr-1">
          <div className="grid max-w-3xl gap-6">
            <Section label="Soul">
              <div className="grid gap-4">
                <Field label="Persona" hint="Core identity and voice — how they think and speak.">
                  <VersionedComposer
                    kind="persona"
                    value={persona}
                    onChange={setPersona}
                    role={role}
                    team={team}
                    name={name}
                    agentKey={draftId}
                    history={personaHist}
                    onHistoryChange={setPersonaHist}
                  />
                </Field>
                <Field label="Human" hint="Who they’re speaking with, and the setting. Optional.">
                  <VersionedComposer
                    kind="human"
                    value={human}
                    onChange={setHuman}
                    role={role}
                    team={team}
                    name={name}
                    agentKey={draftId}
                    history={humanHist}
                    onHistoryChange={setHumanHist}
                    showJovaHumanInsert
                  />
                </Field>
              </div>
            </Section>

            <Section label="Voice & routing">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Voice" hint="Assign an ElevenLabs voice on its own screen.">
                  <VoiceSummaryButton voiceKey={draftId} onOpen={openVoice} />
                </Field>
                <Field label="Routing" hint="Which OpenRouter preset the brain uses.">
                  <PresetSelect value={preset} onChange={setPreset} />
                </Field>
              </div>
            </Section>
          </div>
        </div>
        <ScrollMore show={more} />
      </div>

      {/* action bar — always visible, never buried under the soul blocks */}
      {err && <p className="max-w-3xl shrink-0 pt-2 text-[12px] text-rose-300/80">{err}</p>}
      <div className="mt-3 flex max-w-3xl shrink-0 items-center gap-2 border-t border-white/10 pt-3">
        <button
          onClick={submit}
          disabled={creating}
          className="rounded-lg border border-cyan-300/30 bg-cyan-400/20 px-4 py-2 text-[13px] text-cyan-50 transition hover:bg-cyan-400/30 disabled:opacity-40"
        >
          {creating ? "Creating…" : "Create agent"}
        </button>
        <button onClick={showAgents} disabled={creating} className="rounded-lg px-3 py-2 text-[13px] text-white/55 transition hover:text-white/85">
          Cancel
        </button>
        <span className="ml-auto text-[11px] text-white/35">Clones the default brain config.</span>
      </div>
    </div>
  );
}
