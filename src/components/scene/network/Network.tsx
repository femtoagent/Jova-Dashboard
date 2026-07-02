"use client";

import * as THREE from "three";
import { useMemo } from "react";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { TeamBrain } from "./TeamBrain";
import { AgentNode } from "./AgentNode";
import { Strand } from "./Strand";
import { Pulses, type PulseCurve } from "./Pulses";

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

  // The mock activity driver used to tick here; it now lives in lib/network/useActivityDriver
  // (mounted by CommandCenter) so the simulation runs whichever renderer draws the network.

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
