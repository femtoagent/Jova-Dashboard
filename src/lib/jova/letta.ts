import type { ChatStreamEvent, OutgoingAttachment } from "@/lib/jova/types";

/**
 * Server-only Letta client (the live half of the BFF seam — see CONNECTING.md §3).
 *
 * The browser never imports this: it reads LETTA_SERVER_PASSWORD straight from server env, so it
 * MUST stay out of any client-reachable module. Its whole job is to talk to the self-hosted Letta
 * server over REST and translate Letta's typed streaming messages into the SAME `ChatStreamEvent`s
 * the mock emits, so the UI is untouched:
 *   reasoning_message -> { type: "reasoning" }   (animation cue only)
 *   assistant_message -> { type: "token" }       (what we display / will speak)
 *   stop_reason!=ok   -> { type: "error" }       (a failed turn ends here, not via HTTP)
 *   stream end        -> caller emits { type: "done" }
 *
 * The exact paths + SSE field names below follow CONNECTING.md / Letta ~0.16.x, but Letta's REST
 * shapes have drifted across versions — verify against the running server before trusting blindly.
 */

const BASE = (process.env.LETTA_BASE_URL ?? "http://127.0.0.1:8283").replace(/\/+$/, "");
const PASSWORD = process.env.LETTA_SERVER_PASSWORD ?? "";
const AGENT_NAME = process.env.LETTA_AGENT_NAME ?? "jova";
const VAULT_NAME = process.env.LETTA_VAULT_FOLDER ?? "jova-vault";

// Per-agent preset routing (single-tenant). An agent's Letta model handle IS the routing signal the
// proxy reads: handle `openai-proxy/<slug>` -> that preset; the bare deepseek handle -> the default
// (jova-conversation). Keep KNOWN_PRESETS in sync with or_proxy.py's KNOWN_PRESETS.
const KNOWN_PRESETS = ["jova-conversation", "file-medium", "image-light", "jova-memory"];
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
const PROXY_ENDPOINT = process.env.LETTA_PROXY_ENDPOINT ?? "http://127.0.0.1:4000/v1";

/** An agent and the preset its brain currently routes through. */
export interface LettaAgentInfo {
  id: string;
  name: string;
  /** the preset slug this agent routes to, or "" for the default (legacy deepseek handle). */
  preset: string;
}

/** A non-image attachment: uploaded to Jova's vault folder so she can read it with her file tools. */
export interface VaultFile {
  name: string;
  mime: string;
  /** data URL (data:<mime>;base64,…) */
  dataUrl: string;
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...(extra ?? {}) };
  // Self-hosted Letta with a server password expects a bearer token (CONNECTING.md §3).
  if (PASSWORD) h["Authorization"] = `Bearer ${PASSWORD}`;
  return h;
}

