import type { Mood } from "@/lib/mood";

export type Role = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  createdAt: number;
  /** true while tokens are still streaming in */
  streaming?: boolean;
  /** her internal reasoning — used ONLY as an animation cue, never shown by default */
  reasoning?: string;
  /** a special message rendered distinctly — e.g. a dream carried into the chat as context */
  kind?: "dream";
  /** an attached image (object/data URL) for the agent to process */
  image?: string;
}

/** Who a chat session is addressed to — a team's agent. Absent on a session = Jova herself. */
export interface ChatTarget {
  teamId: string;
  agentId: string;
  teamName: string;
  /** role label, e.g. "Product Manager" */
  label: string;
  color: string;
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

/**
 * One event from the streaming chat endpoint. This mirrors the shape we'll build from a real
 * Letta stream: reasoning_message -> reasoning, assistant_message tokens -> token, and an
 * optional mood update from the (future) affect block.
 */
export type ChatStreamEvent =
  | { type: "reasoning"; text: string }
  | { type: "token"; text: string }
  | { type: "mood"; mood: Partial<Mood> }
  | { type: "done" }
  | { type: "error"; message: string };
