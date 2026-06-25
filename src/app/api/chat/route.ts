import type { ChatStreamEvent } from "@/lib/jova/types";
import { generateMockReply, tokenize } from "@/lib/jova/mock";
import { config } from "@/lib/config";
import { streamLetta } from "@/lib/jova/letta";

export const runtime = "nodejs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The BFF chat endpoint. Streams NDJSON ChatStreamEvents to the browser.
 *
 * Backend is chosen by JOVA_BACKEND (src/lib/config.ts): "mock" (default, offline demo) or
 * "letta" (the real agent, server-only secrets — see CONNECTING.md). Both paths emit the SAME
 * events, so the frontend is backend-agnostic.
 */
export async function POST(req: Request) {
  let message = "";
  let image: string | undefined;
  let file: { name: string; mime: string; dataUrl: string } | undefined;
  try {
    const body = await req.json();
    message = typeof body?.message === "string" ? body.message : "";
    if (typeof body?.image === "string" && body.image) image = body.image;
    const f = body?.file;
    if (f && typeof f.name === "string" && typeof f.dataUrl === "string") {
      file = { name: f.name, mime: typeof f.mime === "string" ? f.mime : "", dataUrl: f.dataUrl };
    }
  } catch {
    /* empty body -> empty message */
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatStreamEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));

      try {
        if (config.backend === "letta") {
          // Real Jova. streamLetta forwards reasoning/mood immediately and reveals each step's
          // assistant message live (word-by-word) as it arrives, so intermediate messages
          // (e.g. a mid-turn question) show right away instead of waiting for the whole turn.
          await streamLetta(message, send, req.signal, image, file);
          send({ type: "done" });
        } else {
          // Mock brain — her reasoning is an animation cue, not shown to the user.
          const reply = generateMockReply(message);
          send({ type: "reasoning", text: reply.reasoning });
          await sleep(220);

          for (const tk of tokenize(reply.text)) {
            send({ type: "token", text: tk });
            await sleep(20 + Math.random() * 45);
          }

          send({ type: "mood", mood: reply.mood });
          send({ type: "done" });
        }
      } catch (err) {
        send({ type: "error", message: String(err) });
        send({ type: "done" });
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
