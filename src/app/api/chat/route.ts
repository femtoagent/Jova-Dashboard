import type { ChatStreamEvent, StreamedDoc } from "@/lib/jova/types";
import { generateMockReply, tokenize } from "@/lib/jova/mock";
import { config } from "@/lib/config";
import { streamLetta } from "@/lib/jova/letta";
import { listDocs } from "@/lib/jova/workshop";

export const runtime = "nodejs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Build a StreamedDoc (name/category/kind) from a vault-relative path + mtime. */
function toStreamedDoc(path: string, mtime: number): StreamedDoc {
  const slash = path.lastIndexOf("/");
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  const category = slash >= 0 ? path.slice(0, slash) : "";
  const dot = name.lastIndexOf(".");
  const kind = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
  return { path, name, category, kind, mtime };
}

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
          // Snapshot the vault before the turn so we can detect anything jova-docs files during it.
          // The workshop reports its own mtimes, so the diff is robust to client/server clock skew.
          let before: Map<string, number> | null = null;
          try {
            before = new Map((await listDocs()).map((d) => [d.path, d.mtime]));
          } catch {
            /* workshop unreachable (tunnel down) — the live doc preview just won't fire this turn */
          }

          // Real Jova. streamLetta forwards reasoning/mood immediately and reveals each step's
          // assistant message live (word-by-word) as it arrives.
          await streamLetta(message, send, req.signal, image, file);

          // Push-on-complete: emit a `doc` event for every doc that's new or newer than the snapshot.
          if (before) {
            try {
              const fresh = (await listDocs())
                .filter((d) => {
                  const m = before!.get(d.path);
                  return m === undefined || d.mtime > m;
                })
                .sort((a, b) => a.mtime - b.mtime); // oldest first -> the newest ends up "current"
              for (const d of fresh) send({ type: "doc", doc: toStreamedDoc(d.path, d.mtime) });
            } catch {
              /* best-effort — a failed diff just means no live preview this turn */
            }
          }
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
          // demo: if the message looks doc-related, surface a placeholder so the live panel is visible offline
          if (/\b(resume|cv|document|doc|pdf|report|slide|deck|spreadsheet|render)\b/i.test(message)) {
            send({ type: "doc", doc: toStreamedDoc("Career/Sample Resume.pdf", Date.now() / 1000) });
          }
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
