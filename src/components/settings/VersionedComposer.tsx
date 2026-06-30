"use client";

import { useEffect, useRef, useState } from "react";
import { streamSoul } from "@/lib/jova/client";
import { getAgent, listAgents } from "@/lib/jova/agents";
import { appendVersion, selectVersion, type KindHistory, type VersionEntry, type VersionKind, type VersionSource } from "@/lib/jova/agentVersions";

function relTime(ts: number): string {
  const m = Math.floor(Math.max(0, Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/**
 * Persona/Human composer. The textarea IS the prompt: pressing "Generate" reads the field — any text
 * wrapped in `{{ double braces }}` is treated as rewrite guidelines (applied to the rest of the field);
 * with no `{{ }}` it generates FRESH (via Nexus) from the Name + Role (+ Team). Voice cues live in
 * `[square brackets]` (eleven_v3 audio tags) and are deliberately left untouched — that's why the
 * guideline delimiter is `{{ }}`, not `[ ]`. Each generation is saved as a version (≤5), browsable via
 * the history dropdown / arrows. `readOnly` still shows the block AND its version history (browse-only —
 * moving through versions just previews them, it doesn't persist), but blocks editing + generation. A core
 * agent's block is read-only until unlocked in the Edit screen.
 */
export function VersionedComposer({
  kind,
  value,
  onChange,
  role,
  team,
  name,
  agentKey,
  history,
  onHistoryChange,
  showJovaHumanInsert,
  readOnly,
}: {
  kind: VersionKind;
  value: string;
  onChange: (v: string) => void;
  role?: string;
  team?: string;
  name: string;
  agentKey: string;
  history: KindHistory;
  onHistoryChange: (h: KindHistory) => void;
  showJovaHumanInsert?: boolean;
  readOnly?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [idx, setIdx] = useState(0);
  // while read-only, browsing the history previews into THIS local state — it never touches the parent's
  // savable value, so unlocking + saving can't silently persist a version you were only previewing.
  const [preview, setPreview] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => () => ctrlRef.current?.abort(), []);
  // drop any locked-browse preview the moment the block becomes editable (textarea returns to the live value)
  useEffect(() => {
    if (!readOnly) setPreview(null);
  }, [readOnly]);

  const versions = history.versions;
  const total = versions.length;

  const generate = async () => {
    if (busy || readOnly) return;
    setError("");

    // The field is the prompt. {{ braced }} text = rewrite guidelines applied to the rest; no {{ }} =
    // generate fresh from Name + Role (+ Team). We use {{ }} (not [ ]) so [voice cues] in the draft are
    // preserved, not eaten as instructions.
    const raw = value;
    const instructions = [...raw.matchAll(/\{\{([\s\S]*?)\}\}/g)].map((m) => m[1].trim()).filter(Boolean);
    const draft = raw.replace(/\{\{[\s\S]*?\}\}/g, "").trim();
    let genPrompt: string;
    if (instructions.length) {
      genPrompt = draft
        ? `Here is the current ${kind} draft:\n\n${draft}\n\nRewrite or extend it, following these guidelines: ${instructions.join("; ")}`
        : `Write the ${kind}, following these guidelines: ${instructions.join("; ")}`;
    } else if (draft.includes("{{")) {
      // a "{{" with no closing "}}" survives the strip above — likely a mistyped rewrite guide; don't
      // silently fresh-gen over the draft. (An empty/closed "{{}}" is stripped, so it falls through to fresh.)
      setError("Looks like an unclosed {{ — close it with }} to steer a rewrite of what's below, or remove it to generate fresh.");
      return;
    } else {
      if (!name.trim() || !role?.trim()) {
        setError("Add a Name and Role to generate fresh — or wrap {{ guidelines }} to steer a rewrite.");
        return;
      }
      genPrompt = ""; // fresh: the route composes from name + role + team
    }

    setBusy(true);
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    const prev = value;
    let acc = "";
    let failed = false;
    try {
      // Snapshot the current draft as a version BEFORE generation overwrites the box, so a fresh take (or a
      // guided rewrite) is always recoverable from the history dropdown — never a silent, unrecoverable loss.
      const existing = prev.trim();
      if (existing && versions[0]?.text?.trim() !== existing) {
        const snap = await appendVersion(agentKey, kind, prev, { source: "manual" });
        if (snap) onHistoryChange(snap);
      }
      await streamSoul({
        prompt: genPrompt,
        role,
        team,
        name,
        kind,
        signal: ctrl.signal,
        onEvent: (e) => {
          if (ctrl.signal.aborted) return;
          if (e.type === "token") {
            acc += e.text;
            onChange(acc);
          } else if (e.type === "error") {
            failed = true;
            setError(e.message || "Nexus couldn't write that.");
          }
        },
      });
      if (failed) {
        onChange(prev); // error mid-stream → don't persist a partial; restore the draft
        return;
      }
      const text = acc.trim();
      if (text) {
        const h = await appendVersion(agentKey, kind, text, { prompt: genPrompt || `fresh: ${name} · ${role ?? ""}`, source: "nexus" });
        if (h) {
          onHistoryChange(h);
          setIdx(0);
        }
      } else {
        onChange(prev);
      }
    } catch {
      if (!ctrl.signal.aborted) {
        setError("Nexus couldn't write that — try again.");
        if (!acc) onChange(prev);
      }
    } finally {
      if (ctrlRef.current === ctrl) ctrlRef.current = null;
      if (!ctrl.signal.aborted) setBusy(false);
    }
  };

  const show = async (next: number) => {
    const v = versions[next];
    if (!v) return;
    setIdx(next);
    if (readOnly) {
      setPreview(v.text); // browse-only: preview locally, leave the parent value + stored "current" untouched
      return;
    }
    onChange(v.text);
    const h = await selectVersion(agentKey, kind, v.id);
    if (h) onHistoryChange(h);
  };

  const insertJovaHuman = async () => {
    if (readOnly) return;
    setError("");
    try {
      const jova = (await listAgents()).find((a) => a.name.toLowerCase() === "jova");
      if (!jova) return setError("Couldn't find Jova.");
      const detail = await getAgent(jova.id);
      const text = detail.human?.trim();
      if (!text) return setError("Jova has no human block to copy.");
      onChange(text);
      const h = await appendVersion(agentKey, kind, text, { source: "jova-human" });
      if (h) {
        onHistoryChange(h);
        setIdx(0);
      }
    } catch {
      setError("Couldn't read Jova's human block.");
    }
  };

  return (
    <div>
      <div className="relative">
        <textarea
          value={readOnly ? preview ?? value : value}
          onChange={readOnly ? undefined : (e) => onChange(e.target.value)}
          readOnly={readOnly}
          rows={kind === "persona" ? 7 : 4}
          placeholder={
            readOnly
              ? undefined
              : kind === "persona"
                ? "Describe the agent, or wrap {{ guidelines }} and let Nexus write it…"
                : "Who this agent talks with and the setting, or {{ guidelines }} for Nexus…"
          }
          className={`w-full resize-y rounded-lg border px-3 py-2 pr-16 text-[13px] leading-relaxed outline-none ${
            readOnly ? "border-white/10 bg-white/[0.02] text-white/55" : "border-white/15 bg-white/5 text-white focus:border-cyan-300/40"
          }`}
        />

        {/* version indicator — a compact clickable badge at the top-right of the box; opens the history popover */}
        {total > 0 && (
          <div className="absolute right-6 top-2">
            <button
              type="button"
              onClick={() => setHistoryOpen((o) => !o)}
              title="Version history"
              className="flex items-center gap-0.5 rounded-md border border-white/15 bg-black/40 px-1.5 py-0.5 text-[10px] font-medium text-white/70 backdrop-blur-sm transition hover:bg-white/15"
            >
              v{total - idx}
              <span className="text-white/35">/{total}</span>
              <span className="text-white/40">⌄</span>
            </button>
            {historyOpen && (
              <VersionHistoryPopover
                versions={versions}
                idx={idx}
                onSelect={(i) => {
                  void show(i);
                  setHistoryOpen(false);
                }}
                onClose={() => setHistoryOpen(false)}
              />
            )}
          </div>
        )}
      </div>

      {/* Generate sits BELOW the box — it acts on what's written above (fresh, or a {{ guided }} rewrite). */}
      {!readOnly && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <button
            onClick={() => void generate()}
            disabled={busy}
            className={`shrink-0 rounded-lg border px-3 py-1.5 text-[12px] transition ${
              busy ? "cursor-wait border-white/10 bg-white/5 text-white/40" : "border-cyan-300/30 bg-cyan-400/20 text-cyan-50 hover:bg-cyan-400/30"
            }`}
          >
            {busy ? "Generating…" : "Generate"}
          </button>
          {showJovaHumanInsert && (
            <button
              onClick={() => void insertJovaHuman()}
              disabled={busy}
              className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-white/60 transition hover:bg-white/10 disabled:opacity-40"
            >
              Insert Jova&rsquo;s human block
            </button>
          )}
          <p className="min-w-[12rem] flex-1 text-[11px] text-white/35">
            <span className="text-white/55">Nexus</span> writes this — wrap{" "}
            <span className="text-white/55">{"{{ guidelines }}"}</span> to steer a rewrite of what&rsquo;s above, or leave them out for a fresh take from the
            Name, Role{team ? " + Team" : ""}. Your current text is saved to history first.
          </p>
        </div>
      )}

      {error && <p className="mt-1.5 text-[11px] text-rose-300/80">{error}</p>}
    </div>
  );
}

const SOURCE_LABEL: Record<VersionSource, string> = { nexus: "Nexus", manual: "Manual", "jova-human": "From Jova" };

/** Popover listing version history newest-first (number, source, time, a text preview); click one to load it. */
function VersionHistoryPopover({
  versions,
  idx,
  onSelect,
  onClose,
}: {
  versions: VersionEntry[];
  idx: number;
  onSelect: (i: number) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const total = versions.length;
  return (
    <div
      ref={ref}
      className="absolute right-0 top-7 z-20 w-72 overflow-hidden rounded-lg border border-white/15 bg-[#0b1117] shadow-[0_10px_34px_rgba(0,0,0,0.55)]"
    >
      <div className="border-b border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-wider text-white/40">Version history · {total}</div>
      <div className="max-h-64 overflow-y-auto p-1">
        {versions.map((v, i) => (
          <button
            key={v.id}
            onClick={() => onSelect(i)}
            className={`block w-full rounded-md px-2 py-1.5 text-left transition ${i === idx ? "bg-cyan-400/15 ring-1 ring-cyan-300/25" : "hover:bg-white/10"}`}
          >
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="font-medium text-white/85">
                v{total - i}
                {i === idx && <span className="text-cyan-200/70"> · current</span>}
              </span>
              <span className="text-white/40">
                {SOURCE_LABEL[v.source]} · {relTime(v.createdAt)}
              </span>
            </div>
            <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/45">{v.text.replace(/\s+/g, " ").trim().slice(0, 140) || "—"}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
