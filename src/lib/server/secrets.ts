import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";

/**
 * Server-only secret store for UI-managed API keys. Each provider holds a LIST of named keys plus an
 * `activeId` — the one used for requests (so you can keep several ElevenLabs accounts and switch /
 * fail over between them). Keys are typed in the browser, POSTed over HTTPS, and persisted to a
 * gitignored, chmod-600 JSON file read PER REQUEST. The full key never leaves the server (callers
 * only surface `maskKey()`). `.env.local` is a fallback when no UI key is set. Override the path with
 * JOVA_SECRETS_FILE. NEVER import this from a client module.
 */

export type Provider = "deepgram" | "elevenlabs";

export interface StoredKey {
  id: string;
  key: string;
  name: string;
}
interface ProviderEntry {
  keys: StoredKey[];
  activeId: string;
}
type SecretsFile = Partial<Record<Provider, ProviderEntry>>;

/** What the route exposes (masked) for one provider. */
export interface KeyMeta {
  id: string;
  name: string;
  masked: string;
}
export interface ProviderStatus {
  activeId: string;
  keys: KeyMeta[];
  /** true when the only "key" is the .env fallback (read-only — can't remove/activate in the UI). */
  envOnly?: boolean;
}

const FILE = process.env.JOVA_SECRETS_FILE || path.join(process.cwd(), "secrets.local.json");
const ENV_FALLBACK: Record<Provider, string> = { deepgram: "DEEPGRAM_API_KEY", elevenlabs: "ELEVENLABS_API_KEY" };

/** Accept both the current {keys,activeId} shape and the legacy single {key,name} shape. */
function normalize(raw: unknown): ProviderEntry | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  if (Array.isArray(r.keys)) {
    const keys = (r.keys as StoredKey[]).filter((k) => k && typeof k.key === "string" && k.key);
    if (!keys.length) return undefined;
    const activeId = keys.some((k) => k.id === r.activeId) ? (r.activeId as string) : keys[0].id;
    return { keys, activeId };
  }
  if (typeof r.key === "string" && r.key) {
    const k: StoredKey = { id: randomUUID(), key: r.key, name: typeof r.name === "string" ? r.name : "" };
    return { keys: [k], activeId: k.id };
  }
  return undefined;
}

async function readFile(): Promise<SecretsFile> {
  try {
    const raw = JSON.parse(await fs.readFile(FILE, "utf8")) as Record<string, unknown>;
    const out: SecretsFile = {};
    const dg = normalize(raw.deepgram);
    const el = normalize(raw.elevenlabs);
    if (dg) out.deepgram = dg;
    if (el) out.elevenlabs = el;
    return out;
  } catch {
    return {}; // missing/corrupt → empty
  }
}

async function writeFile(data: SecretsFile): Promise<void> {
  const clean: SecretsFile = {};
  if (data.deepgram?.keys.length) clean.deepgram = data.deepgram;
  if (data.elevenlabs?.keys.length) clean.elevenlabs = data.elevenlabs;
  await fs.writeFile(FILE, JSON.stringify(clean, null, 2), { mode: 0o600 });
  try {
    await fs.chmod(FILE, 0o600); // tighten perms even if the file pre-existed (no-op on Windows)
  } catch {
    /* best-effort */
  }
}

/** The active usable key for a provider: chosen UI key, else the .env fallback. */
export async function getSecret(p: Provider): Promise<{ key: string; name: string; source: "file" | "env" } | null> {
  const e = (await readFile())[p];
  if (e?.keys.length) {
    const k = e.keys.find((x) => x.id === e.activeId) ?? e.keys[0];
    return { key: k.key, name: k.name || p, source: "file" };
  }
  const env = process.env[ENV_FALLBACK[p]];
  if (env) return { key: env, name: "from .env.local", source: "env" };
  return null;
}

/**
 * Resolve a SPECIFIC key by id (per-agent voices each pin a key). Falls back to the active/env key
 * when the id is empty (default) or no longer exists (a removed key), so playback never hard-fails.
 * `fallback` is true when a requested id couldn't be honored — the caller should then NOT trust a
 * paired voiceId (account-scoped voices don't exist on a different key).
 */
type ResolvedKey = { key: string; name: string; source: "file" | "env"; fallback: boolean };
export async function getSecretById(p: Provider, id?: string | null): Promise<ResolvedKey | null> {
  if (!id) {
    const s = await getSecret(p); // default → active (or env); not a fallback from a requested id
    return s && { ...s, fallback: false };
  }
  if (id === "env") {
    const env = process.env[ENV_FALLBACK[p]];
    if (env) return { key: env, name: "from .env.local", source: "env", fallback: false };
    const s = await getSecret(p);
    return s && { ...s, fallback: true };
  }
  const k = (await readFile())[p]?.keys.find((x) => x.id === id);
  if (k) return { key: k.key, name: k.name || p, source: "file", fallback: false };
  const s = await getSecret(p); // stale/removed id → fall back to active
  return s && { ...s, fallback: true };
}

/** Masked status (id + name + ••••last4) for the UI. */
export async function statusFor(p: Provider): Promise<ProviderStatus | null> {
  const e = (await readFile())[p];
  if (e?.keys.length) {
    return { activeId: e.activeId, keys: e.keys.map((k) => ({ id: k.id, name: k.name || p, masked: maskKey(k.key) })) };
  }
  const env = process.env[ENV_FALLBACK[p]];
  if (env) return { activeId: "env", envOnly: true, keys: [{ id: "env", name: "from .env.local", masked: maskKey(env) }] };
  return null;
}

export async function addKey(p: Provider, key: string, name: string): Promise<string> {
  const f = await readFile();
  const id = randomUUID();
  const entry = f[p] ?? { keys: [], activeId: "" };
  entry.keys.push({ id, key, name });
  if (!entry.keys.some((k) => k.id === entry.activeId)) entry.activeId = id; // first key becomes active
  f[p] = entry;
  await writeFile(f);
  return id;
}

export async function removeKey(p: Provider, id: string): Promise<void> {
  const f = await readFile();
  const entry = f[p];
  if (!entry) return;
  entry.keys = entry.keys.filter((k) => k.id !== id);
  if (entry.activeId === id) entry.activeId = entry.keys[0]?.id ?? ""; // hand active to the next key
  f[p] = entry;
  await writeFile(f); // writeFile drops the provider if no keys remain
}

export async function setActiveKey(p: Provider, id: string): Promise<void> {
  const f = await readFile();
  const entry = f[p];
  if (entry?.keys.some((k) => k.id === id)) {
    entry.activeId = id;
    await writeFile(f);
  }
}

/** Masked form for display — last 4 only, never the full key. */
export function maskKey(key: string): string {
  return `••••${key.slice(-4)}`;
}
