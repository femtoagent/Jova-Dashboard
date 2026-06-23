import { config } from "@/lib/config";
import { lettaHealth } from "@/lib/jova/letta";

export const runtime = "nodejs";

/**
 * BFF health. In mock mode it just reports liveness; in letta mode it pings Letta's own
 * GET /v1/health/ through the BFF so the browser can confirm the real backend is reachable
 * (and see its version) without ever talking to Letta directly.
 */
export async function GET() {
  if (config.backend === "letta") {
    const h = await lettaHealth();
    return Response.json({
      status: h.ok ? "ok" : "degraded",
      backend: "letta",
      lettaVersion: h.version,
      error: h.error,
      time: Date.now(),
    });
  }
  return Response.json({ status: "ok", backend: config.backend, time: Date.now() });
}