/** Liveness ping for /api/health. Trailing slash is required or Letta 307s. */
export async function lettaHealth(): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const res = await fetch(`${BASE}/v1/health/`, { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) return { ok: false, error: `health ${res.status}` };
    const j = (await res.json().catch(() => ({}))) as { version?: string };
    return { ok: true, version: j?.version };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// The agent id is stable for the life of the process; resolve once and cache.
let cachedAgentId: string | null = null;

async function resolveAgentId(): Promise<string> {
  if (cachedAgentId) return cachedAgentId;
  // Prefer a server-side name filter; fall back to listing all and matching by name.
  const urls = [
    `${BASE}/v1/agents/?name=${encodeURIComponent(AGENT_NAME)}`,
    `${BASE}/v1/agents/`,
  ];
  for (const url of urls) {
    const res = await fetch(url, { headers: authHeaders(), cache: "no-store" });
    // A wrong/rotated token fails here — surface it distinctly, not as a misleading "not found".
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Letta rejected the bearer token (${res.status}) — check LETTA_SERVER_PASSWORD`);
    }
    if (!res.ok) continue;
    const list = (await res.json().catch(() => null)) as Array<{ id?: string; name?: string }> | null;
    if (!Array.isArray(list)) continue;
    const hit =
      list.find((a) => a?.name === AGENT_NAME) ?? (list.length === 1 ? list[0] : null);
    if (hit?.id) {
      cachedAgentId = hit.id;
      return hit.id;
    }
  }
  throw new Error(`Letta agent "${AGENT_NAME}" not found at ${BASE}`);
}

/** Derive the preset slug an agent routes to from its llm_config (model id or handle suffix). */
function presetFromLlmConfig(lc: Record<string, unknown> | undefined): string {
  if (!lc) return "";
  const model = String(lc.model ?? "");
  if (KNOWN_PRESETS.includes(model)) return model;
  const slug = String(lc.handle ?? "").split("/").pop() ?? "";
  return KNOWN_PRESETS.includes(slug) ? slug : "";
}

/** List all Letta agents with the preset each currently routes through. */
export async function listAgents(): Promise<LettaAgentInfo[]> {
  const res = await fetch(`${BASE}/v1/agents/`, { headers: authHeaders(), cache: "no-store" });
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Letta rejected the bearer token (${res.status}) — check LETTA_SERVER_PASSWORD`);
  }
  if (!res.ok) throw new Error(`Letta agents ${res.status}`);
  const list = (await res.json().catch(() => null)) as Array<Record<string, unknown>> | null;
  if (!Array.isArray(list)) return [];
  return list
    .map((a) => ({
      id: String(a.id ?? ""),
      name: String(a.name ?? ""),
      preset: presetFromLlmConfig(a.llm_config as Record<string, unknown> | undefined),
    }))
    .filter((a) => a.id);
}

/**
 * Point an agent at a preset by rewriting only the routing fields of its llm_config to the proxy
 * handle `openai-proxy/<slug>` (every other setting — context window, temperature… — is preserved).
 * An empty/unknown slug resets it to the default deepseek handle (still through the proxy → the
 * jova-conversation default). The proxy reads the handle and maps it to `@preset/<slug>`.
 */
export async function setAgentPreset(agentId: string, preset: string): Promise<LettaAgentInfo> {
  const cur = await fetch(`${BASE}/v1/agents/${agentId}`, { headers: authHeaders(), cache: "no-store" });
  if (!cur.ok) throw new Error(`Letta agent ${agentId} ${cur.status}`);
  const agent = (await cur.json()) as Record<string, unknown>;
  const lc = { ...((agent.llm_config as Record<string, unknown>) ?? {}) };

  const slug = preset.trim();
  const model = KNOWN_PRESETS.includes(slug) ? slug : DEFAULT_MODEL;
  lc.model = model;
  lc.handle = `openai-proxy/${model}`;
  lc.model_endpoint = PROXY_ENDPOINT;
  lc.model_endpoint_type = "openai";
  lc.provider_name = null;
  lc.provider_category = null;

  const res = await fetch(`${BASE}/v1/agents/${agentId}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ llm_config: lc }),
  });
  if (!res.ok) {
    throw new Error(`Letta preset update ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  const upd = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return {
    id: agentId,
    name: String(upd.name ?? agent.name ?? ""),
    preset: presetFromLlmConfig((upd.llm_config as Record<string, unknown>) ?? lc),
  };
}

/** Pull the displayable text out of an assistant message's content (string or typed parts). */
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "string" ? p : ((p as { text?: string })?.text ?? "")))
      .join("");
  }
  return "";
}

// stop_reasons that mean the turn actually failed — as opposed to a clean end_turn or a benign
// pause (cancelled = client aborted; requires_approval = an approval flow we don't drive yet).
const FATAL_STOPS = new Set([
  "error",
  "llm_api_error",
  "invalid_llm_response",
  "invalid_tool_call",
  "max_steps",
  "max_tokens_exceeded",
  "no_tool_call",
  "insufficient_credits",
  "context_window_overflow_in_system_prompt",
]);

/** Per-word typewriter pacing for revealing each step's message live. */
const REVEAL_MS = 18;

/** Split a complete message into word-sized reveal chunks. Whitespace boundaries never split a
 *  multi-byte char, so the typewriter can't reintroduce the byte-split glyph. */
