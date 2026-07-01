"use client";

import { useCallback, useEffect, useState } from "react";
import { listAgents } from "@/lib/jova/agents";
import {
  fetchAudit,
  fetchDrift,
  reconcileDrift,
  setAutoSync,
  type AuditEntry,
  type DiffLine,
  type DriftItem,
  type DriftReport,
  type DriftStatus,
  type ReconcileAction,
} from "@/lib/jova/memoryReview";

const ACCENT = "#67e8f9"; // the app's cyan — trusted / primary

/**
 * Memory Review — the human gate on what reaches Jova's long-term memory. Notes live as markdown in the
 * vault; anything edited OUTSIDE the app (Obsidian, Syncthing, another device) shows up here as drift with
 * a trusted→current diff. Accept folds an edit into recall; discard reverts the file. "Trusted vault" mode
 * applies edits automatically and logs them below. The diff is the hero — a reviewer's trust comes from
 * seeing the exact change, so it's rendered raw (monospace, +/- gutters) inside the app's dark glass.
 */

// each drift type carries its own sigil, colour, and a plain-language outcome for accept / discard.
const STATUS: Record<DriftStatus, { sigil: string; label: string; color: string; accept: string; discard: string }> = {
  modified: { sigil: "~", label: "Edited", color: "#fbbf24", accept: "saves this edit to memory", discard: "reverts the file to what Jova has" },
  new: { sigil: "+", label: "New", color: "#34d399", accept: "adds this note to memory", discard: "deletes the file" },
  deleted: { sigil: "–", label: "Removed", color: "#fb7185", accept: "drops it from memory", discard: "restores the file" },
};

// frontmatter keys an injection would target — recall weight, retirement, kind, provenance.
const SENSITIVE = /^(importance|superseded|type|origin)\s*:/;
const hasMetadataEdit = (item: DriftItem) =>
  item.diff.some((d) => (d.t === "add" || d.t === "del") && SENSITIVE.test(d.text.trim()));

const shortId = (noteId: string) => {
  const i = noteId.indexOf("/");
  return i >= 0 ? noteId.slice(i + 1) : noteId;
};

