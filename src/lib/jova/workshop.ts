/**
 * Server-only client for the Jova workshop service (doc rendering + vault files), reached over the
 * SSH tunnel (forward :4100, set WORKSHOP_BASE_URL to override). NEVER import from a client module.
 */
export const WORKSHOP_BASE = process.env.WORKSHOP_BASE_URL ?? "http://127.0.0.1:4100";

export interface VaultDoc {
  /** vault-relative path, forward slashes (e.g. "Career/Resume.pdf") */
  path: string;
  size: number;
  /** epoch seconds */
  mtime: number;
}

/** List vault files (newest first), each with size + mtime. Throws if the workshop is unreachable. */
export async function listDocs(): Promise<VaultDoc[]> {
  const res = await fetch(`${WORKSHOP_BASE}/list`, { cache: "no-store" });
  if (!res.ok) throw new Error(`workshop /list ${res.status}`);
  const json = (await res.json()) as { files?: VaultDoc[] };
  return Array.isArray(json.files) ? json.files : [];
}
