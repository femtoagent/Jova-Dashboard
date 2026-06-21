"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { getGlowTexture } from "../textures";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useJovaStore } from "@/lib/state/useJovaStore";
import type { AgentNode as AgentNodeT } from "@/lib/network/types";

/** Tiny deterministic PRNG so a chain's base shape is stable for the life of its task. */
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const STEP = 0.24; // spacing between chain nodes
const BEND_AMP = 0.14; // sideways bow
const WAVE_K = 1.4; // phase advance per node → a slight curve ↔ a slight S along the chain
const BEND_SPEED = 0.8; // morph speed

/**
 * An agent: a bright core node (the brain's spine connects straight into it) with one dendrite CHAIN
 * per active task — chain length = that task's step count. Each chain is a line displaced by a slow
 * TRAVELLING WAVE, so chains with 2+ nodes smoothly morph between a slight curve and a slight S (the
 * "alive" feel). Single-node stubs (idle / 1-step) stay still. Random base directions keep it organic.
 */
export function AgentNode({
  agent,
  color,
  teamId,
  position,
  brainPosition,
  focused,
  selected,
  talking,
  teamName,
}: {
  agent: AgentNodeT;
  color: string;
  teamId: string;
  teamName: string;
  position: [number, number, number];
  brainPosition: [number, number, number];
  focused: boolean;
  selected: boolean;
  talking: boolean;
}) {
  const glow = getGlowTexture();
  const lobe = useRef<THREE.Group>(null);
  const nodeGroup = useRef<THREE.Group>(null);
  const coreSprite = useRef<THREE.Sprite>(null);
  const work = useRef(0);
  const selectAgent = useNetworkStore((s) => s.selectAgent);
  const focusTeam = useNetworkStore((s) => s.focusTeam);
  const setTalkingAgent = useNetworkStore((s) => s.setTalkingAgent);
  const radialAgentId = useNetworkStore((s) => s.radialAgentId);
  const setRadialAgent = useNetworkStore((s) => s.setRadialAgent);
  const setRenameAgent = useNetworkStore((s) => s.setRenameAgent);
  const openChatWith = useJovaStore((s) => s.openChatWith);

  // one chain per task (length = steps); idle → two short stubs. Seeded per task.id (stable shape).
  const chains = agent.tasks.length
    ? agent.tasks.map((t) => ({ seed: hashStr(t.id), len: t.steps }))
    : [
        { seed: agent.seed * 31 + 1, len: 1 },
        { seed: agent.seed * 31 + 2, len: 1 },
      ];
  const sig = chains.map((c) => `${c.seed}:${c.len}`).join("|");

  const built = useMemo(() => {
    const outward = new THREE.Vector3(
      position[0] - brainPosition[0],
      position[1] - brainPosition[1],
      position[2] - brainPosition[2]
    );
    if (outward.lengthSq() < 1e-6) outward.set(0, 1, 0);
    outward.normalize();
    const refV = Math.abs(outward.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const perpA = new THREE.Vector3().crossVectors(outward, refV).normalize();
    const perpB = new THREE.Vector3().crossVectors(outward, perpA).normalize();

    const descriptors = chains.map((ch) => {
      const rnd = mulberry32(ch.seed);
      const ang = rnd() * Math.PI * 2; // random base direction → organic, not gridded
      const tilt = 0.45 + rnd() * 0.4;
      const dir0 = outward.clone().addScaledVector(perpA, Math.cos(ang) * tilt).addScaledVector(perpB, Math.sin(ang) * tilt).normalize();
      const bend = new THREE.Vector3().crossVectors(dir0, refV);
      if (bend.lengthSq() < 1e-6) bend.copy(perpA);
      bend.normalize();
      return { dir0, bend, phase: rnd() * Math.PI * 2, len: ch.len, animate: ch.len >= 2 };
    });
    const nodeCount = descriptors.reduce((s, d) => s + d.len, 0);
    const positions = new Float32Array(Math.max(nodeCount, 1) * 2 * 3); // 1 segment per node (incl. core→n0)
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return { descriptors, geometry, nodeCount };
  }, [sig, position, brainPosition]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => built.geometry.dispose(), [built]);
  useEffect(() => () => {
    document.body.style.cursor = "auto";
  }, []);

  const _p = useRef(new THREE.Vector3());
  const _prev = useRef(new THREE.Vector3());
  const ping = useRef(0);

  // ping the orb when this agent becomes selected (e.g. clicked in the bottom-left panel)
  useEffect(() => {
    if (selected) ping.current = 1;
  }, [selected]);

  useFrame((state, dt) => {
    work.current += ((agent.tasks.length > 0 ? 1 : 0) - work.current) * (1 - Math.exp(-dt * 4));
    const w = work.current;
    const t = state.clock.elapsedTime;
    if (lobe.current) lobe.current.scale.setScalar(1 + w * 0.15);
    // when "talking" (after you Ask its dream) the orb pulses livelier, like it's speaking
    const talk = talking ? 1 + Math.sin(t * 9) * 0.28 : 1;
    const radialOpen = radialAgentId === agent.id;
    ping.current += (0 - ping.current) * (1 - Math.exp(-dt * 7)); // decaying click bump
    if (coreSprite.current)
      coreSprite.current.scale.setScalar(0.18 * (1 + w * 0.7) * (selected || radialOpen ? 1.4 : 1) * talk * (1 + ping.current * 0.5));

    // re-walk each chain, displacing the straight line by a travelling wave (curve ↔ S morph)
    const attr = built.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const g = nodeGroup.current;
    let vi = 0;
    let ni = 0;
    for (const d of built.descriptors) {
      _prev.current.set(0, 0, 0); // start at the core
      for (let s = 0; s < d.len; s++) {
        _p.current.copy(d.dir0).multiplyScalar(STEP * (s + 1));
        if (d.animate) {
          const wave = Math.sin(t * BEND_SPEED + d.phase + (s + 1) * WAVE_K);
          _p.current.addScaledVector(d.bend, BEND_AMP * wave);
        }
        arr[vi++] = _prev.current.x; arr[vi++] = _prev.current.y; arr[vi++] = _prev.current.z;
        arr[vi++] = _p.current.x; arr[vi++] = _p.current.y; arr[vi++] = _p.current.z;
        _prev.current.copy(_p.current);
        if (g) {
          const spr = g.children[ni] as THREE.Sprite | undefined;
          if (spr) spr.position.copy(_p.current);
        }
        ni++;
      }
    }
    attr.needsUpdate = true;
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    ping.current = 1; // quick bump so the click visibly registers on the orb
    // focused on the team: clicking the orb pops a radial menu. From the overview a tiny agent
    // click just flies into its team.
    if (focused) setRadialAgent(radialAgentId === agent.id ? null : agent.id);
    else focusTeam(teamId);
  };
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = "pointer";
  };
  const onOut = () => {
    document.body.style.cursor = "auto";
  };

  return (
    <group position={position}>
      <mesh onClick={onClick} onPointerOver={onOver} onPointerOut={onOut}>
        <sphereGeometry args={[0.3, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <group ref={lobe}>
        <lineSegments geometry={built.geometry}>
          <lineBasicMaterial color={color} transparent opacity={0.6} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </lineSegments>
        <group ref={nodeGroup}>
          {Array.from({ length: built.nodeCount }).map((_, i) => (
            <sprite key={i} scale={0.06}>
              <spriteMaterial map={glow} color={color} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0.85} />
            </sprite>
          ))}
        </group>
      </group>

      <sprite ref={coreSprite} scale={0.18}>
        <spriteMaterial map={glow} color={color} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </sprite>

      {focused && (
        <Html position={[0, 0.32, 0]} center style={{ pointerEvents: "none" }}>
          <div
            style={{
              whiteSpace: "nowrap",
              fontSize: 10,
              letterSpacing: 0.5,
              color,
              opacity: selected ? 1 : 0.9,
              fontWeight: selected ? 600 : 400,
              textShadow: "0 0 6px rgba(0,0,0,0.95)",
              fontFamily: "ui-sans-serif, system-ui, sans-serif",
            }}
          >
            {agent.label}
            {agent.tasks.length > 0 ? ` · ${agent.tasks.length} task${agent.tasks.length === 1 ? "" : "s"}` : ""}
          </div>
        </Html>
      )}

      {focused && radialAgentId === agent.id && (
        <Html position={[0, 0, 0]} center style={{ pointerEvents: "none" }}>
          <div style={{ position: "relative", width: 0, height: 0 }}>
            {[
              {
                icon: "💬",
                label: "Talk",
                action: () => {
                  setRadialAgent(null);
                  setTalkingAgent(agent.id);
                  openChatWith({ teamId, agentId: agent.id, teamName, label: agent.label, color });
                },
              },
              { icon: "📋", label: "Tasks", action: () => selectAgent(teamId, agent.id) },
              {
                icon: "✎",
                label: "Rename",
                action: () => {
                  selectAgent(teamId, agent.id);
                  setRenameAgent(agent.id);
                },
              },
            ].map((o, i, arr) => {
              const spread = 56; // degrees between spokes, fanned above the orb
              const ang = -90 - (spread * (arr.length - 1)) / 2 + i * spread;
              const r = 48;
              const x = Math.cos((ang * Math.PI) / 180) * r;
              const y = Math.sin((ang * Math.PI) / 180) * r;
              return (
                <button
                  key={o.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    o.action();
                  }}
                  title={o.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border text-[14px] leading-none backdrop-blur-md transition hover:brightness-125"
                  style={{
                    position: "absolute",
                    left: x,
                    top: y,
                    transform: "translate(-50%, -50%)",
                    pointerEvents: "auto",
                    borderColor: `${color}aa`,
                    background: `${color}30`,
                    color,
                    boxShadow: `0 0 10px ${color}55`,
                    animation: "radial-pop 240ms cubic-bezier(0.34, 1.56, 0.64, 1) backwards",
                    animationDelay: `${i * 45}ms`,
                  }}
                >
                  {o.icon}
                </button>
              );
            })}
          </div>
        </Html>
      )}
    </group>
  );
}