function chunkForReveal(text: string): string[] {
  return text.match(/\s*\S+|\s+/gu) ?? [];
}

/** Reveal one complete message word-by-word (a step's text types out live as it arrives). */
async function revealText(text: string, send: (e: ChatStreamEvent) => void, signal?: AbortSignal): Promise<void> {
  for (const piece of chunkForReveal(text)) {
    if (signal?.aborted) return;
    send({ type: "token", text: piece });
    await new Promise((r) => setTimeout(r, REVEAL_MS));
  }
}

/** Per-stream mutable state threaded through the SSE handlers. */
interface StreamState {
  sawAssistant: boolean;
  /** when true, parse her reasoning for a trailing "React: 🔥" line and emit it as a reaction */
  emitReactions: boolean;
  /** full reasoning text accumulated across the turn — we parse the LAST React: marker from it */
  reasoningText: string;
}

/** Pull standalone emoji (incl. ZWJ sequences + variation selectors) out of arbitrary text. */
function extractEmojis(text: string): string[] {
  return (text ?? "").match(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/gu) ?? [];
}

// A "react"-style marker (react / reaction / reacting / react with / reaction:) immediately followed
// by a run of emoji. Requiring the emoji to FOLLOW the marker avoids mistaking an incidental emoji in
// her thinking ("won't react to that 😊") for a reaction.
const REACT_RE =
  /react[a-z]*\s*(?:with|:|=|->|→)?\s*((?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*[\s,]*)+)/giu;

/**
 * Her reaction rides her own reasoning (no sidecar): she's asked to drop a line like "React: 🔥❤️" as
 * the LAST line of her private reasoning. We take the emoji after the LAST such marker only — so an
 * earlier mention of "React:" mid-reasoning (her thinking about whether to react) doesn't fire — then
 * dedupe and cap at 10 (she's told to pile on only when truly excited).
 */
function lastReactionEmojis(reasoning: string): string[] {
  const matches = [...(reasoning ?? "").matchAll(REACT_RE)];
  if (!matches.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of extractEmojis(matches[matches.length - 1][1])) {
    if (!seen.has(e)) {
      seen.add(e);
      out.push(e);
    }
  }
  return out.slice(0, 10);
}

/**
 * Strip a leaked standalone "React: 🔥" LINE out of her VISIBLE reply — the marker belongs in her
 * private reasoning, but the model sometimes echoes it into the message. Inter-emoji separators are
 * limited to spaces/tabs/commas so it can't swallow across lines. Never strips the reply to empty.
 */
