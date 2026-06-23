"use client";

import { useCallback } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { streamChat } from "@/lib/jova/client";
import { ARRIVAL } from "@/lib/jova/mock";
import { setSpeaking } from "@/lib/audio/amplitude";
import { useHistoryStore } from "@/lib/logs/useHistoryStore";
import { useLogStore } from "@/lib/logs/useLogStore";

/**
 * Orchestrates a full turn: user message -> stream Jova's reply -> drive wisp state + mood.
 * Reads/writes the store via getState() so sending doesn't churn React renders on every token
 * (only the message content updates do, which is what we want).
 */
export function useConversation() {
  const send = useCallback(async (text: string, opts?: { arrival?: boolean; image?: string; file?: { name: string; mime: string; dataUrl: string } }) => {
    const arrival = opts?.arrival ?? false;
    const image = opts?.image;
    const file = opts?.file;
    const trimmed = text.trim();
    if (!arrival && !trimmed && !image && !file) return;

    const store = useJovaStore.getState();
    store.touch();

    const sessionId = store.activeSessionId ?? store.createSession();
    // who this thread is with, for the durable chat-history log
    const sess = useJovaStore.getState().sessions.find((x) => x.id === sessionId);
    const who = sess?.target ? `${sess.target.teamName} - ${sess.target.label}` : "Jova";
    const teamId = sess?.target?.teamId;
    const agentId = sess?.target?.agentId;

    if (!arrival) {
      store.addMessage(sessionId, {
        id: crypto.randomUUID(),
        role: "user",
        content: trimmed,
        createdAt: Date.now(),
        image,
        file: file ? { name: file.name } : undefined,
      });
      useHistoryStore.getState().record({
        ts: Date.now(),
        sessionId,
        who,
        teamId,
        agentId,
        role: "user",
        content: trimmed || (image ? "[image attached]" : file ? `[file: ${file.name}]` : ""),
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
        image,
        file,
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
      const finalMsg = s.messages[sessionId]?.find((m) => m.id === assistantId);
      s.finalizeMessage(sessionId, assistantId);
      // durable history (survives closeSession). skip the unprompted arrival greeting + empty bodies.
      if (!arrival && finalMsg?.content?.trim()) {
        useHistoryStore.getState().record({
          ts: Date.now(),
          sessionId,
          who,
          teamId,
          agentId,
          role: "assistant",
          content: finalMsg.content,
          reasoning: finalMsg.reasoning,
        });
      }
      useLogStore.getState().addLog({ kind: "server", source: "/api/chat", message: "POST /api/chat → 200" });
      setSpeaking(false);
      // back to present (hovering near) after speaking; idle timer takes it from here
      s.setWispState("present");
      s.touch();
    }
  }, []);

  return { send };
}
