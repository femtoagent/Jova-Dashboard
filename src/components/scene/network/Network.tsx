"use client";

import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useJovaStore } from "@/lib/state/useJovaStore";
import type { AgentRole } from "@/lib/network/types";
import { TeamBrain } from "./TeamBrain";
import { AgentNode } from "./AgentNode";
import { Strand } from "./Strand";
import { Pulses, type PulseCurve } from "./Pulses";

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

/** A gently bowed curve between two points (so strands arc like synapses, not laser-straight wires). */
function arcCurve(a: THREE.Vector3, b: THREE.Vector3, bow: number): THREE.CatmullRomCurve3 {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y += bow;
  mid.z += bow * 0.5;
  return new THREE.CatmullRomCurve3([a, mid, b]);
}

interface StrandSpec {
  key: string;
  curve: THREE.CatmullRomCurve3;
  color: string;
  tier: "nexus" | "spine";
  radius: number;
  segments: number;
}

export function Network() {
  const teams = useNetworkStore((s) => s.teams);
  const focusedTeamId = useNetworkStore((s) => s.focusedTeamId);
  const selectedAgentId = useNetworkStore((s) => s.selectedAgentId);
  const talkingAgentId = useNetworkStore((s) => s.talkingAgentId);
  const nexusHub = useNetworkStore((s) => s.nexusHub);
  const startTask = useNetworkStore((s) => s.startTask);
  const advanceTask = useNetworkStore((s) => s.advanceTask);
  const completeTask = useNetworkStore((s) => s.completeTask);
  const addApproval = useNetworkStore((s) => s.addApproval);
  const setNexusActive = useJovaStore((s) => s.setNexusActive);

  const hub = useMemo(() => new THREE.Vector3(...nexusHub), [nexusHub]);

  // Topology signature: rebuild curves/geometry only when positions/offsets change — NOT on every
  // task tick (that changes the teams ref but not the layout).
  const topoSig = teams
    .map((c) => `${c.id}@${c.position.join(",")}|${c.agents.map((a) => `${a.id}:${a.offset.join(",")}`).join(";")}`)
    .join("||");

  // ALL teams show their Nexus wire + agent spines (the network is visible from the overview).
  const { strands, pulseCurves, agentWorld } = useMemo(() => {
    const strands: StrandSpec[] = [];
    const pulseCurves: PulseCurve[] = [];
    const agentWorld: Record<string, [number, number, number]> = {};
    for (const c of teams) {
      const brain = new THREE.Vector3(...c.position);
      const nexCurve = arcCurve(hub, brain, Math.max(1.5, hub.distanceTo(brain) * 0.16));
      strands.push({ key: `nx-${c.id}`, curve: nexCurve, color: c.color, tier: "nexus", radius: 0.02, segments: 56 });
      pulseCurves.push({ id: `nx-${c.id}`, curve: nexCurve, color: c.color, tier: "nexus" });
      for (const a of c.agents) {
        const ap = brain.clone().add(new THREE.Vector3(...a.offset));
        agentWorld[`${c.id}:${a.id}`] = [ap.x, ap.y, ap.z];
        const spine = arcCurve(brain, ap, 0.25);
        strands.push({ key: `sp-${c.id}-${a.id}`, curve: spine, color: c.color, tier: "spine", radius: 0.025, segments: 16 });
        pulseCurves.push({ id: `sp-${c.id}-${a.id}`, curve: spine, color: c.color, tier: "spine" });
      }
    }
    return { strands, pulseCurves, agentWorld };
  }, [topoSig, hub]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mock activity driver — starts / advances / completes tasks and occasionally raises an approval.
  const acc = useRef(0);
  useFrame((_, dt) => {
    acc.current += dt;
    if (acc.current < 1.8) return;
    acc.current = 0;
    const c = teams[Math.floor(Math.random() * teams.length)];
    if (!c) return;
    const a = c.agents[Math.floor(Math.random() * c.agents.length)];
    if (!a) return;
    const r = Math.random();
    if (a.tasks.length === 0 || (a.tasks.length < 3 && r < 0.4)) {
      const pool = TASK_TITLES[a.role] ?? ["Working"];
      startTask(c.id, a.id, pool[Math.floor(Math.random() * pool.length)] ?? "Working");
    } else {
      const t = a.tasks[Math.floor(Math.random() * a.tasks.length)];
      if (!t) return;
      if (t.steps >= 5 || Math.random() < 0.25) completeTask(c.id, a.id, t.id);
      else advanceTask(c.id, a.id, t.id);
    }
    if (Math.random() < 0.06) {
      const ag = c.agents[Math.floor(Math.random() * c.agents.length)];
      if (ag) addApproval(c.id, ag.id, ag.label, APPROVAL_THOUGHTS[Math.floor(Math.random() * APPROVAL_THOUGHTS.length)] ?? "Proposed improvement");
    }
    const fresh = useNetworkStore.getState().teams;
    setNexusActive(fresh.some((co) => co.agents.some((ag) => ag.tasks.length > 0)));
  });

  return (
    <group>
      {strands.map((s) => (
        <Strand key={s.key} curve={s.curve} color={s.color} tier={s.tier} radius={s.radius} segments={s.segments} />
      ))}
      {teams.map((c) => (
        <group key={c.id}>
          <TeamBrain team={c} />
          {c.agents.map((a) => (
            <AgentNode
              key={a.id}
              agent={a}
              color={c.color}
              teamId={c.id}
              teamName={c.name}
              position={agentWorld[`${c.id}:${a.id}`]!}
              brainPosition={c.position}
              focused={focusedTeamId === c.id}
              selected={selectedAgentId === a.id}
              talking={talkingAgentId === a.id}
            />
          ))}
        </group>
      ))}
      <Pulses curves={pulseCurves} />
    </group>
  );
}
