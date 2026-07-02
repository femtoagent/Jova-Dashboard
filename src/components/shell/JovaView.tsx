"use client";

import { useEffect, useRef, useState } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { useChatPrefs } from "@/lib/settings/useChatPrefs";
import { stripAudioTags } from "@/lib/jova/speechText";
import { InlineMd } from "@/lib/markdown";
import { JovaPresence } from "@/components/stage/JovaPresence";
import { ConversationPane } from "./ConversationPane";
// the stage reuses the full chat composer so nothing (attachments, PTT, hands-free) is lost
import { Composer } from "@/components/chat/Composer";
import { ChatsCircle } from "@phosphor-icons/react";

/**
 * The Jova view — ONE surface, two states (the focus swap):
 *  - STAGE (chatOpen=false): she is the screen. Fully animated while she speaks, her words as
 *    live captions beneath her, a slim composer at the bottom. Focusing the composer dims her.
 *  - CONVERSATION (chatOpen=true): the full transcript column (rail, markdown, reactions,
 *    attachments); she recedes to a pulsing dot in the header so typing gets the space.
 * The existing chatOpen flag IS the mode, so every openChatWith/openJovaChat call in the app
 * lands in the right state for free.
 */
export function JovaView() {
  const chatOpen = useJovaStore((s) => s.chatOpen);
  const setChatOpen = useJovaStore((s) => s.setChatOpen);
  const totalUnread = useJovaStore((s) => Object.values(s.unread).reduce((a, b) => a + b, 0));
  // press-and-release must BOTH land on the backdrop to count as a click-off (so a drag that
  // starts inside the panel and ends outside doesn't dismiss it)
  const scrimDown = useRef(false);

  return (
    <div data-view="jova" className="relative h-full w-full overflow-hidden bg-void">
      <StageBackdrop />

      {chatOpen ? (
        <div
          className="absolute inset-0 flex justify-center animate-[fade_300ms_ease] sm:p-5"
          onMouseDown={(e) => {
            scrimDown.current = e.target === e.currentTarget;
          }}
          onMouseUp={(e) => {
            if (scrimDown.current && e.target === e.currentTarget) setChatOpen(false);
            scrimDown.current = false;
          }}
        >
          <div className="flex h-full w-full max-w-[960px] flex-col overflow-hidden border-line bg-panel/90 backdrop-blur-sm sm:rounded-2xl sm:border">
            <ConversationPane onMinimize={() => setChatOpen(false)} />
          </div>
        </div>
      ) : (
        <div className="group absolute inset-0 animate-[fade_300ms_ease]">
          {/* she dims and steps back while you're typing in the stage composer */}
          <div className="absolute inset-x-0 top-0 bottom-40 grid place-items-center transition-all duration-500 group-has-[textarea:focus]:scale-90 group-has-[textarea:focus]:opacity-25">
            <JovaPresence />
          </div>

          <StageCaptions />

          <button
            onClick={() => setChatOpen(true)}
            title="Open the conversation"
            className="absolute right-4 top-4 flex items-center gap-2 rounded-full border border-line bg-panel/70 px-3.5 py-2 text-[12px] text-mist backdrop-blur-md transition hover:bg-raise hover:text-bright"
          >
            <ChatsCircle size={15} weight="bold" />
            <span className="hidden sm:inline">Conversation</span>
            {totalUnread > 0 && (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-jova px-1 text-[9px] font-bold text-black">
                {totalUnread}
              </span>
            )}
          </button>

          {/* slim stage composer — full features (attachments, hold-to-talk, stt preview) */}
          <div className="absolute bottom-4 left-1/2 w-[min(700px,94vw)] -translate-x-1/2 rounded-2xl border border-line bg-panel/80 backdrop-blur-md">
            <Composer />
          </div>
        </div>
      )}
    </div>
  );
}

/** The void: a still deep gradient, one slow aurora, a faint dot starfield. Transform-only. */
export function StageBackdrop({ dim = false }: { dim?: boolean }) {
  return (
    <div aria-hidden className={`absolute inset-0 transition-opacity duration-700 ${dim ? "opacity-40" : ""}`}>
      <div
        className="absolute inset-0"
        style={{ background: "radial-gradient(120% 90% at 50% 110%, #0b1424 0%, #080d16 45%, #07080c 80%)" }}
      />
      <div
        className="motion-safe-anim absolute inset-[-12%]"
        style={{
          background:
            "radial-gradient(50% 36% at 30% 28%, rgba(48,140,210,0.12) 0%, transparent 70%), radial-gradient(44% 34% at 72% 64%, rgba(76,201,255,0.06) 0%, transparent 70%)",
          animation: "aurora-drift 28s ease-in-out infinite",
        }}
      />
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage:
            "radial-gradient(rgba(190,230,255,0.32) 0.6px, transparent 0.6px), radial-gradient(rgba(190,230,255,0.14) 0.5px, transparent 0.5px)",
          backgroundSize: "190px 190px, 97px 97px",
          backgroundPosition: "12px 8px, 51px 63px",
        }}
      />
    </div>
  );
}

/**
 * Her words, live on the stage: typing dots while she thinks, the streaming reply while she
 * speaks (audio tags stripped per chat prefs), your interim transcript while she's listening.
 * Long replies clamp to the last few lines with a soft mask; everything fades a beat after
 * the turn settles.
 */
function StageCaptions() {
  const thinking = useJovaStore((s) => s.thinking);
  const listening = useJovaStore((s) => s.listening);
  const sttPartial = useJovaStore((s) => s.sttPartial);
  const speaking = useJovaStore((s) => s.wispState === "speaking");
  const activeMsgs = useJovaStore((s) => (s.activeSessionId ? s.messages[s.activeSessionId] : undefined));
  const showAudioTags = useChatPrefs((s) => s.showAudioTags);

  const msgs = activeMsgs ?? [];
  const last = [...msgs].reverse().find((m) => m.role === "assistant");
  const streaming = !!last?.streaming;
  const raw = last?.content ?? "";
  const text = showAudioTags ? raw : stripAudioTags(raw);

  const active = thinking || speaking || streaming || listening;
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (active) {
      setVisible(true);
      return;
    }
    const t = window.setTimeout(() => setVisible(false), 5000);
    return () => window.clearTimeout(t);
  }, [active]);

  if (!visible && !active) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-28 flex flex-col items-center gap-2 px-4 transition-opacity duration-700">
      {listening && (
        <div className="max-w-[560px] rounded-full bg-panel/70 px-3.5 py-1.5 text-[13px] text-mist backdrop-blur-sm">
          <span className="mr-1.5 text-[10px] uppercase tracking-wider text-faint">you</span>
          {sttPartial || "Listening…"}
        </div>
      )}
      {thinking && !text && (
        <div className="flex items-center gap-1.5 rounded-full bg-panel/70 px-4 py-2 backdrop-blur-sm">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="motion-safe-anim h-1.5 w-1.5 rounded-full bg-jova"
              style={{ animation: `typing-bounce 1.2s ease-in-out ${i * 0.15}s infinite` }}
            />
          ))}
        </div>
      )}
      {text && (
        <div
          className="flex max-h-32 w-[min(660px,92vw)] flex-col justify-end overflow-hidden text-center text-[16px] leading-relaxed text-bright/90 [text-shadow:0_1px_12px_rgba(4,7,12,0.9)]"
          style={{ maskImage: "linear-gradient(to bottom, transparent 0%, black 30%)", WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 30%)" }}
        >
          <InlineMd text={text} />
        </div>
      )}
    </div>
  );
}
