"use client";

import type { ReactNode } from "react";
import { config } from "@/lib/config";

/**
 * Auth seam. Disabled by default so the demo runs with no Google credentials.
 * To go live, set NEXT_PUBLIC_AUTH_DISABLED="false" and drop the real provider in below —
 * NextAuth (Google + single-email allowlist) OR rely on Cloudflare Access at the edge.
 * See CONNECTING.md for the full walkthrough and the tradeoffs.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  if (config.authDisabled) return <>{children}</>;

  return (
    <div className="flex h-dvh w-screen items-center justify-center bg-[#04070a] text-white">
      <div className="w-[min(380px,90vw)] rounded-2xl border border-white/10 bg-white/5 p-7 text-center backdrop-blur-xl">
        <h1 className="mb-1 text-lg font-semibold">Jova</h1>
        <p className="mb-5 text-sm text-white/50">This command center is private.</p>
        <button className="w-full rounded-xl bg-white py-2.5 text-sm font-medium text-black transition hover:bg-white/90">
          Sign in with Google
        </button>
        <p className="mt-4 text-[11px] text-white/35">Auth wiring pending — see CONNECTING.md</p>
      </div>
    </div>
  );
}
