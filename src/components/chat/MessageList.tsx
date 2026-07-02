"use client";

import { useEffect, useRef } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { useChatPrefs } from "@/lib/settings/useChatPrefs";
import { Markdown } from "@/lib/markdown";
import { stripAudioTags } from "@/lib/jova/speechText";
import { Reactions } from "./Reactions";
import { TypingIndicator } from "./TypingIndicator";
import type { ChatMessage } from "@/lib/jova/types";

const EMPTY: ChatMessage[] = [];

/** Friendly stamp shown on hover — "the time it was sent" (assistant: when the reply finished). */
function fmtStamp(ms: number): string {
  try {
    return new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function MessageList() {
  const activeId = useJovaStore((s) => s.activeSessionId);
  const messages = useJovaStore((s) => (activeId ? s.messages[activeId] ?? EMPTY : EMPTY));
  const target = useJovaStore((s) => s.sessions.find((x) => x.id === s.activeSessionId)?.target ?? null);
  const hydrate = useChatPrefs((s) => s.hydrate);
  const showAudioTags = useChatPrefs((s) => s.showAudioTags);
  const endRef = useRef<HTMLDivElement>(null);

  // pull persisted prefs + the agent->preset map (for reaction gating) once on mount
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  // The bubble's sender label is the agent's NAME. For a character that's teamName ("Mira"), not the
  // subtitle ("nekomimi"); team/network agents keep their role label; no target = Jova.
  const agentLabel = !target ? "Jova" : target.teamId === "character" ? target.teamName : target.label || target.teamName;
  const agentColor = target?.color;

  // Her replies sit in a left-anchored bubble, mirroring the user's — a two-people-messaging look.
  const assistantBubbleCls =
    "rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.07] px-3.5 py-2 text-[15px] leading-relaxed";

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto px-4 py-3">
      {messages.length === 0 && (
        <p className="py-6 text-center text-sm text-white/40">
          {target ? `Talking with ${target.teamName}'s ${target.label}…` : "Jova is on her way…"}
        </p>
      )}
      {messages.map((m) => {
        if (m.kind === "dream") {
          return (
            <div key={m.id} className="max-w-[90%] self-start">
              <div className="rounded-2xl border border-violet-300/25 bg-violet-400/10 px-3.5 py-2.5">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-violet-200/80">
                  <span>💭</span> Dream
                </div>
                <div className="text-[14px] leading-relaxed text-violet-50">{m.content}</div>
              </div>
            </div>
          );
        }

        const hasBody = !!(m.content || m.attachments?.length);
        // She's "typing" while the turn is live but nothing's landed yet → show dots, not a bubble.
        const typing = m.role === "assistant" && m.streaming && !hasBody;
        // Never render an empty assistant bubble (e.g. a turn that produced nothing).
        if (m.role === "assistant" && !typing && !hasBody) return null;

        return (
          <div
            key={m.id}
            className={`group flex flex-col ${
              m.role === "user" ? "max-w-[80%] items-end self-end" : "max-w-[88%] items-start self-start"
            }`}
          >
            {/* sender label + hover-revealed timestamp (no time while she's still typing) */}
            <div
              className={`mb-0.5 flex items-baseline gap-2 px-1 text-[10px] ${
                m.role === "user" ? "flex-row-reverse" : ""
              }`}
            >
              <span className="font-medium text-white/45" style={m.role === "assistant" && agentColor ? { color: agentColor } : undefined}>
                {m.role === "user" ? "You" : agentLabel}
              </span>
              {!typing && (
                <span
                  // hover-revealed on desktop; always faintly there on touch (no hover to reveal it)
                  className="text-white/30 opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-60"
                  title={fmtStamp(m.sentAt ?? m.createdAt)}
                >
                  {fmtStamp(m.sentAt ?? m.createdAt)}
                </span>
              )}
            </div>

            {typing ? (
              <TypingIndicator color={agentColor} />
            ) : (
              <div
                className={
                  m.role === "user"
                    ? "rounded-2xl rounded-br-sm border border-cyan-300/20 bg-cyan-400/15 px-3.5 py-2 text-[15px] text-cyan-50"
                    : `${assistantBubbleCls} text-cyan-100/95`
                }
                style={m.role === "assistant" && agentColor ? { color: agentColor } : undefined}
              >
                {m.attachments && m.attachments.length > 0 && (
                  <div className="mb-1.5 flex flex-wrap gap-1.5">
                    {m.attachments.map((a, i) =>
                      a.kind === "image" && a.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={i} src={a.url} alt={a.name} className="max-h-44 max-w-[180px] rounded-lg border border-white/10 object-contain" />
                      ) : (
                        <div key={i} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[12px] text-white/70">
                          <span>📄</span>
                          <span className="max-w-[180px] truncate">{a.name}</span>
                        </div>
                      ),
                    )}
                  </div>
                )}
                {m.content && <Markdown text={m.role === "assistant" && !showAudioTags ? stripAudioTags(m.content) : m.content} />}
                {m.streaming && <span className="ml-0.5 inline-block animate-pulse text-cyan-300">▍</span>}
              </div>
            )}

            {/* emoji likes — yours + the agent's; hidden until hover unless some exist */}
            {activeId && !m.streaming && (
              <div className={m.role === "user" ? "self-end" : "self-start"}>
                <Reactions sessionId={activeId} message={m} align={m.role === "user" ? "right" : "left"} agentLabel={agentLabel} />
              </div>
            )}
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
