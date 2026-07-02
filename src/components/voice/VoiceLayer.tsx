"use client";

import { useEffect, useRef, useState } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { useVoicePrefs, keyLabel, type FeedbackMode } from "@/lib/settings/useVoicePrefs";
import { useChatPrefs } from "@/lib/settings/useChatPrefs";
import { useVoice } from "@/lib/conversation/useVoice";
import { getInputLevel } from "@/lib/audio/stt";
import { InlineMd } from "@/lib/markdown";
import { stripAudioTags } from "@/lib/jova/speechText";
import { Microphone } from "@phosphor-icons/react";

/**
 * The ambient voice surface — how you talk to Jova with the chat closed. Mounted over the scene
 * (a DOM sibling of the canvas). Only the visible chrome hides when the chat is open; the trigger
 * wiring (push-to-talk key, always-listening) keeps running so voice never depends on the chat.
 *
 * Trigger affordance is chosen by triggerMode (orb button / always-on / push-to-talk key). What you
 * SEE during a turn is chosen by feedbackMode. The HUD is redundant with the always-on control's own
 * status line, so it's suppressed when triggerMode is "always".
 */
export function VoiceLayer({ feedback = true }: { feedback?: boolean }) {
  const triggerMode = useVoicePrefs((s) => s.triggerMode);
  const feedbackMode = useVoicePrefs((s) => s.feedbackMode);
  const pttKey = useVoicePrefs((s) => s.pttKey);
  const chatOpen = useJovaStore((s) => s.chatOpen);
  const { toggleHandsFree, pttStart, pttEnd } = useVoice();

  // Push-to-talk: hold the configured key anywhere (but not while typing) to talk.
  useEffect(() => {
    if (triggerMode !== "ptt") return;
    let held = false;
    const typing = () => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
    };
    const down = (e: KeyboardEvent) => {
      if (e.code !== pttKey || e.repeat || held || typing()) return;
      held = true;
      e.preventDefault();
      void pttStart();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== pttKey || !held) return;
      held = false;
      e.preventDefault();
      void pttEnd();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      if (held) void pttEnd();
    };
  }, [triggerMode, pttKey, pttStart, pttEnd]);

  // Always-listening: start continuous capture on entering this mode; stop on leaving/unmount.
  useEffect(() => {
    if (triggerMode !== "always") return;
    if (!useJovaStore.getState().micOn) toggleHandsFree();
    return () => {
      if (useJovaStore.getState().micOn) toggleHandsFree();
    };
  }, [triggerMode, toggleHandsFree]);

  if (chatOpen) return null; // ambient chrome is for when the chat is collapsed

  // The HUD overlaps (and duplicates) the always-on control's status line — hide it in that mode.
  // The Default shell passes feedback=false: its stage captions carry the turn, only triggers render.
  const showFeedback = feedback && !(triggerMode === "always" && feedbackMode === "hud");

  return (
    <>
      {showFeedback && <VoiceFeedback mode={feedbackMode} />}
      {triggerMode === "orb" && <VoiceOrb onClick={() => toggleHandsFree()} />}
      {triggerMode === "ptt" && <PttHint code={pttKey} />}
      {triggerMode === "always" && <AlwaysControl onToggle={() => toggleHandsFree()} />}
    </>
  );
}

