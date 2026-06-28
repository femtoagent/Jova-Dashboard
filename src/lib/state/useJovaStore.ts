"use client";

import { create } from "zustand";
import type { ChatMessage, ChatSession, ChatTarget, OutgoingAttachment, Role } from "@/lib/jova/types";
import { type Mood, type WispType, NEUTRAL_MOOD } from "@/lib/mood";

/** The four states from the brief — the soul of the wisp. */
export type WispState = "approaching" | "present" | "speaking" | "receded";

/** Procedural Nexus visual styles (all in the team/agent design language). */
export type NexusStyle = "brain" | "neuron" | "rings" | "galaxy" | "vortex";

/** Jova's hero forms on the "just Jova" screen — each a distinct screen-filling presence. */
export type JovaStyle =
  | "mycelium"
  | "glyph"
  | "medusa"
  | "cocoon"
  | "resonance"
  | "mothership"
  | "corona"
  | "plasma"
  | "singularity";

/** Persisted "Jova view" preference — set in the Settings Jova editor, remembered across reloads. */
const JOVA_STYLE_KEY = "jova.jovaStyle";
const JOVA_STYLES: JovaStyle[] = [
  "mycelium", "glyph", "medusa", "cocoon", "resonance", "mothership", "corona", "plasma", "singularity",
];

interface JovaState {
  // ---- scene ----
  wispType: WispType;
  wispState: WispState;
  mood: Mood;
  quality: "high" | "low";
  /** Nexus spins up to an "active/processing" state when true, easing back to baseline when false. */
  nexusActive: boolean;
  /** Master switch for Nexus's spatial audio (off by default; needs a user gesture to start). */
  soundOn: boolean;
  /** false = lite "just Jova" (cheap load); true = the full network/Nexus world is loaded. */
  fullMode: boolean;
  /** which procedural Nexus style is shown */
  nexusStyle: NexusStyle;
  /** which hero form Jova takes on the "just Jova" screen */
  jovaStyle: JovaStyle;

  // ---- chat ----
  sessions: ChatSession[];
  activeSessionId: string | null;
  messages: Record<string, ChatMessage[]>;
  /** per-thread count of unread incoming messages (arrived while you weren't viewing that thread) */
  unread: Record<string, number>;
  chatOpen: boolean;
  voiceOn: boolean; // TTS (her voice out)
  micOn: boolean; // STT hands-free (mic in, continuous auto-send)
  /** true while the mic is actively capturing (hands-free OR push-to-talk) — drives the listening glow */
  listening: boolean;
  /** true between sending a turn and her first token — the "thinking" phase for the voice HUD */
  thinking: boolean;
  /** live interim transcript from Deepgram, shown as a preview while she's hearing you */
  sttPartial: string;
  /** transient voice error (mic denied / not configured) surfaced near the composer, auto-cleared */
  voiceError: string | null;
  lastInteraction: number;
  /** staged attachments for the next message (up to 5) — from the composer picker OR drag-and-drop */
  pendingAttachments: OutgoingAttachment[];

  // ---- scene actions ----
  setWispType: (t: WispType) => void;
  setWispState: (s: WispState) => void;
  setMood: (m: Mood) => void;
  mergeMood: (m: Partial<Mood>) => void;
  setQuality: (q: "high" | "low") => void;
  setNexusActive: (v: boolean) => void;
  setSoundOn: (v: boolean) => void;
  setFullMode: (v: boolean) => void;
  toggleFullMode: () => void;
  setNexusStyle: (s: NexusStyle) => void;
  setJovaStyle: (s: JovaStyle) => void;
  /** Apply the persisted Jova-view preference (call once on the client after mount). */
  hydrateJovaStyle: () => void;

