"use client";

import { useRef, useState } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import type { ChatMessage } from "@/lib/jova/types";
import { EmojiPicker } from "./EmojiPicker";

interface Merged {
  emoji: string;
  count: number;
  mine: boolean; // the user has this reaction
  agent: boolean; // the agent has this reaction
}

/** Collapse the flat reaction list into one chip per emoji, tracking who tapped it. */
function merge(reactions: ChatMessage["reactions"]): Merged[] {
  const map = new Map<string, Merged>();
  for (const r of reactions ?? []) {
    const m = map.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, agent: false };
    m.count += 1;
    if (r.by === "user") m.mine = true;
    else m.agent = true;
    map.set(r.emoji, m);
  }
  return [...map.values()];
}

/**
 * Emoji "likes" on a message. You react to the AGENT's messages (your taps, cyan, removable); the
 * agent reacts to YOURS (violet, read-only). You can't react to your own messages — so the ＋ picker
 * only appears on the agent's messages.
 */
export function Reactions({
  sessionId,
  message,
  align,
  agentLabel,
}: {
  sessionId: string;
  message: ChatMessage;
  align: "left" | "right";
  agentLabel: string;
}) {
  const addReaction = useJovaStore((s) => s.addReaction);
  const removeReaction = useJovaStore((s) => s.removeReaction);
  const [picking, setPicking] = useState(false);
  const addBtnRef = useRef<HTMLButtonElement>(null);

  // You react to her messages; she reacts to yours. Never react to your own.
  const canReact = message.role === "assistant";
  const merged = merge(message.reactions);
  const hasAny = merged.length > 0;

  if (!canReact && !hasAny) return null; // your message with no reactions from her → nothing to show

  return (
    <div
      className={`relative flex items-center gap-1 ${hasAny ? "mt-1" : "h-0"} ${
        align === "right" ? "justify-end" : "justify-start"
      }`}
    >
      {merged.map((m) => (
        <button
          key={m.emoji}
          onClick={canReact ? () => (m.mine ? removeReaction : addReaction)(sessionId, message.id, m.emoji, "user") : undefined}
          title={
            canReact
              ? m.mine
                ? "You reacted — tap to remove"
                : "Tap to react"
              : `${agentLabel} reacted`
          }
          className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[12px] leading-none transition ${
            m.mine
              ? "border-cyan-300/50 bg-cyan-400/20 text-cyan-50"
              : "border-fuchsia-300/40 bg-fuchsia-400/10 text-fuchsia-50/90"
          } ${canReact ? "hover:brightness-110" : "cursor-default"}`}
        >
          <span>{m.emoji}</span>
          {m.count > 1 && <span className="text-[10px] opacity-70">{m.count}</span>}
        </button>
      ))}

      {canReact && (
        <button
          ref={addBtnRef}
          onClick={() => setPicking((p) => !p)}
          title="Add a reaction"
          className={`inline-flex items-center whitespace-nowrap rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[11px] leading-none text-white/45 transition hover:bg-white/10 hover:text-white/80 ${
            hasAny ? "" : `absolute top-0 ${align === "right" ? "right-0" : "left-0"} opacity-0 group-hover:opacity-100`
          }`}
        >
          <span>＋</span>
          <span className="text-[10px]">🙂</span>
        </button>
      )}

      {picking && (
        <EmojiPicker
          anchorRef={addBtnRef}
          onPick={(e) => {
            addReaction(sessionId, message.id, e, "user");
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
