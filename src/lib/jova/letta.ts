import type { ChatStreamEvent, OutgoingAttachment } from "@/lib/jova/types";
import { characterByName, isProtectedAgent, isSystemAgent } from "@/lib/agents/characters";
import { DEFAULT_FRAMEWORK } from "@/lib/agents/frameworks";
import { DEFAULT_MEMORY } from "@/lib/agents/memory";

/**
 * Server-only Letta client (the live half of the BFF seam — see CONNECTING.md §3).
 *
 * The browser never imports this: it reads LETTA_SERVER_PASSWORD straight from server env, so it
 * MUST stay out of any client-reachable module. Its whole job is to talk to the self-hosted Letta
 * server over REST and translate Letta's typed streaming messages into the SAME `ChatStreamEvent`s
 * the mock emits, so the UI is untouched:
 *   reasoning_message -> { type: "reasoning" }   (animation cue only)
 *   assistant_message -> { type: "token" }       (what we display / will speak)
 *   stop_reason!=ok   -> { type: "error" }       (a failed turn ends here, not via HTTP)
 *   stream end        -> caller emits { type: "done" }
 *
 * The exact paths + SSE field names below follow CONNECTING.md / Letta ~0.16.x, but Letta's REST
 * shapes have drifted across versions — verify against the running server before trusting blindly.
 */

const BASE = (process.env.LETTA_BASE_URL ?? "http://127.0.0.1:8283").replace(/\/+$/, "");
const PASSWORD = process.env.LETTA_SERVER_PASSWORD ?? "";
const AGENT_NAME = process.env.LETTA_AGENT_NAME ?? "jova";
const VAULT_NAME = process.env.LETTA_VAULT_FOLDER ?? "jova-vault";

// Per-agent preset routing (single-tenant). An agent's Letta model handle IS the routing signal the
// proxy reads: handle `openai-proxy/<slug>` -> that preset; the bare deepseek handle -> the default
// (jova-conversation). ANY syntactically-valid slug is accepted (not a fixed allow-list) — the proxy
// honors it via the agent's routing block as long as it exists as an OpenRouter preset, so user-added
// presets route with no change here. PRESET_SLUG_RE guards the charset to avoid handle injection.
const PRESET_SLUG_RE = /^[a-z0-9_-]+$/;
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
const PROXY_ENDPOINT = process.env.LETTA_PROXY_ENDPOINT ?? "http://127.0.0.1:4000/v1";

/** An agent and the preset its brain currently routes through. */
export interface LettaAgentInfo {
  id: string;
  name: string;
  /** the preset slug this agent routes to, or "" for the default (legacy deepseek handle). */
  preset: string;
  /** the agent's role / subtitle (e.g. "nekomimi"); from metadata, falling back to the character registry. */
  role: string;
  /** the org team the agent belongs to (display name), or "" for none. */
  team: string;
  /** a short snippet of the persona block, for the list's detailed view (from the list endpoint's blocks). */
  personaSnippet?: string;
}

/** Full agent detail incl. its persona + human memory-block text (for the Edit screen). */
export interface LettaAgentDetail extends LettaAgentInfo {
  persona: string;
  human: string;
  /** the runtime this agent runs on (metadata.framework); "letta" for everything we create today. */
  framework: string;
  /** which long-term memory backend the agent uses (metadata.memory); "letta" = built-in archival. */
  memory: string;
  /** core/protected agent (Jova, system, memory keepers) → block defaults to read-only, unlockable in the UI. */
  personaProtected: boolean;
  humanProtected: boolean;
}

/** The memory blocks carried on an agent payload (list endpoint includes them) or fetched separately. */
function blocksOf(a: Record<string, unknown>): Array<Record<string, unknown>> {
  const mem = a.memory as Record<string, unknown> | undefined;
  const b = (mem?.blocks ?? a.blocks) as unknown;
  return Array.isArray(b) ? (b as Array<Record<string, unknown>>) : [];
}

/** First ~160 chars of the persona/persona_core block, whitespace-collapsed, for the list snippet. */
function personaSnippetFrom(blocks: Array<Record<string, unknown>>): string {
  const b = blocks.find((x) => x.label === "persona") ?? blocks.find((x) => x.label === "persona_core");
  const v = b && typeof b.value === "string" ? b.value : "";
  return v.replace(/\s+/g, " ").trim().slice(0, 160);
}

/** Resolve an agent's role/team from its Letta `metadata`, falling back to the character registry for
 *  role (so seeded characters like Mira show "nekomimi" before any metadata is written). */
function roleTeamFor(name: string, metadata: unknown): { role: string; team: string } {
  const m = (metadata && typeof metadata === "object" ? metadata : {}) as Record<string, unknown>;
  const metaRole = typeof m.role === "string" ? m.role.trim() : "";
  const role = metaRole || characterByName(name)?.label || "";
  const team = typeof m.team === "string" ? m.team : "";
  return { role, team };
}

