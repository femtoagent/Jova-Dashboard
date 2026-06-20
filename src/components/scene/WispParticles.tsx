"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { WISP_PARTICLE_VERT, WISP_PARTICLE_FRAG } from "./shaders";
import { getAmplitude } from "@/lib/audio/amplitude";
import { getWispDynamics } from "@/lib/scene/wispDynamics";

export interface WispParticlesProps {
  count: number;
  color: [number, number, number];
  edgeColor: [number, number, number];
  size?: number;
  speed?: number;
  twinkle?: number;
  reactive?: boolean;
  /** extra trail responsiveness (orb is heavier/cloudier than the flame) */
  trailGain?: number;
  position?: [number, number, number];
}

const TRAIL_K = 0.06; // seconds of velocity baked into the trail — gentle lag, not a fling
const TRAIL_MAX = 0.45; // local-space cap so travel between tree<->user stays natural
const _trail = new THREE.Vector3();

/**
 * The wisp's own living particle cloud. Reads the shared wisp dynamics each frame so the cloud
 * trails behind her motion (faster => longer/wider tail) and disperses to orbit the trunk when she
 * recedes. All motion is in the vertex shader; only a few uniforms are written per frame.
 */
export function WispParticles({
  count,
  color,
  edgeColor,
  size = 9,
  speed = 1,
  twinkle = 0.4,
  reactive = true,
  trailGain = 1,
  position = [0, 0, 0],
}: WispParticlesProps) {
  const { geometry, material } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3); // unused by shader but required attribute
    const seeds = new Float32Array(count);
    const scales = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      seeds[i] = Math.random();
      scales[i] = 0.5 + Math.random();
    }
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute("aScale", new THREE.BufferAttribute(scales, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: WISP_PARTICLE_VERT,
      fragmentShader: WISP_PARTICLE_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uPhase: { value: 0 },
        uSpeed: { value: speed },
        uSize: { value: size },
        uDisperse: { value: 0 },
        uAmplitude: { value: 0 },
        uTwinkle: { value: twinkle },
        uTrail: { value: new THREE.Vector3() },
        uColor: { value: new THREE.Color(color[0], color[1], color[2]) },
        uEdgeColor: { value: new THREE.Color(edgeColor[0], edgeColor[1], edgeColor[2]) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry: geo, material: mat };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  // mood/style params can change without rebuilding buffers
  useEffect(() => {
    material.uniforms.uSpeed.value = speed;
    material.uniforms.uSize.value = size;
    material.uniforms.uTwinkle.value = twinkle;
    (material.uniforms.uColor.value as THREE.Color).setRGB(...color);
    (material.uniforms.uEdgeColor.value as THREE.Color).setRGB(...edgeColor);
  }, [material, speed, size, twinkle, color, edgeColor]);

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  const u = material.uniforms;
  useFrame((state, dt) => {
    const d = getWispDynamics();
    u.uTime.value = state.clock.elapsedTime;
    u.uAmplitude.value = reactive ? getAmplitude() : 0;
    u.uDisperse.value += (d.disperse - (u.uDisperse.value as number)) * 0.08;

    // calm her spores as she disperses to the tree — slow, gentle, less twinkly (relaxed state)
    const disp = u.uDisperse.value as number;
    const calm = 1 - 0.65 * disp;
    u.uSpeed.value = speed * calm;
    // Integrate the swirl phase on the CPU. The shader uses uPhase (NOT uTime*uSpeed): multiplying a
    // forever-growing uTime by a changing speed jumped the angle by ~uTime*Δspeed on every move —
    // worse over the session ("spins faster after every fly"). Integrating a rate is jump-free.
    u.uPhase.value += dt * (u.uSpeed.value as number);
    u.uTwinkle.value = twinkle * (1 - 0.5 * disp);

    // local-space trail = -worldVelocity scaled, converted out of the group's scale, capped
    const inv = (TRAIL_K * trailGain) / Math.max(0.0001, d.scale);
    _trail.set(-d.vx * inv, -d.vy * inv, -d.vz * inv);
    if (_trail.length() > TRAIL_MAX) _trail.setLength(TRAIL_MAX);
    (u.uTrail.value as THREE.Vector3).lerp(_trail, 0.25);
  });

  return <points geometry={geometry} material={material} position={position} />;
}
