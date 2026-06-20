/**
 * Runtime config + feature flags. Client-readable flags MUST be NEXT_PUBLIC_*.
 * Secrets (LETTA_SERVER_PASSWORD, DEEPGRAM_API_KEY, ELEVENLABS_API_KEY) are read ONLY in
 * route handlers / server code — never here, never shipped to the browser.
 */

export const config = {
  /** Auth is disabled by default so the demo runs locally with no Google credentials.
   *  Set NEXT_PUBLIC_AUTH_DISABLED="false" once real auth (NextAuth / Cloudflare Access) is wired. */
  authDisabled: process.env.NEXT_PUBLIC_AUTH_DISABLED !== "false",

  /** Which backend the BFF talks to. "mock" today; "letta" once CONNECTING.md is done. */
  backend: (process.env.JOVA_BACKEND ?? "mock") as "mock" | "letta",
};