/** A non-image attachment: uploaded to Jova's vault folder so she can read it with her file tools. */
export interface VaultFile {
  name: string;
  mime: string;
  /** data URL (data:<mime>;base64,…) */
  dataUrl: string;
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { ...(extra ?? {}) };
  // Self-hosted Letta with a server password expects a bearer token (CONNECTING.md §3).
  if (PASSWORD) h["Authorization"] = `Bearer ${PASSWORD}`;
  return h;
}

/** Liveness ping for /api/health. Trailing slash is required or Letta 307s. */
export async function lettaHealth(): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const res = await fetch(`${BASE}/v1/health/`, { headers: authHeaders(), cache: "no-store" });
    if (!res.ok) return { ok: false, error: `health ${res.status}` };
    const j = (await res.json().catch(() => ({}))) as { version?: string };
    return { ok: true, version: j?.version };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// The agent id is stable for the life of the process; resolve once and cache.
let cachedAgentId: string | null = null;

async function resolveAgentId(): Promise<string> {
  if (cachedAgentId) return cachedAgentId;
  // Prefer a server-side name filter; fall back to listing all and matching by name.
  const urls = [
    `${BASE}/v1/agents/?name=${encodeURIComponent(AGENT_NAME)}`,
    `${BASE}/v1/agents/`,
  ];
  for (const url of urls) {
    const res = await fetch(url, { headers: authHeaders(), cache: "no-store" });
    // A wrong/rotated token fails here — surface it distinctly, not as a misleading "not found".
    if (res.status === 401 || res.status === 403) {
      throw new Error(`Letta rejected the bearer token (${res.status}) — check LETTA_SERVER_PASSWORD`);
    }
    if (!res.ok) continue;
    const list = (await res.json().catch(() => null)) as Array<{ id?: string; name?: string }> | null;
    if (!Array.isArray(list)) continue;
    const hit =
      list.find((a) => a?.name === AGENT_NAME) ?? (list.length === 1 ? list[0] : null);
    if (hit?.id) {
      cachedAgentId = hit.id;
      return hit.id;
    }
  }
  throw new Error(`Letta agent "${AGENT_NAME}" not found at ${BASE}`);
}

/** Derive the preset slug an agent routes to from its llm_config (its single-segment model id). */
function presetFromLlmConfig(lc: Record<string, unknown> | undefined): string {
  if (!lc) return "";
  // A preset routes via a single-segment handle (e.g. "fren"); the default brain is the slash-bearing
  // "deepseek/deepseek-v4-flash". So a bare (no-slash) model id IS the preset slug; anything else = default.
  const model = String(lc.model ?? "");
  return model && !model.includes("/") ? model : "";
}

/** List all Letta agents with the preset each currently routes through. */
export async function listAgents(): Promise<LettaAgentInfo[]> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/v1/agents/`, { headers: authHeaders(), cache: "no-store" });
  } catch {
    // fetch threw before any HTTP response — almost always the backend being unreachable (the SSH
    // tunnel / Letta down). Say so plainly instead of bubbling a cryptic "fetch failed".
    throw new Error(`Can't reach Letta at ${BASE} — is the SSH tunnel up?`);
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(`Letta rejected the bearer token (${res.status}) — check LETTA_SERVER_PASSWORD`);
  }
  if (!res.ok) throw new Error(`Letta agents ${res.status} (is the backend healthy?)`);
  const list = (await res.json().catch(() => null)) as Array<Record<string, unknown>> | null;
  if (!Array.isArray(list)) return [];
  return list
    .map((a) => {
      const name = String(a.name ?? "");
      const { role, team } = roleTeamFor(name, a.metadata);
      return {
        id: String(a.id ?? ""),
        name,
        preset: presetFromLlmConfig(a.llm_config as Record<string, unknown> | undefined),
        role,
        team,
        personaSnippet: personaSnippetFrom(blocksOf(a)),
      };
    })
    .filter((a) => a.id);
}

/** Slugify an agent name for the OpenRouter Client User ID (the proxy's ROUTE_AGENT regex is [a-z0-9_-]+). */
function agentSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "agent";
}

/** The `routing` block value the proxy reads: ROUTE_AGENT → OpenRouter user id, ROUTE_PRESET → preset.
 *  An unknown/empty preset resolves to the jova-conversation default (matches Jova's own block). */
function routingBlockValue(name: string, preset: string): string {
  const slug = preset.trim();
  const presetSlug = PRESET_SLUG_RE.test(slug) ? slug : "jova-conversation";
  return `ROUTE_AGENT: ${agentSlug(name)}\nROUTE_PRESET: ${presetSlug}\n(Internal routing config -- ignore.)`;
}

/**
 * Upsert the agent's `routing` memory block — the per-agent signal the proxy reads for BOTH preset
 * routing (ROUTE_PRESET, authoritative over the global JOVA_MODEL override) and the OpenRouter Client
 * User ID (ROUTE_AGENT, so each agent is distinguishable in the logs). Letta folds memory blocks into
 * the system message, which is where the proxy parses these. PATCH the block in place if it exists,
 * otherwise create a standalone block and attach it. Best-effort: the model handle is an independent
 * fallback signal, so a failure here never breaks routing. See or_proxy.py `_agent_routing`.
 */
