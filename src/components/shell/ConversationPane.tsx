"use client";

import { useEffect, useState } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { useSettingsStore } from "@/lib/settings/useSettingsStore";
import { useVoice } from "@/lib/conversation/useVoice";
import { useAgentVoices } from "@/lib/settings/useAgentVoices";
import { useVoicePrefs } from "@/lib/settings/useVoicePrefs";
import { unlockAudio, setOutputDevice, stopSpeaking } from "@/lib/audio/tts";
import { characterByName } from "@/lib/agents/characters";
import { MessageList } from "@/components/chat/MessageList";
import { Composer, fileToDataUrl, MAX_ATTACH_BYTES } from "@/components/chat/Composer";
import { ConversationRail } from "@/components/chat/ConversationRail";
import { CornersIn, List, Microphone, SpeakerHigh, X } from "@phosphor-icons/react";

/**
 * The conversation surface of the Default shell — every chat feature (rail, threads, voice
 * toggles, reactions, attachments, drag-drop) in an EMBEDDABLE column: the Jova view fills the
 * screen with it, the Network view docks it in the detail column (`compact`). The classic 3D
 * mode keeps its own floating ChatSurface; both share the same inner components and store.
 */
export function ConversationPane({ onMinimize, compact = false }: { onMinimize?: () => void; compact?: boolean }) {
  const voiceOn = useJovaStore((s) => s.voiceOn);
  const micOn = useJovaStore((s) => s.micOn);
  const listening = useJovaStore((s) => s.listening);
  const wispState = useJovaStore((s) => s.wispState);
  const { toggleSpeaker, toggleHandsFree } = useVoice();
  const activeId = useJovaStore((s) => s.activeSessionId);
  const closeSession = useJovaStore((s) => s.closeSession);
  const target = useJovaStore((s) => s.sessions.find((x) => x.id === s.activeSessionId)?.target ?? null);
  const openAgent = useSettingsStore((s) => s.openAgent);
  const addPendingAttachments = useJovaStore((s) => s.addPendingAttachments);

  const isJova = !target;
  const accent = target?.color ?? "#4cc9ff";
  const editableAgent = target && target.teamId !== "nexus" && target.teamId !== "character";
  const targetTitle = target ? (target.label ? `${target.teamName} - ${target.label}` : target.teamName) : "Jova";
  const isCharacter = !!target && target.teamId === "character";
  const charVoice = useAgentVoices((s) => (target ? s.roster.find((r) => r.id === target.agentId) : undefined));
  const charSpeakOn = !!charVoice?.enabled;
  const toggleCharSpeak = () => {
    if (!target) return;
    const av = useAgentVoices.getState();
    if (av.roster.find((r) => r.id === target.agentId)?.enabled) {
      av.setEnabled(target.agentId, false);
      stopSpeaking();
    } else {
      const meta = characterByName(target.teamName);
      av.ensureAgent(target.agentId, meta?.display ?? target.teamName, meta?.voice);
      unlockAudio();
      setOutputDevice(useVoicePrefs.getState().outputDeviceId);
      av.setEnabled(target.agentId, true);
    }
  };

  const [railOpen, setRailOpen] = useState(!compact);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (compact || window.matchMedia("(max-width: 640px)").matches) setRailOpen(false);
  }, [compact]);

  // drop images/files anywhere on the pane → stage them as attachments
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

  const speaking = wispState === "speaking";

  return (
    <div data-conversation className="flex h-full min-h-0 w-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {!compact && (
            <button
              onClick={() => setRailOpen((v) => !v)}
              title={railOpen ? "Hide conversations" : "Show conversations"}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-faint transition hover:bg-raise hover:text-mist"
            >
              <List size={16} weight="bold" />
            </button>
          )}
          {/* her live dot — pulses while she speaks, so she's never fully gone from the chat */}
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${isJova && speaking ? "animate-pulse" : ""}`}
            style={{ background: accent, boxShadow: isJova && speaking ? `0 0 10px ${accent}` : `0 0 5px ${accent}66` }}
          />
          {editableAgent ? (
            <button
              onClick={() => openAgent(target.teamId, target.agentId)}
              title="Open this agent's settings"
              className="truncate text-sm font-semibold transition hover:underline"
              style={{ color: accent }}
            >
              {targetTitle}
            </button>
          ) : (
            <span className="truncate text-sm font-semibold" style={{ color: isJova ? "#bfe9ff" : accent }}>
              {targetTitle}
            </span>
          )}
          {target?.team && (
            <span className="shrink-0 rounded-full border border-line bg-raise px-1.5 py-0.5 text-[10px] text-mist" title={`Team: ${target.team}`}>
              {target.team}
            </span>
          )}
          {!isJova && !isCharacter && <span className="shrink-0 text-[10px] text-faint">text</span>}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {(isJova || isCharacter) && (
            <>
              <IconToggle
                on={micOn}
                onClick={() => toggleHandsFree()}
                label="Hands-free mic"
                hint={isJova ? "Listen continuously and auto-send each utterance" : `Talk to ${target?.teamName} by voice`}
                pulse={micOn && listening}
              >
                <Microphone size={15} weight="bold" />
              </IconToggle>
              <IconToggle
                on={isJova ? voiceOn : charSpeakOn}
                onClick={isJova ? toggleSpeaker : toggleCharSpeak}
                label="Voice"
                hint={`${isJova ? "Jova" : target?.teamName} speaks replies aloud`}
              >
                <SpeakerHigh size={15} weight="bold" />
              </IconToggle>
            </>
          )}
          {!isJova && activeId && (
            <button
              onClick={() => closeSession(activeId)}
              title="Close this chat"
              className="grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-raise hover:text-rose-300"
            >
              <X size={15} weight="bold" />
            </button>
          )}
          {onMinimize && (
            <button
              onClick={onMinimize}
              title="Back to the stage"
              className="grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-raise hover:text-mist"
            >
              <CornersIn size={15} weight="bold" />
            </button>
          )}
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {railOpen && !compact && (
          <>
            <button
              aria-label="Close conversations"
              onClick={() => setRailOpen(false)}
              className="absolute inset-0 z-10 bg-black/50 sm:hidden"
            />
            <div className="absolute inset-y-0 left-0 z-20 flex bg-panel shadow-[8px_0_30px_rgba(0,0,0,0.45)] sm:static sm:z-auto sm:bg-transparent sm:shadow-none">
              <ConversationRail />
            </div>
          </>
        )}

        <div
          className="relative flex min-w-0 flex-1 flex-col"
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
            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center border-2 border-dashed border-jova/60 bg-jova/10 backdrop-blur-sm">
              <span className="rounded-lg bg-void/70 px-3 py-1.5 text-sm text-bright">Drop images or files for {targetTitle}</span>
            </div>
          )}
          <div className="relative min-h-0 flex-1 overflow-hidden">
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
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={`${label} — ${hint}`}
      className={`grid h-8 w-8 place-items-center rounded-lg transition ${pulse ? "animate-pulse" : ""} ${
        on ? "border border-jova/40 bg-jova/20 text-bright" : "border border-transparent text-faint hover:bg-raise"
      }`}
    >
      {children}
    </button>
  );
}
