import type { Mood } from "@/lib/mood";

export type Role = "user" | "assistant";

/**
 * An emoji "like" on a message. `by` is who tapped it — the user, or the agent (which expresses its
 * reactions inside its own reasoning on a normal turn; the BFF parses them out — no sidecar model).
 */
export interface Reaction {
  emoji: string;
  by: Role;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  /** when the message was "sent" — user: at submit; assistant: when streaming finished. Falls back
   *  to createdAt. This is the time shown on hover (the agent's reply time = when it landed). */
  sentAt?: number;
  /** true while tokens are still streaming in */
  streaming?: boolean;
  /** her internal reasoning — used ONLY as an animation cue, never shown by default */
  reasoning?: string;
  /** a special message rendered distinctly — e.g. a dream carried into the chat as context */
  kind?: "dream";
  /** attachments shown on this message — up to 5 images and/or files */
  attachments?: MessageAttachment[];
  /** emoji "likes" on this message — from the user and/or the agent */
  reactions?: Reaction[];
}

/** An attachment as displayed on a message bubble. */
export interface MessageAttachment {
  kind: "image" | "file";
  name: string;
  /** images only: a data URL for inline display */
  url?: string;
}

/** An attachment being sent with a turn (image seen inline; file uploaded to her vault). */
export interface OutgoingAttachment {
  kind: "image" | "file";
  name: string;
  mime: string;
  /** data URL (data:<mime>;base64,…) */
  dataUrl: string;
}

/** Who a chat session is addressed to — a team's agent. Absent on a session = Jova herself. */
export interface ChatTarget {
  teamId: string;
  agentId: string;
  teamName: string;
  /** role label, e.g. "Product Manager" */
  label: string;
  color: string;
  /** the org team this agent belongs to (display name), shown in chat. Distinct from `teamName` (which
   *  for characters is the agent's own display name). Absent for synthetic/Nexus targets. */
  team?: string;
  /** The REAL Letta agent id this thread routes to, when it's a live agent (e.g. a character like
   *  Baal/Mira). Absent for synthetic demo targets (network nodes, Nexus) — those still fall back to
   *  Jova on the server. The turn is sent to this id; see useConversation -> streamChat -> /api/chat. */
  lettaId?: string;
}

/** The Nexus orchestrator as a chat target — distinct from Jova and from team agents. */
export const NEXUS_CHAT_TARGET: ChatTarget = {
  teamId: "nexus",
  agentId: "nexus",
  teamName: "Nexus",
  label: "Orchestrator",
  color: "#9fe8ff",
};

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** who this conversation is with; absent = Jova */
  target?: ChatTarget;
}

/** A document Jova filed during a turn — surfaced live to the read-only doc preview panel. */
export interface StreamedDoc {
  /** vault-relative path, forward slashes */
  path: string;
  /** basename, e.g. "Gavin Barker Resume.pdf" */
  name: string;
  /** vault subfolder, e.g. "Career" ("" if top-level) */
  category: string;
  /** lowercased extension: pdf | docx | xlsx | pptx | … (drives inline vs open-in-tab) */
  kind: string;
  /** epoch seconds — also used to bust the preview when the same doc is re-rendered */
  mtime: number;
}

/**
 * One event from the streaming chat endpoint. This mirrors the shape we'll build from a real
 * Letta stream: reasoning_message -> reasoning, assistant_message tokens -> token, an optional
 * mood update from the (future) affect block, and a `doc` event when a render is filed mid-turn.
 */
export type ChatStreamEvent =
  | { type: "reasoning"; text: string }
  | { type: "token"; text: string }
  | { type: "mood"; mood: Partial<Mood> }
  | { type: "doc"; doc: StreamedDoc }
  /** the agent tapping emoji "likes" back onto the user's latest message (cheap reactor model) */
  | { type: "reaction"; emojis: string[] }
  /** end the current reply bubble and start a new one — a separate step in the same turn (e.g. she
   *  pauses to run a tool: "Hold on, let me check…" then "Okay, found it") shows as its own bubble */
  | { type: "message_break" }
  | { type: "done" }
  | { type: "error"; message: string };

/** Config the client passes to /api/chat to drive emoji reactions for this turn. */
export interface ReactionTurnConfig {
  /** master gate — the active agent's preset is on the reactions allow-list */
  enabled: boolean;
  /** natural-language context woven into the agent's turn: the reaction convention + any likes the
   *  user just added/removed since the agent was last told (so she understands them) */
  note?: string;
  /** emojis the user just ADDED this turn — lets the mock brain mirror them offline */
  incoming?: string[];
}