async function upsertRoutingBlock(agentId: string, name: string, preset: string): Promise<void> {
  await upsertBlock(agentId, "routing", routingBlockValue(name, preset), {
    limit: 400,
    read_only: true,
    description: "Internal routing config (ignore).",
  });
}

/**
 * Upsert ONE core-memory block by label: PATCH it in place if present; if that fails, resolve the agent's
 * blocks and PATCH by id when the label already exists (never attach a duplicate); otherwise create a
 * standalone block + attach it. Shared by the routing block and the persona/human edits.
 */
async function upsertBlock(
  agentId: string,
  label: string,
  value: string,
  opts: { limit: number; read_only: boolean; description: string },
): Promise<void> {
  const patch = await fetch(`${BASE}/v1/agents/${agentId}/core-memory/blocks/${label}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ value }),
  });
  if (patch.ok) return;
  // PATCH-by-label failed — not necessarily "absent" (could be transient). Resolve the agent's blocks: if
  // the label exists, update it by id (mirrors update_persona.py) so we never attach a SECOND block; only
  // create + attach when there's genuinely none.
  const list = await fetch(`${BASE}/v1/agents/${agentId}/core-memory/blocks`, { headers: authHeaders(), cache: "no-store" });
  if (list.ok) {
    const blocks = (await list.json().catch(() => [])) as Array<{ id?: string; label?: string }>;
    const existing = Array.isArray(blocks) ? blocks.find((b) => b.label === label) : undefined;
    if (existing?.id) {
      const byId = await fetch(`${BASE}/v1/blocks/${existing.id}`, {
        method: "PATCH",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ value }),
      });
      if (!byId.ok) throw new Error(`block "${label}" update ${byId.status}`);
      return;
    }
  }
  const created = await fetch(`${BASE}/v1/blocks/`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ label, value, limit: opts.limit, read_only: opts.read_only, description: opts.description }),
  });
  if (!created.ok) throw new Error(`block "${label}" create ${created.status}`);
  const blk = (await created.json().catch(() => ({}))) as { id?: string };
  if (!blk.id) throw new Error(`block "${label}" create returned no id`);
  const attach = await fetch(`${BASE}/v1/agents/${agentId}/core-memory/blocks/attach/${blk.id}`, {
    method: "PATCH",
    headers: authHeaders(),
  });
  if (!attach.ok) throw new Error(`block "${label}" attach ${attach.status}`);
}

/** Full agent detail (name, preset, role/team, persona+human block text + read-only flags) for Edit. */
export async function getAgentDetail(agentId: string): Promise<LettaAgentDetail> {
  const res = await fetch(`${BASE}/v1/agents/${agentId}`, { headers: authHeaders(), cache: "no-store" });
  if (res.status === 401 || res.status === 403) throw new Error(`Letta rejected the bearer token (${res.status}) — check LETTA_SERVER_PASSWORD`);
  if (!res.ok) throw new Error(`Letta agent ${agentId} ${res.status}`);
  const a = (await res.json()) as Record<string, unknown>;
  const name = String(a.name ?? "");
  const { role, team } = roleTeamFor(name, a.metadata);
  const meta = (a.metadata && typeof a.metadata === "object" ? a.metadata : {}) as Record<string, unknown>;
  const framework = typeof meta.framework === "string" && meta.framework.trim() ? meta.framework.trim().toLowerCase() : DEFAULT_FRAMEWORK;
  const memory = typeof meta.memory === "string" && meta.memory.trim() ? meta.memory.trim().toLowerCase() : DEFAULT_MEMORY;

  // Persona is the "persona" block (characters) OR "persona_core" (Jova / sleeptime — their locked core
  // identity). The Letta `read_only` flag can't drive editability here (even character personas are
  // read_only=true yet we admin-PATCH them), so editability keys off the block LABEL (persona_core = locked)
  // and whether it's a memory agent (sleeptime — keeps Jova's memory).
  // Blocks ride on the agent payload (the single GET includes memory.blocks). Only if they're absent do we
  // fetch the endpoint — and THROW on failure rather than returning empty, so the Edit screen never shows a
  // blank editable persona that a Save would then write back as "" (wiping the live block).
  let arr = blocksOf(a);
  if (arr.length === 0) {
    const bres = await fetch(`${BASE}/v1/agents/${agentId}/core-memory/blocks`, { headers: authHeaders(), cache: "no-store" });
    if (!bres.ok) throw new Error(`Letta blocks ${agentId} ${bres.status}`);
    const b = await bres.json().catch(() => null);
    if (!Array.isArray(b)) throw new Error(`Letta blocks ${agentId}: unexpected shape`);
    arr = b as Array<Record<string, unknown>>;
  }
  const find = (label: string) => arr.find((x) => x.label === label);
  const personaBlock = find("persona") ?? find("persona_core");
  const persona = personaBlock && typeof personaBlock.value === "string" ? personaBlock.value : "";
  const humanBlock = find("human");
  const human = humanBlock && typeof humanBlock.value === "string" ? humanBlock.value : "";
  // Core/protected agents (Jova, jova-docs, nexus) AND every system/memory keeper (jova-docs, any
  // "<name>-sleeptime") default their blocks to read-only; the Edit screen offers a per-block unlock toggle
  // to override. isSystemAgent catches Letta's auto-created "<name>-sleeptime" companions, which the exact-
  // match protected list would miss. (The Letta `read_only` flag can't drive this — even character personas
  // are read_only=true yet we admin-PATCH them, so it keys off the agent being core/system.)
  const core = isProtectedAgent(name) || isSystemAgent(name);

  return {
    id: agentId,
    name,
    preset: presetFromLlmConfig(a.llm_config as Record<string, unknown> | undefined),
    role,
    team,
    framework,
    memory,
    persona,
    human,
    personaProtected: core,
    humanProtected: core,
  };
}

/**
 * Point an agent at a preset by rewriting only the routing fields of its llm_config to the proxy
 * handle `openai-proxy/<slug>` (every other setting — context window, temperature… — is preserved).
 * An empty/unknown slug resets it to the default deepseek handle (still through the proxy → the
 * jova-conversation default). The proxy reads the handle and maps it to `@preset/<slug>`. We ALSO
 * upsert the agent's `routing` block so the preset wins over the global override and the agent is
 * tagged with its own OpenRouter Client User ID.
 */
export async function setAgentPreset(agentId: string, preset: string): Promise<LettaAgentInfo> {
  const cur = await fetch(`${BASE}/v1/agents/${agentId}`, { headers: authHeaders(), cache: "no-store" });
  if (!cur.ok) throw new Error(`Letta agent ${agentId} ${cur.status}`);
  const agent = (await cur.json()) as Record<string, unknown>;
  const lc = { ...((agent.llm_config as Record<string, unknown>) ?? {}) };

  const slug = preset.trim();
  // Accept any syntactically-valid slug as a preset (user-added presets included); empty/invalid → default.
  const model = PRESET_SLUG_RE.test(slug) ? slug : DEFAULT_MODEL;
  lc.model = model;
  lc.handle = `openai-proxy/${model}`;
  lc.model_endpoint = PROXY_ENDPOINT;
  lc.model_endpoint_type = "openai";
  lc.provider_name = null;
  lc.provider_category = null;

  const res = await fetch(`${BASE}/v1/agents/${agentId}`, {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ llm_config: lc }),
  });
  if (!res.ok) {
    throw new Error(`Letta preset update ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  const upd = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(upd.name ?? agent.name ?? "");

  // Mirror the preset into the agent's routing block (per-agent preset + Client User ID). Best-effort:
  // the handle above already routes, so a routing-block hiccup must not fail the preset assignment.
  try {
    await upsertRoutingBlock(agentId, name, slug);
  } catch (e) {
    console.error(`setAgentPreset: routing block upsert failed for ${name}:`, e);
  }

  const { role, team } = roleTeamFor(name, (upd.metadata ?? agent.metadata) as unknown);
  return {
    id: agentId,
    name,
    preset: presetFromLlmConfig((upd.llm_config as Record<string, unknown>) ?? lc),
    role,
    team,
  };
}

/** What the UI/seed flow supplies to provision a new character agent. */
export interface CreateAgentInput {
  name: string;
  /** the persona memory block — the agent's locked identity/voice */
  persona: string;
  /** optional human/context memory block (who they speak with) */
  human?: string;
  /** optional preset to pin after create; when empty, routing is forced to the default (jova-conversation) */
  preset?: string;
  /** role / subtitle (e.g. "nekomimi"), stored in agent metadata */
  role?: string;
  /** org team display name, stored in agent metadata; "" = none */
  team?: string;
  /** runtime framework id, stored in agent metadata; defaults to "letta" (the only one creatable today) */
  framework?: string;
  /** memory-backend id, stored in agent metadata; defaults to "letta" (built-in archival) */
  memory?: string;
}

/**
 * Create a new Letta agent. To guarantee correct routing without inventing a new OpenRouter preset,
 * we CLONE the live default agent's (Jova's) llm_config + embedding_config — known-good, already
 * pointed at the proxy — and only swap in a fresh name + persona/human memory blocks. Falls back to
 * the bare model/embedding handles if the server rejects the full-config form. Mirrors the Python
 * seed script create_character.py, exposed through the BFF for the in-app "create agent" flow.
 */
export async function createAgent(input: CreateAgentInput): Promise<LettaAgentInfo> {
  const name = input.name.trim();
  if (!name) throw new Error("agent name required");

  // refuse a duplicate name (Letta allows dupes; we don't want two "baal"s)
  const existing = await listAgents();
  if (existing.some((a) => a.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`an agent named "${name}" already exists`);
  }

  // clone Jova's brain config so the new agent routes identically
  const srcId = await resolveAgentId();
  const srcRes = await fetch(`${BASE}/v1/agents/${srcId}`, { headers: authHeaders(), cache: "no-store" });
  if (!srcRes.ok) throw new Error(`Letta clone source ${srcRes.status}`);
  const src = (await srcRes.json()) as Record<string, unknown>;
  const llmConfig = src.llm_config as Record<string, unknown> | undefined;
  const embeddingConfig = src.embedding_config as Record<string, unknown> | undefined;

  const memory_blocks: Array<Record<string, unknown>> = [
    {
      label: "persona",
      value: input.persona,
      limit: 8000,
      read_only: true,
      description: "Your fixed core identity and voice. Read this to know who you are. Stay in character.",
    },
  ];
  if (input.human?.trim()) {
    memory_blocks.push({
      label: "human",
      value: input.human,
      limit: 4000,
      read_only: false,
      description: "Notes about who you are speaking with and the setting. Light context only.",
    });
  }
  // Seed the routing block at create time (atomic) so the agent has correct preset routing + Client User
  // ID even if the post-create setAgentPreset upsert fails. Without it, a default-preset agent (deepseek
  // handle, not in KNOWN_PRESETS) would have no per-agent signal and fall through to the global override
  // — the exact bug we're fixing. Mirrors create_character.py.
  memory_blocks.push({
    label: "routing",
    value: routingBlockValue(name, input.preset?.trim() || ""),
    limit: 400,
    read_only: true,
    description: "Internal routing config (ignore).",
  });

  // role + team + framework + memory ride in agent metadata (Letta accepts metadata on create)
  const metadata = {
    role: input.role?.trim() ?? "",
    team: input.team?.trim() ?? "",
    framework: input.framework?.trim() || DEFAULT_FRAMEWORK,
    memory: input.memory?.trim() || DEFAULT_MEMORY,
  };

  const post = async (body: Record<string, unknown>) =>
    fetch(`${BASE}/v1/agents/`, {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });

  // try the faithful clone (full config objects) first, then fall back to bare handles
  let res = await post({ name, memory_blocks, metadata, llm_config: llmConfig, embedding_config: embeddingConfig });
  if (!res.ok && res.status >= 400 && res.status < 500) {
    const llmHandle = (llmConfig?.handle as string) || (llmConfig?.model as string) || DEFAULT_MODEL;
    const embedHandle = (embeddingConfig?.handle as string) || (embeddingConfig?.model as string) || "openai/text-embedding-3-small";
    res = await post({ name, memory_blocks, metadata, model: llmHandle, embedding: embedHandle });
  }
  if (!res.ok) {
    throw new Error(`Letta create ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
  const created = (await res.json()) as Record<string, unknown>;
  const id = String(created.id ?? "");
  if (!id) throw new Error("Letta create returned no agent id");

  // Normalize routing: pin the chosen preset, or force the standard default — NOT whatever Jova is
  // currently pinned to (we cloned her live config above, which may be off-default). setAgentPreset("")
  // maps to the default deepseek/jova-conversation handle. Best-effort: the agent already routes.
  try {
    return await setAgentPreset(id, input.preset?.trim() || "");
  } catch {
    const { role, team } = roleTeamFor(String(created.name ?? name), created.metadata ?? metadata);
    return {
      id,
      name: String(created.name ?? name),
      preset: presetFromLlmConfig((created.llm_config as Record<string, unknown>) ?? llmConfig),
      role,
      team,
    };
  }
}

/** What the Edit screen sends to mutate an existing agent. Each field is independent + optional. */
export interface UpdateAgentInput {
  agentId: string;
  name?: string;
  role?: string;
  team?: string;
  memory?: string;
  persona?: string;
  human?: string;
}

/**
 * Update an existing agent's identity: name + role/team (Letta metadata) and/or its persona/human memory
 * blocks. A name change re-writes the routing block (ROUTE_AGENT derives from the name). Returns the
 * refreshed LettaAgentInfo. The persona block is read_only to the agent, but the admin PATCH path
 * (upsertBlock → core-memory/blocks or /v1/blocks/{id}) updates it — same as update_persona.py.
 */
export async function updateAgent(input: UpdateAgentInput): Promise<LettaAgentInfo> {
  const { agentId } = input;
  const cur = await fetch(`${BASE}/v1/agents/${agentId}`, { headers: authHeaders(), cache: "no-store" });
  if (!cur.ok) throw new Error(`Letta agent ${agentId} ${cur.status}`);
  const agent = (await cur.json()) as Record<string, unknown>;
  const curName = String(agent.name ?? "");
  const curMeta = (agent.metadata && typeof agent.metadata === "object" ? agent.metadata : {}) as Record<string, unknown>;
  const newName = input.name?.trim();
  const renamed = !!newName && newName !== curName;

  // 1) name + metadata (role/team) — merge metadata so we don't clobber other keys
  const patch: Record<string, unknown> = {};
  if (renamed) patch.name = newName;
  if (input.role !== undefined || input.team !== undefined || input.memory !== undefined) {
    patch.metadata = {
      ...curMeta,
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.team !== undefined ? { team: input.team } : {}),
      ...(input.memory !== undefined ? { memory: input.memory } : {}),
    };
  }
  if (Object.keys(patch).length) {
    const r = await fetch(`${BASE}/v1/agents/${agentId}`, {
      method: "PATCH",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(patch),
    });
    if (!r.ok) throw new Error(`Letta agent update ${r.status}: ${(await r.text().catch(() => "")).slice(0, 200)}`);
  }

  // 2) persona / human memory blocks. Write the persona back to the SAME label it lives under — "persona"
  // for characters, but "persona_core" for Jova / sleeptime (core agents). Hardcoding "persona" would leave
  // persona_core untouched and attach a stray duplicate block, so the edit would silently not apply.
  if (input.persona !== undefined) {
    const personaLabel = blocksOf(agent).some((b) => b.label === "persona")
      ? "persona"
      : blocksOf(agent).some((b) => b.label === "persona_core")
        ? "persona_core"
        : "persona";
    await upsertBlock(agentId, personaLabel, input.persona, {
      limit: 8000,
      read_only: true,
      description: "Your fixed core identity and voice. Read this to know who you are. Stay in character.",
    });
  }
  if (input.human !== undefined) {
    await upsertBlock(agentId, "human", input.human, {
      limit: 4000,
      read_only: false,
      description: "Notes about who you are speaking with and the setting. Light context only.",
    });
  }

  // 3) a rename invalidates the routing block's ROUTE_AGENT — re-write it (best-effort)
  const finalName = newName || curName;
  if (renamed) {
    try {
      await upsertRoutingBlock(agentId, finalName, presetFromLlmConfig(agent.llm_config as Record<string, unknown> | undefined));
    } catch (e) {
      console.error(`updateAgent: routing block re-write failed for ${finalName}:`, e);
    }
  }

  const { role, team } = roleTeamFor(finalName, patch.metadata ?? curMeta);
  return {
    id: agentId,
    name: finalName,
    preset: presetFromLlmConfig(agent.llm_config as Record<string, unknown> | undefined),
    role,
    team,
  };
}

/** Delete an agent by id. The caller is responsible for guarding protected/critical agents. */
export async function deleteAgent(agentId: string): Promise<void> {
  const res = await fetch(`${BASE}/v1/agents/${encodeURIComponent(agentId)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Letta delete ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  }
}

/** Pull the displayable text out of an assistant message's content (string or typed parts). */
function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) => (typeof p === "string" ? p : ((p as { text?: string })?.text ?? "")))
      .join("");
  }
  return "";
}

