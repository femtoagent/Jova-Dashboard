import { config } from "@/lib/config";
import { WORKSHOP_BASE } from "@/lib/jova/workshop";

export const runtime = "nodejs";

/**
 * BFF: stream ONE vault doc's bytes to the browser for the read-only preview. `path` is vault-relative;
 * the workshop guards traversal. PDFs come back with an inline content-type so they render in an
 * <iframe>. In mock mode we serve a small placeholder so the panel is demoable offline.
 */
export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!path) return new Response("path required", { status: 400 });

  if (config.backend !== "letta") {
    const html =
      `<!doctype html><body style="margin:0;font:14px system-ui;color:#bcd;background:#0a0f14;` +
      `display:grid;place-items:center;height:100vh;text-align:center;padding:0 2rem">` +
      `Demo mode — the live preview shows the real document once connected to Jova.</body>`;
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  }

  try {
    const upstream = await fetch(`${WORKSHOP_BASE}/file?path=${encodeURIComponent(path)}`, { cache: "no-store" });
    if (!upstream.ok) return new Response("not found", { status: upstream.status });
    const buf = await upstream.arrayBuffer();
    const headers = new Headers({ "cache-control": "no-store" });
    headers.set("content-type", upstream.headers.get("content-type") ?? "application/octet-stream");
    const cd = upstream.headers.get("content-disposition");
    if (cd) headers.set("content-disposition", cd);
    return new Response(buf, { headers });
  } catch (e) {
    return new Response(String(e), { status: 502 });
  }
}
