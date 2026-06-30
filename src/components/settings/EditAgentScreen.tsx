"use client";

import { useEffect, useState } from "react";
import { useSettingsStore } from "@/lib/settings/useSettingsStore";
import { getAgent, updateAgent, setAgentPreset, deleteAgent, type AgentDetail } from "@/lib/jova/agents";
import { appendVersion, getVersions, seedIfEmpty, setCurrentVersion, type KindHistory } from "@/lib/jova/agentVersions";
import { characterByName, isProtectedAgent, isSystemAgent, JOVA_AGENT_NAME } from "@/lib/agents/characters";
import { frameworkLabel } from "@/lib/agents/frameworks";
import { DEFAULT_MEMORY } from "@/lib/agents/memory";
import { useAgentVoices } from "@/lib/settings/useAgentVoices";
import { VersionedComposer } from "./VersionedComposer";
import { Field, MemoryPicker, PresetSelect, TeamPicker, Section, AgentGlyph, SpecField } from "./agentForm";
import { AgentVoiceScreen, VoiceSummaryButton } from "./AgentVoiceScreen";
import { ScrollMore, useScrollMore } from "./ScrollMore";

const EMPTY: KindHistory = { current: "", versions: [] };

/** Edit an existing agent — identity (name/role/team), versioned persona/human, routing preset, voice,
 *  and delete. The rail stays. A mismatch banner warns when the live block differs from the last saved
 *  version (edited out-of-band). */