  // ---- chat actions ----
  createSession: (title?: string, target?: ChatTarget) => string;
  switchSession: (id: string) => void;
  /** open (or reuse) a session addressed to a specific team agent (or Nexus); returns the session id */
  openChatWith: (target: ChatTarget) => string;
  /** return to talking with Jova herself */
  openJovaChat: () => void;
  /** make Jova's thread active without opening the chat window (for ambient voice); returns its id */
  ensureJovaActive: () => string;
  /** close one chat thread (keeps at least one Jova thread as home) */
  closeSession: (id: string) => void;
  /** close a whole conversation (all of a person's threads) — agent/Nexus only */
  closeConversation: (teamId: string, agentId: string) => void;
  /** keep chat-session targets (and auto-titles) in sync when an agent is renamed in the network store */
  renameTarget: (teamId: string, agentId: string, label: string) => void;
  addMessage: (sessionId: string, msg: ChatMessage) => void;
  appendToken: (sessionId: string, msgId: string, text: string) => void;
  setReasoning: (sessionId: string, msgId: string, text: string) => void;
  finalizeMessage: (sessionId: string, msgId: string) => void;
  /** add an emoji "like" to a message (deduped per emoji+author; user reactions capped at 10) */
  addReaction: (sessionId: string, msgId: string, emoji: string, by: Role) => void;
  /** remove an emoji "like" (only its own author should call this) */
  removeReaction: (sessionId: string, msgId: string, emoji: string, by: Role) => void;
  /** snapshot of the user reactions already reported to the agent, per session (key "msgId|emoji") */
  reportedReactions: Record<string, string[]>;
  /** diff the user's current reactions in a session against what the agent was last told, update the
   *  snapshot, and return the emojis newly added / removed since — so she understands both. */
  reconcileReactions: (sessionId: string) => { added: string[]; removed: string[] };
  setChatOpen: (open: boolean) => void;
  toggleVoice: () => void;
  setVoiceOn: (v: boolean) => void;
  toggleMic: () => void;
  setListening: (v: boolean) => void;
  setThinking: (v: boolean) => void;
  setSttPartial: (text: string) => void;
  setVoiceError: (msg: string | null) => void;
  /** stage attachments for the next message — appended, then capped at 5 total */
  addPendingAttachments: (atts: OutgoingAttachment[]) => void;
  removePendingAttachment: (index: number) => void;
  clearPending: () => void;

  /** Register interaction; if she had receded, bring her back. */
  touch: () => void;
}

/** Return a new unread map with this thread cleared (same ref if already clear → no needless render). */
function clearUnread(unread: Record<string, number>, id: string): Record<string, number> {
  if (!unread[id]) return unread;
  const next = { ...unread };
  delete next[id];
  return next;
}
/** Return a new unread map with this thread's count incremented by one. */
function bumpUnread(unread: Record<string, number>, id: string): Record<string, number> {
  return { ...unread, [id]: (unread[id] ?? 0) + 1 };
}
/** Stable per-person key — must match ConversationRail/SessionsView (jova | teamId:agentId). */
function personKeyOf(s: ChatSession): string {
  return s.target ? `${s.target.teamId}:${s.target.agentId}` : "jova";
}
/**
 * Clear unread across EVERY thread of the person who owns `sessionId`. The rail badge is a per-person
 * rollup, so opening a person must mark all their threads read (not just the one clicked).
 */
function clearPersonUnread(
  unread: Record<string, number>,
  sessions: ChatSession[],
  sessionId: string | null
): Record<string, number> {
  if (!sessionId) return unread;
  const ref = sessions.find((s) => s.id === sessionId);
  if (!ref) return clearUnread(unread, sessionId);
  const key = personKeyOf(ref);
  let next = unread;
  for (const s of sessions) if (personKeyOf(s) === key) next = clearUnread(next, s.id);
  return next;
}

