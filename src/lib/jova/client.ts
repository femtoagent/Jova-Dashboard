import type { ChatStreamEvent, OutgoingAttachment, ReactionTurnConfig } from "@/lib/jova/types";

/**
 * Frontend -> BFF client. The browser only ever talks to our own /api/* routes; those routes
 * (the BFF) hold the Letta password and broker the request. Swapping mock -> real Letta is a
 * change inside /api/chat, not here.
 */

export interface HealthResult {
  status: string;
  backend: string;
  time: number;
}

export async function health(): Promise<HealthResult> {
  const res = await fetch("/api/health", { cache: "no-store" });
  if (!res.ok) throw new Error(`health ${res.status}`);
  return res.json();
}

/** POST a message and consume the NDJSON event stream, calling onEvent per event. */
export async function streamChat(params: {
  sessionId: string;
  message: string;
  /** the REAL Letta agent id to route this turn to (a live character). Omit for Jova / demo targets. */
  agentId?: string;
  /** up to 5 attachments — images are seen inline by the vision model, files uploaded to her vault */
  attachments?: OutgoingAttachment[];
  /** emoji-reaction config for this turn (gate + reactor preset + incoming likes) */
  reactions?: ReactionTurnConfig;
  signal?: AbortSignal;
  onEvent: (e: ChatStreamEvent) => void;
}): Promise<void> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: params.sessionId,
      message: params.message,
      agentId: params.agentId,
      attachments: params.attachments,
      reactions: params.reactions,
    }),
    signal: params.signal,
  });

  if (!res.ok || !res.body) {
    params.onEvent({ type: "error", message: `chat ${res.status}` });
    params.onEvent({ type: "done" });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        params.onEvent(JSON.parse(line) as ChatStreamEvent);
      } catch {
        /* ignore malformed line */
      }
    }
  }
  const tail = buf.trim();
  if (tail) {
    try {
      params.onEvent(JSON.parse(tail) as ChatStreamEvent);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Ask Nexus to write an agent "soul" from a prompt. Reuses the same NDJSON `ChatStreamEvent`
 * contract as chat (token/done/error), POSTing to the BFF route /api/nexus/soul.
 */
export async function streamSoul(params: {
  prompt: string;
  role?: string;
  name?: string;
  /** the agent's org team (woven into the generation prompt) */
  team?: string;
  /** which block to write — "persona" (identity/voice) or "human" (who they talk to). Default persona. */
  kind?: "persona" | "human";
  signal?: AbortSignal;
  onEvent: (e: ChatStreamEvent) => void;
}): Promise<void> {
  const res = await fetch("/api/nexus/soul", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: params.prompt, role: params.role, name: params.name, team: params.team, kind: params.kind }),
    signal: params.signal,
  });

  if (!res.ok || !res.body) {
    params.onEvent({ type: "error", message: `soul ${res.status}` });
    params.onEvent({ type: "done" });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        params.onEvent(JSON.parse(line) as ChatStreamEvent);
      } catch {
        /* ignore malformed line */
      }
    }
  }
  const tail = buf.trim();
  if (tail) {
    try {
      params.onEvent(JSON.parse(tail) as ChatStreamEvent);
    } catch {
      /* ignore */
    }
  }
}
