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
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
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