export const useJovaStore = create<JovaState>((set, get) => ({
  wispType: "orb",
  wispState: "present",
  mood: NEUTRAL_MOOD,
  quality: "high",
  nexusActive: false,
  soundOn: false,
  fullMode: false,
  nexusStyle: "brain",
  jovaStyle: "mycelium",

  sessions: [],
  activeSessionId: null,
  messages: {},
  unread: {},
  reportedReactions: {},
  chatOpen: false, // starts closed — only the 💬 Chat button (or opening a specific agent) brings it up
  voiceOn: false,
  micOn: false,
  listening: false,
  thinking: false,
  sttPartial: "",
  voiceError: null,
  lastInteraction: Date.now(),
  pendingAttachments: [],

  setWispType: (t) => set({ wispType: t }),
  setWispState: (s) => set({ wispState: s }),
  setMood: (m) => set({ mood: m }),
  mergeMood: (m) => set((st) => ({ mood: { ...st.mood, ...m } })),
  setQuality: (q) => set({ quality: q }),
  setNexusActive: (v) => set({ nexusActive: v }),
  setSoundOn: (v) => set({ soundOn: v }),
  // leaving full mode also clears nexusActive (its only reset lived in the now-unmounted network driver)
  setFullMode: (v) => set(v ? { fullMode: true } : { fullMode: false, nexusActive: false }),
  toggleFullMode: () => set((st) => (st.fullMode ? { fullMode: false, nexusActive: false } : { fullMode: true })),
  setNexusStyle: (s) => set({ nexusStyle: s }),
  setJovaStyle: (s) => {
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem(JOVA_STYLE_KEY, s); } catch {}
    }
    set({ jovaStyle: s });
  },
  hydrateJovaStyle: () => {
    if (typeof window === "undefined") return;
    try {
      const v = window.localStorage.getItem(JOVA_STYLE_KEY);
      if (v && (JOVA_STYLES as string[]).includes(v)) set({ jovaStyle: v as JovaStyle });
    } catch {}
  },

  createSession: (title, target) => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const session: ChatSession = {
      id,
      title: title ?? `Session ${get().sessions.length + 1}`,
      createdAt: now,
      updatedAt: now,
      target,
    };
    set((st) => {
      const sessions = [...st.sessions, session];
      return {
        sessions,
        activeSessionId: id,
        messages: { ...st.messages, [id]: [] },
        chatOpen: true,
        unread: clearPersonUnread(st.unread, sessions, id),
      };
    });
    return id;
  },

  switchSession: (id) =>
    set((st) => ({
      activeSessionId: id,
      // mark it most-recent so the rail's per-person row represents the thread you actually opened
      sessions: st.sessions.map((s) => (s.id === id ? { ...s, updatedAt: Date.now() } : s)),
      unread: clearPersonUnread(st.unread, st.sessions, id),
    })),

  openChatWith: (target) => {
    const st = get();
    const matching = st.sessions.filter((s) => s.target?.teamId === target.teamId && s.target?.agentId === target.agentId);
    if (matching.length) {
      const recent = matching.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
      set((s) => ({ activeSessionId: recent.id, chatOpen: true, unread: clearPersonUnread(s.unread, s.sessions, recent.id) }));
      return recent.id;
    }
    const id = crypto.randomUUID();
    const now = Date.now();
    const session: ChatSession = { id, title: `${target.teamName} - ${target.label}`, createdAt: now, updatedAt: now, target };
    set((s) => ({ sessions: [...s.sessions, session], activeSessionId: id, messages: { ...s.messages, [id]: [] }, chatOpen: true }));
    return id;
  },

  openJovaChat: () =>
    set((st) => {
      const jova = [...st.sessions].reverse().find((s) => !s.target);
      if (jova) return { activeSessionId: jova.id, chatOpen: true, unread: clearPersonUnread(st.unread, st.sessions, jova.id) };
      const id = crypto.randomUUID();
      const now = Date.now();
      const session: ChatSession = { id, title: "Jova", createdAt: now, updatedAt: now };
      return { sessions: [...st.sessions, session], activeSessionId: id, messages: { ...st.messages, [id]: [] }, chatOpen: true };
    }),

  /** Make Jova's thread the active one WITHOUT opening the chat window — so ambient voice (chat
   *  collapsed) routes to her, not to whichever agent was last viewed. Returns the session id. */
  ensureJovaActive: () => {
    const st = get();
    const existing = [...st.sessions].reverse().find((s) => !s.target);
    if (existing) {
      if (st.activeSessionId !== existing.id) set({ activeSessionId: existing.id });
      return existing.id;
    }
    const id = crypto.randomUUID();
    const now = Date.now();
    const session: ChatSession = { id, title: "Jova", createdAt: now, updatedAt: now };
    set((s) => ({ sessions: [...s.sessions, session], activeSessionId: id, messages: { ...s.messages, [id]: [] } }));
    return id;
  },

  closeSession: (id) =>
    set((st) => {
      const sess = st.sessions.find((s) => s.id === id);
      if (!sess) return {};
      // keep at least one Jova (no-target) thread as home
      if (!sess.target && st.sessions.filter((s) => !s.target).length <= 1) return {};
      const sessions = st.sessions.filter((s) => s.id !== id);
      const messages = { ...st.messages };
      delete messages[id];
      let activeSessionId = st.activeSessionId;
      if (activeSessionId === id) {
        const jova = [...sessions].reverse().find((s) => !s.target);
        activeSessionId = jova?.id ?? sessions[sessions.length - 1]?.id ?? null;
      }
      let unread = clearUnread(st.unread, id);
      unread = clearPersonUnread(unread, sessions, activeSessionId);
      return { sessions, messages, activeSessionId, unread };
    }),

  closeConversation: (teamId, agentId) =>
    set((st) => {
      const match = (s: ChatSession) => s.target?.teamId === teamId && s.target?.agentId === agentId;
      const sessions = st.sessions.filter((s) => !match(s));
      const messages = { ...st.messages };
      let unread = st.unread;
      for (const s of st.sessions)
        if (match(s)) {
          delete messages[s.id];
          unread = clearUnread(unread, s.id);
        }
      let activeSessionId = st.activeSessionId;
      if (!sessions.some((s) => s.id === activeSessionId)) {
        const jova = [...sessions].reverse().find((s) => !s.target);
        activeSessionId = jova?.id ?? sessions[sessions.length - 1]?.id ?? null;
      }
      unread = clearPersonUnread(unread, sessions, activeSessionId);
      return { sessions, messages, activeSessionId, unread };
    }),

  renameTarget: (teamId, agentId, label) =>
    set((st) => ({
      sessions: st.sessions.map((s) => {
        if (s.target?.teamId !== teamId || s.target?.agentId !== agentId) return s;
        // refresh the auto-generated "Team - Role" title too, but leave user-distinct titles ("New chat") alone
        const autoTitle = `${s.target.teamName} - ${s.target.label}`;
        const title = s.title === autoTitle ? `${s.target.teamName} - ${label}` : s.title;
        return { ...s, title, target: { ...s.target, label } };
      }),
    })),

  addMessage: (sessionId, msg) =>
    set((st) => {
      // a complete incoming (assistant/dream) message landing on a thread you aren't viewing is unread
      const viewing = st.chatOpen && st.activeSessionId === sessionId;
      const unseen = msg.role === "assistant" && !msg.streaming && !viewing;
      return {
        messages: {
          ...st.messages,
          [sessionId]: [...(st.messages[sessionId] ?? []), msg],
        },
        sessions: st.sessions.map((s) =>
          s.id === sessionId ? { ...s, updatedAt: Date.now() } : s
        ),
        unread: unseen ? bumpUnread(st.unread, sessionId) : st.unread,
      };
    }),

  appendToken: (sessionId, msgId, text) =>
    set((st) => ({
      messages: {
        ...st.messages,
        [sessionId]: (st.messages[sessionId] ?? []).map((m) =>
          m.id === msgId ? { ...m, content: m.content + text } : m
        ),
      },
    })),

  setReasoning: (sessionId, msgId, text) =>
    set((st) => ({
      messages: {
        ...st.messages,
        [sessionId]: (st.messages[sessionId] ?? []).map((m) =>
          m.id === msgId ? { ...m, reasoning: text } : m
        ),
      },
    })),

  finalizeMessage: (sessionId, msgId) =>
    set((st) => {
      // a reply that finished streaming while you were on another thread (or with chat closed) is unread.
      // only count an actually-streaming message (so finalize is idempotent and never double-counts addMessage)
      const viewing = st.chatOpen && st.activeSessionId === sessionId;
      const wasStreaming = !!(st.messages[sessionId] ?? []).find((m) => m.id === msgId)?.streaming;
      return {
        messages: {
          ...st.messages,
          [sessionId]: (st.messages[sessionId] ?? []).map((m) =>
            // stamp the "sent" time when the reply actually finished (what hover shows)
            m.id === msgId ? { ...m, streaming: false, sentAt: m.sentAt ?? Date.now() } : m
          ),
        },
        unread: viewing || !wasStreaming ? st.unread : bumpUnread(st.unread, sessionId),
      };
    }),

  addReaction: (sessionId, msgId, emoji, by) =>
    set((st) => ({
      messages: {
        ...st.messages,
        [sessionId]: (st.messages[sessionId] ?? []).map((m) => {
          if (m.id !== msgId) return m;
          const reactions = m.reactions ?? [];
          if (reactions.some((r) => r.emoji === emoji && r.by === by)) return m; // dedupe
          if (by === "user" && reactions.filter((r) => r.by === "user").length >= 10) return m; // cap
          return { ...m, reactions: [...reactions, { emoji, by }] };
        }),
      },
    })),

  removeReaction: (sessionId, msgId, emoji, by) =>
    set((st) => ({
      messages: {
        ...st.messages,
        [sessionId]: (st.messages[sessionId] ?? []).map((m) =>
          m.id === msgId
            ? { ...m, reactions: (m.reactions ?? []).filter((r) => !(r.emoji === emoji && r.by === by)) }
            : m
        ),
      },
    })),

  reconcileReactions: (sessionId) => {
    const msgs = get().messages[sessionId] ?? [];
    const current: string[] = [];
    for (const m of msgs) for (const r of m.reactions ?? []) if (r.by === "user") current.push(`${m.id}|${r.emoji}`);
    const prev = get().reportedReactions[sessionId] ?? [];
    const prevSet = new Set(prev);
    const curSet = new Set(current);
    const emojiOf = (k: string) => k.slice(k.indexOf("|") + 1);
    const added = current.filter((k) => !prevSet.has(k)).map(emojiOf);
    const removed = prev.filter((k) => !curSet.has(k)).map(emojiOf);
    set((st) => ({ reportedReactions: { ...st.reportedReactions, [sessionId]: current } }));
    return { added, removed };
  },

  setChatOpen: (open) =>
    set((st) =>
      open && st.activeSessionId
        ? { chatOpen: true, unread: clearPersonUnread(st.unread, st.sessions, st.activeSessionId) }
        : { chatOpen: open }
    ),
  toggleVoice: () => set((st) => ({ voiceOn: !st.voiceOn })),
  setVoiceOn: (v) => set({ voiceOn: v }),
  toggleMic: () => set((st) => ({ micOn: !st.micOn })),
  setListening: (v) => set({ listening: v }),
  setThinking: (v) => set({ thinking: v }),
  setSttPartial: (text) => set({ sttPartial: text }),
  setVoiceError: (msg) => set({ voiceError: msg }),
  addPendingAttachments: (atts) =>
    set((st) => ({ pendingAttachments: [...st.pendingAttachments, ...atts].slice(0, 5) })),
  removePendingAttachment: (index) =>
    set((st) => ({ pendingAttachments: st.pendingAttachments.filter((_, i) => i !== index) })),
  clearPending: () => set({ pendingAttachments: [] }),

  touch: () =>
    set((st) => ({
      lastInteraction: Date.now(),
      wispState: st.wispState === "receded" ? "approaching" : st.wispState,
    })),
}));

// Dev convenience: expose the store for smoke tests / debugging in the browser console.
if (typeof window !== "undefined") {
  (window as unknown as { __jovaStore?: typeof useJovaStore }).__jovaStore = useJovaStore;
}
