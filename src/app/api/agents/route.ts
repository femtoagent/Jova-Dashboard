import { config } from "@/lib/config";
import { listAgents, setAgentPreset, type LettaAgentInfo } from "@/lib/jova/letta";

export const runtime = "nodejs";

/**
 * BFF: list real agents and set an agent's OpenRouter preset. The preset is persisted as the agent's
 * Letta model handle (`openai-proxy/<slug>`), which the proxy reads to route the turn — see
 * letta.ts setAgentPreset + or_proxy.py. Falls back to a mock roster when the backend is the mock,
 * so the Documents UI still renders offline. Secrets stay server-side.
 */

const MOCK_AGENTS: LettaAgentInfo[] = [
  { id: "jova", name: "jova", preset: "" },
  { id: "jova-docs", name: "jova-docs", preset: "file-medium" },
];

export async function GET() {
  if (config.backend !== "letta") return Response.json({ agents: MOCK_AGENTS, mock: true });
  try {
    return Response.json({ agents: await listAgents() });
  } catch (e) {
    return Response.json({ error: String(e), agents: [] }, { status: 502 });
  }
}

export async function PATCH(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { agentId?: string; preset?: string };
  if (!body.agentId) return Response.json({ error: "agentId required" }, { status: 400 });
  if (config.backend !== "letta") {
    return Response.json({ agent: { id: body.agentId, name: body.agentId, preset: body.preset ?? "" }, mock: true });
  }
  try {
    return Response.json({ agent: await setAgentPreset(body.agentId, body.preset ?? "") });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 502 });
  }
}
