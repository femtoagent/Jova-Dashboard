"use client";

import { useCallback, useRef } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { useVoicePrefs } from "@/lib/settings/useVoicePrefs";
import { useConversation } from "./useConversation";
import { startStt, stopStt, flushPtt, isListening } from "@/lib/audio/stt";
import { stopSpeaking, unlockAudio, setOutputDevice } from "@/lib/audio/tts";

/** Apply the saved output device + return the saved input device for getUserMedia. */
function audioPrefs() {
  const p = useVoicePrefs.getState();
  setOutputDevice(p.outputDeviceId);
  return { inputDeviceId: p.inputDeviceId };
}

/**
 * Decide where the upcoming utterance goes, re-derived at speak time (not baked at mic-start): voice
 * follows whoever's thread is active — so if you were chatting a character and minimize the chat, your
 * voice still talks to THEM. Only fall back to Jova when the active thread is hers/targetless or there's
 * no active thread at all. Re-deriving each utterance means switching threads mid-listen routes right.
 */
function routeUtterance() {
  const st = useJovaStore.getState();
  const active = st.sessions.find((s) => s.id === st.activeSessionId);
  if (!active?.target) st.ensureJovaActive();
}

/**
 * Voice controls shared by the chat header (🔊 speaker, 🎤 hands-free) and the composer (push-to-talk).
 *
 * - Speaker: toggles TTS. Unlocks the AudioContext on the click (autoplay policy) and stops any
 *   in-flight speech when turned off.
 * - Hands-free: continuous Deepgram STT; each end-of-utterance auto-sends. Talking barges in over her.
 * - Push-to-talk: hold to capture one utterance, release to send. Won't fight hands-free if it's on.
 *
 * STT is a singleton (one mic session at a time), so starting any mode stops a prior one cleanly.
 */
export function useVoice() {
  const { send } = useConversation();
  const pttHeld = useRef(false);
  const pttFinishing = useRef(false);

  const toggleSpeaker = useCallback(() => {
    const s = useJovaStore.getState();
    unlockAudio(); // this click is the user gesture that satisfies autoplay
    setOutputDevice(useVoicePrefs.getState().outputDeviceId);
    if (s.voiceOn) stopSpeaking(); // turning off → go quiet immediately
    s.toggleVoice();
  }, []);

  const startHandsFree = useCallback(async () => {
    const s = useJovaStore.getState();
    unlockAudio();
    stopSpeaking(); // barge-in: don't talk over the listener
    s.setVoiceError(null);
    await startStt(
      "continuous",
      {
        onOpen: () => useJovaStore.getState().setListening(true),
        onPartial: (t) => useJovaStore.getState().setSttPartial(t),
        onFinal: (t) => {
          stopSpeaking(); // user just spoke → cut any reply still playing
          routeUtterance();
          void send(t);
        },
        onError: (msg) => {
          const st = useJovaStore.getState();
          st.setVoiceError(msg);
          st.setListening(false);
          if (st.micOn) st.toggleMic(); // surface the failure in the toggle
        },
        onClose: () => useJovaStore.getState().setListening(false),
      },
      audioPrefs(),
    );
  }, [send]);

  const toggleHandsFree = useCallback(() => {
    const s = useJovaStore.getState();
    if (s.micOn) {
      s.toggleMic();
      stopStt();
      s.setListening(false);
      s.setSttPartial("");
    } else {
      s.toggleMic();
      void startHandsFree();
    }
  }, [startHandsFree]);

  const finishPtt = useCallback(async () => {
    if (pttFinishing.current) return;
    pttFinishing.current = true;
    const s = useJovaStore.getState();
    s.setListening(false);
    s.setSttPartial("");
    await flushPtt(); // emits onFinal → send, then stops the mic
    pttFinishing.current = false;
  }, []);

  const pttStart = useCallback(async () => {
    const s = useJovaStore.getState();
    if (s.micOn) return; // hands-free already owns the mic
    pttHeld.current = true;
    unlockAudio();
    stopSpeaking();
    s.setVoiceError(null);
    await startStt(
      "ptt",
      {
        onOpen: () => {
          useJovaStore.getState().setListening(true);
          if (!pttHeld.current) void finishPtt(); // released before the socket opened
        },
        onPartial: (t) => useJovaStore.getState().setSttPartial(t),
        onFinal: (t) => {
          routeUtterance();
          void send(t);
        },
        onError: (msg) => {
          const st = useJovaStore.getState();
          st.setVoiceError(msg);
          st.setListening(false);
          pttHeld.current = false;
        },
        onClose: () => useJovaStore.getState().setListening(false),
      },
      audioPrefs(),
    );
  }, [send, finishPtt]);

  const pttEnd = useCallback(async () => {
    pttHeld.current = false;
    if (isListening()) await finishPtt();
    // else: not open yet — onOpen will finish once it sees pttHeld === false
  }, [finishPtt]);

  return { toggleSpeaker, toggleHandsFree, pttStart, pttEnd };
}
