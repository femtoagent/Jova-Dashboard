import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

/**
 * Server-only version store for agent persona/human blocks. Keeps the last 5 generations/edits per agent
 * per kind, PLUS the "current" applied text — stored SEPARATELY from the live Letta block so an out-of-band
 * edit can be detected (the Edit screen compares `current` to the live block and surfaces a mismatch).
 * Gitignored JSON, chmod-600, read per request. Override the path with JOVA_AGENT_VERSIONS_FILE. NEVER
 * import from a client module.
 */

export type VersionKind = "persona" | "human";
export type VersionSource = "nexus" | "manual" | "jova-human";

export interface VersionEntry {
  id: string;
  text: string;
  prompt?: string;
  source: VersionSource;
  createdAt: number;
}
export interface KindHistory {
  current: string;
  /** newest-first, capped at 5 */
  versions: VersionEntry[];
}
export interface AgentHistory {
  persona: KindHistory;
  human: KindHistory;
}
type Store = Record<string, AgentHistory>;

const FILE = process.env.JOVA_AGENT_VERSIONS_FILE || path.join(process.cwd(), "agent-versions.local.json");
const MAX = 5;

const emptyKind = (): KindHistory => ({ current: "", versions: [] });

function normalizeKind(k: unknown): KindHistory {
  if (!k || typeof k !== "object") return emptyKind();
  const o = k as Partial<KindHistory>;
  return {
    current: typeof o.current === "string" ? o.current : "",
    versions: Array.isArray(o.versions)
      ? o.versions.filter((v): v is VersionEntry => !!v && typeof (v as VersionEntry).text === "string").slice(0, MAX)
      : [],
  };
}
function agentOf(s: Store, id: string): AgentHistory {
  const a = s[id];
  return { persona: normalizeKind(a?.persona), human: normalizeKind(a?.human) };
}

async function readStore(): Promise<Store> {
  let raw: string;
  try {
    raw = await fs.readFile(FILE, "utf8");
  } catch {
    return {}; // missing → empty
  }
  try {
    const o = JSON.parse(raw) as Store;
    return o && typeof o === "object" ? o : {};
  } catch {
    // corrupt → preserve it aside instead of silently overwriting on the next write (recoverable)
    try {
      await fs.rename(FILE, `${FILE}.corrupt`);
    } catch {
      /* best-effort */
    }
    return {};
  }
}
async function writeStore(s: Store): Promise<void> {
  // atomic: write a temp file then rename over the target — no partial/truncated file on a crash.
  const tmp = `${FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(s, null, 2), { mode: 0o600 });
  try {
    await fs.chmod(tmp, 0o600);
  } catch {
    /* best-effort (no-op on Windows) */
  }
  await fs.rename(tmp, FILE);
}

// Serialize all read-modify-write mutations in-process so overlapping requests can't clobber each other
// (the whole file is rewritten each time; without this, two parallel POSTs last-writer-wins).
let mutationChain: Promise<unknown> = Promise.resolve();
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = mutationChain.then(fn, fn);
  mutationChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function getHistory(agentId: string): Promise<AgentHistory> {
  return agentOf(await readStore(), agentId);
}

/** Add a new version (becomes `current`); keeps the newest 5. */
export function appendVersion(
  agentId: string,
  kind: VersionKind,
  text: string,
  opts?: { prompt?: string; source?: VersionSource },
): Promise<KindHistory> {
  return withLock(async () => {
    const s = await readStore();
    const a = agentOf(s, agentId);
    const entry: VersionEntry = { id: randomUUID(), text, prompt: opts?.prompt, source: opts?.source ?? "manual", createdAt: Date.now() };
    a[kind] = { current: text, versions: [entry, ...a[kind].versions].slice(0, MAX) };
    s[agentId] = a;
    await writeStore(s);
    return a[kind];
  });
}

/**
 * Seed version 1 from the live block ONLY when this kind has no history yet — the check + append happen
 * together under the lock, so concurrent reloads can't create duplicate "version 1"s. Returns the
 * AUTHORITATIVE history either way, so a caller whose own getHistory read transiently failed still gets the
 * real stored history back (never clobbers a real `current`, never masks a genuine out-of-band mismatch).
 */
export function seedIfEmpty(agentId: string, kind: VersionKind, text: string, opts?: { source?: VersionSource }): Promise<KindHistory> {
  return withLock(async () => {
    const s = await readStore();
    const a = agentOf(s, agentId);
    if (text.trim() && a[kind].versions.length === 0) {
      const entry: VersionEntry = { id: randomUUID(), text, source: opts?.source ?? "manual", createdAt: Date.now() };
      a[kind] = { current: text, versions: [entry] };
      s[agentId] = a;
      await writeStore(s);
    }
    return a[kind];
  });
}

/** Point `current` at an existing version's text (no reordering). */
export function selectVersion(agentId: string, kind: VersionKind, versionId: string): Promise<KindHistory> {
  return withLock(async () => {
    const s = await readStore();
    const a = agentOf(s, agentId);
    const v = a[kind].versions.find((x) => x.id === versionId);
    if (v) a[kind] = { ...a[kind], current: v.text };
    s[agentId] = a;
    await writeStore(s);
    return a[kind];
  });
}

/** Set `current` to an arbitrary text (e.g. a manual edit saved without a new generation). */
export function setCurrent(agentId: string, kind: VersionKind, text: string): Promise<KindHistory> {
  return withLock(async () => {
    const s = await readStore();
    const a = agentOf(s, agentId);
    a[kind] = { ...a[kind], current: text };
    s[agentId] = a;
    await writeStore(s);
    return a[kind];
  });
}

/** Migrate a Create-flow draft history (`draft-…` key) onto the real agent id once it's created. */
export function claimDraft(draftId: string, realId: string): Promise<void> {
  return withLock(async () => {
    if (!draftId || !realId || draftId === realId) return;
    const s = await readStore();
    if (!s[draftId]) return;
    s[realId] = agentOf(s, draftId); // the draft is what the user authored during Create — it wins
    delete s[draftId];
    await writeStore(s);
  });
}
