"use client";

import { useCallback, useEffect, useState } from "react";
import { useChatPrefs } from "@/lib/settings/useChatPrefs";
import { ScrollMore, useScrollMore } from "./ScrollMore";
import {
  fetchPresets,
  getOpenRouterKeys,
  getOpenRouterCredits,
  addOpenRouterKey,
  activateOpenRouterKey,
  removeOpenRouterKey,
  type PresetSummary,
  type OpenRouterKeyStatus,
  type OpenRouterCredits,
} from "@/lib/jova/openrouter";

/**
 * LLM Presets — manage the OpenRouter side of routing: the OpenRouter API key (stored server-side, like
 * the ElevenLabs keys) and the list of preset slugs surfaced in the Agents routing dropdowns. OpenRouter
 * has no "list my presets" API, so presets are enumerated by slug here and verified against your key.
 */
export function LlmPresetsScreen() {
  const customPresets = useChatPrefs((s) => s.customPresets);
  const addCustomPreset = useChatPrefs((s) => s.addCustomPreset);
  const removeCustomPreset = useChatPrefs((s) => s.removeCustomPreset);
  const hydratePrefs = useChatPrefs((s) => s.hydrate);

  const [status, setStatus] = useState<OpenRouterKeyStatus | null>(null);
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [mock, setMock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [slug, setSlug] = useState("");
  const [credits, setCredits] = useState<OpenRouterCredits | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);

  const { scrollRef, more } = useScrollMore();

  const reloadPresets = useCallback(async (slugs: string[]) => {
    setLoading(true);
    try {
      const r = await fetchPresets(slugs);
      setPresets(r.presets);
      setMock(r.mock);
    } catch {
      /* offline — keep last */
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadCredits = useCallback(async () => {
    setCreditsLoading(true);
    try {
      setCredits(await getOpenRouterCredits());
    } finally {
      setCreditsLoading(false);
    }
  }, []);

  useEffect(() => {
    hydratePrefs();
  }, [hydratePrefs]);

  useEffect(() => {
    void getOpenRouterKeys().then(setStatus);
  }, []);

  useEffect(() => {
    void reloadPresets(customPresets);
  }, [reloadPresets, customPresets]);

  // Fetch the balance when the tab opens, then poll it (OpenRouter has no push/WS for this) so usage stays
  // current while you watch. The interval is cleared on unmount (leaving the tab), so it never runs in the bg.
  useEffect(() => {
    void reloadCredits();
    const t = setInterval(() => void reloadCredits(), 30_000);
    return () => clearInterval(t);
  }, [reloadCredits]);

  // when keys change, the active key changes which presets + balance resolve — refresh all
  const onKeysChanged = useCallback(
    async (next: OpenRouterKeyStatus | null) => {
      setStatus(next);
      await Promise.all([reloadPresets(useChatPrefs.getState().customPresets), reloadCredits()]);
    },
    [reloadPresets, reloadCredits],
  );

  const addSlug = () => {
    if (!slug.trim()) return;
    addCustomPreset(slug);
    setSlug("");
  };

  const resolved = new Set(presets.map((p) => p.slug));
  const unresolvedCustom = customPresets.filter((s) => !resolved.has(s));

  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        <div ref={scrollRef} className="no-scrollbar h-full overflow-y-auto">
          <div className="mb-4 pr-10">
            <h2 className="text-lg font-semibold text-cyan-100">LLM Presets</h2>
            <p className="text-[12px] text-white/40">
              These are <span className="text-white/60">OpenRouter</span> presets — the routing profiles each agent&rsquo;s
              brain uses. Add your OpenRouter API key, then the presets you&rsquo;ve created so they show up in the Agents
              routing dropdowns.
            </p>
          </div>

          <OpenRouterKeyCard
            status={status}
            onChanged={onKeysChanged}
            credits={credits}
            creditsLoading={creditsLoading}
            onRefreshCredits={reloadCredits}
          />

          <section className="mt-5">
        <h3 className="mb-1 text-sm font-semibold text-white/85">Presets</h3>
        <p className="mb-2.5 text-[11px] text-white/40">
          OpenRouter has no &ldquo;list presets&rdquo; API, so add each preset by its slug (from your OpenRouter
          dashboard). Valid ones are verified and named below.
        </p>

        {mock && (
          <div className="mb-2.5 rounded-lg border border-amber-300/20 bg-amber-300/5 px-3 py-2 text-[11px] text-amber-200/80">
            No OpenRouter key yet — showing sample presets. Add a key above to load and verify your real presets.
          </div>
        )}

        <div className="mb-3 flex items-center gap-2">
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSlug();
              }
            }}
            placeholder="preset slug (e.g. min)"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 outline-none focus:border-cyan-300/40"
          />
          <button
            onClick={addSlug}
            disabled={!slug.trim()}
            className="shrink-0 rounded-lg border border-cyan-300/30 bg-cyan-400/15 px-3 py-2 text-[12px] text-cyan-50 transition hover:bg-cyan-400/25 disabled:opacity-40"
          >
            Add preset
          </button>
        </div>

        {loading && !presets.length ? (
          <p className="text-[12px] text-white/40">Loading presets…</p>
        ) : (
          <div className="grid gap-1.5">
            {presets.map((p) => (
              <PresetRow
                key={p.slug}
                name={p.name}
                slug={p.slug}
                description={p.description}
                unverified={mock}
                custom={customPresets.includes(p.slug)}
                onRemove={() => removeCustomPreset(p.slug)}
              />
            ))}
            {unresolvedCustom.map((s) => (
              <PresetRow key={s} name={s} slug={s} unverified custom onRemove={() => removeCustomPreset(s)} />
            ))}
            {!presets.length && !unresolvedCustom.length && (
              <p className="text-[12px] text-white/40">No presets yet — add one by slug above.</p>
            )}
          </div>
        )}
      </section>
        </div>
        <ScrollMore show={more} />
      </div>
    </div>
  );
}

