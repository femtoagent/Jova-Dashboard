"use client";

import * as THREE from "three";
import { useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { setWispDynamics } from "@/lib/scene/wispDynamics";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { JovaStage, Mycelium } from "./JovaStage";

/**
 * Jova is placed RELATIVE TO THE CAMERA so she stays framed wherever it flies:
 *   - centre-front, large, when it's "just Jova" (lite mode) — her hero stage
 *   - contracted to the compact orb, tucked bottom-right, once the full network is expanded
 * Offsets are (right, up, forward) in camera space; forward is how far in front of the lens.
 */
const CENTRE: [number, number, number] = [0, -0.4, -6.5];
const CORNER: [number, number, number] = [3.3, -2.0, -6.5];

export function Wisp() {
  const group = useRef<THREE.Group>(null);
  const prev = useRef(new THREE.Vector3());
  const desired = useRef(new THREE.Vector3());
  const camera = useThree((s) => s.camera);
  const focusTeam = useNetworkStore((s) => s.focusTeam);
  const fullMode = useJovaStore((s) => s.fullMode);
  const jovaStyle = useJovaStore((s) => s.jovaStyle);

  useFrame((state, dt) => {
    const g = group.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    // full network → she contracts to the corner; lite "just Jova" → centre stage
    const o = fullMode ? CORNER : CENTRE;

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

  // Clicking Jova just returns focus to her — the chat only opens from the 💬 Chat button now.
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    focusTeam(null);
  };

  return (
    <group ref={group}>
      {/* invisible, raycastable hit sphere so she's clickable — large in lite, tight as the corner orb */}
      <mesh onClick={onClick}>
        <sphereGeometry args={[fullMode ? 0.7 : 2.6, 16, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {fullMode ? (
        // In the full network she contracts to a compact Mycelium tucked in the corner.
        <group scale={0.22}>
          {/* halve her speaking glow in the corner so she isn't too bright on the network side */}
          <Mycelium speakGlow={0.5} />
        </group>
      ) : (
        <JovaStage style={jovaStyle} />
      )}
    </group>
  );
}