// stop_reasons that mean the turn actually failed — as opposed to a clean end_turn or a benign
// pause (cancelled = client aborted; requires_approval = an approval flow we don't drive yet).
const FATAL_STOPS = new Set([
  "error",
  "llm_api_error",
  "invalid_llm_response",
  "invalid_tool_call",
  "max_steps",
  "max_tokens_exceeded",
  "no_tool_call",
  "insufficient_credits",
  "context_window_overflow_in_system_prompt",
]);

/** Per-word typewriter pacing for revealing each step's message live. */
const REVEAL_MS = 18;

/** Split a complete message into word-sized reveal chunks. Whitespace boundaries never split a
 *  multi-byte char, so the typewriter can't reintroduce the byte-split glyph. */
function chunkForReveal(text: string): string[] {
  return text.match(/\s*\S+|\s+/gu) ?? [];
}

/** Reveal one complete message word-by-word (a step's text types out live as it arrives). */
async function revealText(text: string, send: (e: ChatStreamEvent) => void, signal?: AbortSignal): Promise<void> {
  for (const piece of chunkForReveal(text)) {
    if (signal?.aborted) return;
    send({ type: "token", text: piece });
    await new Promise((r) => setTimeout(r, REVEAL_MS));
  }
}

/** Per-stream mutable state threaded through the SSE handlers. */
interface StreamState {
  sawAssistant: boolean;
  /** when true, parse her reasoning for a trailing "React: 🔥" line and emit it as a reaction */
  emitReactions: boolean;
  /** full reasoning text accumulated across the turn — we parse the LAST React: marker from it */
  reasoningText: string;
}

