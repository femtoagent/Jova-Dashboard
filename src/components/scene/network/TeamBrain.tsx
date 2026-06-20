"use client";

import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { getGlowTexture } from "../textures";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import type { Team } from "@/lib/network/types";

/** A team's central "brain": a glowing core + faint wireframe shell + halo, with a label.
 *  Click it to focus. Brightens when any agent is working, and throbs an amber alert halo when the
 *  team has something awaiting your sign-off (visible even from the Nexus overview). */
export function TeamBrain({ team }: { team: Team }) {
  const glow = getGlowTexture();
  const core = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Sprite>(null);
  const alert = useRef<THREE.Sprite>(null);
  const focusTeam = useNetworkStore((s) => s.focusTeam);
  const focused = useNetworkStore((s) => s.focusedTeamId === team.id);

  useEffect(() => () => {
    document.body.style.cursor = "auto";
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const working = team.agents.some((a) => a.tasks.length > 0);
    const needs = team.approvals.length > 0;
    // when something needs sign-off the brain throbs faster + harder to draw the eye
    const pulse = 1 + Math.sin(t * (needs ? 5 : 1.5) + team.position[0]) * (needs ? 0.14 : 0.06);
    const bright = working ? 1.5 : 1.0;
    if (core.current) core.current.scale.setScalar(pulse * (focused ? 1.12 : 1));
    if (halo.current) {
      const s = 2.2 * pulse * bright;
      halo.current.scale.set(s, s, 1);
      (halo.current.material as THREE.SpriteMaterial).opacity = (focused ? 0.6 : 0.42) * bright;
    }
    if (alert.current) {
      const ap = needs ? 0.5 + 0.5 * Math.sin(t * 5) : 0; // 0..1 throb when sign-off pending
      const s = 3.0 + ap * 1.4;
      alert.current.scale.set(s, s, 1);
      (alert.current.material as THREE.SpriteMaterial).opacity = needs ? 0.2 + ap * 0.4 : 0;
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    focusTeam(team.id);
  };
  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = "pointer";
  };
  const onOut = () => {
    document.body.style.cursor = "auto";
  };

  return (
    <group position={team.position}>
      {/* amber alert halo — only visible when an approval is pending */}
      <sprite ref={alert}>
        <spriteMaterial map={glow} color="#ffd27f" transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0} />
      </sprite>

      <sprite ref={halo}>
        <spriteMaterial map={glow} color={team.color} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0.42} />
      </sprite>

      {/* clickable solid core */}
      <mesh ref={core} onClick={onClick} onPointerOver={onOver} onPointerOut={onOut}>
        <icosahedronGeometry args={[0.5, 3]} />
        <meshBasicMaterial color={team.color} toneMapped={false} />
      </mesh>

      {/* faint wireframe shell — the "brain" texture */}
      <mesh scale={1.12}>
        <icosahedronGeometry args={[0.5, 2]} />
        <meshBasicMaterial color={team.color} wireframe transparent opacity={0.28} toneMapped={false} depthWrite={false} />
      </mesh>

      <Html position={[0, 1.05, 0]} center style={{ pointerEvents: "none" }}>
        <div
          style={{
            whiteSpace: "nowrap",
            fontSize: 12,
            letterSpacing: 1,
            fontWeight: 600,
            color: team.color,
            textShadow: "0 0 8px rgba(0,0,0,0.9)",
            opacity: focused ? 1 : 0.82,
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
          }}
        >
          {team.name.toUpperCase()}
          {team.approvals.length > 0 && <span style={{ color: "#ffd27f" }}>{"  ⚠"}</span>}
        </div>
      </Html>
    </group>
  );
}