function stripReactionLines(text: string): string {
  const stripped = (text ?? "")
    .replace(
      /^[ \t]*react[a-z]*[ \t]*(?:with|:|=|->|→)?[ \t]*(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*[ \t,]*)+[ \t]*$/gimu,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return stripped || text;
}

/**
 * Translate one parsed SSE payload into ChatStreamEvents, revealing each step's assistant message
 * LIVE (word-by-word) as it arrives — so an intermediate message (e.g. a mid-turn question) shows
 * immediately instead of being buffered until the whole turn finishes. Tool/usage/ping frames ignored.
 */
async function emitFromMessage(
  msg: Record<string, unknown>,
  send: (e: ChatStreamEvent) => void,
  signal: AbortSignal | undefined,
  state: StreamState,
): Promise<void> {
  const mt = (msg.message_type ?? (msg as { messageType?: string }).messageType ?? msg.type) as
    | string
    | undefined;
  switch (mt) {
    case "reasoning_message": {
      const text = (msg.reasoning as string) ?? "";
      if (text) {
        if (state.emitReactions) state.reasoningText += text + "\n";
        send({ type: "reasoning", text });
      }
      break;
    }
    case "hidden_reasoning_message": {
      // provider-redacted thinking — usually empty, but surface the cue if any text survives
      const text = (msg.hidden_reasoning as string) ?? "";
      if (text) {
        if (state.emitReactions) state.reasoningText += text + "\n";
        send({ type: "reasoning", text });
      }
      break;
    }
    case "assistant_message": {
      // she's told to keep the React: line in reasoning, but strip it if it leaks into the visible reply
      const text = state.emitReactions ? stripReactionLines(extractText(msg.content)) : extractText(msg.content);
      if (text) {
        // a new spoken step in the same turn (e.g. after a tool call) becomes its OWN bubble
        if (state.sawAssistant) send({ type: "message_break" });
        state.sawAssistant = true;
        await revealText(text, send, signal);
      }
      break;
    }
    case "tool_call_message": {
      // She's finished speaking for this step and is about to run a tool. Close the current bubble and
      // open a fresh one — which renders as the three-dot typing indicator while the tool runs, then
      // fills with her next message. (Only if she actually said something in this bubble; a tool-only
      // step before any speech keeps the existing empty "typing" bubble.) This replaces the trailing
      // caret on a finished message with a proper "…working" bubble below it.
      if (state.sawAssistant) {
        send({ type: "message_break" });
        state.sawAssistant = false;
      }
      break;
    }
    case "stop_reason": {
      // a failed turn terminates via a stop_reason (then [DONE]), NOT via an HTTP error
      const reason = msg.stop_reason as string | undefined;
      if (reason && FATAL_STOPS.has(reason)) send({ type: "error", message: `Letta: ${reason}` });
      break;
    }
    // tool_return_message / usage_statistics / ping / system / user -> ignored
  }
}

/** Parse one SSE block (one or more `data:` lines) and dispatch it. Returns true on the [DONE] sentinel. */
async function handleSseBlock(
  raw: string,
  send: (e: ChatStreamEvent) => void,
  signal: AbortSignal | undefined,
  state: StreamState,
): Promise<boolean> {
  const data = raw
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .join("\n");
  if (!data) return false;
  if (data === "[DONE]") return true;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return false; // malformed/keepalive frame
  }
  await emitFromMessage(parsed, send, signal, state);
  return false;
}

/**
 * Build a Letta message `content`: a plain string for text-only, or a parts list when an image is
 * attached. Letta 0.16.x uses its OWN image schema — `{ type: "image", source: {...} }` — and
 * REJECTS OpenAI's `{ type: "image_url" }` for MessageCreate (422 union_tag_invalid). A base64 data
 * URL becomes a base64 source; any other string is treated as a remote URL source.
 */
function buildContent(message: string, images: string[]): string | unknown[] {
  if (!images.length) return message;
  const parts: unknown[] = [];
  if (message) parts.push({ type: "text", text: message });
  for (const image of images) {
    const m = /^data:([^;]+);base64,(.*)$/s.exec(image);
    parts.push(
      m
        ? { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } }
        : { type: "image", source: { type: "url", url: image } },
    );
  }
  return parts;
}

// Jova's vault folder (Letta Source) is stable; resolve its id by name once and cache it.
let cachedVaultId: string | null = null;