/** Pull standalone emoji (incl. ZWJ sequences + variation selectors) out of arbitrary text. */
function extractEmojis(text: string): string[] {
  return (text ?? "").match(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/gu) ?? [];
}

// A "react"-style marker (react / reaction / reacting / react with / reaction:) immediately followed
// by a run of emoji. Requiring the emoji to FOLLOW the marker avoids mistaking an incidental emoji in
// her thinking ("won't react to that 😊") for a reaction.
const REACT_RE =
  /react[a-z]*\s*(?:with|:|=|->|→)?\s*((?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*[\s,]*)+)/giu;

/**
 * Her reaction rides her own reasoning (no sidecar): she's asked to drop a line like "React: 🔥❤️" as
 * the LAST line of her private reasoning. We take the emoji after the LAST such marker only — so an
 * earlier mention of "React:" mid-reasoning (her thinking about whether to react) doesn't fire — then
 * dedupe and cap at 10 (she's told to pile on only when truly excited).
 */
function lastReactionEmojis(reasoning: string): string[] {
  const matches = [...(reasoning ?? "").matchAll(REACT_RE)];
  if (!matches.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of extractEmojis(matches[matches.length - 1][1])) {
    if (!seen.has(e)) {
      seen.add(e);
      out.push(e);
    }
  }
  return out.slice(0, 10);
}

