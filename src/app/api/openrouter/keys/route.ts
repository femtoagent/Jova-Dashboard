/**
 * OpenRouter API-key management BFF. Mirrors /api/voice/keys but for the single "openrouter" provider.
 * Keys are stored server-side and NEVER returned in full (GET yields only ••••last4 + the name). One
 * key is active — used by the presets fetch (and available to anything else server-side).
 *  - GET    → { openrouter } masked status (keys[] + activeId)
 *  - POST   → add: { key, name } | activate: { activateId }
 *  - DELETE → ?id=… : forget one stored key
 */
export const runtime = "nodejs";

import { getSecret, addKey, removeKey, setActiveKey, statusFor } from "@/lib/server/secrets";

/** Probe the key so we don't store a dud. true/false, or null if the check itself failed (network). */
async function verify(key: string): Promise<boolean | null> {
  try {
    const r = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` } });
    if (r.status === 401 || r.status === 403) return false;
    return r.ok ? true : null;
  } catch {
    return null;
  }
}

export async function GET() {
  return Response.json({ openrouter: await statusFor("openrouter") });
}

export async function POST(req: Request) {
  let body: { key?: unknown; name?: unknown; activateId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad request" }, { status: 400 });
  }

  // activate an existing key
  if (typeof body.activateId === "string") {
    await setActiveKey("openrouter", body.activateId);
    return Response.json({ openrouter: await statusFor("openrouter") });
  }

  // add a new key
  const key = typeof body.key === "string" ? body.key.trim() : "";
  const name = (typeof body.name === "string" ? body.name.trim() : "") || "OpenRouter";
  if (!key) return Response.json({ error: "missing key" }, { status: 400 });

  const verified = await verify(key);
  if (verified === false) return Response.json({ error: "That key was rejected by OpenRouter." }, { status: 401 });

  await addKey("openrouter", key, name);
  return Response.json({ openrouter: await statusFor("openrouter"), verified: verified === true });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ error: "missing id" }, { status: 400 });
  await removeKey("openrouter", id);
  void getSecret("openrouter"); // dropping the active key may hand off to another
  return Response.json({ openrouter: await statusFor("openrouter") });
}