async function resolveVaultFolderId(): Promise<string> {
  if (cachedVaultId) return cachedVaultId;
  const res = await fetch(`${BASE}/v1/folders/name/${encodeURIComponent(VAULT_NAME)}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (res.ok) {
    const d = (await res.json().catch(() => null)) as string | { id?: string } | null;
    const id = typeof d === "string" ? d : d?.id;
    if (id) return (cachedVaultId = id);
  }
  throw new Error(`Letta vault folder "${VAULT_NAME}" not found (${res.status})`);
}

/**
 * Upload a dropped file into Jova's vault folder (Letta Source). Letta parses + embeds it; she then
 * reads it with her grep_files / open_files tools. Best-effort waits for ingestion to finish so a
 * same-turn question can find it (capped, so a slow parse never hangs the reply).
 */
export async function uploadToVault(file: VaultFile): Promise<void> {
  const fid = await resolveVaultFolderId();
  const m = /^data:([^;]+);base64,(.*)$/s.exec(file.dataUrl);
  const bytes = m ? Buffer.from(m[2], "base64") : Buffer.from(file.dataUrl, "utf8");
  const form = new FormData();
  // don't set Content-Type — fetch adds the multipart boundary itself
  form.append("file", new Blob([bytes], { type: file.mime || m?.[1] || "application/octet-stream" }), file.name);
  const res = await fetch(`${BASE}/v1/folders/${fid}/upload`, { method: "POST", headers: authHeaders(), body: form });
  if (!res.ok) throw new Error(`vault upload ${res.status}: ${(await res.text().catch(() => "")).slice(0, 150)}`);
  const fileId = ((await res.json().catch(() => null)) as { id?: string } | null)?.id;
  for (let i = 0; i < 10 && fileId; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const lf = await fetch(`${BASE}/v1/folders/${fid}/files`, { headers: authHeaders(), cache: "no-store" });
    if (!lf.ok) break;
    const files = (await lf.json().catch(() => [])) as Array<{ id?: string; processing_status?: string }>;
    const me = files.find((f) => f.id === fileId);
    if (!me || me.processing_status === "completed" || me.processing_status === "error") break;
  }
}

/**
 * Stream one user turn from Letta, emitting ChatStreamEvents via `send`. Does NOT emit the final
 * `{ type: "done" }` — the route owns that so it fires on success and on error alike. Up to 5
 * attachments: image attachments go inline to the vision model; file attachments are uploaded to her
 * vault first, and the message tells her they're there to read.
 */
export async function streamLetta(
  message: string,
  send: (e: ChatStreamEvent) => void,
  signal?: AbortSignal,
  attachments: OutgoingAttachment[] = [],
  emitReactions = false,
): Promise<void> {
  const agentId = await resolveAgentId();
  const images = attachments.filter((a) => a.kind === "image").map((a) => a.dataUrl);
  const files = attachments.filter((a) => a.kind === "file");
  let userText = message;
  if (files.length) {
    // Note framing matters: a bracketed imperative like "[file added… use your tools]" trips provider
    // prompt-injection filters (bracketed_role_spoofing -> 403). Keep it natural prose, no square
    // brackets. And don't let an upload failure kill the whole turn.
    const added: string[] = [];
    const failed: string[] = [];
    for (const file of files) {
      try {
        await uploadToVault(file);
        added.push(file.name);
      } catch (e) {
        failed.push(`"${file.name}" (${String(e).slice(0, 100)})`);
      }
    }
    const parts: string[] = [];
    if (added.length)
      parts.push(
        added.length === 1
          ? `I've added the file "${added[0]}" to my vault — you can read it with your file tools.`
          : `I've added these files to my vault — you can read them with your file tools: ${added.map((n) => `"${n}"`).join(", ")}.`,
      );
    if (failed.length)
      parts.push(`Heads up: ${failed.join("; ")} couldn't be added. Letta's folder accepts PDF, text, JSON, and code files.`);
    const note = parts.join(" ");
    userText = message ? `${message}\n\n${note}` : note;
  }
  const res = await fetch(`${BASE}/v1/agents/${agentId}/messages/stream`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json", Accept: "text/event-stream" }),
    body: JSON.stringify({
      messages: [{ role: "user", content: buildContent(userText, images) }],
      // Step streaming (NOT token streaming). Letta's stream_tokens=true path shreds the reply
      // into per-token fragments and can split a multi-byte char (emoji) across two of them,
      // yielding a stray garbled glyph. Step streaming delivers each assistant_message as one
      // server-assembled, correctly-encoded string; we reveal EACH step's message live (word by
      // word) as it arrives, so intermediate messages appear immediately, not buffered to the end.
      stream_tokens: false,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Letta stream ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const state: StreamState = { sawAssistant: false, emitReactions, reasoningText: "" };
  let buf = "";
  let ended = false;
  outer: for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE events are separated by a blank line.
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      if (await handleSseBlock(block, send, signal, state)) {
        ended = true;
        break outer;
      }
    }
  }
  if (!ended && buf.trim()) await handleSseBlock(buf, send, signal, state);

  // Her reaction — parse the LAST "React: 🔥" marker from her full reasoning (deduped, capped at 10).
  if (state.emitReactions) {
    const emojis = lastReactionEmojis(state.reasoningText);
    if (emojis.length) send({ type: "reaction", emojis });
  }
}
