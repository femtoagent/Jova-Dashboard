"use client";

import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { makeStrandMaterial, type StrandTier } from "./strandMaterial";

/** One connecting strand (a tube along a curve) with the travelling-charge shader. */
export function Strand({
  curve,
  color,
  tier,
  radius,
  segments = 48,
}: {
  curve: THREE.Curve<THREE.Vector3>;
  color: string;
  tier: StrandTier;
  radius: number;
  /** tube length resolution — keep low for the many short spines, higher for the long Nexus wires */
  segments?: number;
}) {
  const mat = useMemo(() => makeStrandMaterial(color, tier), [color, tier]);
  const geom = useMemo(() => new THREE.TubeGeometry(curve, segments, radius, 6, false), [curve, radius, segments]);

  useFrame((_, dt) => {
    mat.uniforms.uTime.value += dt;
  });

  useEffect(() => () => {
    geom.dispose();
    mat.dispose();
  }, [geom, mat]);

  return <mesh geometry={geom} material={mat} />;
}
