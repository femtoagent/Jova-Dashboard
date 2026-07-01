import { config } from "@/lib/config";
import { createAgent, deleteAgent, getAgentDetail, listAgents, setAgentPreset, updateAgent, type LettaAgentInfo } from "@/lib/jova/letta";
import { isProtectedAgent } from "@/lib/agents/characters";
import { DEFAULT_MEMORY_PROFILE, profileForTier, type MemoryProfile } from "@/lib/agents/memoryProfile";

export const runtime = "nodejs";

/**
 * BFF: list real agents, set an agent's OpenRouter preset, and create new (character) agents. The
 * preset is persisted as the agent's Letta model handle (`openai-proxy/<slug>`), which the proxy
 * reads to route the turn — see letta.ts setAgentPreset + or_proxy.py. Falls back to an in-memory
 * mock roster when the backend is the mock, so the UI (Routing, Voice, chat picker) still renders +
 * the create flow is exercisable offline. Secrets stay server-side.
 */

// Mutable in mock mode so a mock-created agent shows up in subsequent lists (single process).
const mockAgents: LettaAgentInfo[] = [
  { id: "jova", name: "jova", preset: "", role: "your companion", team: "", memory: "ranked", memoryProfile: profileForTier("deep") },
  { id: "jova-docs", name: "jova-docs", preset: "file-medium", role: "documents", team: "", memory: "letta" },
  { id: "baal", name: "baal", preset: "", role: "Lord of Destruction", team: "", memory: "none" },
  { id: "mira", name: "mira", preset: "", role: "nekomimi", team: "", memory: "ranked", memoryProfile: DEFAULT_MEMORY_PROFILE },
];

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (config.backend !== "letta") {
    if (id) {
      const a = mockAgents.find((x) => x.id === id);
      if (!a) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json({ agent: { ...a, persona: "", human: "", framework: "letta", memory: "letta", memoryProfile: DEFAULT_MEMORY_PROFILE, personaProtected: isProtectedAgent(a.name), humanProtected: isProtectedAgent(a.name) }, mock: true });
    }
    return Response.json({ agents: mockAgents, mock: true });
  }
  try {
    if (id) return Response.json({ agent: await getAgentDetail(id) });
    return Response.json({ agents: await listAgents() });
  } catch (e) {
    return Response.json({ error: String(e), agents: [] }, { status: 502 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string; persona?: string; human?: string; preset?: string; role?: string; team?: string; framework?: string; memory?: string; memoryProfile?: MemoryProfile };
  const name = (body.name ?? "").trim();
  if (!name) return Response.json({ error: "name required" }, { status: 400 });

  if (config.backend !== "letta") {
    if (mockAgents.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
      return Response.json({ error: `an agent named "${name}" already exists` }, { status: 409 });
    }
    const agent: LettaAgentInfo = { id: name.toLowerCase(), name, preset: body.preset ?? "", role: body.role ?? "", team: body.team ?? "" };
    mockAgents.push(agent);
    return Response.json({ agent, mock: true });
  }

  if (!body.persona?.trim()) return Response.json({ error: "persona required" }, { status: 400 });
  try {
    return Response.json({
      agent: await createAgent({ name, persona: body.persona, human: body.human, preset: body.preset, role: body.role, team: body.team, framework: body.framework, memory: body.memory, memoryProfile: body.memoryProfile }),
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    op?: string;
    agentId?: string;
    preset?: string;
    name?: string;
    role?: string;
    team?: string;
    memory?: string;
    memoryProfile?: MemoryProfile;
    persona?: string;
    human?: string;
  };
  if (!body.agentId) return Response.json({ error: "agentId required" }, { status: 400 });

  // identity / persona / human update
  if (body.op === "update") {
    if (config.backend !== "letta") {
      const found = mockAgents.find((a) => a.id === body.agentId);
      if (found) {
        if (body.name !== undefined) found.name = body.name;
        if (body.role !== undefined) found.role = body.role;
        if (body.team !== undefined) found.team = body.team;
      }
      const agent: LettaAgentInfo =
        found ?? { id: body.agentId, name: body.name ?? body.agentId, preset: "", role: body.role ?? "", team: body.team ?? "" };
      return Response.json({ agent, mock: true });
    }
    try {
      return Response.json({
        agent: await updateAgent({
          agentId: body.agentId,
          name: body.name,
          role: body.role,
          team: body.team,
          memory: body.memory,
          memoryProfile: body.memoryProfile,
          persona: body.persona,
          human: body.human,
        }),
      });
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 502 });
    }
  }

  // preset change
  if (config.backend !== "letta") {
    const found = mockAgents.find((a) => a.id === body.agentId);
    const agent: LettaAgentInfo = {
      id: body.agentId,
      name: found?.name ?? body.agentId,
      preset: body.preset ?? "",
      role: found?.role ?? "",
      team: found?.team ?? "",
    };
    if (found) found.preset = agent.preset;
    return Response.json({ agent, mock: true });
  }
  try {
    return Response.json({ agent: await setAgentPreset(body.agentId, body.preset ?? "") });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { agentId?: string; name?: string };
  const agentId = (body.agentId ?? "").trim();
  if (!agentId) return Response.json({ error: "agentId required" }, { status: 400 });

  // Guard critical agents server-side (don't trust the client). Decide protection from the name the
  // AUTHORITATIVE roster reports for this id — never let a client-supplied name skip/override the lookup.
  const claimed = (body.name ?? "").trim();

  if (config.backend !== "letta") {
    const found = mockAgents.find((a) => a.id === agentId);
    if (isProtectedAgent(found?.name ?? "") || isProtectedAgent(claimed)) {
      return Response.json({ error: `"${found?.name ?? claimed}" is protected and can't be deleted` }, { status: 403 });
    }
    const i = mockAgents.findIndex((a) => a.id === agentId);
    if (i >= 0) mockAgents.splice(i, 1);
    return Response.json({ ok: true, mock: true });
  }

  try {
    const resolved = (await listAgents()).find((a) => a.id === agentId)?.name ?? "";
    if (isProtectedAgent(resolved) || isProtectedAgent(claimed)) {
      return Response.json({ error: `"${resolved || claimed}" is protected and can't be deleted` }, { status: 403 });
    }
    await deleteAgent(agentId);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
