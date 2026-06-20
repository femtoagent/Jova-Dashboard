"use client";

import type { ReactNode } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { MessageList } from "./MessageList";
import { Composer } from "./Composer";
import { SessionSwitcher } from "./SessionSwitcher";

/** The in-world chat: glassy, semi-transparent, materializes from the dark near the wisp. */
export function ChatSurface() {
  const chatOpen = useJovaStore((s) => s.chatOpen);
  const setChatOpen = useJovaStore((s) => s.setChatOpen);
  const voiceOn = useJovaStore((s) => s.voiceOn);
  const micOn = useJovaStore((s) => s.micOn);
  const toggleVoice = useJovaStore((s) => s.toggleVoice);
  const toggleMic = useJovaStore((s) => s.toggleMic);

  if (!chatOpen) {
    return (
      <button
        onClick={() => setChatOpen(true)}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-5 py-2.5 text-sm text-cyan-50 backdrop-blur-md transition hover:bg-cyan-400/20"
      >
        Talk to Jova
      </button>
    );
  }

  return (
    <div className="fixed bottom-5 left-1/2 w-[min(680px,94vw)] -translate-x-1/2 overflow-hidden rounded-2xl border border-white/10 bg-black/35 shadow-[0_0_60px_rgba(0,180,255,0.08)] backdrop-blur-xl animate-[fadein_400ms_ease]">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <SessionSwitcher />
        <div className="flex items-center gap-1.5">
          <IconToggle on={micOn} onClick={toggleMic} label="Mic (STT)" hint="wired in Phase 4">
            🎤
          </IconToggle>
          <IconToggle on={voiceOn} onClick={toggleVoice} label="Voice (TTS)" hint="wired in Phase 4">
            🔊
          </IconToggle>
          <button
            onClick={() => setChatOpen(false)}
            title="Hide"
            className="rounded-lg px-2 py-1 text-white/50 hover:bg-white/10 hover:text-white/80"
          >
            ▾
          </button>
        </div>
      </div>
      <MessageList />
      <Composer />
    </div>
  );
}

function IconToggle({
  on,
  onClick,
  label,
  hint,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={`${label} — ${hint}`}
      className={`rounded-lg px-2 py-1 text-sm transition ${
        on
          ? "border border-cyan-300/30 bg-cyan-400/25 text-cyan-50"
          : "border border-transparent text-white/45 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}