function PresetRow({
  name,
  slug,
  description,
  custom,
  unverified,
  onRemove,
}: {
  name: string;
  slug: string;
  description?: string | null;
  custom?: boolean;
  unverified?: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-[13px] font-medium text-white/85">{name}</span>
          {unverified ? (
            <span className="shrink-0 rounded bg-amber-300/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-200/70">unverified</span>
          ) : (
            <span className="shrink-0 rounded bg-emerald-400/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-emerald-200/70">verified</span>
          )}
        </div>
        <div className="truncate font-mono text-[11px] text-white/40">
          {slug}
          {description ? ` · ${description}` : ""}
        </div>
      </div>
      {custom && (
        <button onClick={onRemove} title="Remove this preset" className="shrink-0 rounded px-1.5 text-white/35 transition hover:text-rose-300">
          ×
        </button>
      )}
    </div>
  );
}

/** OpenRouter API key card — add/activate/remove named keys, masked, with the account balance inline.
 *  Mirrors the ElevenLabs key card (which shows credits the same way). */
function OpenRouterKeyCard({
  status,
  onChanged,
  credits,
  creditsLoading,
  onRefreshCredits,
}: {
  status: OpenRouterKeyStatus | null;
  onChanged: (next: OpenRouterKeyStatus | null) => void | Promise<void>;
  credits: OpenRouterCredits | null;
  creditsLoading: boolean;
  onRefreshCredits: () => void;
}) {
  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const envOnly = status?.envOnly;

  const save = async () => {
    if (!key.trim()) return;
    setBusy(true);
    setError("");
    setNote("");
    try {
      const r = await addOpenRouterKey(key.trim(), name.trim());
      if (!r.ok) {
        setError(r.error || "Couldn't save the key.");
        return;
      }
      setKey("");
      setName("");
      setAdding(false);
      setNote(r.verified ? "Saved & verified." : "Saved (couldn't verify — will try when used).");
      await onChanged(r.status);
    } catch (e) {
      setError(String(e).slice(0, 140));
    } finally {
      setBusy(false);
    }
  };

  const activate = async (id: string) => {
    setBusy(true);
    try {
      await onChanged(await activateOpenRouterKey(id));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await onChanged(await removeOpenRouterKey(id));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h3 className="mb-1 text-sm font-semibold text-white/85">OpenRouter API key</h3>
      <p className="mb-2.5 text-[11px] text-white/40">Stored on the server, never shown in full. Add several and pick which one is active.</p>

      <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 sm:max-w-md">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-sm font-medium text-white/85">OpenRouter</div>
            <div className="text-[11px] text-white/40">Routing presets + chat models</div>
          </div>
          {status && (
            <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-white/40">
              {envOnly ? ".env" : `${status.keys.length} key${status.keys.length === 1 ? "" : "s"}`}
            </span>
          )}
        </div>

        {status && (
          <div className="mt-2 space-y-1">
            {status.keys.map((k) => {
              const active = k.id === status.activeId;
              return (
                <div key={k.id} className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 ${active ? "bg-cyan-400/10 ring-1 ring-cyan-300/25" : "bg-black/30"}`}>
                  {!envOnly && (
                    <button
                      onClick={() => !active && void activate(k.id)}
                      disabled={busy || active}
                      title={active ? "Active key" : "Use this key"}
                      className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border transition ${active ? "border-cyan-300 bg-cyan-300/30" : "border-white/25 hover:border-cyan-300/60"}`}
                    >
                      {active && <span className="h-1.5 w-1.5 rounded-full bg-cyan-200" />}
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] text-white/80">{k.name}</span>
                      {active && !envOnly && <span className="shrink-0 rounded bg-cyan-400/20 px-1 text-[9px] uppercase tracking-wide text-cyan-100/80">active</span>}
                    </div>
                    <div className="font-mono text-[11px] text-white/40">{k.masked}</div>
                  </div>
                  {!envOnly && (
                    <button onClick={() => void remove(k.id)} disabled={busy} title="Remove key" className="shrink-0 rounded px-1.5 text-white/35 transition hover:text-rose-300">
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {adding ? (
          <div className="mt-2 space-y-1.5">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Name (e.g. "OpenRouter – personal")'
              className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-[12px] text-white/85 outline-none focus:border-cyan-300/40"
            />
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="Paste OpenRouter API key (sk-or-…)"
              className="w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 font-mono text-[12px] text-white/85 outline-none focus:border-cyan-300/40"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={save}
                disabled={busy || !key.trim()}
                className="rounded-md border border-cyan-300/30 bg-cyan-400/20 px-3 py-1.5 text-[12px] text-cyan-50 transition hover:bg-cyan-400/30 disabled:opacity-40"
              >
                {busy ? "Saving…" : "Save key"}
              </button>
              <button onClick={() => { setAdding(false); setKey(""); setName(""); setError(""); }} className="text-[11px] text-white/45 hover:text-white/70">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="mt-2 rounded-md border border-dashed border-white/15 px-2.5 py-1.5 text-[12px] text-white/60 transition hover:bg-white/5">
            + Add{status ? " another" : ""} key
          </button>
        )}

        {error && <div className="mt-1.5 text-[11px] text-rose-300/80">{error}</div>}
        {note && !error && <div className="mt-1.5 text-[11px] text-emerald-300/70">{note}</div>}

        {/* account balance — polled + manual refresh, same in-card placement as the ElevenLabs credits */}
        {status && (
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-white/5 pt-2 text-[11px]">
            {credits ? (
              <span className={credits.remaining <= 0 ? "font-medium text-rose-300/90" : "text-white/55"}>
                {fmt(credits.remaining)} left
                <span className="text-white/35"> · {fmt(credits.usage)} of {fmt(credits.total)} used</span>
              </span>
            ) : (
              <span className="text-white/35">{creditsLoading ? "checking balance…" : "balance unavailable"}</span>
            )}
            <button
              onClick={onRefreshCredits}
              disabled={creditsLoading}
              title="Refresh balance"
              className="shrink-0 rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/60 transition hover:bg-white/10 disabled:opacity-40"
            >
              {creditsLoading ? "…" : "Refresh"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
