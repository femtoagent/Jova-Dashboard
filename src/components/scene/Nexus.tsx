"use client";

import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { useNetworkStore } from "@/lib/network/useNetworkStore";

useGLTF.preload("/models/Nexus.glb");

type Axis = "x" | "y" | "z";

// how much faster the rings spin in the "active/processing" state vs baseline
const ACTIVE_MULT = 12;
// the core sphere spins up on its OWN multiplier (independent of the rings)
const CORE_ACTIVE_MULT = 24;
// how much brighter Nexus's own emissive glow blazes when active
const EMISSIVE_MULT = 16;

// Spin each ring around an axis IN its plane (not its symmetry axis) so it visibly TUMBLES — a smooth
// ring spun around its own centre axis looks static. Different axis per ring = a 3-axis gyroscope.
// Matched by normalized name substring (GLTFLoader turns "Inner Ring" into "Inner_Ring"). Tune speeds.
const SPINNERS: { key: string; axis: Axis; speed: number; activeMult: number }[] = [
  { key: "innerring", axis: "x", speed: 0.6, activeMult: ACTIVE_MULT },
  { key: "middlering", axis: "y", speed: 0.45, activeMult: ACTIVE_MULT },
  { key: "outerring", axis: "z", speed: -0.3, activeMult: ACTIVE_MULT },
  { key: "coresphere", axis: "y", speed: 0.12, activeMult: CORE_ACTIVE_MULT },
];

const norm = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "");

/** Re-pivot a mesh so it spins around its own geometry centre (the GLB bakes geometry at world y≈3,
 *  pivots at the origin — without this it would orbit the origin instead of spinning in place). */
function repivot(mesh: THREE.Mesh) {
  mesh.geometry = mesh.geometry.clone();
  mesh.geometry.computeBoundingBox();
  const c = new THREE.Vector3();
  mesh.geometry.boundingBox!.getCenter(c);
  mesh.geometry.translate(-c.x, -c.y, -c.z);
  mesh.position.add(c);
}

/** Nexus, the Openclaw Orchestrator — a sculpted GLB (sphere + 3 gyroscopic rings, capped top/bottom)
 *  that looms huge in the background, its rings turning independently. (Jova is separate.) */
export function Nexus({ scale, position }: { scale: number; position: [number, number, number] }) {
  const { scene } = useGLTF("/models/Nexus.glb");

  const { object, spinners, mats, cap } = useMemo(() => {
    const obj = scene.clone(true);
    const spinners: { obj: THREE.Object3D; axis: Axis; speed: number; activeMult: number }[] = [];
    const mats: { mat: THREE.MeshStandardMaterial; base: number }[] = [];
    let cap: THREE.Object3D | null = null;
    obj.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // clone the material so we can pulse its emissive without mutating the cached one
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      m.material = mat;
      mats.push({ mat, base: mat.emissiveIntensity });
      const n = norm(m.name);
      if (n.includes("topcap")) cap = m; // team strands rise from the crown of Nexus
      const spec = SPINNERS.find((s) => n.includes(s.key));
      if (spec) {
        repivot(m);
        spinners.push({ obj: m, axis: spec.axis, speed: spec.speed, activeMult: spec.activeMult });
      }
    });
    return { object: obj, spinners, mats, cap };
  }, [scene]);

  // ease a speed multiplier toward the active target so she spins up / winds down smoothly
  // one activation (0 idle .. 1 active) driven by the Active/Idle button; each spinner ramps to its
  // OWN active multiplier (rings -> ACTIVE_MULT, core -> CORE_ACTIVE_MULT).
  const activation = useRef(0);
  const hubPublished = useRef(false);
  useFrame((_, dt) => {
    // once the GLB has mounted with its world transform, publish the top-cap's world top so the
    // team strands originate from Nexus's crown (robust to its scale/position).
    if (!hubPublished.current && cap) {
      const capObj = cap as THREE.Object3D;
      capObj.updateWorldMatrix(true, false);
      const box = new THREE.Box3().setFromObject(capObj);
      if (Number.isFinite(box.max.y)) {
        const c = new THREE.Vector3();
        box.getCenter(c);
        useNetworkStore.getState().setNexusHub([c.x, box.max.y, c.z]);
        hubPublished.current = true;
      }
    }
    const target = useJovaStore.getState().nexusActive ? 1 : 0;
    activation.current += (target - activation.current) * (1 - Math.exp(-dt * 3));
    const a = activation.current;
    const glow = 1 + (EMISSIVE_MULT - 1) * a;
    for (const e of mats) e.mat.emissiveIntensity = e.base * glow;
    for (const s of spinners) {
      const mult = 1 + (s.activeMult - 1) * a;
      s.obj.rotation[s.axis] += dt * s.speed * mult;
    }
  });

  return <primitive object={object} scale={scale} position={position} />;
}