export function EditAgentScreen() {
  const id = useSettingsStore((s) => s.focusAgentId);
  const showAgents = useSettingsStore((s) => s.showAgents);

  const [detail, setDetail] = useState<AgentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [team, setTeam] = useState("");
  const [memory, setMemory] = useState(DEFAULT_MEMORY);
  const [preset, setPreset] = useState("");
  const [origPreset, setOrigPreset] = useState("");
  const [persona, setPersona] = useState("");
  const [human, setHuman] = useState("");
  const [personaHist, setPersonaHist] = useState<KindHistory>(EMPTY);
  const [humanHist, setHumanHist] = useState<KindHistory>(EMPTY);
  const [dismissed, setDismissed] = useState({ persona: false, human: false });
  // per-block unlock for core/protected agents — their blocks render read-only until unlocked here.
  const [unlocked, setUnlocked] = useState({ persona: false, human: false });
  // the stored "current" captured at load (and re-aligned on save). The mismatch banner compares THIS to
  // the live block — so an out-of-band edit shows, but generating/editing locally (which bumps the history
  // current) does NOT spuriously trip it.
  const [baseline, setBaseline] = useState({ persona: "", human: "" });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  // voice — opens the dedicated voice screen (AgentCard + browser) as a takeover; the roster entry is
  // materialized below so the editor + summary have data to bind to.
  const ensureAgent = useAgentVoices((s) => s.ensureAgent);
  const removeVoice = useAgentVoices((s) => s.removeAgent);
  const [voiceOpen, setVoiceOpen] = useState(false);
  const { scrollRef, more } = useScrollMore();

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setErr(null);
    Promise.all([getAgent(id), getVersions(id)])
      .then(async ([d, h]) => {
        if (!alive) return;
        // Seed version 1 from the live block when there's no history yet, so the version dropdown is always
        // populated (older agents predating the version store, or ones saved without a Nexus generation).
        // seedIfEmpty is atomic + authoritative server-side: it only seeds a genuinely-empty store (under a
        // lock, so no double-seed) and otherwise returns the REAL history — so a transient getVersions miss
        // can't clobber a real `current` or hide an out-of-band mismatch.
        let ph = h.persona;
        let hh = h.human;
        if (d.persona.trim()) {
          const s = await seedIfEmpty(d.id, "persona", d.persona);
          if (s) ph = s;
        }
        if (d.human.trim()) {
          const s = await seedIfEmpty(d.id, "human", d.human);
          if (s) hh = s;
        }
        if (!alive) return;
        setDetail(d);
        setName(d.name);
        setRole(d.role);
        setTeam(d.team);
        setMemory(d.memory);
        setPreset(d.preset);
        setOrigPreset(d.preset);
        setPersona(d.persona);
        setHuman(d.human);
        setPersonaHist(ph);
        setHumanHist(hh);
        setBaseline({ persona: ph.current, human: hh.current });
        setDismissed({ persona: false, human: false });
        setUnlocked({ persona: false, human: false });
        // materialize a voice-roster entry only for ordinary agents — NOT Jova (her built-in "jova" entry is
        // the real one) or system agents (no voice), else we'd create a duplicate/leaked voice card.
        if (!isSystemAgent(d.name) && d.name.toLowerCase() !== JOVA_AGENT_NAME) {
          ensureAgent(d.id, characterByName(d.name)?.display ?? d.name, characterByName(d.name)?.voice);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (alive) {
          setErr(String(e));
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [id, ensureAgent]);

  if (!id) return <NotFound onBack={showAgents} />;

  // Jova's voice lives on the built-in "jova" roster entry (not her Letta uuid); everyone else binds to
  // their own id. The voice editor is a full-area takeover so this Edit form keeps its in-progress state.
  const voiceKey = detail?.name.toLowerCase() === JOVA_AGENT_NAME ? "jova" : id;
  if (voiceOpen && detail) return <AgentVoiceScreen voiceKey={voiceKey} onBack={() => setVoiceOpen(false)} />;

  // a core/protected block is read-only RIGHT NOW unless the user has unlocked it; gates editing, generation,
  // saving, and the mismatch "Use live / Keep saved" actions.
  const personaRO = !!detail && detail.personaProtected && !unlocked.persona;
  const humanRO = !!detail && detail.humanProtected && !unlocked.human;

  const personaMismatch = !!detail && !dismissed.persona && !!baseline.persona && baseline.persona !== detail.persona;
  const humanMismatch = !!detail && !dismissed.human && !!baseline.human && baseline.human !== detail.human;

  const useLive = (kind: "persona" | "human") => {
    if (!detail) return;
    const live = kind === "persona" ? detail.persona : detail.human;
    if (kind === "persona") setPersona(live);
    else setHuman(live);
    setBaseline((b) => ({ ...b, [kind]: live }));
    void setCurrentVersion(id, kind, live).then((h) => h && (kind === "persona" ? setPersonaHist(h) : setHumanHist(h)));
    setDismissed((d) => ({ ...d, [kind]: true }));
  };
  const keepSaved = (kind: "persona" | "human") => {
    const cur = kind === "persona" ? baseline.persona : baseline.human;
    if (kind === "persona") setPersona(cur);
    else setHuman(cur);
    setDismissed((d) => ({ ...d, [kind]: true }));
  };

  const save = async () => {
    if (!detail) return;
    setSaving(true);
    setSaved(false);
    setErr(null);
    try {
      // never write a block that's read-only right now (core agent whose block isn't unlocked)
      await updateAgent({
        agentId: id,
        name: name.trim() || detail.name,
        role,
        team,
        memory,
        persona: personaRO ? undefined : persona,
        human: humanRO ? undefined : human,
      });
      if (preset !== origPreset) {
        await setAgentPreset(id, preset);
        setOrigPreset(preset);
      }
      // re-read the canonical live values, then align the stored "current" + the editor + the baseline to
      // them, so nothing drifts (no spurious mismatch on the next load, no "Keep saved" reverting the edit).
      const fresh = await getAgent(id);
      // Capture each block we wrote as a NEW version — a manual save IS a version, so you can get back to it
      // later. Skip the append only when the text is unchanged from the latest stored version (no dup on a
      // no-op save, or a save right after a Nexus generation already created the version). Always realign the
      // editor to the live value so a re-locked block with pending edits visibly reverts instead of leaving
      // stale text under a misleading "Saved".
      if (!personaRO) {
        const changed = fresh.persona.trim() !== (personaHist.versions[0]?.text?.trim() ?? "");
        const ph = changed
          ? await appendVersion(id, "persona", fresh.persona, { source: "manual" })
          : await setCurrentVersion(id, "persona", fresh.persona);
        if (ph) setPersonaHist(ph);
      }
      setPersona(fresh.persona);
      if (!humanRO) {
        const changed = fresh.human.trim() !== (humanHist.versions[0]?.text?.trim() ?? "");
        const hh = changed
          ? await appendVersion(id, "human", fresh.human, { source: "manual" })
          : await setCurrentVersion(id, "human", fresh.human);
        if (hh) setHumanHist(hh);
      }
      setHuman(fresh.human);
      setDetail(fresh);
      setBaseline({ persona: fresh.persona, human: fresh.human });
      setDismissed({ persona: false, human: false });
      setSaved(true);
      setTimeout(() => setSaved(false), 1600);
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!detail) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteAgent(id, detail.name);
      removeVoice(id);
      showAgents();
    } catch (e) {
      setErr(String(e));
      setBusy(false);
      setConfirming(false);
    }
  };

  const protectedAgent = isProtectedAgent(detail?.name);

  return (
    <div className="flex h-full flex-col">
      {loading ? (
        <>
          <button onClick={showAgents} className="shrink-0 self-start rounded px-1 text-[12px] text-white/50 transition hover:text-white/80">
            ‹ Agents
          </button>
          <p className="mt-4 text-sm text-white/40">Loading agent…</p>
        </>
      ) : !detail ? (
        <NotFound onBack={showAgents} err={err} />
      ) : (
        <>
          {/* identity header — the agent's face: accent-lit glyph + its name & role as a title block */}
          <div className="max-w-3xl shrink-0 pr-10">
            <button onClick={showAgents} className="rounded px-1 text-[12px] text-white/50 transition hover:text-white/80">
              ‹ Agents
            </button>
            <div className="mt-2 flex items-start gap-3.5">
              <AgentGlyph name={name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    aria-label="Agent name"
                    className="min-w-0 flex-1 border-b border-transparent bg-transparent text-xl font-semibold outline-none transition focus:border-white/15"
                    style={{ color: characterByName(name)?.color ?? "#67e8f9" }}
                  />
                  {protectedAgent && (
                    <span className="shrink-0 rounded bg-white/8 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/40">core</span>
                  )}
                </div>
                <input
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="Role — e.g. nekomimi"
                  aria-label="Agent role"
                  className="mt-1 w-full bg-transparent text-[13px] text-white/60 outline-none placeholder:text-white/25"
                />
                <div className="mt-2.5 flex flex-wrap items-end gap-3">
                  <SpecField label="Framework">
                    <div
                      className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/55"
                      title="Set at creation — can’t be changed"
                    >
                      {frameworkLabel(detail.framework)}
                    </div>
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
                      {detail.personaProtected && (
                        <LockToggle locked={personaRO} onToggle={() => setUnlocked((u) => ({ ...u, persona: !u.persona }))} />
                      )}
                      {personaMismatch && (
                        <MismatchBanner kind="persona" disabled={personaRO} onUseLive={() => useLive("persona")} onKeepSaved={() => keepSaved("persona")} />
                      )}
                      <VersionedComposer
                        kind="persona"
                        value={persona}
                        onChange={setPersona}
                        role={role}
                        team={team}
                        name={name}
                        agentKey={id}
                        history={personaHist}
                        onHistoryChange={setPersonaHist}
                        readOnly={personaRO}
                      />
                    </Field>
                    <Field label="Human" hint="Who they’re speaking with, and the setting.">
                      {detail.humanProtected && (
                        <LockToggle locked={humanRO} onToggle={() => setUnlocked((u) => ({ ...u, human: !u.human }))} />
                      )}
                      {humanMismatch && (
                        <MismatchBanner kind="human" disabled={humanRO} onUseLive={() => useLive("human")} onKeepSaved={() => keepSaved("human")} />
                      )}
                      <VersionedComposer
                        kind="human"
                        value={human}
                        onChange={setHuman}
                        role={role}
                        team={team}
                        name={name}
                        agentKey={id}
                        history={humanHist}
                        onHistoryChange={setHumanHist}
                        showJovaHumanInsert={!humanRO}
                        readOnly={humanRO}
                      />
                    </Field>
                  </div>
                </Section>

                <Section label="Voice & routing">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Voice">
                      {isSystemAgent(detail.name) ? (
                        <p className="text-[11px] text-white/40">This agent has no voice.</p>
                      ) : (
                        <VoiceSummaryButton voiceKey={voiceKey} onOpen={() => setVoiceOpen(true)} />
                      )}
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

          {/* action bar — always visible */}
          {err && <p className="max-w-3xl shrink-0 pt-2 text-[12px] text-rose-300/80">{err}</p>}
          <div className="mt-3 flex max-w-3xl shrink-0 items-center gap-2 border-t border-white/10 pt-3">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-lg border border-cyan-300/30 bg-cyan-400/20 px-4 py-2 text-[13px] text-cyan-50 transition hover:bg-cyan-400/30 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            {saved && <span className="text-[12px] text-emerald-300/80">Saved</span>}

            {!protectedAgent && (
              <div className="ml-auto">
                {confirming ? (
                  <span className="flex items-center gap-1.5">
                    <button
                      onClick={doDelete}
                      disabled={busy}
                      className="rounded-md border border-rose-400/40 bg-rose-500/20 px-2.5 py-1.5 text-[12px] text-rose-100 transition hover:bg-rose-500/30 disabled:opacity-40"
                    >
                      {busy ? "Deleting…" : "Confirm delete"}
                    </button>
                    <button onClick={() => setConfirming(false)} disabled={busy} className="rounded-md px-2 py-1.5 text-[12px] text-white/50 hover:text-white/80">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirming(true)}
                    className="rounded-md px-2.5 py-1.5 text-[12px] text-white/40 transition hover:bg-rose-500/10 hover:text-rose-300"
                  >
                    Delete agent
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Lock state for a core-agent block: read-only by default, with a toggle to edit it deliberately. */
function LockToggle({ locked, onToggle }: { locked: boolean; onToggle: () => void }) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-[11px]">
      <span className={locked ? "text-amber-200/70" : "text-emerald-200/75"}>
        {locked ? "🔒 Read-only — core-agent block." : "🔓 Editable — changes will be saved."}
      </span>
      <button onClick={onToggle} className="ml-auto rounded border border-white/15 px-2 py-0.5 text-white/75 transition hover:bg-white/10">
        {locked ? "Unlock to edit" : "Re-lock"}
      </button>
    </div>
  );
}

function MismatchBanner({ kind, onUseLive, onKeepSaved, disabled }: { kind: string; onUseLive: () => void; onKeepSaved: () => void; disabled?: boolean }) {
  return (
    <div className="mb-2 rounded-lg border border-amber-300/25 bg-amber-300/5 px-3 py-2 text-[11px] text-amber-200/85">
      The live {kind} differs from your last saved version — it may have been edited outside this screen.
      <div className="mt-1.5 flex items-center gap-2">
        <button
          onClick={onUseLive}
          disabled={disabled}
          className="rounded border border-white/15 px-2 py-0.5 text-white/75 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Use live
        </button>
        <button
          onClick={onKeepSaved}
          disabled={disabled}
          className="rounded border border-white/15 px-2 py-0.5 text-white/75 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Keep saved
        </button>
        {disabled && <span className="text-[10px] text-amber-200/55">Unlock the block to resolve.</span>}
      </div>
    </div>
  );
}

function NotFound({ onBack, err }: { onBack: () => void; err?: string | null }) {
  return (
    <div>
      <button onClick={onBack} className="mb-3 text-[12px] text-white/50 transition hover:text-white/80">
        ‹ Agents
      </button>
      {/* a failed load (backend down / token) carries an actionable message — show it instead of implying
          the agent was deleted. Only a clean "no such agent" falls back to "Agent not found." */}
      {err ? (
        <p className="rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-[12px] text-amber-200/80">{err}</p>
      ) : (
        <p className="text-sm text-white/50">Agent not found.</p>
      )}
    </div>
  );
}
