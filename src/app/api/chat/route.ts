import type { ChatStreamEvent } from "@/lib/jova/types";
import { generateMockReply, tokenize } from "@/lib/jova/mock";

export const runtime = "nodejs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The BFF chat endpoint. Streams NDJSON ChatStreamEvents.
 *
 * MOCK today. To go live (after CONNECTING.md): connect to Letta with
 * Authorization: Bearer <LETTA_SERVER_PASSWORD>, call agents.messages.create(...streaming),
 * and translate Letta's typed messages into the SAME events emitted below:
 *   reasoning_message -> {type:"reasoning"}, assistant_message tokens -> {type:"token"},
 *   affect block -> {type:"mood"}. The frontend won't change.
 */
export async function POST(req: Request) {
  let message = "";
  try {
    const body = await req.json();
    message = typeof body?.message === "string" ? body.message : "";
  } catch {
    /* empty body -> empty message */
  }

  const reply = generateMockReply(message);
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatStreamEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));

      try {
        // brief "thinking" beat — her reasoning is an animation cue, not shown to the user
        send({ type: "reasoning", text: reply.reasoning });
        await sleep(220);

        for (const tk of tokenize(reply.text)) {
          send({ type: "token", text: tk });
          await sleep(20 + Math.random() * 45);
        }

        send({ type: "mood", mood: reply.mood });
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
