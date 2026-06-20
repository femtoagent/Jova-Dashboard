"use client";

import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { getGlowTexture } from "../textures";

export interface PulseCurve {
  id: string;
  curve: THREE.Curve<THREE.Vector3>;
  color: string;
  tier: "nexus" | "spine";
}

interface Slot {
  active: boolean;
  curve: THREE.Curve<THREE.Vector3> | null;
  t: number;
  speed: number;
  size: number;
  color: THREE.Color;
}

const POOL = 28;

/**
 * The messages flying between neurons: a fixed pool of glow sprites that ride the strand curves
 * (Nexus→team are larger/slower, team↔agent spines smaller/faster). Pooled + driven in
 * useFrame so spawning a message never re-renders React.
 */
export function Pulses({ curves }: { curves: PulseCurve[] }) {
  const glow = getGlowTexture();
  const group = useRef<THREE.Group>(null);
  const tmp = useRef(new THREE.Vector3());
  const acc = useRef(0);
  const slots = useRef<Slot[]>(
    Array.from({ length: POOL }, () => ({ active: false, curve: null, t: 0, speed: 0.4, size: 0.1, color: new THREE.Color() }))
  );

  // when the curve set changes (focus switch / team removed), retire any in-flight pulse riding a
  // curve that no longer exists — so a sprite never glides along a now-hidden strand.
  useEffect(() => {
    const live = new Set(curves.map((c) => c.curve));
    const g = group.current;
    for (let i = 0; i < POOL; i++) {
      const s = slots.current[i];
      if (s.active && s.curve && !live.has(s.curve)) {
        s.active = false;
        const spr = g?.children[i] as THREE.Sprite | undefined;
        if (spr) spr.scale.setScalar(0);
      }
    }
  }, [curves]);

  useFrame((_, dt) => {
    // spawn a new pulse on a random curve at a steady cadence
    acc.current += dt;
    if (curves.length && acc.current >= 0.6) {
      acc.current = 0;
      const pc = curves[Math.floor(Math.random() * curves.length)];
      const slot = slots.current.find((s) => !s.active);
      if (slot) {
        slot.active = true;
        slot.curve = pc.curve;
        slot.t = 0;
        slot.color.set(pc.color);
        if (pc.tier === "nexus") {
          slot.speed = 0.22 + Math.random() * 0.06;
          slot.size = 0.5;
        } else {
          slot.speed = 0.5 + Math.random() * 0.3;
          slot.size = 0.24;
        }
      }
    }

    const g = group.current;
    if (!g) return;
    for (let i = 0; i < POOL; i++) {
      const s = slots.current[i];
      const spr = g.children[i] as THREE.Sprite;
      if (!s.active || !s.curve) {
        spr.scale.setScalar(0);
        continue;
      }
      s.t += dt * s.speed;
      if (s.t >= 1) {
        s.active = false;
        spr.scale.setScalar(0);
        continue;
      }
      s.curve.getPointAt(s.t, tmp.current);
      spr.position.copy(tmp.current);
      const a = Math.min(Math.min(s.t, 1 - s.t) * 5, 1); // fade in/out at the ends
      spr.scale.setScalar(s.size * (0.55 + 0.45 * a));
      const m = spr.material as THREE.SpriteMaterial;
      m.color.copy(s.color);
      m.opacity = a;
    }
  });

  return (
    <group ref={group}>
      {Array.from({ length: POOL }).map((_, i) => (
        <sprite key={i} scale={0}>
          <spriteMaterial map={glow} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0} />
        </sprite>
      ))}
    </group>
  );
}
