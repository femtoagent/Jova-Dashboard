"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useSettingsStore } from "@/lib/settings/useSettingsStore";
import { ROLE_LABEL, ADDABLE_ROLES } from "@/lib/settings/options";
import { ConfirmRemoveDialog } from "./ConfirmRemoveDialog";

const inputCls = "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/40";

/**
 * Team identity editor. With teamId === null it is in CREATE mode — nothing is added to the network
 * until the user hits "Create team". With a teamId it edits the existing team + its roster.
 */
export function TeamEditor() {
  const teamId = useSettingsStore((s) => s.teamId);
  const creating = teamId === null;
  const team = useNetworkStore((s) => (teamId ? s.teams.find((t) => t.id === teamId) ?? null : null));
  const createTeam = useNetworkStore((s) => s.createTeam);
  const updateTeam = useNetworkStore((s) => s.updateTeam);
  const addAgent = useNetworkStore((s) => s.addAgent);
  const removeAgent = useNetworkStore((s) => s.removeAgent);
  const showTeams = useSettingsStore((s) => s.showTeams);
  const showTeam = useSettingsStore((s) => s.showTeam);
  const showAgent = useSettingsStore((s) => s.showAgent);

  const [name, setName] = useState("");
  const [mission, setMission] = useState("");
  const [solvingFor, setSolvingFor] = useState("");
  const [saved, setSaved] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (team) {
      setName(team.name);
      setMission(team.mission ?? "");
      setSolvingFor(team.solvingFor ?? "");
    } else {
      setName("");
      setMission("");
      setSolvingFor("");
    }
    setSaved(false); // don't let a prior team's "Saved" badge leak across a switch
    submittedRef.current = false;
    // re-sync when switching teams or entering create mode
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team?.id, creating]);

  if (!creating && !team) {
    return (
      <div>
        <button onClick={showTeams} className="mb-3 text-[12px] text-white/50 transition hover:text-white/80">
          ‹ Teams
        </button>
        <p className="text-sm text-white/50">Team not found.</p>
      </div>
    );
  }

  const color = team?.color ?? "#67e8f9";
  const dirty =
    creating ||
    (!!team && (name !== team.name || mission !== (team.mission ?? "") || solvingFor !== (team.solvingFor ?? "")));

  const save = () => {
    if (creating) {
      if (submittedRef.current) return; // guard against a double-click creating two teams
      submittedRef.current = true;
      const id = createTeam({ name: name.trim() || undefined, mission, solvingFor });
      showTeam(id); // switch into edit mode on the freshly-created team (with its PM + Dev)
      return;
    }
    if (!team) return;
    const finalName = name.trim() || team.name;
    updateTeam(team.id, { name: finalName, mission, solvingFor });
    setName(finalName);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const removingAgent = team?.agents.find((a) => a.id === removing) ?? null;

  return (
    <div>
      <button onClick={showTeams} className="mb-3 text-[12px] text-white/50 transition hover:text-white/80">
        ‹ Teams
      </button>
      <div className="mb-4 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
        <h2 className="text-lg font-semibold" style={{ color }}>
          {creating ? "New team" : team!.name}
        </h2>
      </div>

      <div className="mb-6 grid gap-3">
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            placeholder={creating ? "Defaults to a generated name if left blank" : undefined}
          />
        </Field>
        <Field label="Team mission">
          <textarea value={mission} onChange={(e) => setMission(e.target.value)} rows={2} className={inputCls} placeholder="Why this team exists." />
        </Field>
        <Field label="What they're solving for">
          <textarea value={solvingFor} onChange={(e) => setSolvingFor(e.target.value)} rows={2} className={inputCls} placeholder="The problem they own." />
        </Field>
        <div className="flex items-center gap-2">
          <button
            onClick={save}
            disabled={!dirty}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              dirty ? "border-cyan-300/30 bg-cyan-400/20 text-cyan-50 hover:bg-cyan-400/30" : "cursor-default border-white/10 bg-white/5 text-white/30"
            }`}
          >
            {creating ? "Create team" : "Save"}
          </button>
          {saved && <span className="text-[12px] text-emerald-300/80">Saved</span>}
        </div>
      </div>

      {creating ? (
        <>
          <Section label="Agents" />
          <p className="text-[12px] leading-relaxed text-white/45">
            A <b className="text-white/70">Product Manager</b> and a <b className="text-white/70">Developer</b> are added automatically when you
            create the team. You can edit them and add more afterward.
          </p>
        </>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white/80">Agents</h3>
            <div className="relative">
              <button
                onClick={() => setAddOpen((v) => !v)}
                className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[12px] text-white/70 transition hover:bg-white/10"
              >
                + Add agent
              </button>
              {addOpen && (
                <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-white/10 bg-black/80 p-1 backdrop-blur-xl">
                  {ADDABLE_ROLES.map((r) => (
                    <button
                      key={r.role}
                      onClick={() => {
                        const id = addAgent(team!.id, r.role, r.label);
                        setAddOpen(false);
                        if (id) showAgent(team!.id, id);
                      }}
                      className="block w-full rounded px-2 py-1.5 text-left text-[12px] text-white/75 transition hover:bg-white/10"
                    >
                      + {r.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <ul className="space-y-1">
            {team!.agents.map((a) => (
              <li key={a.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white/85">{a.label}</span>
                  <span className="block text-[11px] text-white/40">
                    {ROLE_LABEL[a.role]}
                    {a.role === "pm" ? " · lead" : ""}
                  </span>
                </span>
                <button
                  onClick={() => showAgent(team!.id, a.id)}
                  className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[12px] text-white/70 transition hover:bg-white/10"
                >
                  Edit
                </button>
                {a.role !== "pm" && (
                  <button
                    onClick={() => setRemoving(a.id)}
                    className="shrink-0 rounded-lg px-2 py-1 text-[12px] text-rose-300/60 transition hover:bg-white/10 hover:text-rose-300"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {removingAgent && team && (
        <ConfirmRemoveDialog
          kind="agent"
          name={removingAgent.label}
          impact={
            <>
              <p>Closes any open chat threads with {removingAgent.label}.</p>
              <p>Re-packs the team&rsquo;s ring in the scene.</p>
              <p>This can&rsquo;t be undone.</p>
            </>
          }
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            removeAgent(team.id, removingAgent.id);
            setRemoving(null);
          }}
        />
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

function Section({ label }: { label: string }) {
  return <div className="mb-1 text-[10px] uppercase tracking-wider text-white/35">{label}</div>;
}
