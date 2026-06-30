"use client";

import { useEffect, useState } from "react";
import { useChatPrefs } from "@/lib/settings/useChatPrefs";
import { Markdown } from "@/lib/markdown";
import { listPresets, type PresetSummary } from "@/lib/jova/openrouter";

const FORMATTING_EXAMPLE = `**Bold**, *italic*, and \`inline code\`.

- Bulleted lists
- Like this

1. Numbered too
2. In order

> A quote, for emphasis.

A [link](https://example.com) and a code block:

\`\`\`
const hi = "hello";
\`\`\``;

/**
 * The "Chat" settings screen — the in-app helper for what you can do in chat:
 *   • a live Markdown formatting cheatsheet,
 *   • how emoji reactions work (you like hers; she likes yours from inside her own reasoning),
 *   • the per-preset reactions allow-list.
 */
export function ChatScreen() {
  const allowlist = useChatPrefs((s) => s.reactionsAllowlist);
  const toggleAllowlist = useChatPrefs((s) => s.toggleAllowlist);
  const showAudioTags = useChatPrefs((s) => s.showAudioTags);
  const setShowAudioTags = useChatPrefs((s) => s.setShowAudioTags);
  const hydrate = useChatPrefs((s) => s.hydrate);
  const refreshAgentPresets = useChatPrefs((s) => s.refreshAgentPresets);

  const [presets, setPresets] = useState<PresetSummary[]>([]);

  useEffect(() => {
    hydrate();
    void refreshAgentPresets();
    let alive = true;
    listPresets()
      .then((p) => alive && setPresets(p))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [hydrate, refreshAgentPresets]);

  return (
    <div className="max-w-2xl space-y-7">
      <div>
        <h2 className="text-lg font-semibold text-cyan-100">Chat</h2>
        <p className="text-[12px] text-white/40">What you can do in a conversation — formatting and reactions.</p>
      </div>

      {/* ---- Formatting cheatsheet ---- */}
      <section>
        <h3 className="mb-1 text-sm font-semibold text-white/85">Formatting</h3>
        <p className="mb-3 text-[12px] text-white/45">
          Messages render Markdown. Type it the normal way — here&rsquo;s the gist, with the live result on the right.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <pre className="overflow-x-auto rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[11.5px] leading-relaxed text-white/70">
            {FORMATTING_EXAMPLE}
          </pre>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-[13.5px] text-cyan-100/90">
            <Markdown text={FORMATTING_EXAMPLE} />
          </div>
        </div>

        <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 transition hover:bg-white/[0.05]">
          <span className="min-w-0">
            <span className="text-[13px] text-white/85">Show emphasis tags</span>
            <span className="block text-[11px] text-white/40">
              v3-voice agents can add delivery cues like <span className="rounded bg-white/10 px-1 font-mono text-[10px]">[angry]</span> that ElevenLabs performs.
              They&rsquo;re hidden from the transcript by default — turn this on to see them.
            </span>
          </span>
          <input
            type="checkbox"
            checked={showAudioTags}
            onChange={(e) => setShowAudioTags(e.target.checked)}
            className="h-4 w-4 shrink-0 accent-cyan-400"
          />
        </label>
      </section>

      {/* ---- Reactions ---- */}
      <section>
        <h3 className="mb-1 text-sm font-semibold text-white/85">Reactions (emoji likes)</h3>
        <p className="mb-2 text-[12px] leading-relaxed text-white/55">
          Hover one of <em>her</em> messages and tap <span className="rounded bg-white/10 px-1">＋🙂</span> to react — up to 10 emoji,
          free pick. It&rsquo;s a feedback channel: when you like (or take back) a reaction, she&rsquo;s told on her next reply, so she can
          adjust and remember. And she reacts to <em>your</em> messages from inside her own reasoning on a normal turn — no separate
          model call, just a couple of tokens of thought — and the app lifts those emoji onto your message.
        </p>
        <ul className="mb-4 list-disc space-y-0.5 pl-5 text-[12px] text-white/45">
          <li>Your taps are <span className="text-cyan-200/80">cyan</span>; hers are <span className="text-fuchsia-200/80">violet</span>.</li>
          <li>You react to her messages; she reacts to yours — you can&rsquo;t react to your own.</li>
          <li>Tap your own reaction again to remove it.</li>
          <li>Reactions only run for agents whose preset is allow-listed below.</li>
        </ul>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-2 text-[12px] font-medium text-white/70">Allowed presets</div>
          <p className="mb-3 text-[11px] text-white/40">
            Only agents routing through a checked preset react and understand reactions. Leave a preset unchecked to keep that agent
            out of the reaction loop entirely.
          </p>
          {presets.length === 0 ? (
            <p className="text-[12px] text-white/35">Loading presets…</p>
          ) : (
            <div className="grid gap-1.5">
              {presets.map((p) => {
                const on = allowlist.includes(p.slug);
                return (
                  <label
                    key={p.slug}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 transition hover:bg-white/[0.05]"
                  >
                    <span className="min-w-0">
                      <span className="text-[13px] text-white/85">{p.name}</span>
                      <span className="ml-1 text-[11px] text-white/35">{p.slug}</span>
                      {p.description && <span className="block truncate text-[11px] text-white/35">{p.description}</span>}
                    </span>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleAllowlist(p.slug)}
                      className="h-4 w-4 shrink-0 accent-cyan-400"
                    />
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
