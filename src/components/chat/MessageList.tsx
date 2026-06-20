"use client";

import { useEffect, useRef } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import type { ChatMessage } from "@/lib/jova/types";

const EMPTY: ChatMessage[] = [];

export function MessageList() {
  const activeId = useJovaStore((s) => s.activeSessionId);
  const messages = useJovaStore((s) => (activeId ? s.messages[activeId] ?? EMPTY : EMPTY));
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  return (
    <div className="flex flex-col gap-3 overflow-y-auto px-4 py-3" style={{ maxHeight: "42vh" }}>
      {messages.length === 0 && (
        <p className="py-6 text-center text-sm text-white/40">Jova is on her way…</p>
      )}
      {messages.map((m) => (
        <div key={m.id} className={m.role === "user" ? "max-w-[80%] self-end" : "max-w-[88%] self-start"}>
          <div
            className={
              m.role === "user"
                ? "rounded-2xl rounded-br-sm border border-cyan-300/20 bg-cyan-400/15 px-3.5 py-2 text-[15px] text-cyan-50"
                : "text-[15px] leading-relaxed text-cyan-100/95 [text-shadow:0_0_18px_rgba(95,208,255,0.15)]"
            }
          >
            {m.content}
            {m.streaming && (
              <span className="ml-0.5 inline-block animate-pulse text-cyan-300">▍</span>
            )}
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}
