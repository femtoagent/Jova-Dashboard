"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { getGlowTexture } from "./textures";
import { useJovaStore, type NexusStyle } from "@/lib/state/useJovaStore";
import { useNetworkStore } from "@/lib/network/useNetworkStore";

const COLOR = "#5fd0ff";
/** local height (pre-scale) of the crown the team strands rise from */
const CROWN_LOCAL = 1.6;

/**
 * Nexus the Orchestrator, rebuilt procedurally in the team/agent design language (neon additive
 * core + wireframe + glow sprites + dendrite lines) instead of the old sculpted GLB. Three
 * toggleable styles. Still publishes its crown so team strands originate from it, and spins
 * up / brightens with nexusActive.
 */
export function NexusViz({ scale, position, style }: { scale: number; position: [number, number, number]; style: NexusStyle }) {
  // publish the crown world position (top of Nexus) so team strands emanate from it
  useEffect(() => {
    useNetworkStore.getState().setNexusHub([position[0], position[1] + CROWN_LOCAL * scale, position[2]]);
  }, [position, scale]);

  return (
    <group position={position} scale={scale}>
      {style === "brain" && <BrainNexus />}
      {style === "neuron" && <NeuronNexus />}
      {style === "rings" && <RingsNexus />}
      {style === "galaxy" && <GalaxyNexus />}
      {style === "vortex" && <VortexNexus />}
    </group>
  );
}

/** ease an activation value (0 idle .. 1 active) toward nexusActive */
function activate(a: React.MutableRefObject<number>, dt: number) {
  const target = useJovaStore.getState().nexusActive ? 1 : 0;
  a.current += (target - a.current) * (1 - Math.exp(-dt * 3));
  return a.current;
}

/** Style 1 — a giant TeamBrain: solid core + nested wireframe shells + halo. */
function BrainNexus() {
  const glow = getGlowTexture();
  const grp = useRef<THREE.Group>(null);
  const core = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Sprite>(null);
  const act = useRef(useJovaStore.getState().nexusActive ? 1 : 0);
  const phase = useRef(0);

  useFrame((_, dt) => {
    const a = activate(act, dt);
    // accumulate phase rather than sin(elapsedTime * freq): a frequency that changes with the eased
    // activation, multiplied by the ever-growing elapsed time, spikes the angular velocity by ~t·da/dt
    // during the ramp — that was the "rapid expand/contract that gets wild after a while" bug.
    phase.current += dt * (1 + a * 3);
    const pulse = 1 + Math.sin(phase.current) * (0.04 + a * 0.08);
    if (grp.current) grp.current.rotation.y += dt * (0.12 + a * 1.1);
    if (core.current) core.current.scale.setScalar(pulse);
    if (halo.current) {
      const s = 5 * (1 + a * 0.5) * pulse;
      halo.current.scale.set(s, s, 1);
      (halo.current.material as THREE.SpriteMaterial).opacity = 0.32 + a * 0.4;
    }
  });

  return (
    <group ref={grp}>
      <sprite ref={halo}>
        <spriteMaterial map={glow} color={COLOR} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0.32} />
      </sprite>
      <mesh ref={core}>
        <icosahedronGeometry args={[1.1, 4]} />
        <meshBasicMaterial color={COLOR} toneMapped={false} />
      </mesh>
      <mesh scale={1.22}>
        <icosahedronGeometry args={[1.1, 2]} />
        <meshBasicMaterial color={COLOR} wireframe transparent opacity={0.3} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh scale={1.55}>
        <icosahedronGeometry args={[1.1, 1]} />
        <meshBasicMaterial color={COLOR} wireframe transparent opacity={0.12} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

/** Style 2 — a neural cluster: a bright core with a sphere of glow-nodes + dendrite lines. */
function NeuronNexus() {
  const glow = getGlowTexture();
  const grp = useRef<THREE.Group>(null);
  const core = useRef<THREE.Sprite>(null);
  const act = useRef(useJovaStore.getState().nexusActive ? 1 : 0);
  const phase = useRef(0);
  const N = 26;

  const { nodes, lineGeom } = useMemo(() => {
    const R = 1.7;
    const nodes: THREE.Vector3[] = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2; // -1..1
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const phi = i * Math.PI * (3 - Math.sqrt(5)); // golden angle → even spread
      nodes.push(new THREE.Vector3(Math.cos(phi) * r * R, y * R, Math.sin(phi) * r * R));
    }
    const positions: number[] = [];
    for (const n of nodes) positions.push(0, 0, 0, n.x, n.y, n.z); // core → node dendrites
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return { nodes, lineGeom };
  }, []);
  useEffect(() => () => lineGeom.dispose(), [lineGeom]);

  useFrame((_, dt) => {
    const a = activate(act, dt);
    if (grp.current) {
      grp.current.rotation.y += dt * (0.1 + a * 0.9);
      grp.current.rotation.x += dt * (0.04 + a * 0.3);
    }
    phase.current += dt * (2 + a * 4); // accumulate phase (see BrainNexus note)
    if (core.current) core.current.scale.setScalar(1.2 * (1 + Math.sin(phase.current) * (0.06 + a * 0.12)));
  });

  return (
    <group ref={grp}>
      <sprite ref={core} scale={1.2}>
        <spriteMaterial map={glow} color={COLOR} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <lineSegments geometry={lineGeom}>
        <lineBasicMaterial color={COLOR} transparent opacity={0.4} depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </lineSegments>
      {nodes.map((n, i) => (
        <sprite key={i} position={[n.x, n.y, n.z]} scale={0.32}>
          <spriteMaterial map={glow} color={COLOR} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0.9} />
        </sprite>
      ))}
    </group>
  );
}

