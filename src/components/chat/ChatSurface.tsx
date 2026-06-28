"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { useSettingsStore } from "@/lib/settings/useSettingsStore";
import { useVoice } from "@/lib/conversation/useVoice";
import { MessageList } from "./MessageList";
import { Composer, fileToDataUrl, MAX_ATTACH_BYTES } from "./Composer";
import { ConversationRail } from "./ConversationRail";

const DEFAULT_H = 440;
const MIN_H = 260;

/**
 * The chat: a conversations rail (one row per person) + the active thread. Voice/mic (TTS/STT) show
 * ONLY for Jova; every other agent is text-only. Drag the top handle to resize the height. Dream
 * messages render as a 💭 card; attached images render inline.
 */
export function ChatSurface() {
  const chatOpen = useJovaStore((s) => s.chatOpen);
  const setChatOpen = useJovaStore((s) => s.setChatOpen);
  const voiceOn = useJovaStore((s) => s.voiceOn);
  const micOn = useJovaStore((s) => s.micOn);
  const listening = useJovaStore((s) => s.listening);
  const { toggleSpeaker, toggleHandsFree } = useVoice();
  const activeId = useJovaStore((s) => s.activeSessionId);
  const closeSession = useJovaStore((s) => s.closeSession);
  const totalUnread = useJovaStore((s) => Object.values(s.unread).reduce((a, b) => a + b, 0));
  const target = useJovaStore((s) => s.sessions.find((x) => x.id === s.activeSessionId)?.target ?? null);
  const openAgent = useSettingsStore((s) => s.openAgent);
  const isJova = !target;
  const accent = target?.color ?? "#67e8f9";
  // a real team agent (not Jova, not the Nexus orchestrator) can deep-link to its settings screen
  const editableAgent = target && target.teamId !== "nexus";

  const addPendingAttachments = useJovaStore((s) => s.addPendingAttachments);

  const [height, setHeight] = useState(DEFAULT_H);
  const [railOpen, setRailOpen] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const drag = useRef<{ startY: number; startH: number } | null>(null);

  // drop images/files anywhere on the chat → stage them as attachments (images go inline to the
  // vision model; other files are uploaded to her vault). Reads to data URLs so they survive the BFF.
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.size <= MAX_ATTACH_BYTES);
    if (!files.length) return;
    const atts = await Promise.all(
      files.map(async (f) => ({
        kind: f.type.startsWith("image/") ? ("image" as const) : ("file" as const),
        name: f.name,
        mime: f.type || "application/octet-stream",
        dataUrl: await fileToDataUrl(f),
      })),
    );
    addPendingAttachments(atts);
  };

  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId); // still get move/up/cancel if the pointer leaves the window
    drag.current = { startY: e.clientY, startH: height };
    document.body.style.userSelect = "none";
    const move = (ev: PointerEvent) => {
      if (!drag.current) return;
      const dy = drag.current.startY - ev.clientY; // dragging up = taller
      setHeight(Math.min(Math.max(drag.current.startH + dy, MIN_H), window.innerHeight * 0.9));
    };
    const end = () => {
      drag.current = null;
      document.body.style.userSelect = "";
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  };

  // keep height in sync with the CSS cap so a later drag doesn't snap from a stale value
  useEffect(() => {
    const onResize = () => setHeight((h) => Math.min(h, window.innerHeight * 0.9));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // collapse the conversations rail by default on small screens — leaves the thread full-width
  useEffect(() => {
    if (window.matchMedia("(max-width: 640px)").matches) setRailOpen(false);
  }, []);

  if (!chatOpen) {
    return (
      <button
        onClick={() => setChatOpen(true)}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-5 py-2.5 text-sm text-cyan-50 backdrop-blur-md transition hover:bg-cyan-400/20"
      >
        💬 Chat
        {totalUnread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-cyan-400 px-1 text-[10px] font-semibold text-black shadow-[0_0_8px_#67e8f9]">
            {totalUnread}
          </span>
        )}
      </button>
    );
  }

  return (
    <div
      data-chat-pane
      style={{ height }}
      className="fixed bottom-5 left-1/2 flex w-[min(760px,96vw)] max-h-[90vh] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-black/40 shadow-[0_0_60px_rgba(0,180,255,0.08)] backdrop-blur-xl animate-[fadein_400ms_ease]"
    >
      {/* drag-to-resize handle (vertical only) */}
      <div onPointerDown={onHandleDown} className="group flex h-3 shrink-0 cursor-ns-resize touch-none items-center justify-center" title="Drag to resize">
        <div className="h-1 w-10 rounded-full bg-white/15 transition group-hover:bg-white/35" />
      </div>

      <div className="flex min-h-0 flex-1">
        {railOpen && <ConversationRail />}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <button
                onClick={() => setRailOpen((v) => !v)}
                title={railOpen ? "Hide conversations" : "Show conversations"}
                className="shrink-0 rounded-lg px-1.5 py-1 text-white/45 transition hover:bg-white/10 hover:text-white/80"
              >
                ☰
              </button>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: accent, boxShadow: `0 0 6px ${accent}` }} />
              {editableAgent ? (
                <button
                  onClick={() => openAgent(target.teamId, target.agentId)}
                  title="Open this agent's settings"
                  className="truncate text-sm font-semibold transition hover:underline"
                  style={{ color: accent }}
                >
                  {`${target.teamName} - ${target.label}`}
                </button>
              ) : (
                <span className="truncate text-sm font-semibold" style={{ color: target ? accent : "#a5f3fc" }}>
                  {target ? `${target.teamName} - ${target.label}` : "Jova"}
                </span>
              )}
              {!isJova && <span className="shrink-0 text-[10px] text-white/35">text</span>}
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {isJova && (
                <>
                  <IconToggle
                    on={micOn}
                    onClick={toggleHandsFree}
                    label="Hands-free mic"
                    hint="Listen continuously and auto-send each utterance"
                    pulse={micOn && listening}
                  >
                    🎤
                  </IconToggle>
                  <IconToggle on={voiceOn} onClick={toggleSpeaker} label="Voice" hint="Jova speaks her replies aloud">
                    🔊
                  </IconToggle>
                </>
              )}
              {!isJova && activeId && (
                <button
                  onClick={() => closeSession(activeId)}
                  title="Close this chat"
                  className="rounded-lg px-2 py-1 text-white/45 transition hover:bg-white/10 hover:text-rose-300"
                >
                  ✕
                </button>
              )}
              <button
                onClick={() => setChatOpen(false)}
                title="Hide"
                className="rounded-lg px-2 py-1 text-white/50 transition hover:bg-white/10 hover:text-white/80"
              >
                ▾
              </button>
            </div>
          </div>

          <div
            className="relative min-h-0 flex-1 overflow-hidden"
            onDragOver={(e) => {
              e.preventDefault();
              if (!dragOver) setDragOver(true);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false);
            }}
            onDrop={onDrop}
          >
            {dragOver && (
              <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-cyan-300/60 bg-cyan-400/10 backdrop-blur-sm">
                <span className="rounded-lg bg-black/50 px-3 py-1.5 text-sm text-cyan-100">Drop images or files for {target ? target.label : "Jova"}</span>
              </div>
            )}
            <MessageList />
          </div>
          <Composer />
        </div>
      </div>
    </div>
  );
}

function IconToggle({
  on,
  onClick,
  label,
  hint,
  pulse = false,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  hint: string;
  pulse?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={`${label} — ${hint}`}
      className={`rounded-lg px-2 py-1 text-sm transition ${pulse ? "animate-pulse" : ""} ${
        on ? "border border-cyan-300/30 bg-cyan-400/25 text-cyan-50" : "border border-transparent text-white/45 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}
