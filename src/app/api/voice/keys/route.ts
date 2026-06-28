/**
 * Voice API-key management BFF. Each provider holds multiple named keys with one active; keys are
 * stored server-side and NEVER returned to the browser (GET yields only ••••last4 + the name).
 *  - GET    → { deepgram, elevenlabs } masked status (keys[] + activeId)
 *  - POST   → add: { provider, key, name }  | activate: { provider, activateId }
 *  - DELETE → ?provider=…&id=… : forget one stored key
 */
export const runtime = "nodejs";

import { getSecret, addKey, removeKey, setActiveKey, statusFor, type Provider } from "@/lib/server/secrets";

const PROVIDERS: Provider[] = ["deepgram", "elevenlabs"];
const isProvider = (v: unknown): v is Provider => typeof v === "string" && PROVIDERS.includes(v as Provider);

async function status() {
  return { deepgram: await statusFor("deepgram"), elevenlabs: await statusFor("elevenlabs") };
}

/** Probe the key so we don't store a dud. true/false, or null if the check itself failed (network). */
async function verify(provider: Provider, key: string): Promise<boolean | null> {
  try {
    if (provider === "deepgram") {
      const r = await fetch("https://api.deepgram.com/v1/projects", { headers: { Authorization: `Token ${key}` } });
      if (r.status === 401 || r.status === 403) return false;
      return r.ok ? true : null;
    }
    const r = await fetch("https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": key } });
    if (r.status === 401 || r.status === 403) return false;
    return r.ok ? true : null;
  } catch {
    return null;
  }
}

export async function GET() {
  return Response.json(await status());
}

export async function POST(req: Request) {
  let body: { provider?: unknown; key?: unknown; name?: unknown; activateId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }
  if (!isProvider(body.provider)) return Response.json({ error: "unknown provider" }, { status: 400 });

  // activate an existing key
  if (typeof body.activateId === "string") {
    await setActiveKey(body.provider, body.activateId);
    return Response.json(await status());
  }

  // add a new key
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const name = (typeof body.name === "string" ? body.name.trim() : "") || defaultName(body.provider);
  if (!key) return Response.json({ error: "missing key" }, { status: 400 });

  const verified = await verify(body.provider, key);
  if (verified === false) return Response.json({ error: "That key was rejected by the provider." }, { status: 401 });

  await addKey(body.provider, key, name);
  return Response.json({ ...(await status()), verified: verified === true });
}

export async function DELETE(req: Request) {
  const sp = new URL(req.url).searchParams;
  const provider = sp.get("provider");
  const id = sp.get("id");
  if (!isProvider(provider)) return Response.json({ error: "unknown provider" }, { status: 400 });
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });
  await removeKey(provider, id);
  // dropping the active key may hand off to another → reflect it
  void getSecret(provider);
  return Response.json(await status());
}

function defaultName(p: Provider): string {
  return p === "deepgram" ? "Deepgram" : "ElevenLabs";
}