function ago(ts: number): string {
  const s = Math.max(0, Date.now() / 1000 - ts);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function MemoryReviewScreen() {
  const [agents, setAgents] = useState<string[]>([]);
  const [agent, setAgent] = useState("jova");
  const [report, setReport] = useState<DriftReport | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // noteId | "all" | "autosync" while a call is in flight
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showAudit, setShowAudit] = useState(false);

  // populate the agent picker (only agents with ranked memory really have drift; others read clean)
  useEffect(() => {
    let alive = true;
    listAgents()
      .then((a) => {
        if (!alive) return;
        const names = a.map((x) => x.name);
        setAgents(names);
        if (names.length && !names.includes("jova")) setAgent(names[0]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const load = useCallback(async (who: string) => {
    setError(null);
    try {
      const [r, h] = await Promise.all([fetchDrift(who), fetchAudit(who, 40)]);
      setReport(r);
      setAudit(h);
    } catch (e) {
      setReport(null);
      setError(String(e instanceof Error ? e.message : e));
    }
  }, []);

  useEffect(() => {
    setReport(null);
    void load(agent);
  }, [agent, load]);

  const act = async (action: ReconcileAction, noteIds: string[] | null, key: string) => {
    setBusy(key);
    try {
      const fresh = await reconcileDrift(agent, action, noteIds);
      setReport(fresh);
      setAudit(await fetchAudit(agent, 40));
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  };

  const toggleAuto = async () => {
    if (!report) return;
    setBusy("autosync");
    try {
      const next = await setAutoSync(agent, !report.autoSync);
      setReport({ ...report, autoSync: next });
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  };

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const items = report?.items ?? [];
  const anyBusy = busy !== null;

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3 pr-10">
        <div>
          <h2 className="text-lg font-semibold text-cyan-100">Memory Review</h2>
          <p className="max-w-[52ch] text-[12px] text-white/40">
            Changes made to {agent === "jova" ? "Jova's" : `${agent}'s`} memory outside the app — from Obsidian or another
            device. Review each one before it reaches what she recalls.
          </p>
        </div>
        {agents.length > 1 && (
          <select
            value={agent}
            onChange={(e) => setAgent(e.target.value)}
            aria-label="Agent"
            className="mt-0.5 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1.5 text-[12px] text-white outline-none focus:border-cyan-300/40"
          >
            {agents.map((a) => (
              <option key={a} value={a} className="bg-[#0a0f14]">
                {a}
              </option>
            ))}
          </select>
        )}
      </div>

      {report && <AutoSyncCard on={report.autoSync} busy={busy === "autosync"} onToggle={toggleAuto} />}

      {error && (
        <p className="mb-3 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-[12px] text-amber-200/80">
          Couldn&apos;t reach the memory service — {error}
        </p>
      )}
      {!report && !error && <p className="text-sm text-white/40">Checking the vault…</p>}

      {report && items.length > 0 && (
        <>
          <div className="mb-2.5 mt-4 flex items-center justify-between gap-2">
            <span className="text-[11px] uppercase tracking-wider text-white/40">
              {items.length} change{items.length === 1 ? "" : "s"}
              {report.autoSync ? " · will sync automatically" : " · waiting for review"}
            </span>
            <div className="flex gap-1.5">
              <button
                onClick={() => act("accept", null, "all")}
                disabled={anyBusy}
                className="rounded-lg border border-emerald-300/30 bg-emerald-400/15 px-2.5 py-1 text-[12px] text-emerald-50 transition hover:bg-emerald-400/25 disabled:opacity-40"
              >
                Accept all
              </button>
              <button
                onClick={() => act("discard", null, "all")}
                disabled={anyBusy}
                className="rounded-lg border border-rose-300/30 bg-rose-400/10 px-2.5 py-1 text-[12px] text-rose-100 transition hover:bg-rose-400/20 disabled:opacity-40"
              >
                Discard all
              </button>
            </div>
          </div>

          <div className="grid gap-2.5">
            {items.map((item) => (
              <DriftCard
                key={item.noteId}
                item={item}
                collapsed={collapsed.has(item.noteId)}
                busy={busy === item.noteId || busy === "all"}
                disabled={anyBusy}
                onToggle={() => toggleCollapse(item.noteId)}
                onAccept={() => act("accept", [item.noteId], item.noteId)}
                onDiscard={() => act("discard", [item.noteId], item.noteId)}
              />
            ))}
          </div>
        </>
      )}

      {report && items.length === 0 && !error && <CleanState autoSync={report.autoSync} />}

      {report && <AuditLog entries={audit} open={showAudit} onToggle={() => setShowAudit((v) => !v)} />}
    </div>
  );
}

/** The policy switch: trusted vault (auto-apply + log) vs review-first. Sets the tone for the whole screen. */
function AutoSyncCard({ on, busy, onToggle }: { on: boolean; busy: boolean; onToggle: () => void }) {
  return (
    <div
      className="flex items-start justify-between gap-4 rounded-xl border px-4 py-3 transition-colors"
      style={
        on
          ? { borderColor: `${ACCENT}44`, background: `${ACCENT}12`, boxShadow: `0 0 22px ${ACCENT}18` }
          : { borderColor: "rgba(251,191,36,0.28)", background: "rgba(251,191,36,0.06)" }
      }
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span aria-hidden className="text-[13px]" style={{ color: on ? ACCENT : "#fbbf24" }}>
            {on ? "◈" : "☑"}
          </span>
          <span className="text-[13px] font-semibold" style={{ color: on ? "rgb(207,250,254)" : "rgba(253,230,138,0.95)" }}>
            {on ? "Trusted vault" : "Review before saving"}
          </span>
        </div>
        <p className="mt-1 max-w-[60ch] text-[11.5px] leading-snug text-white/45">
          {on
            ? "Edits made in the vault are folded into memory automatically and logged below. Turn this off to check every change first."
            : "Edits wait here until you accept them — nothing reaches Jova's memory unreviewed. Turn this on to trust the vault and sync automatically."}
        </p>
      </div>
      <Switch on={on} busy={busy} onToggle={onToggle} label={on ? "On" : "Off"} accent={on ? ACCENT : "#fbbf24"} />
    </div>
  );
}

function DriftCard({
  item,
  collapsed,
  busy,
  disabled,
  onToggle,
  onAccept,
  onDiscard,
}: {
  item: DriftItem;
  collapsed: boolean;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
  onAccept: () => void;
  onDiscard: () => void;
}) {
  const meta = STATUS[item.status];
  // only a signal on an EDIT — a new/removed note's frontmatter is wholly added/removed, so flagging it is noise.
  const metaEdit = item.status === "modified" && hasMetadataEdit(item);
  return (
    <div
      className="rounded-xl border border-white/10 bg-white/[0.03] transition-opacity"
      style={busy ? { opacity: 0.5 } : undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left outline-none focus-visible:bg-white/[0.02]"
      >
        <span
          aria-hidden
          className="grid h-5 w-5 shrink-0 place-items-center rounded-md font-mono text-[13px] font-bold"
          style={{ color: meta.color, background: `${meta.color}1f` }}
        >
          {meta.sigil}
        </span>
        <span className="text-[10px] uppercase tracking-wider" style={{ color: meta.color }}>
          {meta.label}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-white/70">{shortId(item.noteId)}</span>
        {metaEdit && (
          <span
            title="This edit changes note metadata (importance, retirement, kind) — an injection would target these."
            className="shrink-0 rounded-full border border-amber-300/30 bg-amber-300/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-200/90"
          >
            metadata
          </span>
        )}
        <span className="shrink-0 font-mono text-[11px] text-white/35">
          {item.added > 0 && <span className="text-emerald-300/80">+{item.added}</span>}
          {item.added > 0 && item.removed > 0 && " "}
          {item.removed > 0 && <span className="text-rose-300/80">−{item.removed}</span>}
        </span>
        <span aria-hidden className="shrink-0 text-white/30 transition-transform" style={{ transform: collapsed ? "none" : "rotate(90deg)" }}>
          ›
        </span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3">
          <DiffView diff={item.diff} status={item.status} />
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <p className="min-w-0 text-[10.5px] leading-snug text-white/35">
              <span className="text-emerald-300/70">Accept</span> {meta.accept} ·{" "}
              <span className="text-rose-300/70">Discard</span> {meta.discard}
            </p>
            <div className="flex shrink-0 gap-1.5">
              <button
                onClick={onDiscard}
                disabled={disabled}
                className="rounded-lg border border-rose-300/30 bg-rose-400/10 px-2.5 py-1 text-[12px] text-rose-100 transition hover:bg-rose-400/20 disabled:opacity-40"
              >
                Discard
              </button>
              <button
                onClick={onAccept}
                disabled={disabled}
                className="rounded-lg border border-emerald-300/30 bg-emerald-400/15 px-2.5 py-1 text-[12px] text-emerald-50 transition hover:bg-emerald-400/25 disabled:opacity-40"
              >
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** The raw diff — the one place the app drops its soft chrome for a terminal patch, because a reviewer's
 *  trust comes from seeing exactly what changed. Monospace, +/- gutters, contained + scrollable. */
function DiffView({ diff, status }: { diff: DiffLine[]; status: DriftStatus }) {
  if (diff.length === 0) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px] text-white/40">
        {status === "deleted" ? "(file removed — nothing to show)" : "(no textual difference)"}
      </div>
    );
  }
  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-white/10 bg-black/40 py-1.5 font-mono text-[11px] leading-[1.55]">
      {diff.map((d, i) => {
        const style =
          d.t === "add"
            ? { color: "#6ee7b7", background: "rgba(52,211,153,0.10)" }
            : d.t === "del"
              ? { color: "#fda4af", background: "rgba(251,113,133,0.10)" }
              : { color: "rgba(255,255,255,0.45)" };
        return (
          <div key={i} className="flex px-2.5" style={style}>
            <span aria-hidden className="mr-2 w-2 shrink-0 select-none text-center opacity-70">
              {d.t === "add" ? "+" : d.t === "del" ? "−" : " "}
            </span>
            <span className="whitespace-pre-wrap break-words">{d.text || " "}</span>
          </div>
        );
      })}
    </div>
  );
}

/** In-sync confirmation — a calm close, not a dead end. */
function CleanState({ autoSync }: { autoSync: boolean }) {
  return (
    <div className="mt-4 grid place-items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-10 text-center">
      <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full text-[16px]" style={{ color: ACCENT, background: `${ACCENT}18` }}>
        ✓
      </span>
      <p className="text-[13px] text-white/70">Memory is in sync</p>
      <p className="max-w-[42ch] text-[11.5px] leading-snug text-white/40">
        No edits outside the app. {autoSync ? "Anything you change in the vault will sync automatically." : "Changes in the vault will show up here for review."}
      </p>
    </div>
  );
}

/** The forensic trail — every accept, discard, and auto-sync. Collapsed by default; the record behind
 *  trusted-vault mode, so an auto-applied edit is never invisible. */
function AuditLog({ entries, open, onToggle }: { entries: AuditEntry[]; open: boolean; onToggle: () => void }) {
  return (
    <div className="mt-5 border-t border-white/10 pt-3">
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-white/40 outline-none transition hover:text-white/65"
      >
        <span aria-hidden className="transition-transform" style={{ transform: open ? "rotate(90deg)" : "none" }}>
          ›
        </span>
        Recent activity {entries.length > 0 && <span className="text-white/25">({entries.length})</span>}
      </button>
      {open &&
        (entries.length === 0 ? (
          <p className="mt-2 text-[11.5px] text-white/35">Nothing yet. Accepted, discarded, and auto-synced changes show up here.</p>
        ) : (
          <ul className="mt-2 grid gap-0.5">
            {entries.map((e, i) => {
              const meta = STATUS[e.status];
              const verb = e.action === "auto-accept" ? "auto-synced" : e.action === "accept" ? "accepted" : "discarded";
              const verbColor = e.action === "discard" ? "#fda4af" : "#6ee7b7";
              return (
                <li key={i} className="flex items-center gap-2 py-0.5 text-[11.5px]">
                  <span aria-hidden style={{ color: meta.color }} className="w-2 font-mono">
                    {meta.sigil}
                  </span>
                  <span style={{ color: verbColor }} className="w-[74px] shrink-0">
                    {verb}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-mono text-white/55">{shortId(e.noteId)}</span>
                  {e.detail && <span className="shrink-0 font-mono text-[10.5px] text-white/30">{e.detail}</span>}
                  <span className="shrink-0 text-white/30">{ago(e.ts)}</span>
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}

/** Pill switch — matches the memory-profile switch; accent colour follows the mode (cyan on / amber off). */
function Switch({ on, busy, onToggle, label, accent }: { on: boolean; busy: boolean; onToggle: () => void; label: string; accent: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={onToggle}
      className="flex shrink-0 items-center gap-2 outline-none disabled:opacity-50"
    >
      <span className="text-[11px] uppercase tracking-wide text-white/45">{label}</span>
      <span
        className="relative h-4 w-7 shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none"
        style={{ background: on ? `${accent}99` : "rgba(255,255,255,0.15)" }}
      >
        <span className="absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all duration-200 motion-reduce:transition-none" style={{ left: on ? 14 : 2 }} />
      </span>
    </button>
  );
}
