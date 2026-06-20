"use client";

import * as THREE from "three";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { WispParticles } from "./WispParticles";
import { getGlowTexture } from "./textures";
import { getAmplitude } from "@/lib/audio/amplitude";
import { getWispDynamics } from "@/lib/scene/wispDynamics";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { moodToWispParams } from "@/lib/mood";

// Warm golden spores (ref 00108 / Will-o-the-Wisp.jpg).
const SPORE: [number, number, number] = [1.0, 0.88, 0.55];
const SPORE_EDGE: [number, number, number] = [1.0, 0.6, 0.25];

/**
 * Woodland light-orb wisp. Reworked to feel weightier: a layered core (halo + body + hot center)
 * gives her mass, a denser particle cloud spills below the core and swirls up off it, and the
 * near-camera mote cluster keeps the sense of depth/parallax Gavin liked.
 */
export function OrbWisp() {
  const glow = getGlowTexture();

  const inner = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Sprite>(null);
  const bodyRef = useRef<THREE.Sprite>(null);
  const coreRef = useRef<THREE.Sprite>(null);
  const motesRef = useRef<THREE.Group>(null);
  const core = useRef(new THREE.Color());
  const edge = useRef(new THREE.Color());

  const motes = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => ({
        angle: (i / 7) * Math.PI * 2,
        radius: 0.18 + (i % 3) * 0.05,
        speed: 0.4 + Math.random() * 0.4,
        y: (Math.random() * 2 - 1) * 0.12,
        s: 0.16 + Math.random() * 0.12,
      })),
    []
  );

  useFrame((state) => {
    const amp = getAmplitude();
    const p = moodToWispParams(useJovaStore.getState().mood, "orb");
    const c = core.current.setRGB(...p.coreColor);
    const e = edge.current.setRGB(...p.edgeColor);
    const t = state.clock.elapsedTime;
    // as she recedes she breaks into particles — fade the solid core almost out, the cloud takes over
    const presence = 1 - 0.9 * getWispDynamics().disperse;

    if (inner.current) {
      const breathe = 1 + Math.sin(t * 1.4) * 0.035;
      inner.current.scale.setScalar(p.scale * breathe * (1 + amp * 0.1));
    }
    if (haloRef.current) {
      const s = 1.25 * (1 + amp * 0.3);
      haloRef.current.scale.set(s, s, 1);
      const m = haloRef.current.material as THREE.SpriteMaterial;
      m.color.copy(e);
      m.opacity = (0.26 + amp * 0.18) * presence;
    }
    if (bodyRef.current) {
      // the "mass": a sustained mid layer with a touch of vertical weight
      const s = (0.78 + amp * 0.18) * p.intensity;
      bodyRef.current.scale.set(s, s * 1.06, 1);
      const m = bodyRef.current.material as THREE.SpriteMaterial;
      m.color.copy(c);
      m.opacity = (0.6 + amp * 0.2) * presence;
    }
    if (coreRef.current) {
      const s = (0.36 + amp * 0.18) * p.intensity * presence;
      coreRef.current.scale.set(s, s, 1);
      (coreRef.current.material as THREE.SpriteMaterial).color.lerpColors(c, new THREE.Color(1, 1, 1), 0.5);
    }
    if (motesRef.current) {
      motesRef.current.children.forEach((child, i) => {
        const mo = motes[i];
        // absolute-clock orbit at a constant rate — no accumulator, so it can never drift/stack
        const a = mo.angle + t * mo.speed * 1.1;
        child.position.set(
          Math.cos(a) * mo.radius,
          mo.y + Math.sin(t * mo.speed * 1.3) * 0.04,
          Math.sin(a) * mo.radius
        );
        const sp = child as THREE.Sprite;
        const sc = mo.s * (1 + amp * 0.6);
        sp.scale.set(sc, sc, 1);
        (sp.material as THREE.SpriteMaterial).color.copy(c);
      });
    }
  });

  return (
    <group ref={inner}>
      {/* layered core for mass: soft halo -> body -> hot center */}
      <sprite ref={haloRef}>
        <spriteMaterial map={glow} color="#ffcf80" transparent depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0.26} />
      </sprite>
      <sprite ref={bodyRef} position={[0, -0.02, 0.01]}>
        <spriteMaterial map={glow} color="#ffe0a0" transparent depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0.6} />
      </sprite>
      <sprite ref={coreRef} position={[0, 0, 0.02]}>
        <spriteMaterial map={glow} color="#fff4d8" transparent depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </sprite>

      {/* near-camera mote cluster (depth/parallax) */}
      <group ref={motesRef}>
        {motes.map((_, i) => (
          <sprite key={i}>
            <spriteMaterial map={glow} color="#ffe6a0" transparent depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} />
          </sprite>
        ))}
      </group>

      {/* the cloud: denser spores that spill below the core and swirl up off it, trailing as she moves */}
      <WispParticles
        count={130}
        color={SPORE}
        edgeColor={SPORE_EDGE}
        size={13}
        speed={0.9}
        twinkle={0.5}
        trailGain={1.8}
        reactive
        position={[0, -0.04, 0]}
      />
    </group>
  );
}
