"use client";

import * as THREE from "three";
import { useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { setWispDynamics } from "@/lib/scene/wispDynamics";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { OrbWisp } from "./OrbWisp";

/**
 * Jova is placed RELATIVE TO THE CAMERA so she stays framed wherever it flies:
 *   - centre-front when you're with her (overview / talking to her)
 *   - tucked bottom-right when a team is focused (leaving the corner for its info panels)
 * Offsets are (right, up, forward) in camera space; forward is how far in front of the lens.
 */
const CENTRE: [number, number, number] = [0, -0.9, -6.5];
const CORNER: [number, number, number] = [3.3, -2.0, -6.5];

export function Wisp() {
  const group = useRef<THREE.Group>(null);
  const prev = useRef(new THREE.Vector3());
  const desired = useRef(new THREE.Vector3());
  const camera = useThree((s) => s.camera);
  const focusTeam = useNetworkStore((s) => s.focusTeam);
  const setChatOpen = useJovaStore((s) => s.setChatOpen);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    const focused = useNetworkStore.getState().focusedTeamId != null;
    const o = focused ? CORNER : CENTRE;

    // camera-relative target -> world (so she tracks the view, with a gentle idle bob)
    desired.current.set(o[0], o[1] + Math.sin(t * 0.6) * 0.05, o[2]);
    camera.localToWorld(desired.current);

    prev.current.copy(g.position);
    g.position.lerp(desired.current, 1 - Math.exp(-dt * 3));

    const inv = dt > 1e-4 ? 1 / dt : 0;
    const vx = (g.position.x - prev.current.x) * inv;
    const vy = (g.position.y - prev.current.y) * inv;
    const vz = (g.position.z - prev.current.z) * inv;
    const residual = g.position.distanceTo(desired.current); // she streaks a touch while repositioning
    setWispDynamics({
      x: g.position.x, y: g.position.y, z: g.position.z,
      vx, vy, vz, speed: Math.hypot(vx, vy, vz),
      // keep her gathered while moving — motion reads through the directional trail, not a radial
      // whirl (a big disperse spikes/compounds on rapid consecutive moves and looks like spin-up)
      disperse: Math.min(residual * 0.07, 0.18),
      scale: 1,
    });
  });

  // Click Jova directly = talk to her: bring her centre-front and open the chat.
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    focusTeam(null);
    setChatOpen(true);
  };

  return (
    <group ref={group}>
      {/* invisible, raycastable hit sphere so she's clickable */}
      <mesh onClick={onClick}>
        <sphereGeometry args={[0.7, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <OrbWisp />
    </group>
  );
}
