import * as THREE from "three";

/**
 * The "electricity flowing between neurons" look: a faint constant glow along a tube, with bright
 * bands that travel its length (uv.x runs along the strand in TubeGeometry). Additive, no tone-map,
 * so the project's bloom pass catches the bands.
 */

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3  uColor;
  uniform float uSpeed;   // band travel speed
  uniform float uReps;    // how many bands along the length
  uniform float uBase;    // constant glow floor
  uniform float uFlow;    // band brightness
  varying vec2 vUv;

  void main() {
    float f = fract(vUv.x * uReps - uTime * uSpeed);
    // a sharp travelling band (bright leading edge, soft tail)
    float band = smoothstep(0.0, 0.05, f) * (1.0 - smoothstep(0.05, 0.32, f));
    // brighter toward the centre-line of the tube cross-section
    float cross = pow(max(1.0 - abs(vUv.y - 0.5) * 2.0, 0.0), 1.2);
    float intensity = (uBase + band * uFlow) * (0.35 + 0.65 * cross);
    gl_FragColor = vec4(uColor * intensity, intensity);
  }
`;

export type StrandTier = "nexus" | "spine" | "tendril";

const PRESETS: Record<StrandTier, { uSpeed: number; uReps: number; uBase: number; uFlow: number }> = {
  nexus: { uSpeed: 0.18, uReps: 2.0, uBase: 0.05, uFlow: 1.2 },
  spine: { uSpeed: 0.5, uReps: 3.0, uBase: 0.16, uFlow: 1.5 },
  tendril: { uSpeed: 0.9, uReps: 4.0, uBase: 0.1, uFlow: 1.8 },
};

export function makeStrandMaterial(colorHex: string, tier: StrandTier): THREE.ShaderMaterial {
  const p = PRESETS[tier];
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(colorHex) },
      uSpeed: { value: p.uSpeed },
      uReps: { value: p.uReps },
      uBase: { value: p.uBase },
      uFlow: { value: p.uFlow },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
}
