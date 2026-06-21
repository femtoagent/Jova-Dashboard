"use client";

import { useCallback } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { streamChat } from "@/lib/jova/client";
import { ARRIVAL } from "@/lib/jova/mock";
import { setSpeaking } from "@/lib/audio/amplitude";

/**
 * Orchestrates a full turn: user message -> stream Jova's reply -> drive wisp state + mood.
 * Reads/writes the store via getState() so sending doesn't churn React renders on every token
 * (only the message content updates do, which is what we want).
 */
export function useConversation() {
  const send = useCallback(async (text: string, opts?: { arrival?: boolean; image?: string }) => {
    const arrival = opts?.arrival ?? false;
    const image = opts?.image;
    const trimmed = text.trim();
    if (!arrival && !trimmed && !image) return;

    const store = useJovaStore.getState();
    store.touch();

    const sessionId = store.activeSessionId ?? store.createSession();

    if (!arrival) {
      store.addMessage(sessionId, {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
        image,
      });
    }

    const assistantId = crypto.randomUUID();
    store.addMessage(sessionId, {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: Date.now(),
      streaming: true,
    });

    let speakingStarted = false;
    try {
      await streamChat({
        sessionId,
        message: arrival ? ARRIVAL : trimmed,
        onEvent: (e) => {
          const s = useJovaStore.getState();
          switch (e.type) {
            case "reasoning":
              s.setReasoning(sessionId, assistantId, e.text);
              break;
            case "token":
              if (!speakingStarted) {
                speakingStarted = true;
                s.setWispState("speaking");
                setSpeaking(true);
              }
              s.appendToken(sessionId, assistantId, e.text);
              break;
            case "mood":
              s.mergeMood(e.mood);
              break;
            case "error":
              s.appendToken(sessionId, assistantId, "…I lost the thread for a second there.");
              break;
            case "done":
              break;
          }
        },
      });
    } finally {
      const s = useJovaStore.getState();
      s.finalizeMessage(sessionId, assistantId);
      setSpeaking(false);
      // back to present (hovering near) after speaking; idle timer takes it from here
      s.setWispState("present");
      s.touch();
    }
  }, []);

  return { send };
}
