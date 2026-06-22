"use client";

import { useState } from "react";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import type { AgentNode } from "@/lib/network/types";

const inputCls = "w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-cyan-300/40";

/** Mask a secret down to a hint we can safely display/store (we never keep the full key client-side). */
function mask(secret: string): string | undefined {
  const s = secret.trim();
  if (!s) return undefined;
  return s.length > 4 ? `••••${s.slice(-4)}` : "••••";
}

/** Apps / API keys an agent can use. Keys are masked on add; the full secret is never stored here. */
export function AccessSection({ teamId, agent }: { teamId: string; agent: AgentNode }) {
  const addAccess = useNetworkStore((s) => s.addAccess);
  const removeAccess = useNetworkStore((s) => s.removeAccess);
  const [app, setApp] = useState("");
  const [secret, setSecret] = useState("");
  const grants = agent.access ?? [];

  const add = () => {
    const a = app.trim();
    if (!a) return;
    // skip duplicates (case-insensitive) so the same app doesn't stack identical rows
    if (grants.some((g) => g.app.toLowerCase() === a.toLowerCase())) {
      setApp("");
      setSecret("");
      return;
    }
    addAccess(teamId, agent.id, a, mask(secret));
    setApp("");
    setSecret("");
  };

  return (
    <div>
      <p className="mb-3 text-[12px] leading-relaxed text-white/45">
        Apps &amp; API keys this agent can use. Keys are masked once added — the full secret isn&rsquo;t kept in
        the browser (it&rsquo;ll live in a server-side vault when the backend is wired).
      </p>

      <ul className="mb-4 space-y-1">
        {grants.length === 0 && <li className="text-[12px] text-white/30">No access yet.</li>}
        {grants.map((g) => (
          <li key={g.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-white/85">{g.app}</span>
              <span className="block font-mono text-[11px] text-white/40">{g.keyHint ?? "linked · no key"}</span>
            </span>
            <button
              onClick={() => removeAccess(teamId, agent.id, g.id)}
              title="Remove access"
              className="shrink-0 rounded px-1.5 py-1 text-[13px] leading-none text-white/40 transition hover:bg-white/10 hover:text-rose-300"
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
        <div className="mb-2 text-[11px] uppercase tracking-wider text-white/40">Add access</div>
        <div className="grid gap-2">
          <input
            value={app}
            onChange={(e) => setApp(e.target.value)}
            placeholder="App / what it's for (e.g. GitHub, Stripe)"
            className={inputCls}
          />
          <input
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            type="password"
            autoComplete="off"
            placeholder="API key (optional) — stored masked"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            className={inputCls}
          />
          <button
            onClick={add}
            disabled={!app.trim()}
            className={`self-start rounded-lg border px-3 py-1.5 text-sm transition ${
              app.trim() ? "border-cyan-300/30 bg-cyan-400/20 text-cyan-50 hover:bg-cyan-400/30" : "cursor-default border-white/10 bg-white/5 text-white/30"
            }`}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