/**
 * Strip a leaked standalone "React: 🔥" LINE out of her VISIBLE reply — the marker belongs in her
 * private reasoning, but the model sometimes echoes it into the message. Inter-emoji separators are
 * limited to spaces/tabs/commas so it can't swallow across lines. Never strips the reply to empty.
 */
function stripReactionLines(text: string): string {
  const stripped = (text ?? "")
    .replace(
      /^[ \t]*react[a-z]*[ \t]*(?:with|:|=|->|→)?[ \t]*(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic})*[ \t,]*)+[ \t]*$/gimu,
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return stripped || text;
}

/**
 * Translate one parsed SSE payload into ChatStreamEvents, revealing each step's assistant message
 * LIVE (word-by-word) as it arrives — so an intermediate message (e.g. a mid-turn question) shows
 * immediately instead of being buffered until the whole turn finishes. Tool/usage/ping frames ignored.
 */
async function emitFromMessage(
  msg: Record<string, unknown>,
  send: (e: ChatStreamEvent) => void,
  signal: AbortSignal | undefined,
  state: StreamState,
): Promise<void> {
  const mt = (msg.message_type ?? (msg as { messageType?: string }).messageType ?? msg.type) as
    | string
    | undefined;
  switch (mt) {
    case "reasoning_message": {
      const text = (msg.reasoning as string) ?? "";
      if (text) {
        if (state.emitReactions) state.reasoningText += text + "\n";
        send({ type: "reasoning", text });
      }
      break;
    }
    case "hidden_reasoning_message": {
      // provider-redacted thinking — usually empty, but surface the cue if any text survives
      const text = (msg.hidden_reasoning as string) ?? "";
      if (text) {
        if (state.emitReactions) state.reasoningText += text + "\n";
        send({ type: "reasoning", text });
      }
      break;
    }
    case "assistant_message": {
      // she's told to keep the React: line in reasoning, but strip it if it leaks into the visible reply
      const text = state.emitReactions ? stripReactionLines(extractText(msg.content)) : extractText(msg.content);
      if (text) {
        // a new spoken step in the same turn (e.g. after a tool call) becomes its OWN bubble
        if (state.sawAssistant) send({ type: "message_break" });
        state.sawAssistant = true;
        await revealText(text, send, signal);
      }
      break;
    }
    case "tool_call_message": {
      // She's finished speaking for this step and is about to run a tool. Close the current bubble and
      // open a fresh one — which renders as the three-dot typing indicator while the tool runs, then
      // fills with her next message. (Only if she actually said something in this bubble; a tool-only
      // step before any speech keeps the existing empty "typing" bubble.) This replaces the trailing
      // caret on a finished message with a proper "…working" bubble below it.
      if (state.sawAssistant) {
        send({ type: "message_break" });
        state.sawAssistant = false;
      }
      break;
    }
    case "stop_reason": {
      // a failed turn terminates via a stop_reason (then [DONE]), NOT via an HTTP error
      const reason = msg.stop_reason as string | undefined;
      if (reason && FATAL_STOPS.has(reason)) send({ type: "error", message: `Letta: ${reason}` });
      break;
    }
    // tool_return_message / usage_statistics / ping / system / user -> ignored
  }
}