/** Style 3 — a neon gyroscope: a glowing core ringed by three wireframe tori spinning on each axis. */
function RingsNexus() {
  const glow = getGlowTexture();
  const core = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Sprite>(null);
  const r1 = useRef<THREE.Mesh>(null);
  const r2 = useRef<THREE.Mesh>(null);
  const r3 = useRef<THREE.Mesh>(null);
  const act = useRef(useJovaStore.getState().nexusActive ? 1 : 0);
  const phase = useRef(0);

  useFrame((_, dt) => {
    const a = activate(act, dt);
    const m = 1 + a * 10; // spin up hard when active
    if (r1.current) r1.current.rotation.x += dt * 0.5 * m;
    if (r2.current) r2.current.rotation.y += dt * 0.4 * m;
    // r3 must spin around an in-plane axis (x/y), not z — z is the torus's symmetry axis, so a
    // z-spin is invisible. that's why the third ring looked static.
    if (r3.current) r3.current.rotation.x += dt * -0.32 * m;
    phase.current += dt * (1 + a * 3); // accumulate phase (see BrainNexus note)
    if (core.current) core.current.scale.setScalar(1 + Math.sin(phase.current) * (0.05 + a * 0.08));
    if (halo.current) (halo.current.material as THREE.SpriteMaterial).opacity = 0.28 + a * 0.4;
  });

  return (
    <group>
      <sprite ref={halo} scale={4}>
        <spriteMaterial map={glow} color={COLOR} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0.28} />
      </sprite>
      <mesh ref={core}>
        <icosahedronGeometry args={[0.7, 3]} />
        <meshBasicMaterial color={COLOR} toneMapped={false} />
      </mesh>
      <mesh ref={r1} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.5, 0.03, 8, 80]} />
        <meshBasicMaterial color={COLOR} transparent opacity={0.7} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={r2} rotation={[0, 0, Math.PI / 3]}>
        <torusGeometry args={[1.95, 0.03, 8, 80]} />
        <meshBasicMaterial color={COLOR} transparent opacity={0.55} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={r3} rotation={[Math.PI / 4, Math.PI / 4, 0]}>
        <torusGeometry args={[2.35, 0.025, 8, 80]} />
        <meshBasicMaterial color={COLOR} transparent opacity={0.45} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}

