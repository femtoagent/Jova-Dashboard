"use client";

import { useEffect } from "react";
import { useNetworkStore } from "./useNetworkStore";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { useLogStore } from "@/lib/logs/useLogStore";
import type { AgentRole } from "./types";

/** Mock "agent thoughts" that occasionally surface for the operator's sign-off. */
const APPROVAL_THOUGHTS = [
  "Adopt a caching layer to cut p95 latency",
  "Split the monolith API into services",
  "Raise the test-coverage gate to 80%",
  "Pause the lowest-ROI ad channel",
  "Rewrite the onboarding flow",
  "Add a nightly data-integrity job",
  "Negotiate a volume discount on inference",
];

/** Flavour text for the mock activity driver (until this is wired to real agent events). */
const TASK_TITLES: Record<AgentRole, string[]> = {
  pm: ["Define Q3 roadmap", "Prioritize backlog", "Scope new feature", "Align stakeholders"],
  developer: ["Refactor auth flow", "Fix payment bug", "Build API endpoint", "Optimize render loop"],
  qa: ["Write E2E suite", "Triage flaky tests", "Verify release build", "Audit error logs"],
  devops: ["Provision staging", "Tune autoscaling", "Patch CVE-2026", "Roll out deploy"],
  marketing: ["Draft launch post", "A/B test landing", "Plan campaign", "Analyze funnel"],
  cx: ["Clear ticket queue", "Write help article", "Escalate outage", "Survey churned users"],
};

const TICK_MS = 1800;

/**
 * The mock network activity: starts / advances / completes tasks, occasionally raises an
 * approval, feeds the mesh log, and derives nexusActive. Lived inside the 3D <Network>'s
 * useFrame before the 2D view existed — now renderer-independent so the simulation runs
 * whichever stage draws it. Mount exactly once (CommandCenter), gated on fullMode.
 */
export function useActivityDriver(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      const ns = useNetworkStore.getState();
      const teams = ns.teams;
      const c = teams[Math.floor(Math.random() * teams.length)];
      if (!c) return;
      const a = c.agents[Math.floor(Math.random() * c.agents.length)];
      if (!a) return;
      const log = useLogStore.getState().addLog;
      const r = Math.random();
      if (a.tasks.length === 0 || (a.tasks.length < 3 && r < 0.4)) {
        const pool = TASK_TITLES[a.role] ?? ["Working"];
        const title = pool[Math.floor(Math.random() * pool.length)] ?? "Working";
        ns.startTask(c.id, a.id, title);
        log({ kind: "mesh", source: `${c.name} / ${a.label}`, message: `Started "${title}"` });
      } else {
        const t = a.tasks[Math.floor(Math.random() * a.tasks.length)];
        if (!t) return;
        if (t.steps >= 5 || Math.random() < 0.25) {
          ns.completeTask(c.id, a.id, t.id);
          log({ kind: "mesh", source: `${c.name} / ${a.label}`, message: `Completed "${t.title}"` });
        } else ns.advanceTask(c.id, a.id, t.id);
      }
      if (Math.random() < 0.06) {
        const ag = c.agents[Math.floor(Math.random() * c.agents.length)];
        if (ag && c.approvals.length < 3) {
          // gate on the same cap addApproval enforces, so the log can't show a sign-off that wasn't added
          const text = APPROVAL_THOUGHTS[Math.floor(Math.random() * APPROVAL_THOUGHTS.length)] ?? "Proposed improvement";
          ns.addApproval(c.id, ag.id, ag.label, text);
          log({ kind: "mesh", level: "warn", source: `${c.name} / ${ag.label}`, message: `Needs sign-off: ${text}` });
        }
      }
      const fresh = useNetworkStore.getState().teams;
      useJovaStore.getState().setNexusActive(fresh.some((co) => co.agents.some((ag) => ag.tasks.length > 0)));
    };
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [enabled]);
}