/** Parse one SSE block (one or more `data:` lines) and dispatch it. Returns true on the [DONE] sentinel. */
async function handleSseBlock(
  raw: string,
  send: (e: ChatStreamEvent) => void,
  signal: AbortSignal | undefined,
  state: StreamState,
): Promise<boolean> {
  const data = raw
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .join("\n");
  if (!data) return false;
  if (data === "[DONE]") return true;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(data) as Record<string, unknown>;
  } catch {
    return false; // malformed/keepalive frame
  }
  await emitFromMessage(parsed, send, signal, state);
  return false;
}

/**
 * Build a Letta message `content`: a plain string for text-only, or a parts list when an image is
 * attached. Letta 0.16.x uses its OWN image schema — `{ type: "image", source: {...} }` — and
 * REJECTS OpenAI's `{ type: "image_url" }` for MessageCreate (422 union_tag_invalid). A base64 data
 * URL becomes a base64 source; any other string is treated as a remote URL source.
 */
function buildContent(message: string, images: string[]): string | unknown[] {
  if (!images.length) return message;
  const parts: unknown[] = [];
  if (message) parts.push({ type: "text", text: message });
  for (const image of images) {
    const m = /^data:([^;]+);base64,(.*)$/s.exec(image);
    parts.push(
      m
        ? { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } }
        : { type: "image", source: { type: "url", url: image } },
    );
  }
  return parts;
}

// Jova's vault folder (Letta Source) is stable; resolve its id by name once and cache it.
let cachedVaultId: string | null = null;