/** A ring that breathes with your live mic level — the "she hears you" indicator. */
function MicRing({ size }: { size: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const lvl = getInputLevel();
      const el = ref.current;
      if (el) {
        el.style.transform = `scale(${1 + lvl * 0.7})`;
        el.style.opacity = String(0.3 + lvl * 0.6);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div
      ref={ref}
      style={{ width: size, height: size }}
      className="pointer-events-none rounded-full border-2 border-cyan-300/70 shadow-[0_0_22px_#22d3ee] transition-none"
    />
  );
}

/** Floating mic button (orb trigger mode) — click to toggle hands-free listening. */
function VoiceOrb({ onClick }: { onClick: () => void }) {
  const listening = useJovaStore((s) => s.listening);
  const micOn = useJovaStore((s) => s.micOn);
  return (
    <button
      onClick={onClick}
      title={micOn ? "Stop listening" : "Talk to Jova"}
      className={`fixed bottom-[calc(var(--chrome-bottom,0px)_+_6.5rem)] left-[calc(var(--chrome-left,0px)_+_1rem)] z-30 grid h-14 w-14 place-items-center rounded-full border backdrop-blur-md transition sm:bottom-[calc(var(--chrome-bottom,0px)_+_1.5rem)] sm:left-[calc(var(--chrome-left,0px)_+_1.5rem)] ${
        micOn ? "border-cyan-300/50 bg-cyan-400/25 text-cyan-50 shadow-[0_0_24px_rgba(34,211,238,0.4)]" : "border-white/15 bg-black/40 text-white/70 hover:bg-white/10"
      }`}
    >
      {listening && <span className="absolute inset-0 grid place-items-center"><MicRing size={56} /></span>}
      <Microphone size={22} weight="bold" className="relative" />
    </button>
  );
}

/** Push-to-talk hint (ptt trigger mode) — the actual key handling lives in VoiceLayer. */
function PttHint({ code }: { code: string }) {
  const listening = useJovaStore((s) => s.listening);
  return (
    <div
      className={`fixed bottom-[calc(var(--chrome-bottom,0px)_+_6rem)] left-1/2 z-30 -translate-x-1/2 rounded-full border px-4 py-2 text-sm backdrop-blur-md transition ${
        listening ? "border-cyan-300/50 bg-cyan-400/20 text-cyan-50" : "border-white/15 bg-black/40 text-white/65"
      }`}
    >
      {listening ? (
        <span className="flex items-center gap-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_6px_#67e8f9]" /> Listening…
        </span>
      ) : (
        <span>
          Hold{" "}
          <kbd className="rounded border border-white/25 bg-white/10 px-1.5 py-0.5 text-[11px] font-semibold text-white/80">{keyLabel(code)}</kbd>{" "}
          to talk to Jova
        </span>
      )}
    </div>
  );
}

/** Always-listening presence (always trigger mode) — a mic-reactive ring + pause toggle. */
function AlwaysControl({ onToggle }: { onToggle: () => void }) {
  const listening = useJovaStore((s) => s.listening);
  const micOn = useJovaStore((s) => s.micOn);
  const voiceError = useJovaStore((s) => s.voiceError);
  return (
    <button
      onClick={onToggle}
      title={micOn ? "Pause listening" : "Resume listening"}
      className="fixed bottom-[calc(var(--chrome-bottom,0px)_+_6rem)] left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/15 bg-black/40 px-4 py-2 backdrop-blur-md transition hover:bg-white/10"
    >
      <span className="relative grid h-8 w-8 place-items-center">
        {listening && <span className="absolute inset-0 grid place-items-center"><MicRing size={30} /></span>}
        <span className={`relative h-2.5 w-2.5 rounded-full ${micOn ? "bg-cyan-300 shadow-[0_0_8px_#67e8f9]" : "bg-white/30"}`} />
      </span>
      <span className="text-sm text-white/75">
        {voiceError ? <span className="text-rose-300/80">{voiceError}</span> : micOn ? "Listening — tap to pause" : "Paused — tap to listen"}
      </span>
    </button>
  );
}

function VoiceFeedback({ mode }: { mode: FeedbackMode }) {
  if (mode === "captions") return <Captions />;
  if (mode === "hud") return <Hud />;
  return null; // "wisp" — pure presence, the wisp animation is the only feedback
}

/** Floating subtitles over the scene: your live words + her reply, shown during a turn then faded. */
function Captions() {
  const sttPartial = useJovaStore((s) => s.sttPartial);
  const listening = useJovaStore((s) => s.listening);
  const thinking = useJovaStore((s) => s.thinking);
  const speaking = useJovaStore((s) => s.wispState === "speaking");
  // follow the ACTIVE thread (voice routes there now) so captions match whoever you're talking to
  const activeMsgs = useJovaStore((s) => (s.activeSessionId ? s.messages[s.activeSessionId] : undefined));

  const showAudioTags = useChatPrefs((s) => s.showAudioTags);
  const msgs = activeMsgs ?? [];
  const lastUser = [...msgs].reverse().find((m) => m.role === "user")?.content ?? "";
  const lastReply = [...msgs].reverse().find((m) => m.role === "assistant" && m.content.trim())?.content ?? "";
  const lastJova = showAudioTags ? lastReply : stripAudioTags(lastReply);

  // keep captions up briefly after the turn goes quiet, then fade out
  const active = listening || thinking || speaking;
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (active) {
      setVisible(true);
      return;
    }
    const t = window.setTimeout(() => setVisible(false), 4500);
    return () => window.clearTimeout(t);
  }, [active]);

  if (!visible && !active) return null;
  const youText = listening ? sttPartial : lastUser;

  return (
    <div className="pointer-events-none fixed bottom-40 left-1/2 z-20 flex w-[min(680px,92vw)] -translate-x-1/2 flex-col items-center gap-2 text-center">
      {youText && (
        <div className="max-w-full rounded-2xl bg-black/35 px-3 py-1.5 text-[13px] text-white/70 backdrop-blur-sm">
          <span className="mr-1.5 text-[10px] uppercase tracking-wider text-white/35">you</span>
          <InlineMd text={youText} />
        </div>
      )}
      {lastJova && (
        <div className="max-w-full rounded-2xl bg-cyan-500/10 px-3.5 py-2 text-[15px] text-cyan-50 shadow-[0_0_30px_rgba(34,211,238,0.12)] backdrop-blur-sm">
          <InlineMd text={lastJova} />
        </div>
      )}
    </div>
  );
}

/** Minimal status line near the chat: listening / thinking / speaking. */
function Hud() {
  const listening = useJovaStore((s) => s.listening);
  const thinking = useJovaStore((s) => s.thinking);
  const speaking = useJovaStore((s) => s.wispState === "speaking");
  const label = listening ? "Listening" : thinking ? "Thinking" : speaking ? "Speaking" : "";
  if (!label) return null;
  return (
    <div className="pointer-events-none fixed bottom-40 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3.5 py-1.5 text-xs text-white/75 backdrop-blur-md">
      <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-300 shadow-[0_0_6px_#67e8f9]" />
      {label}…
    </div>
  );
}
