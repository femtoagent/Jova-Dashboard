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

/** Where finished work plausibly flows next — drives the Team Room's handoff flights. */
const HANDOFF_NEXT: Record<AgentRole, AgentRole> = {
  pm: "developer",
  developer: "qa",
  qa: "devops",
  devops: "developer",
  marketing: "cx",
  cx: "pm",
};

/** ~35% of completions hand the work downstream instead of just finishing (tuned per plan). */
const HANDOFF_CHANCE = 0.35;

/** Things teams occasionally want to SHOW the operator (Team Room demo board). */
const DEMO_IDEAS: { title: string; description: string; url: string }[] = [
  {
    title: "Checkout flow walkthrough",
    description: "A click-through of the new checkout happy path, including the error states we fixed last sprint.",
    url: "Demos/Checkout Walkthrough.pdf",
  },
  {
    title: "Latency dashboard",
    description: "p95 latency before and after the cache layer, on live traffic.",
    url: "https://example.com/latency-demo",
  },
  {
    title: "Onboarding email sequence",
    description: "The four-email nurture flow with projected open rates per segment.",
    url: "Demos/Onboarding Sequence.pdf",
  },
  {
    title: "Support deflection bot",
    description: "The FAQ bot answering our top 20 ticket types, with escalation rules.",
    url: "Demos/Support Bot.pdf",
  },
];

const TICK_MS = 1800;

/**
 * The mock network activity: starts / advances / completes tasks, hands work between agents
 * (emitting FlowEvents the Team Room animates as flying documents), occasionally raises an
 * approval or readies a demo, feeds the mesh log, and derives nexusActive. Renderer-independent;
 * mount exactly once (CommandCenter), gated on fullMode.
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
      const pm = c.agents.find((x) => x.role === "pm");
      const r = Math.random();

      if (a.tasks.length === 0 || (a.tasks.length < 3 && r < 0.4)) {
        // NEW WORK: the PM assigns it (visible flight in the room); PM's own work comes from Nexus.
        const pool = TASK_TITLES[a.role] ?? ["Working"];
        const title = pool[Math.floor(Math.random() * pool.length)] ?? "Working";
        const fromId = pm && pm.id !== a.id ? pm.id : null;
        const taskId = ns.startTask(c.id, a.id, title, fromId);
        if (taskId) {
          ns.emitFlow({ teamId: c.id, fromAgentId: fromId, toAgentId: a.id, taskId, taskTitle: title, kind: "assign" });
          log({ kind: "mesh", source: `${c.name} / ${a.label}`, message: `Started "${title}"` });
        }
      } else {
        const t = a.tasks[Math.floor(Math.random() * a.tasks.length)];
        if (!t) return;
        if (t.steps >= 5 || Math.random() < 0.25) {
          // FINISHED: sometimes the output moves downstream instead of just completing.
          const nextRole = HANDOFF_NEXT[a.role];
          const target = c.agents.find((x) => x.role === nextRole && x.id !== a.id && x.tasks.length < 3);
          if (target && Math.random() < HANDOFF_CHANCE) {
            ns.completeTask(c.id, a.id, t.id);
            const newId = ns.startTask(c.id, target.id, t.title, a.id);
            if (newId) {
              ns.emitFlow({ teamId: c.id, fromAgentId: a.id, toAgentId: target.id, taskId: newId, taskTitle: t.title, kind: "handoff" });
              log({ kind: "mesh", source: `${c.name} / ${a.label}`, message: `Handed "${t.title}" to ${target.label}` });
            } else {
              log({ kind: "mesh", source: `${c.name} / ${a.label}`, message: `Completed "${t.title}"` });
            }
          } else {
            ns.completeTask(c.id, a.id, t.id);
            log({ kind: "mesh", source: `${c.name} / ${a.label}`, message: `Completed "${t.title}"` });
          }
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

      // occasionally a team readies something to SHOW (the room's demo board; capped at 2/team)
      if (Math.random() < 0.02) {
        const idea = DEMO_IDEAS[Math.floor(Math.random() * DEMO_IDEAS.length)];
        if (idea && ns.demos.filter((d) => d.teamId === c.id).length < 2) {
          ns.addDemo(c.id, idea.title, idea.description, idea.url);
          log({ kind: "mesh", source: c.name, message: `Demo ready: ${idea.title}` });
        }
      }

      const fresh = useNetworkStore.getState().teams;
      useJovaStore.getState().setNexusActive(fresh.some((co) => co.agents.some((ag) => ag.tasks.length > 0)));
    };
    const id = window.setInterval(tick, TICK_MS);
    return () => window.clearInterval(id);
  }, [enabled]);
}
