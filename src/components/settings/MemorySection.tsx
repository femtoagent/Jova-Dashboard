"use client";

import { MemoryEngineCards, Section } from "./agentForm";
import { MemoryProfileEditor } from "./MemoryProfileEditor";
import type { MemoryProfile } from "@/lib/agents/memoryProfile";

/**
 * The whole "Memory" surface for an agent: pick the engine as cards, and — when the ranked engine is
 * chosen — its profile unfolds directly beneath the cards, tethered by a shared cyan accent so cause
 * (this engine) and effect (this profile) are adjacent, not a silent reveal further down the scroll.
 * Replaces the old header dropdown + far-away "Memory profile" Section.
 */
export function MemorySection({
  value,
  framework,
  onChange,
  profile,
  onProfileChange,
}: {
  value: string;
  framework: string;
  onChange: (v: string) => void;
  profile: MemoryProfile;
  onProfileChange: (p: MemoryProfile) => void;
}) {
  return (
    <Section label="Memory">
      <p className="mb-3 text-[12px] leading-relaxed text-white/45">How this agent remembers.</p>
      <MemoryEngineCards value={value} framework={framework} onChange={onChange} />
      {value === "ranked" && (
        <div className="relative mt-3">
          {/* a small notch under the (leftmost) ranked card so the panel reads as unfolding from it */}
          <div className="ml-6 text-[10px] leading-none text-cyan-400/40" aria-hidden>
            ▲
          </div>
          <div className="-mt-1 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.03] p-4">
            <MemoryProfileEditor value={profile} onChange={onProfileChange} />
          </div>
        </div>
      )}
    </Section>
  );
}
