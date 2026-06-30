import type { ChatStreamEvent } from "@/lib/jova/types";
import { generateMockSoul, tokenize } from "@/lib/jova/mock";
import { getSecret } from "@/lib/server/secrets";

export const runtime = "nodejs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
};

// Default generation brain. The `@preset/<slug>` form is accepted by OpenRouter directly (the routing
// proxy uses the same form). Override with OPENROUTER_NEXUS_MODEL for a specific model id.
const NEXUS_MODEL = process.env.OPENROUTER_NEXUS_MODEL ?? "@preset/jova-conversation";
const APP_URL = process.env.JOVA_APP_URL ?? "https://jova-dashboard.local";

type Kind = "persona" | "human";

function systemPrompt(kind: Kind, ctx: { role?: string; team?: string; name?: string }): string {
  const who = ctx.name ? `named "${ctx.name}"` : "";
  const roleLine = ctx.role ? ` Their role is "${ctx.role}".` : "";
  const teamLine = ctx.team ? ` They belong to the team "${ctx.team}".` : "";
  if (kind === "human") {
    return (
      `You are Nexus, composing the "human" context block for an AI agent ${who}.${roleLine}${teamLine} ` +
      `This block describes WHO the agent talks with and the setting — light context only, NOT the agent's own ` +
      `identity. A few clear sentences. Output ONLY the block text — no preamble, headings, or quotes.`
    );
  }
  return (
    `You are Nexus, composing the PERSONA block (core identity + voice) for an AI agent ${who}.${roleLine}${teamLine} ` +
    `Write a vivid persona: who they are, how they speak, what they care about, their manner and quirks. Keep it ` +
    `tight and characterful. Output ONLY the persona prose — no preamble, headings, or quotes.`
  );
}

/** A kind-aware mock for the no-key/demo path so a "human" block reads like context-about-the-operator,
 *  not an identity. (The real OpenRouter path threads kind + team through systemPrompt.) */
function mockHuman(prompt?: string, name?: string, role?: string, team?: string): string {
  const who = name || "This agent";
  const r = role ? ` (${role})` : "";
  const t = team ? ` on the ${team} team` : "";
  const notes = prompt?.trim() ? ` Notes: ${prompt.trim()}.` : "";
  return (
    `${who}${r}${t} speaks with a single operator — the person running this command center.${notes} Keep their ` +
    `goals, preferences, and the project context in mind. This is light context about WHO you talk with, not your own identity.`
  );
}

/**
 * BFF: Nexus writes an agent's persona/human block from a prompt. Streams the SAME NDJSON
 * ChatStreamEvents as /api/chat (reasoning -> token… -> done). REAL generation via OpenRouter when a key
 * is configured (read server-side, never exposed); falls back to the mock soul when there's no key so the
 * demo always works.
 */
export async function POST(req: Request) {
  let prompt = "";
  let role: string | undefined;
  let name: string | undefined;
  let team: string | undefined;
  let kind: Kind = "persona";
  try {
    const body = await req.json();
    prompt = typeof body?.prompt === "string" ? body.prompt : "";
    role = typeof body?.role === "string" ? body.role : undefined;
    name = typeof body?.name === "string" ? body.name : undefined;
    team = typeof body?.team === "string" ? body.team : undefined;
    if (body?.kind === "human" || body?.kind === "persona") kind = body.kind;
  } catch {
    /* empty body -> empty prompt */
  }

  const encoder = new TextEncoder();
  const key = (await getSecret("openrouter"))?.key;

  // No OpenRouter key → mock soul (offline/demo). Keeps the exact stream contract. Kind-aware so a
  // "human" block doesn't read like a persona.
  if (!key) {
    const soul = kind === "human" ? mockHuman(prompt, name, role, team) : generateMockSoul(prompt, role, name);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (e: ChatStreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        try {
          send({ type: "reasoning", text: "Nexus is composing…" });
          await sleep(220);
          for (const tk of tokenize(soul)) {
            send({ type: "token", text: tk });
            await sleep(18 + Math.random() * 50);
          }
          send({ type: "done" });
        } catch (err) {
          send({ type: "error", message: String(err) });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: NDJSON_HEADERS });
  }

  // Real generation via OpenRouter chat-completions (streamed).
  const messages = [
    { role: "system", content: systemPrompt(kind, { role, team, name }) },
    { role: "user", content: prompt || `Write a ${kind} block for this agent.` },
  ];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatStreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        send({ type: "reasoning", text: "Nexus is composing…" });
        const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "HTTP-Referer": APP_URL,
            "X-Title": "Jova Nexus",
          },
          body: JSON.stringify({ model: NEXUS_MODEL, messages, stream: true }),
          signal: req.signal,
        });
        if (!r.ok || !r.body) {
          const detail = (await r.text().catch(() => "")).slice(0, 200);
          send({ type: "error", message: `Nexus generation failed (${r.status})${detail ? `: ${detail}` : ""}` });
          send({ type: "done" });
          controller.close();
          return;
        }
        // Translate OpenRouter SSE (`data: {json}` frames, `[DONE]` sentinel) into our token events.
        const reader = r.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let finished = false;
        while (!finished) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line.startsWith("data:")) continue; // skip blank lines + `:` keep-alive comments
            const data = line.slice(5).trim();
            if (data === "[DONE]") {
              finished = true;
              break;
            }
            try {
              const j = JSON.parse(data) as { choices?: Array<{ delta?: { content?: unknown } }> };
              const delta = j?.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta) send({ type: "token", text: delta });
            } catch {
              /* partial / non-JSON keep-alive — ignore */
            }
          }
        }
        send({ type: "done" });
      } catch (err) {
        if (!req.signal.aborted) send({ type: "error", message: String(err) });
        send({ type: "done" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS });
}
