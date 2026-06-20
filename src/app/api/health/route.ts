import { config } from "@/lib/config";

export const runtime = "nodejs";

export async function GET() {
  // Later: also ping Letta's GET /v1/health/ (trailing slash!) through the BFF.
  return Response.json({ status: "ok", backend: config.backend, time: Date.now() });
}
