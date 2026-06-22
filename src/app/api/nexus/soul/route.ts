import type { ChatStreamEvent } from "@/lib/jova/types";
import { generateMockSoul, tokenize } from "@/lib/jova/mock";

export const runtime = "nodejs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * BFF endpoint: Nexus writes an agent "soul" from a prompt. Streams the SAME NDJSON
 * ChatStreamEvents as /api/chat (reasoning -> token… -> done), so the existing stream consumer
 * works unchanged. MOCK today; swap generateMockSoul for a real Nexus call later — no UI change.
 */
export async function POST(req: Request) {
  let prompt = "";
  let role: string | undefined;
  let name: string | undefined;
  try {
    const body = await req.json();
    prompt = typeof body?.prompt === "string" ? body.prompt : "";
    role = typeof body?.role === "string" ? body.role : undefined;
    name = typeof body?.name === "string" ? body.name : undefined;
  } catch {
    /* empty body -> empty prompt */
  }

  const soul = generateMockSoul(prompt, role, name);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatStreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        send({ type: "reasoning", text: "Nexus is composing a soul…" });
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

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