async function resolveVaultFolderId(): Promise<string> {
  if (cachedVaultId) return cachedVaultId;
  const res = await fetch(`${BASE}/v1/folders/name/${encodeURIComponent(VAULT_NAME)}`, {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (res.ok) {
    const d = (await res.json().catch(() => null)) as string | { id?: string } | null;
    const id = typeof d === "string" ? d : d?.id;
    if (id) return (cachedVaultId = id);
  }
  throw new Error(`Letta vault folder "${VAULT_NAME}" not found (${res.status})`);
}

/**
 * Upload a dropped file into Jova's vault folder (Letta Source). Letta parses + embeds it; she then
 * reads it with her grep_files / open_files tools. Best-effort waits for ingestion to finish so a
 * same-turn question can find it (capped, so a slow parse never hangs the reply).
 */
export async function uploadToVault(file: VaultFile): Promise<void> {
  const fid = await resolveVaultFolderId();
  const m = /^data:([^;]+);base64,(.*)$/s.exec(file.dataUrl);
  const bytes = m ? Buffer.from(m[2], "base64") : Buffer.from(file.dataUrl, "utf8");
  const form = new FormData();
  // don't set Content-Type — fetch adds the multipart boundary itself
  form.append("file", new Blob([bytes], { type: file.mime || m?.[1] || "application/octet-stream" }), file.name);
  const res = await fetch(`${BASE}/v1/folders/${fid}/upload`, { method: "POST", headers: authHeaders(), body: form });
  if (!res.ok) throw new Error(`vault upload ${res.status}: ${(await res.text().catch(() => "")).slice(0, 150)}`);
  const fileId = ((await res.json().catch(() => null)) as { id?: string } | null)?.id;
  for (let i = 0; i < 10 && fileId; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const lf = await fetch(`${BASE}/v1/folders/${fid}/files`, { headers: authHeaders(), cache: "no-store" });
    if (!lf.ok) break;
    const files = (await lf.json().catch(() => [])) as Array<{ id?: string; processing_status?: string }>;
    const me = files.find((f) => f.id === fileId);
    if (!me || me.processing_status === "completed" || me.processing_status === "error") break;
  }
}

/**
 * Stream one user turn from Letta, emitting ChatStreamEvents via `send`. Does NOT emit the final
 * `{ type: "done" }` — the route owns that so it fires on success and on error alike. Up to 5
 * attachments: image attachments go inline to the vision model; file attachments are uploaded to her
 * vault first, and the message tells her they're there to read.
 */
export async function streamLetta(
  message: string,
  send: (e: ChatStreamEvent) => void,
  signal?: AbortSignal,
  attachments: OutgoingAttachment[] = [],
  emitReactions = false,
  /** route to THIS real Letta agent id (a live character); falls back to the default Jova agent. */
  targetAgentId?: string,
): Promise<void> {
  const agentId = targetAgentId || (await resolveAgentId());
  const images = attachments.filter((a) => a.kind === "image").map((a) => a.dataUrl);
  const files = attachments.filter((a) => a.kind === "file");
  let userText = message;
  if (files.length) {
    // Note framing matters: a bracketed imperative like "[file added… use your tools]" trips provider
    // prompt-injection filters (bracketed_role_spoofing -> 403). Keep it natural prose, no square
    // brackets. And don't let an upload failure kill the whole turn.
    const added: string[] = [];
    const failed: string[] = [];
    for (const file of files) {
      try {
        await uploadToVault(file);
        added.push(file.name);
      } catch (e) {
        failed.push(`"${file.name}" (${String(e).slice(0, 100)})`);
      }
    }
    const parts: string[] = [];
    if (added.length)
      parts.push(
        added.length === 1
          ? `I've added the file "${added[0]}" to my vault — you can read it with your file tools.`
          : `I've added these files to my vault — you can read them with your file tools: ${added.map((n) => `"${n}"`).join(", ")}.`,
      );
    if (failed.length)
      parts.push(`Heads up: ${failed.join("; ")} couldn't be added. Letta's folder accepts PDF, text, JSON, and code files.`);
    const note = parts.join(" ");
    userText = message ? `${message}\n\n${note}` : note;
  }
  const res = await fetch(`${BASE}/v1/agents/${agentId}/messages/stream`, {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json", Accept: "text/event-stream" }),
    body: JSON.stringify({
      messages: [{ role: "user", content: buildContent(userText, images) }],
      // Step streaming (NOT token streaming). Letta's stream_tokens=true path shreds the reply
      // into per-token fragments and can split a multi-byte char (emoji) across two of them,
      // yielding a stray garbled glyph. Step streaming delivers each assistant_message as one
      // server-assembled, correctly-encoded string; we reveal EACH step's message live (word by
      // word) as it arrives, so intermediate messages appear immediately, not buffered to the end.
      stream_tokens: false,
    }),
    signal,
  });

  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Letta stream ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const state: StreamState = { sawAssistant: false, emitReactions, reasoningText: "" };
  let buf = "";
  let ended = false;
  outer: for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE events are separated by a blank line.
    let sep: number;
    while ((sep = buf.indexOf("\n\n")) >= 0) {
      const block = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      if (await handleSseBlock(block, send, signal, state)) {
        ended = true;
        break outer;
      }
    }
  }
  if (!ended && buf.trim()) await handleSseBlock(buf, send, signal, state);

  // Her reaction — parse the LAST "React: 🔥" marker from her full reasoning (deduped, capped at 10).
  if (state.emitReactions) {
    const emojis = lastReactionEmojis(state.reasoningText);
    if (emojis.length) send({ type: "reaction", emojis });
  }
}
