/**
 * BFF: agent persona/human version history (server-side store). GET ?agentId= returns both kinds'
 * histories; POST mutates one kind (append/select/setCurrent) or migrates a Create-flow draft (claim).
 * The store file is server-only and gitignored — see src/lib/server/agentVersions.ts.
 */
export const runtime = "nodejs";

import {
  getHistory,
  appendVersion,
  seedIfEmpty,
  selectVersion,
  setCurrent,
  claimDraft,
  type VersionKind,
  type VersionSource,
} from "@/lib/server/agentVersions";

const isKind = (k: unknown): k is VersionKind => k === "persona" || k === "human";

export async function GET(req: Request) {
  const agentId = new URL(req.url).searchParams.get("agentId") ?? "";
  if (!agentId) return Response.json({ error: "agentId required" }, { status: 400 });
  return Response.json(await getHistory(agentId));
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    agentId?: string;
    kind?: unknown;
    action?: string;
    text?: string;
    prompt?: string;
    source?: VersionSource;
    versionId?: string;
    draftId?: string;
    realId?: string;
  };

  if (body.action === "claim") {
    if (!body.draftId || !body.realId) return Response.json({ error: "draftId + realId required" }, { status: 400 });
    await claimDraft(body.draftId, body.realId);
    return Response.json(await getHistory(body.realId));
  }

  if (!body.agentId) return Response.json({ error: "agentId required" }, { status: 400 });
  if (!isKind(body.kind)) return Response.json({ error: "kind must be persona|human" }, { status: 400 });

  try {
    if (body.action === "append") {
      if (typeof body.text !== "string") return Response.json({ error: "text required" }, { status: 400 });
      return Response.json(await appendVersion(body.agentId, body.kind, body.text, { prompt: body.prompt, source: body.source }));
    }
    if (body.action === "seedIfEmpty") {
      if (typeof body.text !== "string") return Response.json({ error: "text required" }, { status: 400 });
      return Response.json(await seedIfEmpty(body.agentId, body.kind, body.text, { source: body.source }));
    }
    if (body.action === "select") {
      if (!body.versionId) return Response.json({ error: "versionId required" }, { status: 400 });
      return Response.json(await selectVersion(body.agentId, body.kind, body.versionId));
    }
    if (body.action === "setCurrent") {
      if (typeof body.text !== "string") return Response.json({ error: "text required" }, { status: 400 });
      return Response.json(await setCurrent(body.agentId, body.kind, body.text));
    }
    return Response.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
