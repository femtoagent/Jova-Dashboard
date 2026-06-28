/**
 * STT token BFF — mints a SHORT-LIVED Deepgram key so the browser can open a realtime WebSocket to
 * Deepgram directly (Next.js `next start` can't host a WS server, and the brief explicitly allows the
 * short-lived-token path). The long-lived DEEPGRAM_API_KEY never leaves the server. The ephemeral key
 * is scoped to usage:write and expires quickly. Returns 503 when voice isn't configured.
 *
 * Why the ephemeral KEY (POST /projects/{id}/keys) and not /v1/auth/grant: the browser authenticates
 * over the WS subprotocol `["token", <key>]`, which is the ONE documented browser pattern that works
 * for sure. The newer grant-JWT flow has an open SDK issue (#392) about WS handshake failures and no
 * documented subprotocol, so we avoid it. The trade-off: the parent DEEPGRAM_API_KEY must have rights
 * to create keys (an Owner/Admin-scoped key — the default when you make a key as the account owner).
 */
export const runtime = "nodejs";

import { getSecret } from "@/lib/server/secrets";

const DG = "https://api.deepgram.com/v1";
// cache the project id per key, so swapping the key in the UI re-resolves instead of using a stale id
let cached: { key: string; projectId: string } | null = null;

async function resolveProjectId(key: string): Promise<string> {
  if (cached && cached.key === key) return cached.projectId;
  const r = await fetch(`${DG}/projects`, { headers: { Authorization: `Token ${key}` }, cache: "no-store" });
  if (!r.ok) throw new Error(`projects ${r.status}`);
  const j = (await r.json()) as { projects?: Array<{ project_id?: string }> };
  const id = j.projects?.[0]?.project_id;
  if (!id) throw new Error("no Deepgram project found");
  cached = { key, projectId: id };
  return id;
}

export async function POST() {
  const secret = await getSecret("deepgram");
  if (!secret) return Response.json({ error: "voice not configured" }, { status: 503 });
  const key = secret.key;
  try {
    const projectId = await resolveProjectId(key);
    const r = await fetch(`${DG}/projects/${projectId}/keys`, {
      method: "POST",
      headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        comment: "jova-stt-ephemeral",
        scopes: ["usage:write"],
        time_to_live_in_seconds: 120, // browser must connect within 2 min; the WS itself can run longer
      }),
    });
    if (!r.ok) {
      const detail = (await r.text().catch(() => "")).slice(0, 200);
      // 401/403 here almost always means the parent key can't create keys — point the user at the fix.
      const hint = r.status === 401 || r.status === 403 ? " (the DEEPGRAM_API_KEY needs key-creation rights — use an Owner/Admin-scoped key)" : "";
      return Response.json({ error: `Deepgram key ${r.status}: ${detail}${hint}` }, { status: 502 });
    }
    const j = (await r.json()) as { key?: string };
    if (!j.key) return Response.json({ error: "Deepgram returned no key" }, { status: 502 });
    return Response.json({ key: j.key });
  } catch (e) {
    return Response.json({ error: String(e).slice(0, 200) }, { status: 502 });
  }
}
