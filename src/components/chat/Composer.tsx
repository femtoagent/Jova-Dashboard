"use client";

import { useState } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { useConversation } from "@/lib/conversation/useConversation";

export function Composer() {
  const [text, setText] = useState("");
  const { send } = useConversation();
  const micOn = useJovaStore((s) => s.micOn);

  const submit = () => {
    const t = text.trim();
    if (!t) return;
    setText("");
    void send(t);
  };

  return (
    <div className="flex items-end gap-2 px-3 pb-3 pt-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder={micOn ? "Listening… (mic stub) — or just type" : "Talk to Jova…"}
        className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-white/10 bg-white/5 px-3.5 py-2.5 text-[15px] text-white outline-none placeholder:text-white/35 focus:border-cyan-300/40 focus:bg-white/[0.07]"
      />
      <button
        onClick={submit}
        className="h-[44px] shrink-0 rounded-xl border border-cyan-300/30 bg-cyan-400/20 px-4 text-sm font-medium text-cyan-50 transition hover:bg-cyan-400/30"
      >
        Send
      </button>
    </div>
  );
}
