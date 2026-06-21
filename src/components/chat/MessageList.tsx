"use client";

import { useEffect, useRef } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import type { ChatMessage } from "@/lib/jova/types";

const EMPTY: ChatMessage[] = [];

export function MessageList() {
  const activeId = useJovaStore((s) => s.activeSessionId);
  const messages = useJovaStore((s) => (activeId ? s.messages[activeId] ?? EMPTY : EMPTY));
  const target = useJovaStore((s) => s.sessions.find((x) => x.id === s.activeSessionId)?.target ?? null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto px-4 py-3">
      {messages.length === 0 && (
        <p className="py-6 text-center text-sm text-white/40">
          {target ? `Talking with ${target.teamName}'s ${target.label}…` : "Jova is on her way…"}
        </p>
      )}
      {messages.map((m) =>
        m.kind === "dream" ? (
          <div key={m.id} className="max-w-[90%] self-start">
            <div className="rounded-2xl border border-violet-300/25 bg-violet-400/10 px-3.5 py-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-violet-200/80">
                <span>💭</span> Dream
              </div>
              <div className="text-[14px] leading-relaxed text-violet-50">{m.content}</div>
            </div>
          </div>
        ) : (
          <div key={m.id} className={m.role === "user" ? "max-w-[80%] self-end" : "max-w-[88%] self-start"}>
            <div
              className={
                m.role === "user"
                  ? "rounded-2xl rounded-br-sm border border-cyan-300/20 bg-cyan-400/15 px-3.5 py-2 text-[15px] text-cyan-50"
                  : "text-[15px] leading-relaxed text-cyan-100/95 [text-shadow:0_0_18px_rgba(95,208,255,0.15)]"
              }
              style={m.role === "assistant" && target ? { color: target.color } : undefined}
            >
              {m.image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.image} alt="attachment" className="mb-1.5 block max-h-44 rounded-lg border border-white/10 object-contain" />
              )}
              {m.content}
              {m.streaming && <span className="ml-0.5 inline-block animate-pulse text-cyan-300">▍</span>}
            </div>
          </div>
        )
      )}
      <div ref={endRef} />
    </div>
  );
}
