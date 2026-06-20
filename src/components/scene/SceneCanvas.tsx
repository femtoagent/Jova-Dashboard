"use client";

import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useRef } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { Wisp } from "./Wisp";
import { Nexus } from "./Nexus";
import { NexusAudio } from "./NexusAudio";
import { Effects } from "./Effects";
import { Network } from "./network/Network";
import { useNetworkStore } from "@/lib/network/useNetworkStore";

// Nexus placement: huge, deep in the background, its base on a low floor.
const NEXUS_SCALE = 3;
const NEXUS_POS: [number, number, number] = [0, -3, -22];

/** Jova (the Light Orb) front-and-centre, with Nexus the Orchestrator looming huge in the background. */
export default function SceneCanvas() {
  return (
    <Canvas
      dpr={[1, 2]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      camera={{ position: [0, 7, 26], fov: 45, near: 0.1, far: 300 }}
      onPointerMissed={() => useNetworkStore.getState().focusTeam(null)}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.NoToneMapping;
        scene.background = new THREE.Color("#04070a");
      }}
    >
      {/* lights for the PBR Nexus (the additive orb ignores them) */}
      <hemisphereLight args={["#6f86b6", "#1a1c26", 0.7]} />
      <directionalLight position={[6, 14, 6]} intensity={1.1} color="#cfe0ff" />
      <CoreLight />

      <Wisp />
      <Suspense fallback={null}>
        <Nexus scale={NEXUS_SCALE} position={NEXUS_POS} />
      </Suspense>

      <Network />

      <CameraRig />
      <NexusAudio />
      <Effects />
    </Canvas>
  );
}

/** Nexus's core glow — brightens to a processing intensity when active, eases back to baseline. */
function CoreLight() {
  const ref = useRef<THREE.PointLight>(null);
  const i = useRef(40);
  useFrame((_, dt) => {
    const target = useJovaStore.getState().nexusActive ? 170 : 40;
    i.current += (target - i.current) * (1 - Math.exp(-dt * 3));
    if (ref.current) ref.current.intensity = i.current;
  });
  return <pointLight ref={ref} position={[0, 6, -22]} distance={40} decay={2} color="#5fd0ff" />;
}

/**
 * Camera: in overview it floats above Nexus's platform with gentle pointer parallax. When a team
 * is focused it eases in to frame that team (with Jova, who flies there too). Click empty space
 * (onPointerMissed) to return to overview.
 */
function CameraRig() {
  const cam = useThree((s) => s.camera);
  const target = useRef(new THREE.Vector3(0, 18, -38));
  const desired = useRef(new THREE.Vector3(0, 7, 26));
  const look = useRef(new THREE.Vector3());
  useFrame((state, dt) => {
    const k = 1 - Math.exp(-dt * 2.5);
    const { focusedTeamId, teams } = useNetworkStore.getState();
    const c = focusedTeamId ? teams.find((x) => x.id === focusedTeamId) : null;
    if (c) {
      const [px, py, pz] = c.position;
      desired.current.set(px, py + 1.5, pz + 9);
      look.current.set(px, py, pz);
    } else {
      desired.current.set(state.pointer.x * 0.7, 7 + state.pointer.y * 0.5, 26);
      look.current.set(0, 18, -38);
    }
    cam.position.lerp(desired.current, k);
    target.current.lerp(look.current, k);
    cam.lookAt(target.current);
  });
  return null;
}