/** Style 4 — a galaxy: a tilted spiral-arm particle disc with a bright bulge. */
function GalaxyNexus() {
  const glow = getGlowTexture();
  const spin = useRef<THREE.Group>(null);
  const core = useRef<THREE.Sprite>(null);
  const act = useRef(useJovaStore.getState().nexusActive ? 1 : 0);
  const phase = useRef(0);
  const COUNT = 1800;
  const ARMS = 3;

  const geom = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const colors = new Float32Array(COUNT * 3);
    const hot = new THREE.Color("#dff4ff");
    const cool = new THREE.Color("#2f6bd6");
    for (let i = 0; i < COUNT; i++) {
      const tt = Math.pow(Math.random(), 1.8); // bias toward the dense centre
      const radius = 0.3 + tt * 2.6;
      const norm = (radius - 0.3) / 2.6; // 0 centre .. 1 edge
      const armAngle = ((i % ARMS) / ARMS) * Math.PI * 2;
      const ang = armAngle + radius * 2.2 + (Math.random() - 0.5) * 0.25; // log-ish spiral wind
      positions[i * 3] = Math.cos(ang) * radius + (Math.random() - 0.5) * 0.1;
      positions[i * 3 + 1] = (Math.random() - 0.5) * (0.3 * (1 - norm) + 0.04); // thin disc, fat bulge
      positions[i * 3 + 2] = Math.sin(ang) * radius + (Math.random() - 0.5) * 0.1;
      const col = hot.clone().lerp(cool, norm);
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return g;
  }, []);
  useEffect(() => () => geom.dispose(), [geom]);

  useFrame((_, dt) => {
    const a = activate(act, dt);
    if (spin.current) spin.current.rotation.y += dt * (0.08 + a * 0.5);
    phase.current += dt * (1 + a * 2);
    if (core.current) core.current.scale.setScalar(1.1 * (1 + Math.sin(phase.current) * (0.05 + a * 0.1)));
  });

  return (
    <group rotation={[0.5, 0, 0]}>
      <group ref={spin}>
        <sprite ref={core} scale={1.1}>
          <spriteMaterial map={glow} color="#dff4ff" transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
        </sprite>
        <points geometry={geom}>
          <pointsMaterial size={0.45} map={glow} vertexColors transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} sizeAttenuation opacity={0.9} />
        </points>
      </group>
    </group>
  );
}

/** Style 5 — a vortex: two counter-rotating glowing torus-knots woven around a core. */
function VortexNexus() {
  const glow = getGlowTexture();
  const k1 = useRef<THREE.Mesh>(null);
  const k2 = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Sprite>(null);
  const halo = useRef<THREE.Sprite>(null);
  const act = useRef(useJovaStore.getState().nexusActive ? 1 : 0);
  const phase = useRef(0);

  useFrame((_, dt) => {
    const a = activate(act, dt);
    const m = 1 + a * 4;
    if (k1.current) {
      k1.current.rotation.y += dt * 0.4 * m;
      k1.current.rotation.x += dt * 0.15 * m;
    }
    if (k2.current) {
      k2.current.rotation.y -= dt * 0.3 * m;
      k2.current.rotation.z += dt * 0.22 * m;
    }
    phase.current += dt * (1 + a * 3);
    if (core.current) core.current.scale.setScalar(0.95 * (1 + Math.sin(phase.current) * (0.05 + a * 0.1)));
    if (halo.current) (halo.current.material as THREE.SpriteMaterial).opacity = 0.3 + a * 0.4;
  });

  return (
    <group>
      <sprite ref={halo} scale={3.5}>
        <spriteMaterial map={glow} color="#5fd0ff" transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0.3} />
      </sprite>
      <sprite ref={core} scale={0.9}>
        <spriteMaterial map={glow} color="#dff4ff" transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <mesh ref={k1}>
        <torusKnotGeometry args={[1.4, 0.06, 160, 12, 2, 3]} />
        <meshBasicMaterial color="#5fd0ff" transparent opacity={0.85} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={k2} scale={0.7}>
        <torusKnotGeometry args={[1.4, 0.05, 140, 10, 3, 4]} />
        <meshBasicMaterial color="#9f7bff" transparent opacity={0.6} toneMapped={false} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
}
