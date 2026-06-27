"use client";

import { useCallback } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { useDocStore } from "@/lib/docs/useDocStore";
import { useChatPrefs } from "@/lib/settings/useChatPrefs";
import { streamChat } from "@/lib/jova/client";
import { ARRIVAL } from "@/lib/jova/mock";
import type { OutgoingAttachment, ReactionTurnConfig } from "@/lib/jova/types";
import { setSpeaking } from "@/lib/audio/amplitude";
import { useHistoryStore } from "@/lib/logs/useHistoryStore";
import { useLogStore } from "@/lib/logs/useLogStore";

/**
 * Orchestrates a full turn: user message -> stream Jova's reply -> drive wisp state + mood.
 * Reads/writes the store via getState() so sending doesn't churn React renders on every token
 * (only the message content updates do, which is what we want).
 */
export function useConversation() {
  const send = useCallback(async (text: string, opts?: { arrival?: boolean; attachments?: OutgoingAttachment[] }) => {
    const arrival = opts?.arrival ?? false;
    const attachments = opts?.attachments?.length ? opts.attachments.slice(0, 5) : undefined;
    const trimmed = text.trim();
    if (!arrival && !trimmed && !attachments) return;

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
        // images carry their data URL for inline display; files just show a named chip
        attachments: attachments?.map((a) => ({ kind: a.kind, name: a.name, url: a.kind === "image" ? a.dataUrl : undefined })),
      });
      useHistoryStore.getState().record({
        ts: Date.now(),
        sessionId,
        who,
        teamId,
        agentId,
        role: "user",
        content: [trimmed, attachments ? `[${attachments.length} attachment${attachments.length > 1 ? "s" : ""}]` : ""].filter(Boolean).join(" "),
      });
    }

    // Emoji reactions for this turn: gate by the active agent's preset allow-list. Reactions ride her
    // own reasoning (no sidecar) — so we just tell her the convention + any likes I've added or taken
    // back since she was last told, and the BFF parses her reaction out of her reasoning. See api/chat.
    const prefs = useChatPrefs.getState();
    let reactions: ReactionTurnConfig | undefined;
    if (!arrival && prefs.reactionsEnabledFor(sess?.target ?? null)) {
      const { added, removed } = store.reconcileReactions(sessionId);
      // The reaction CONVENTION now lives in her Letta persona (a read-only "reactions" memory block),
      // NOT in the turn. Injecting "react in your reasoning" per message made her chat back to it and
      // skip send_message — a deterministic invalid_llm_response the proxy retry can't fix — and made
      // her over-react. Here we only tell her, in plain prose, which of HER messages I just liked /
      // un-liked (tested tool-call-safe). She still emits "React:" in her reasoning from the persona
      // block, which streamLetta parses into a reaction event.
      const parts: string[] = [];
      if (added.length) parts.push(`I just reacted ${added.join(" ")} to something you said earlier.`);
      if (removed.length) parts.push(`I took back my ${removed.join(" ")} reaction from earlier.`);
      reactions = { enabled: true, note: parts.join(" ") || undefined, incoming: added };
    }

    // The active reply bubble. A `message_break` finalizes it and opens a fresh one for the next
    // spoken step, so a turn with an intermediate "Hold on…" shows as two separate bubbles.
    let assistantId = crypto.randomUUID();
    const newBubble = () => {
      assistantId = crypto.randomUUID();
      useJovaStore.getState().addMessage(sessionId, { id: assistantId, role: "assistant", content: "", createdAt: Date.now(), streaming: true });
    };
    // finalize a bubble + record it to durable history (skip the arrival greeting + empty bodies)
    const finalizeBubble = (msgId: string) => {
      const s = useJovaStore.getState();
      const m = s.messages[sessionId]?.find((x) => x.id === msgId);
      s.finalizeMessage(sessionId, msgId);
      if (!arrival && m?.content?.trim()) {
        useHistoryStore.getState().record({ ts: Date.now(), sessionId, who, teamId, agentId, role: "assistant", content: m.content, reasoning: m.reasoning });
      }
    };
    store.addMessage(sessionId, { id: assistantId, role: "assistant", content: "", createdAt: Date.now(), streaming: true });

    let speakingStarted = false;
    try {
      await streamChat({
        sessionId,
        message: arrival ? ARRIVAL : trimmed,
        attachments,
        reactions,
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
            case "message_break":
              finalizeBubble(assistantId);
              newBubble();
              break;
            case "mood":
              s.mergeMood(e.mood);
              break;
            case "doc":
              // a doc was filed during the turn -> bring it into the read-only preview panel
              useDocStore.getState().showDoc(e.doc);
              break;
            case "reaction": {
              // the agent tapped emoji back — attach them to the user's most recent message
              const msgs = s.messages[sessionId] ?? [];
              const lastUser = [...msgs].reverse().find((m) => m.role === "user");
              if (lastUser) e.emojis.forEach((em) => s.addReaction(sessionId, lastUser.id, em, "assistant"));
              break;
            }
            case "error":
              s.appendToken(sessionId, assistantId, "…I lost the thread for a second there.");
              break;
            case "done":
              break;
          }
        },
      });
    } finally {
      finalizeBubble(assistantId);
      useLogStore.getState().addLog({ kind: "server", source: "/api/chat", message: "POST /api/chat → 200" });
      setSpeaking(false);
      // back to present (hovering near) after speaking; idle timer takes it from here
      useJovaStore.getState().setWispState("present");
      useJovaStore.getState().touch();
    }
  }, []);

  return { send };
}
