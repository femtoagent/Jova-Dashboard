"use client";

import * as THREE from "three";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { getGlowTexture } from "./textures";
import { getAmplitude } from "@/lib/audio/amplitude";
import { moodToWispParams } from "@/lib/mood";
import { useJovaStore, type JovaStyle } from "@/lib/state/useJovaStore";
import { WispParticles } from "./WispParticles";

/**
 * Jova's hero stage — the screen-filling "just Jova" presence (lite mode only; in the full network she
 * contracts to the compact OrbWisp in the corner). Five futuristic forms, each built to feel ALIVE when
 * she speaks (driven by `getAmplitude`) and to tint with her mood (`moodToWispParams`). Any oscillation
 * whose RATE depends on amplitude/arousal integrates a phase on the CPU (never `sin(t * variableRate)`),
 * so eased changes can't spike the motion. Manually-created GPU buffers dispose on view-switch.
 */

const WHITE = new THREE.Color(1, 1, 1);

/** deterministic RNG so every geometry build is identical across mounts. */
function makeRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

/** Evenly-spread points on a sphere of radius r (Fibonacci lattice). */
function fibSphere(n: number, r: number): [number, number, number][] {
  const pts: [number, number, number][] = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = phi * i;
    pts.push([Math.cos(th) * rad * r, y * r, Math.sin(th) * rad * r]);
  }
  return pts;
}

/** A big soft wash behind her so the form reads against the dark, brightening when she speaks. */
function AmbientGlow() {
  const glow = getGlowTexture();
  const ref = useRef<THREE.Sprite>(null);
  const col = useRef(new THREE.Color());
  useFrame((state) => {
    const amp = getAmplitude();
    const p = moodToWispParams(useJovaStore.getState().mood, "orb");
    const breathe = 1 + Math.sin(state.clock.elapsedTime * 0.8) * 0.04;
    if (ref.current) {
      const s = 12 * breathe * (1 + amp * 0.1);
      ref.current.scale.set(s, s, 1);
      const m = ref.current.material as THREE.SpriteMaterial;
      m.color.copy(col.current.setRGB(...p.edgeColor));
      m.opacity = 0.14 + amp * 0.06;
    }
  });
  return (
    <sprite ref={ref} position={[0, 0, -3]}>
      <spriteMaterial map={glow} transparent depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0.14} />
    </sprite>
  );
}

/** Her golden heart — a layered halo→body→core glow shared by most forms. */
function Core({ scale = 1 }: { scale?: number }) {
  const glow = getGlowTexture();
  const halo = useRef<THREE.Sprite>(null);
  const body = useRef<THREE.Sprite>(null);
  const core = useRef<THREE.Sprite>(null);
  const c = useRef(new THREE.Color());
  const e = useRef(new THREE.Color());
  useFrame((state) => {
    const amp = getAmplitude();
    const p = moodToWispParams(useJovaStore.getState().mood, "orb");
    const cc = c.current.setRGB(...p.coreColor);
    const ee = e.current.setRGB(...p.edgeColor);
    const breathe = 1 + Math.sin(state.clock.elapsedTime * 1.3) * 0.04;
    if (halo.current) {
      const s = 2.6 * scale * breathe * (1 + amp * 0.35);
      halo.current.scale.set(s, s, 1);
      const m = halo.current.material as THREE.SpriteMaterial;
      m.color.copy(ee);
      m.opacity = 0.3 + amp * 0.2;
    }
    if (body.current) {
      const s = 1.5 * scale * p.intensity * (1 + amp * 0.25);
      body.current.scale.set(s, s * 1.05, 1);
      (body.current.material as THREE.SpriteMaterial).color.copy(cc);
    }
    if (core.current) {
      const s = 0.8 * scale * p.intensity * (1 + amp * 0.3);
      core.current.scale.set(s, s, 1);
      (core.current.material as THREE.SpriteMaterial).color.lerpColors(cc, WHITE, 0.55);
    }
  });
  return (
    <group>
      <sprite ref={halo}>
        <spriteMaterial map={glow} color="#ffcf80" transparent depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0.3} />
      </sprite>
      <sprite ref={body} position={[0, 0, 0.01]}>
        <spriteMaterial map={glow} color="#ffe0a0" transparent depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <sprite ref={core} position={[0, 0, 0.02]}>
        <spriteMaterial map={glow} color="#fff4d8" transparent depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} />
      </sprite>
    </group>
  );
}

// 3D value-noise fbm, shared by the flow-field shaders.
const NOISE_GLSL = /* glsl */ `
  float hash(vec3 p){
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float vnoise(vec3 x){
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i + vec3(0.0,0.0,0.0)), hash(i + vec3(1.0,0.0,0.0)), f.x),
          mix(hash(i + vec3(0.0,1.0,0.0)), hash(i + vec3(1.0,1.0,0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0,0.0,1.0)), hash(i + vec3(1.0,0.0,1.0)), f.x),
          mix(hash(i + vec3(0.0,1.0,1.0)), hash(i + vec3(1.0,1.0,1.0)), f.x), f.y), f.z);
  }
  float fbm(vec3 p){
    float a = 0.5; float s = 0.0;
    for(int i = 0; i < 5; i++){ s += a * vnoise(p); p *= 2.02; a *= 0.5; }
    return s;
  }
`;

// Differential-rotation accretion disk: particles spiral inward, spaghettify near the core, recycle.
// Inflow speed is amplitude-driven, so its phase is integrated on the CPU (uInflow) — never sin(uTime*amp).
// Differential winding comes from the bounded per-particle `life` plus a CPU-integrated base spin
// (uSpin), NOT from uTime*omega where omega depends on the amp-driven life (that term would spike).
const SING_WIND = 11.0; // radians a mote winds as it falls from outer edge (life 0) to core (life 1)

const SING_DISK_VERT = /* glsl */ `
  attribute float aSeed;     // 0..1 unique per particle
  attribute float aRing;     // 0 (inner edge) .. 1 (outer edge) start radius factor
  uniform float uTime;
  uniform float uInflow;     // CPU-integrated inward progress (grows; amp accelerates it)
  uniform float uSpin;       // CPU-integrated base disk rotation (rate eased by arousal, never uTime*rate)
  uniform float uWind;       // radians of differential winding from outer edge to core
  uniform float uAmp;
  uniform float uSize;
  varying float vHeat;       // 0 cool/outer .. 1 hot/inner
  varying float vTw;
  void main(){
    float seed = aSeed;
    // each particle owns a life in [0,1): 0 = just spawned at outer edge, ~1 = swallowed -> respawn.
    float life = fract(uInflow * (0.05 + 0.06 * seed) + seed);
    vHeat = life;

    float rOuter = mix(2.2, 3.25, aRing);
    float rInner = 0.62;
    // radius collapses inward as life advances; pow makes it linger out then plunge (spaghettify).
    float r = mix(rOuter, rInner, pow(life, 1.7));

    // differential rotation: a globally integrated spin (uSpin, constant coeff on the growing phase)
    // plus a winding that accumulates with how far the mote has fallen in. 'life' is bounded [0,1),
    // so this can NEVER multiply an ever-growing uTime by an amplitude-driven rate.
    float ang = seed * 6.2831 + uSpin + pow(life, 1.3) * uWind;

    float x = cos(ang) * r;
    float z = sin(ang) * r;
    // thin disk: slight vertical thickness, squeezed into the plane as it falls in
    float thick = mix(0.16, 0.015, life) * (0.5 + seed);
    float y = sin(ang * 2.0 + seed * 30.0) * thick;

    vec3 pos = vec3(x, y, z);
    vTw = 0.5 + 0.5 * sin(uTime * 2.2 + seed * 28.0);   // constant-freq twinkle

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    // hotter, brighter, larger as it nears the core; gentle amp bump only
    float sz = uSize * (0.45 + 1.1 * life) * (0.6 + 0.7 * seed) * (1.0 + uAmp * 0.6);
    gl_PointSize = clamp(sz * (9.0 / -mv.z), 0.0, 38.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const SING_DISK_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uCool;   // outer disk (flame edge)
  uniform vec3 uHot;    // inner near-core (flame core, lerped toward white)
  uniform float uAmp;
  varying float vHeat;
  varying float vTw;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float glow = smoothstep(0.5, 0.0, d);
    float core = smoothstep(0.22, 0.0, d);
    vec3 col = mix(uCool, uHot, vHeat * vHeat);
    col += vec3(0.18) * core * vHeat;           // small hot heart only on infalling particles
    float a = (glow * glow * 0.4 + core * 0.32) * (0.55 + 0.45 * vTw);
    a *= (0.45 + 0.55 * vHeat);                  // outer motes dimmer, infalling brighter
    gl_FragColor = vec4(col * (1.0 + uAmp * 0.25), clamp(a, 0.0, 0.7));
  }
`;

// Twin polar jets: two opposed cones of motes streaming along the disk axis (local Y).
// Their reach/brightness surge with amplitude; the stream phase is CPU-integrated (uJet).
const SING_JET_VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aSide;     // +1 up jet, -1 down jet
  uniform float uTime;
  uniform float uJet;        // CPU-integrated stream phase (amp speeds it)
  uniform float uReach;      // eased 0..1 jet length (amp + arousal)
  uniform float uAmp;
  uniform float uSize;
  varying float vLife;
  varying float vTw;
  void main(){
    float seed = aSeed;
    float life = fract(uJet * (0.16 + 0.18 * seed) + seed);
    vLife = life;
    float len = mix(0.5, 3.6, uReach);          // how far the jet shoots
    float y = aSide * (0.45 + life * len);
    // jet narrows at the core then frays at the tip
    float rad = (0.05 + 0.42 * life) * (0.4 + 0.6 * seed);
    float ang = seed * 6.2831 + uTime * 1.6 + life * 6.0;   // uTime*const is safe
    float x = cos(ang) * rad;
    float z = sin(ang) * rad;
    vec3 pos = vec3(x, y, z);
    vTw = 0.5 + 0.5 * sin(uTime * 6.0 + seed * 40.0);  // fast constant-freq flicker
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float sz = uSize * (1.0 - life * 0.5) * (0.5 + 0.7 * seed) * (1.0 + uAmp * 0.7);
    gl_PointSize = clamp(sz * (9.0 / -mv.z), 0.0, 36.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const SING_JET_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uHot;
  uniform float uAmp;
  uniform float uReach;
  varying float vLife;
  varying float vTw;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float g = smoothstep(0.5, 0.0, d);
    float fade = sin(vLife * 3.14159265);        // bright mid-stream, fade at base+tip
    vec3 col = mix(uHot, uColor, vLife);
    float a = g * g * fade * (0.45 + 0.55 * vTw) * (0.35 + 0.65 * uReach);
    gl_FragColor = vec4(col * (1.0 + uAmp * 0.35), clamp(a, 0.0, 0.6));
  }
`;

/** SINGULARITY — a tilted accretion disk spiralling into a collapsed core, a shimmering event-horizon
 *  ring, and twin polar jets that fire when she speaks. A mind collapsing possibility into one utterance. */
function Singularity() {
  const glow = getGlowTexture();
  const precess = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const ringMat = useRef<THREE.MeshBasicMaterial>(null);
  const haloRef = useRef<THREE.Sprite>(null);

  // CPU-integrated phases (amp/arousal-driven rates MUST be integrated, never uTime*rate)
  const inflow = useRef(0);
  const jetPhase = useRef(0);
  const spin = useRef(0);    // base disk rotation phase
  const reach = useRef(0);   // eased jet reach 0..1

  // ---- accretion disk ----
  const disk = useMemo(() => {
    const COUNT = 3200;
    const pos = new Float32Array(COUNT * 3); // required but unused by shader
    const seeds = new Float32Array(COUNT);
    const rings = new Float32Array(COUNT);
    const rnd = makeRng(101);
    for (let i = 0; i < COUNT; i++) {
      seeds[i] = rnd();
      rings[i] = rnd();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute("aRing", new THREE.BufferAttribute(rings, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
    const uniforms = {
      uTime: { value: 0 },
      uInflow: { value: 0 },
      uSpin: { value: 0 },
      uWind: { value: SING_WIND },
      uAmp: { value: 0 },
      uSize: { value: 8.5 },
      uCool: { value: new THREE.Color(0.06, 0.3, 0.9) },
      uHot: { value: new THREE.Color(0.85, 0.97, 1.0) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: SING_DISK_VERT,
      fragmentShader: SING_DISK_FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { geo, mat, uniforms };
  }, []);

  // ---- twin jets ----
  const jets = useMemo(() => {
    const COUNT = 900;
    const pos = new Float32Array(COUNT * 3);
    const seeds = new Float32Array(COUNT);
    const side = new Float32Array(COUNT);
    const rnd = makeRng(202);
    for (let i = 0; i < COUNT; i++) {
      seeds[i] = rnd();
      side[i] = i % 2 === 0 ? 1 : -1;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    geo.setAttribute("aSide", new THREE.BufferAttribute(side, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
    const uniforms = {
      uTime: { value: 0 },
      uJet: { value: 0 },
      uReach: { value: 0.25 },
      uAmp: { value: 0 },
      uSize: { value: 10 },
      uColor: { value: new THREE.Color(0.1, 0.5, 1.0) },
      uHot: { value: new THREE.Color(0.9, 0.98, 1.0) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: SING_JET_VERT,
      fragmentShader: SING_JET_FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { geo, mat, uniforms };
  }, []);

  useEffect(
    () => () => {
      disk.geo.dispose();
      disk.mat.dispose();
      jets.geo.dispose();
      jets.mat.dispose();
    },
    [disk, jets]
  );

  const cool = useRef(new THREE.Color());
  const hot = useRef(new THREE.Color());
  const ringCol = useRef(new THREE.Color());

  useFrame((state, dt) => {
    const amp = getAmplitude();
    const et = state.clock.elapsedTime;
    const mood = useJovaStore.getState().mood;
    const flame = moodToWispParams(mood, "flame");
    const arousal = mood.arousal;
    const warm = (mood.valence + 1) / 2;

    // integrate amplitude/arousal-driven phases (never uTime * variableRate)
    inflow.current += dt * (0.55 + arousal * 0.7 + amp * 2.6);
    jetPhase.current += dt * (0.9 + arousal * 0.8 + amp * 3.4);
    spin.current += dt * (0.4 + arousal * 0.5 + amp * 0.6);   // base disk rotation, integrated
    // eased jet reach: amplitude surges it, arousal lengthens it, low valence shortens it
    const reachTarget = Math.min(1, 0.18 + amp * 1.3 + arousal * 0.3) * (0.7 + 0.3 * warm);
    reach.current += (reachTarget - reach.current) * (1 - Math.exp(-dt * 6));

    // whole-system precession + slow tumble (cool/down = slower)
    if (precess.current) {
      const sp = 0.06 + arousal * 0.06;
      precess.current.rotation.y += dt * sp;
      precess.current.rotation.z = Math.sin(et * 0.25) * 0.05;   // constant-freq tumble
    }

    const cc = cool.current.setRGB(...flame.edgeColor);
    const hh = hot.current.setRGB(...flame.coreColor).lerp(WHITE, 0.35);
    const dim = 0.55 + 0.45 * warm; // low valence = dimmer

    // disk uniforms
    const du = disk.uniforms;
    du.uTime.value = et;
    du.uInflow.value = inflow.current;
    du.uSpin.value = spin.current;
    du.uAmp.value = amp;
    (du.uCool.value as THREE.Color).copy(cc);
    (du.uHot.value as THREE.Color).copy(hh);

    // jet uniforms — pulse/flicker via integrated phase + a constant-freq throb
    const ju = jets.uniforms;
    ju.uTime.value = et;
    ju.uJet.value = jetPhase.current;
    const pulse = 0.85 + 0.15 * Math.sin(et * 3.0); // constant-freq jet throb
    ju.uReach.value = reach.current * pulse;
    ju.uAmp.value = amp;
    (ju.uColor.value as THREE.Color).copy(cc);
    (ju.uHot.value as THREE.Color).copy(hh);

    // event-horizon ring: shimmer/flare; flares brighter when speaking
    if (ringRef.current) {
      const brer = 1 + Math.sin(et * 1.1) * 0.03;
      const s = (1 + amp * 0.18) * brer;
      ringRef.current.scale.set(s, s, s);
      ringRef.current.rotation.z += dt * (0.3 + amp * 0.6);
    }
    if (ringMat.current) {
      ringMat.current.color.copy(ringCol.current.copy(hh));
      const shimmer = 0.5 + 0.5 * Math.sin(et * 4.0);   // constant-freq shimmer
      ringMat.current.opacity = (0.32 + amp * 0.4 + 0.12 * shimmer) * dim;
    }

    // lensed back-halo of the core
    if (haloRef.current) {
      const breathe = 1 + Math.sin(et * 1.6) * 0.05;
      const s = 2.4 * breathe * (1 + amp * 0.3);
      haloRef.current.scale.set(s, s, 1);
      const m = haloRef.current.material as THREE.SpriteMaterial;
      m.color.copy(cc);
      m.opacity = (0.22 + amp * 0.18) * dim;
    }
  });

  return (
    <group>
      {/* lensing back-halo, billboarded behind the core */}
      <sprite ref={haloRef} position={[0, 0, -0.4]}>
        <spriteMaterial map={glow} transparent depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0.22} />
      </sprite>

      {/* tilted system: disk + jets + horizon ring + core all share the dramatic tilt */}
      <group rotation={[0.52, 0, 0]}>
        <group ref={precess}>
          {/* collapsed brilliant core (warm gold) */}
          <Core scale={0.42} />

          {/* event-horizon lensing ring around the core */}
          <mesh ref={ringRef}>
            <ringGeometry args={[0.66, 0.82, 96]} />
            <meshBasicMaterial ref={ringMat} transparent depthWrite={false} side={THREE.DoubleSide} blending={THREE.AdditiveBlending} toneMapped={false} opacity={0.4} />
          </mesh>

          {/* accretion disk */}
          <points geometry={disk.geo} material={disk.mat} />

          {/* twin polar jets */}
          <points geometry={jets.geo} material={jets.mat} />
        </group>
      </group>

      {/* a few drifting cyan motes flung off the disk plane for extra life */}
      <WispParticles count={70} color={[0.5, 0.85, 1.0]} edgeColor={[0.06, 0.3, 0.95]} size={8} speed={0.7} twinkle={0.6} reactive position={[0, 0, 0]} />
    </group>
  );
}

const PLAS_VERT = /* glsl */ `
  attribute float aT;
  attribute float aSeed;
  attribute vec3 aBase;
  uniform float uTime;
  uniform float uFlow;
  uniform float uAmp;
  uniform float uArous;
  uniform float uSize;
  uniform float uReach;
  varying float vBright;
  varying float vT;
  ${NOISE_GLSL}
  // cheap curl of fbm: rotated gradient of a scalar field -> swirling, divergence-free-ish flow
  vec3 PLAS_curl(vec3 p){
    float e = 0.45;
    float n1 = fbm(p + vec3(0.0, e, 0.0));
    float n2 = fbm(p - vec3(0.0, e, 0.0));
    float n3 = fbm(p + vec3(0.0, 0.0, e));
    float n4 = fbm(p - vec3(0.0, 0.0, e));
    float n5 = fbm(p + vec3(e, 0.0, 0.0));
    float n6 = fbm(p - vec3(e, 0.0, 0.0));
    float x = (n3 - n4) - (n1 - n2);
    float y = (n5 - n6) - (n3 - n4);
    float z = (n1 - n2) - (n5 - n6);
    return vec3(x, y, z);
  }
  void main(){
    vT = aT;
    vec3 base = aBase;
    // tendril reaches further out along its length as she speaks (grows toward the tip)
    float reach = 1.0 + uReach * aT * (0.6 + 0.5 * aSeed);
    vec3 pos = base * reach;
    // continuous churn: curl-noise flow sampled in a slowly DRIFTING field (uFlow is integrated on CPU)
    vec3 sample1 = base * 0.7 + vec3(0.0, uFlow * 0.6, 0.0) + aSeed * 4.0;
    vec3 sample2 = base * 1.7 - vec3(uFlow * 0.35, 0.0, uFlow * 0.25);
    vec3 flow = PLAS_curl(sample1) + 0.5 * PLAS_curl(sample2);
    // displacement grows toward the writhing tips; amplitude makes it WRITHE harder & reach further
    float writhe = (0.55 + 0.95 * aT) * (0.8 + uArous * 0.9 + uAmp * 1.7);
    pos += flow * writhe;
    // gentle slow breathing wobble layered on (constant in-shader rate -> safe)
    pos += vec3(sin(uTime * 0.7 + aSeed * 6.2831), cos(uTime * 0.6 + aSeed * 5.0), sin(uTime * 0.5 + aSeed * 3.3)) * 0.06 * aT;
    // bright pulse travelling outward along each strand (uTime * CONSTANT -> safe) + crackle flicker
    float pulse = sin(aT * 7.0 - uTime * 3.2 + aSeed * 20.0);
    float crackle = sin(uTime * 22.0 + aSeed * 91.0);
    vBright = 0.30 + 0.45 * max(0.0, pulse) + 0.18 * max(0.0, crackle) * (0.4 + uAmp + uArous * 0.5)
            + uAmp * 0.6 + (1.0 - aT) * 0.25;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float sz = uSize * (0.5 + 1.1 * vBright) * (0.7 + 0.6 * aSeed);
    gl_PointSize = clamp(sz * (9.0 / -mv.z), 0.0, 38.0);
    gl_Position = projectionMatrix * mv;
  }
`;
const PLAS_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uEdge;
  varying float vBright;
  varying float vT;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float glow = smoothstep(0.5, 0.0, d);
    float hot = smoothstep(0.22, 0.0, d);
    // hot white-blue heart near the core (low aT) cooling to deep edge color at the tips
    vec3 col = mix(uColor, uEdge, clamp(vT * 1.1, 0.0, 1.0));
    col += vec3(0.35, 0.4, 0.45) * hot * (1.0 - vT);
    float a = (glow * glow * 0.42 + hot * 0.4) * clamp(vBright, 0.0, 1.2);
    gl_FragColor = vec4(col * (0.85 + vBright * 0.4), clamp(a, 0.0, 0.68));
  }
`;

function Plasma() {
  const spin = useRef<THREE.Group>(null);
  const flowPhase = useRef(0);
  const reach = useRef(0);

  const { geo, mat } = useMemo(() => {
    const STRANDS = 150;
    const PER = 26; // points per filament
    const total = STRANDS * PER;
    const rnd = makeRng(909);
    const roots = fibSphere(STRANDS, 1.0); // even root directions on the heart's surface
    const pos = new Float32Array(total * 3); // required attribute, unused for placement
    const base = new Float32Array(total * 3);
    const aT = new Float32Array(total);
    const aSeed = new Float32Array(total);
    let w = 0;
    const dir = new THREE.Vector3();
    const tang = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    for (let s = 0; s < STRANDS; s++) {
      const root = roots[s];
      dir.set(root[0], root[1], root[2]).normalize();
      // a per-strand tangent so each filament bows off the radial in its own direction
      tmp.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
      tang.copy(dir).cross(tmp).normalize();
      const len = 1.7 + rnd() * 1.4; // 1.7..3.1 reach
      const curve = 0.5 + rnd() * 1.1;
      const seed = rnd();
      const innerR = 0.55 + rnd() * 0.2;
      for (let i = 0; i < PER; i++) {
        const t = i / (PER - 1);
        const r = innerR + t * len;
        // base filament: radial + a tangential bow that grows along its length
        base[w * 3] = dir.x * r + tang.x * curve * t * t;
        base[w * 3 + 1] = dir.y * r + tang.y * curve * t * t;
        base[w * 3 + 2] = dir.z * r + tang.z * curve * t * t;
        aT[w] = t;
        aSeed[w] = seed;
        w++;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aBase", new THREE.BufferAttribute(base, 3));
    g.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
    g.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));

    const m = new THREE.ShaderMaterial({
      vertexShader: PLAS_VERT,
      fragmentShader: PLAS_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uFlow: { value: 0 },
        uAmp: { value: 0 },
        uArous: { value: 0.35 },
        uReach: { value: 0 },
        uSize: { value: 9 },
        uColor: { value: new THREE.Color(0.85, 0.97, 1.0) },
        uEdge: { value: new THREE.Color(0.08, 0.3, 0.95) },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { geo: g, mat: m };
  }, []);

  useEffect(() => () => { geo.dispose(); mat.dispose(); }, [geo, mat]);

  const u = mat.uniforms;
  useFrame((state, dt) => {
    const amp = getAmplitude();
    const mood = useJovaStore.getState().mood;
    const p = moodToWispParams(mood, "flame"); // electric blue -> white-hot cyan
    const arous = Math.max(0, Math.min(1, mood.arousal));

    // CPU-integrated flow phase: writhe SPEED rises with arousal + speaking, never sin(uTime*amp).
    flowPhase.current += dt * (0.22 + arous * 0.5 + amp * 1.4);
    // smoothed reach so tendrils extend/retract instead of snapping
    const reachTarget = amp * 1.3 + arous * 0.25;
    reach.current += (reachTarget - reach.current) * (1 - Math.exp(-dt * 6));

    u.uTime.value = state.clock.elapsedTime;
    u.uFlow.value = flowPhase.current;
    u.uAmp.value = amp;
    u.uArous.value = arous;
    u.uReach.value = reach.current;
    (u.uColor.value as THREE.Color).setRGB(...p.coreColor);
    (u.uEdge.value as THREE.Color).setRGB(...p.edgeColor);

    if (spin.current) {
      // slow global rotation/precession, a touch faster when energized
      spin.current.rotation.y += dt * (0.1 + arous * 0.12 + amp * 0.18);
      spin.current.rotation.x += dt * 0.035;
    }
  });

  return (
    <group>
      <Core scale={0.4} />
      <group ref={spin}>
        <points geometry={geo} material={mat} />
      </group>
      <WispParticles count={120} color={[0.8, 0.95, 1.0]} edgeColor={[0.15, 0.4, 1.0]} size={9} speed={1.1} twinkle={0.7} reactive position={[0, 0, 0]} />
    </group>
  );
}

const RES_SURF_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;     // raw time; only ever multiplied by CONSTANTS in-shader
  uniform float uAmp;      // live amplitude 0..0.85 (scales displacement/brightness only)
  uniform float uArousal;  // 0..1
  uniform float uRadius;
  uniform float uSize;
  varying float vGlow;
  varying float vSeed;
  void main(){
    vec3 dir = normalize(position);
    float t = uTime;
    // layered harmonic ripples racing over the surface (constant in-shader rates -> never spike)
    float w1 = sin(dir.y * 6.0 + t * 1.7);
    float w2 = sin(dir.x * 5.0 - dir.z * 5.0 + t * 2.6);
    float w3 = sin((dir.x + dir.y + dir.z) * 7.0 + t * 3.4 + aSeed * 6.2831);
    float breath = sin(t * 0.9) * 0.5 + 0.5;          // idle breathing when silent
    float ripple = (w1 * 0.45 + w2 * 0.32 + w3 * 0.23);
    float idle = 0.05 + 0.04 * breath;
    float speak = uAmp * (0.55 + uArousal * 0.65);     // surface heaves with the voice
    float disp = idle + ripple * (idle + speak);
    float r = uRadius * (1.0 + disp);
    vec3 pos = dir * r;
    vGlow = 0.35 + 0.5 * max(0.0, ripple) + speak * 0.9
          + 0.25 * (0.5 + 0.5 * sin(t * 5.0 + aSeed * 30.0)); // twinkle (constant rate)
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = clamp(uSize * (0.6 + 0.9 * vGlow) * (9.0 / -mv.z), 0.0, 38.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const RES_SURF_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor; uniform vec3 uEdge; uniform float uAmp;
  varying float vGlow; varying float vSeed;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float soft = smoothstep(0.5, 0.0, d);
    float g = clamp(vGlow, 0.0, 1.4);
    // modest additive budget: gentle brightness add, alpha kept inside the bloom-safe band
    vec3 col = mix(uEdge, uColor, clamp(g, 0.0, 1.0)) + uAmp * 0.18;
    gl_FragColor = vec4(col, soft * soft * (0.22 + 0.30 * g));
  }
`;

// Radial EQ spikes: lineSegments from the surface outward; tips pushed by the voice.
const RES_SPIKE_VERT = /* glsl */ `
  attribute float aSeed;   // per-spike random (shared by both endpoints)
  attribute float aTip;    // 0 at base (on sphere), 1 at tip
  uniform float uTime; uniform float uAmp; uniform float uArousal; uniform float uRadius;
  varying float vTip; varying float vBright;
  void main(){
    vec3 dir = normalize(position);
    vTip = aTip;
    // per-spike bob uses a per-vertex CONSTANT rate; amplitude scales LENGTH only.
    float bob = 0.5 + 0.5 * sin(uTime * (2.0 + 1.3 * fract(aSeed * 7.0)) + aSeed * 6.2831);
    float reach = 0.12 + bob * 0.10                                  // idle shimmer
                + uAmp * (0.7 + uArousal * 0.9) * (0.6 + 0.8 * fract(aSeed * 13.0)); // voice leap
    float r = uRadius * 1.02 + aTip * reach;
    vec3 pos = dir * r;
    vBright = (0.4 + uAmp * 1.1) * (1.0 - aTip * 0.35);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const RES_SPIKE_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor; uniform vec3 uEdge;
  varying float vTip; varying float vBright;
  void main(){
    vec3 col = mix(uColor, uEdge, vTip);
    float a = vBright * (1.0 - vTip) * 0.6;
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.7));
  }
`;

function Resonance() {
  const glow = getGlowTexture();
  const spin = useRef<THREE.Group>(null);

  const RING_POOL = 6;
  const RES_RADIUS = 2.7; // BIG: inside the required ~2.6..3.4 band; spikes/rings reach further

  // surface point-cloud sphere + radial EQ spikes
  const { surfGeo, surfMat, spikeGeo, spikeMat } = useMemo(() => {
    const surfPts = fibSphere(1400, 1);
    const sp = new Float32Array(surfPts.length * 3);
    const ss = new Float32Array(surfPts.length);
    const rnd = makeRng(909);
    surfPts.forEach((p, i) => {
      sp[i * 3] = p[0]; sp[i * 3 + 1] = p[1]; sp[i * 3 + 2] = p[2];
      ss[i] = rnd();
    });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    sg.setAttribute("aSeed", new THREE.BufferAttribute(ss, 1));
    const sm = new THREE.ShaderMaterial({
      vertexShader: RES_SURF_VERT, fragmentShader: RES_SURF_FRAG,
      uniforms: {
        uTime: { value: 0 }, uAmp: { value: 0 }, uArousal: { value: 0.35 },
        uRadius: { value: 2.7 }, uSize: { value: 10 },
        uColor: { value: new THREE.Color(0.6, 0.95, 1.0) },
        uEdge: { value: new THREE.Color(0.1, 0.4, 1.0) },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });

    const NSP = 220;
    const spikeDirs = fibSphere(NSP, 1);
    const lp = new Float32Array(NSP * 2 * 3);
    const ltip = new Float32Array(NSP * 2);
    const lseed = new Float32Array(NSP * 2);
    const rnd2 = makeRng(313);
    spikeDirs.forEach((dd, i) => {
      const seed = rnd2();
      lp[i * 6] = dd[0]; lp[i * 6 + 1] = dd[1]; lp[i * 6 + 2] = dd[2];
      lp[i * 6 + 3] = dd[0]; lp[i * 6 + 4] = dd[1]; lp[i * 6 + 5] = dd[2];
      ltip[i * 2] = 0; ltip[i * 2 + 1] = 1;
      lseed[i * 2] = seed; lseed[i * 2 + 1] = seed;
    });
    const spg = new THREE.BufferGeometry();
    spg.setAttribute("position", new THREE.BufferAttribute(lp, 3));
    spg.setAttribute("aTip", new THREE.BufferAttribute(ltip, 1));
    spg.setAttribute("aSeed", new THREE.BufferAttribute(lseed, 1));
    const spm = new THREE.ShaderMaterial({
      vertexShader: RES_SPIKE_VERT, fragmentShader: RES_SPIKE_FRAG,
      uniforms: {
        uTime: { value: 0 }, uAmp: { value: 0 }, uArousal: { value: 0.35 }, uRadius: { value: 2.7 },
        uColor: { value: new THREE.Color(0.7, 0.95, 1.0) },
        uEdge: { value: new THREE.Color(0.15, 0.5, 1.0) },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });

    return { surfGeo: sg, surfMat: sm, spikeGeo: spg, spikeMat: spm };
  }, []);

  // sonar ring pool (thin additive rings expanding + fading)
  const ringRefs = useRef<(THREE.Mesh | null)[]>([]);
  const ringMatRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const ringState = useRef(
    Array.from({ length: RING_POOL }, () => ({ life: 0, active: false }))
  );

  useEffect(() => () => {
    surfGeo.dispose(); surfMat.dispose(); spikeGeo.dispose(); spikeMat.dispose();
  }, [surfGeo, surfMat, spikeGeo, spikeMat]);

  // CPU-integrated ring-emission phase (cadence depends on amplitude -> must be integrated)
  const emitPhase = useRef(0);
  const spinSpd = useRef(0);
  const c1 = useRef(new THREE.Color());
  const c2 = useRef(new THREE.Color());
  const cWarm = useRef(new THREE.Color());

  useFrame((state, dt) => {
    const amp = getAmplitude();
    const m = useJovaStore.getState().mood;
    const pf = moodToWispParams(m, "flame");
    const po = moodToWispParams(m, "orb");
    const warm = Math.max(0, Math.min(1, (m.valence + 1) / 2));
    const et = state.clock.elapsedTime;

    // cool electric flame, warmed toward gold by valence
    const core = c1.current.setRGB(...pf.coreColor).lerp(cWarm.current.setRGB(...po.coreColor), warm * 0.5);
    const edge = c2.current.setRGB(...pf.edgeColor).lerp(WHITE, warm * 0.12);

    surfMat.uniforms.uTime.value = et;
    surfMat.uniforms.uAmp.value = amp;
    surfMat.uniforms.uArousal.value = m.arousal;
    (surfMat.uniforms.uColor.value as THREE.Color).copy(core);
    (surfMat.uniforms.uEdge.value as THREE.Color).copy(edge);

    spikeMat.uniforms.uTime.value = et;
    spikeMat.uniforms.uAmp.value = amp;
    spikeMat.uniforms.uArousal.value = m.arousal;
    (spikeMat.uniforms.uColor.value as THREE.Color).copy(core);
    (spikeMat.uniforms.uEdge.value as THREE.Color).copy(edge);

    // slow rotation, eased so an arousal change can't jump it
    const targetSpin = 0.12 + m.arousal * 0.18 + amp * 0.25;
    spinSpd.current += (targetSpin - spinSpd.current) * 0.05;
    if (spin.current) {
      spin.current.rotation.y += dt * spinSpd.current;
      spin.current.rotation.x += dt * spinSpd.current * 0.22;
    }

    // sonar ring emission (CPU-integrated cadence)
    const emitRate = 0.45 + m.arousal * 0.4 + amp * 3.0; // rings/sec, grows with the voice
    emitPhase.current += dt * emitRate;
    if (emitPhase.current >= 1) {
      emitPhase.current -= 1;
      const st = ringState.current;
      let idx = -1; let oldest = -1;
      for (let i = 0; i < RING_POOL; i++) {
        if (!st[i].active) { idx = i; break; }
        if (st[i].life > oldest) { oldest = st[i].life; idx = i; }
      }
      if (idx >= 0) { st[idx].life = 0; st[idx].active = true; }
    }

    // advance + render rings
    const ringSpeed = 0.85 + amp * 0.9 + m.arousal * 0.3;
    for (let i = 0; i < RING_POOL; i++) {
      const st = ringState.current[i];
      const mesh = ringRefs.current[i];
      const mat = ringMatRefs.current[i];
      if (!mesh || !mat) continue;
      if (!st.active) { mesh.visible = false; continue; }
      st.life += dt * ringSpeed;
      if (st.life >= 1) { st.active = false; mesh.visible = false; continue; }
      mesh.visible = true;
      const s = RES_RADIUS + st.life * 1.7;            // expand outward from the surface
      mesh.scale.set(s, s, s);
      mesh.quaternion.copy(state.camera.quaternion);   // face the viewer
      mat.color.copy(edge);
      mat.opacity = (1 - st.life) * (1 - st.life) * (0.4 + amp * 0.35);
    }
  });

  return (
    <group>
      <Core scale={0.42} />
      <group ref={spin}>
        <points geometry={surfGeo} material={surfMat} />
        <lineSegments geometry={spikeGeo} material={spikeMat} />
      </group>
      {Array.from({ length: RING_POOL }).map((_, i) => (
        <mesh key={i} ref={(el) => { ringRefs.current[i] = el; }} visible={false}>
          <ringGeometry args={[0.92, 1.0, 96]} />
          <meshBasicMaterial
            ref={(el) => { ringMatRefs.current[i] = el; }}
            map={glow}
            transparent depthWrite={false} side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending} toneMapped={false} opacity={0}
          />
        </mesh>
      ))}
    </group>
  );
}

const COR_PHOTO_VERT = /* glsl */ `
  attribute vec3 aDir;       // unit direction on the star surface (deterministic)
  attribute float aSeed;     // 0..1 per-point
  uniform float uTime;       // raw clock (only multiplied by CONSTANTS in-shader)
  uniform float uChurn;      // CPU-integrated granulation phase (rate eased by amp/arousal)
  uniform float uFlare;      // CPU-integrated random-orb flare phase (rate eased by amp/arousal)
  uniform float uRadius;
  uniform float uAmp;
  uniform float uArousal;
  uniform float uSize;
  varying float vHeat;       // 0 dark intergranular lane .. 1 hot granule
  varying float vRim;        // limb-darkening / facing term
  varying float vTw;
  varying float vOrb;        // 0..1 random bright-orb flare on this point (fades in and out)
  ${NOISE_GLSL}
  void main(){
    vec3 dir = aDir;
    // seething granulation: fbm sampled over the surface in a drifting field (uChurn integrated on CPU).
    // The temporal term is ONLY the integrated uChurn; uTime appears solely with constant coefficients.
    vec3 sp = dir * 3.2 + vec3(0.0, uChurn, 0.0);
    float g = fbm(sp);
    float g2 = fbm(dir * 6.4 - vec3(uChurn * 0.6, 0.0, uChurn * 0.4));
    float cell = g * 0.65 + g2 * 0.35;            // 0..1-ish convection field
    // radial heave: granules bulge out, lanes sink; amplitude makes the surface boil harder.
    float boil = (cell - 0.5) * (0.10 + uAmp * 0.30 + uArousal * 0.05);
    float breathe = sin(uTime * 0.55) * 0.02;     // slow idle breathing (constant rate)
    float r = uRadius * (1.0 + boil + breathe);
    vec3 pos = dir * r;

    // RANDOM FADING ORBS: each surface point owns a bounded flare cycle in [0,1) advanced by the
    // CPU-integrated uFlare. A per-point phase offset (aSeed) staggers them so bright orbs flare in
    // and dim out at random all over the sphere. uFlare is integrated on CPU (rate eased by amp), so
    // the cycle SPEED can rise without ever spiking. The cube sharpens it to a brief bright flash so
    // only a few of the surface points glow at any moment (continuous, all over the outer sphere).
    float fl = fract(uFlare * (0.20 + 0.30 * aSeed) + aSeed * 7.0);
    float orb = sin(fl * 3.14159265);            // 0 -> 1 -> 0 smooth fade in/out across the cycle
    vOrb = orb * orb * orb;                       // sharpen so each orb is a brief bright flash

    // facing / limb term: points near the limb (low z) are dimmer -> classic limb darkening
    vRim = 0.45 + 0.55 * smoothstep(-0.5, 1.0, dir.z);
    vHeat = cell;
    vTw = 0.6 + 0.4 * sin(uTime * 2.3 + aSeed * 41.0);  // constant-rate shimmer

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float sz = uSize * (0.55 + 0.9 * cell + 1.0 * vOrb) * (0.65 + 0.6 * aSeed);
    gl_PointSize = clamp(sz * (9.0 / -mv.z), 0.0, 40.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const COR_PHOTO_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uCool;   // intergranular lane (deep electric blue)
  uniform vec3 uHot;    // bright granule (toward cyan-white)
  uniform float uAmp;
  varying float vHeat;
  varying float vRim;
  varying float vTw;
  varying float vOrb;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float soft = smoothstep(0.5, 0.0, d);
    float core = smoothstep(0.2, 0.0, d);
    float heat = clamp(vHeat, 0.0, 1.0);
    vec3 col = mix(uCool, uHot, heat * heat);
    col += uHot * core * heat * 0.22;                 // hot heart only on bright granules
    col += uHot * vOrb * 0.35;                        // flaring orbs run hot toward the cyan core
    // modest per-fragment alpha: this is a DENSE additive sphere, so keep the budget low
    // (in line with the sibling point-spheres) to stay bloom-safe under NoToneMapping.
    float a = (soft * soft * 0.34 + core * 0.26) * vRim * (0.5 + 0.5 * vTw);
    a *= (0.45 + 0.55 * heat);                        // lanes dim, granules bright
    a += soft * soft * vOrb * 0.30 * vRim;            // bright orbs flare in then fade out with vOrb
    gl_FragColor = vec4(col * (1.0 + uAmp * 0.25), clamp(a, 0.0, 0.6));
  }
`;

// Coronal EJECTIONS: long comet streams flung off RANDOM points on the surface. Each shoots OUTWARD
// and decelerates but NEVER returns (no bounce); the whole streak fades out before its cycle wraps,
// and the next cycle launches from a FRESH random point, so a finished ejection is replaced by a new
// one elsewhere. The tail lags the head by 0.8 of the cycle, so the tail only leaves the surface once
// the head has flown ~80% of its airtime (a very long streak). aT is the static position along the
// tail (0 head .. 1 tail end); the launch direction is hashed per comet-cycle.
const COR_EJ_VERT = /* glsl */ `
  attribute float aT;        // 0 head .. 1 tail end
  attribute float aSeed;     // per-comet random (shared by a comet's tail samples)
  attribute float aPhase;    // per-comet staggered cycle offset
  uniform float uTime;       // raw clock (constant coeffs only)
  uniform float uFlow;       // CPU-integrated cycle phase (slow; amp nudges it)
  uniform float uReach;      // eased 0..1 how far ejections shoot
  uniform float uRadius;     // star radius (the surface ejections launch from)
  uniform float uAmp;
  uniform float uSize;
  varying float vBright;
  varying float vT;
  ${NOISE_GLSL}
  // pseudo-random unit direction from a scalar seed (uses hash() from NOISE_GLSL)
  vec3 corRandDir(float s){
    float u = hash(vec3(s, 1.7, 9.2)) * 2.0 - 1.0;
    float th = hash(vec3(s, 4.3, 2.1)) * 6.2831853;
    float r = sqrt(max(0.0, 1.0 - u * u));
    return vec3(r * cos(th), u, r * sin(th));
  }
  void main(){
    vT = aT;
    // bounded cycles; each new cycle picks a NEW random launch point (replacement, not relaunch-in-place)
    float prog = uFlow * (0.45 + 0.5 * aSeed) + aPhase;
    float cyc = floor(prog);
    float life = fract(prog);
    vec3 dir = corRandDir(aSeed * 41.0 + cyc * 1.61803);
    vec3 tang = normalize(cross(dir, corRandDir(aSeed * 17.0 + cyc * 2.71828 + 3.0)));

    // LONG tail: tail lags head by up to 0.8 of the cycle -> tail leaves surface at ~80% head airtime
    float lifeT = life - aT * 0.8;
    float lc = clamp(lifeT, 0.0, 1.0);
    // monotonic DECELERATING outward flight; never returns to the surface (no bounce)
    float rise = 1.0 - (1.0 - lc) * (1.0 - lc);
    float reach = mix(0.7, 2.4, uReach) * (0.55 + 0.6 * aSeed);
    vec3 pos = dir * (uRadius + rise * reach);
    pos += tang * rise * reach * 0.16;                   // slight sideways drift so it is not pin-straight
    pos += tang * sin(uTime * 1.2 + aSeed * 30.0 + aT * 5.0) * 0.03 * rise; // gentle constant-rate shimmer

    float emitted = step(0.0001, lifeT);                 // hide tail samples still at the surface
    float emit = smoothstep(0.0, 0.05, life);            // fade in at launch
    float die  = smoothstep(1.0, 0.82, life);            // fade out before wrap (hides the jump)
    float headTail = (1.0 - aT) * (1.0 - aT);
    vBright = ((0.22 + 0.6 * headTail) * (0.55 + 0.5 * rise) * emit * die + uAmp * 0.3 * headTail) * emitted;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float sz = uSize * (0.4 + 1.0 * headTail) * (0.55 + 0.7 * aSeed) * (1.0 + uAmp * 0.4) * emitted;
    gl_PointSize = clamp(sz * (9.0 / -mv.z), 0.0, 38.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const COR_EJ_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;   // ejection body / tail (deep electric blue)
  uniform vec3 uHot;     // hot head (toward cyan-white)
  uniform float uAmp;
  varying float vBright;
  varying float vT;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float glow = smoothstep(0.5, 0.0, d);
    float hot = smoothstep(0.22, 0.0, d);
    float b = clamp(vBright, 0.0, 1.3);
    // head runs hot/cyan-white, cooling toward the deep blue edge down the fading tail
    vec3 col = mix(uHot, uColor, vT);
    float fade = (1.0 - vT) * (1.0 - vT);              // tail FADES toward the tail end
    float a = (glow * glow * 0.34 + hot * 0.28) * b * fade;
    gl_FragColor = vec4(col * (1.0 + uAmp * 0.3), clamp(a, 0.0, 0.55));
  }
`;

function Corona() {
  const glow = getGlowTexture();
  const spin = useRef<THREE.Group>(null);

  // CPU-integrated phases (amp/arousal-driven rates MUST be integrated, never sin(uTime*rate))
  const churn = useRef(0);     // granulation churn phase
  const orbFlare = useRef(0);  // random surface-orb flare-cycle phase
  const flow = useRef(0);      // ejection ballistic-cycle phase
  const reach = useRef(0);     // eased ejection reach 0..1

  // ---- photosphere: dense displaced point-sphere ----
  const photo = useMemo(() => {
    const COUNT = 4200;
    const RADIUS = 2.7;
    const dirs = fibSphere(COUNT, 1);
    const rnd = makeRng(424);
    const pos = new Float32Array(COUNT * 3); // required attribute (unused for placement)
    const aDir = new Float32Array(COUNT * 3);
    const aSeed = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      aDir[i * 3] = dirs[i][0];
      aDir[i * 3 + 1] = dirs[i][1];
      aDir[i * 3 + 2] = dirs[i][2];
      aSeed[i] = rnd();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aDir", new THREE.BufferAttribute(aDir, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), RADIUS * 1.5);
    const uniforms = {
      uTime: { value: 0 },
      uChurn: { value: 0 },
      uFlare: { value: 0 },
      uRadius: { value: RADIUS },
      uAmp: { value: 0 },
      uArousal: { value: 0.35 },
      uSize: { value: 9.5 },
      uCool: { value: new THREE.Color(0.04, 0.16, 0.7) },
      uHot: { value: new THREE.Color(0.85, 0.98, 1.0) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: COR_PHOTO_VERT,
      fragmentShader: COR_PHOTO_FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { geo, mat, uniforms };
  }, []);

  // ---- coronal ejections: comet streams flung off the limb that arc out and fall back ----
  const ejecta = useMemo(() => {
    const RADIUS = 2.7;
    const EJECTIONS = 14;   // streams flung off random points around the limb
    const PER = 26;         // particles per comet tail
    const total = EJECTIONS * PER;
    const rnd = makeRng(818);
    const anchors = fibSphere(EJECTIONS, 1); // unit launch directions around the sphere

    const pos = new Float32Array(total * 3); // required, unused
    const aLaunch = new Float32Array(total * 3);
    const aTang = new Float32Array(total * 3);
    const aT = new Float32Array(total);
    const aSeed = new Float32Array(total);
    const aPhase = new Float32Array(total);

    const L = new THREE.Vector3();
    const T = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    let w = 0;
    for (let s = 0; s < EJECTIONS; s++) {
      const an = anchors[s];
      L.set(an[0], an[1], an[2]).normalize();
      // a sideways tangent so each comet arcs a little instead of shooting purely radial
      tmp.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
      T.copy(L).cross(tmp).normalize();
      const seed = rnd();
      const phase = rnd();   // staggered cycle so ejections fire on their own timing
      for (let i = 0; i < PER; i++) {
        const t = i / (PER - 1);
        aLaunch[w * 3] = L.x; aLaunch[w * 3 + 1] = L.y; aLaunch[w * 3 + 2] = L.z;
        aTang[w * 3] = T.x; aTang[w * 3 + 1] = T.y; aTang[w * 3 + 2] = T.z;
        aT[w] = t;
        aSeed[w] = seed;
        aPhase[w] = phase;
        w++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aLaunch", new THREE.BufferAttribute(aLaunch, 3));
    geo.setAttribute("aTang", new THREE.BufferAttribute(aTang, 3));
    geo.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
    geo.setAttribute("aPhase", new THREE.BufferAttribute(aPhase, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);
    const uniforms = {
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uReach: { value: 0.25 },
      uRadius: { value: RADIUS },
      uAmp: { value: 0 },
      uSize: { value: 9 },
      uColor: { value: new THREE.Color(0.06, 0.3, 0.95) },
      uHot: { value: new THREE.Color(0.85, 0.98, 1.0) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: COR_EJ_VERT,
      fragmentShader: COR_EJ_FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { geo, mat, uniforms };
  }, []);

  // corona halo sprite (soft outer glow ring of the star)
  const haloRef = useRef<THREE.Sprite>(null);

  useEffect(
    () => () => {
      photo.geo.dispose();
      photo.mat.dispose();
      ejecta.geo.dispose();
      ejecta.mat.dispose();
    },
    [photo, ejecta]
  );

  const cool = useRef(new THREE.Color());
  const hot = useRef(new THREE.Color());
  const ejCol = useRef(new THREE.Color());
  const ejHot = useRef(new THREE.Color());

  useFrame((state, dt) => {
    const amp = getAmplitude();
    const et = state.clock.elapsedTime;
    const mood = useJovaStore.getState().mood;
    const pf = moodToWispParams(mood, "flame"); // electric blue -> bright cyan: drives ALL colors
    const arousal = Math.max(0, Math.min(1, mood.arousal));
    const warm = Math.max(0, Math.min(1, (mood.valence + 1) / 2));
    const d = Math.min(0.05, dt);

    // integrate amp/arousal-driven phases (never uTime * variableRate)
    churn.current += d * (0.35 + arousal * 0.55 + amp * 1.8);     // surface boils faster when speaking
    orbFlare.current += d * (0.5 + arousal * 0.7 + amp * 1.6);    // random orbs flare faster when speaking
    flow.current += d * (0.26 + arousal * 0.28 + amp * 1.1);      // slow ejections; a touch faster when speaking
    // eased ejection reach: amplitude flings them further, arousal lengthens, low valence shortens
    const reachTarget = Math.min(1, 0.18 + amp * 1.3 + arousal * 0.3) * (0.65 + 0.35 * warm);
    reach.current += (reachTarget - reach.current) * (1 - Math.exp(-d * 6));

    // ---- all colors from the flame mapping: deep electric blue -> bright cyan ----
    // low valence -> cooler/dimmer, warm valence -> brighter; high arousal already hotter via flame.
    const dim = 0.6 + 0.4 * warm;
    const cc = cool.current.setRGB(...pf.edgeColor);                              // deep blue lane
    const hh = hot.current.setRGB(...pf.coreColor).lerp(WHITE, 0.15 + warm * 0.25); // hot cyan granule

    const pu = photo.uniforms;
    pu.uTime.value = et;
    pu.uChurn.value = churn.current;
    pu.uFlare.value = orbFlare.current;
    pu.uAmp.value = amp;
    pu.uArousal.value = arousal;
    pu.uRadius.value = 2.7 * (0.97 + 0.06 * warm) * pf.scale; // warmer = slightly larger
    pu.uSize.value = 9.5 * (1 + amp * 0.25);
    (pu.uCool.value as THREE.Color).copy(cc);
    (pu.uHot.value as THREE.Color).copy(hh);

    // ---- ejection colors: deep electric-blue tail, cyan-white head ----
    const ec = ejCol.current.setRGB(...pf.edgeColor);
    const eh = ejHot.current.setRGB(...pf.coreColor).lerp(WHITE, 0.3 + warm * 0.2);
    const eu = ejecta.uniforms;
    eu.uTime.value = et;
    eu.uFlow.value = flow.current;
    eu.uReach.value = reach.current;
    eu.uRadius.value = pu.uRadius.value;   // launch right from the (slightly mood-scaled) limb
    eu.uAmp.value = amp;
    eu.uSize.value = 9 * (1 + amp * 0.2);
    (eu.uColor.value as THREE.Color).copy(ec);
    (eu.uHot.value as THREE.Color).copy(eh);

    // slow rotation + gentle wobble (so the ejections drift around the star)
    if (spin.current) {
      spin.current.rotation.y += d * (0.07 + arousal * 0.08 + amp * 0.12);
      spin.current.rotation.x = Math.sin(et * 0.18) * 0.12;
      spin.current.rotation.z = Math.cos(et * 0.13) * 0.06;
    }

    // corona halo: breathes, flares brighter when speaking, tints electric blue, dims at low valence
    if (haloRef.current) {
      const breathe = 1 + Math.sin(et * 0.9) * 0.04;
      const s = 8.2 * breathe * (1 + amp * 0.18);
      haloRef.current.scale.set(s, s, 1);
      const m = haloRef.current.material as THREE.SpriteMaterial;
      m.color.copy(cc);
      m.opacity = (0.16 + amp * 0.12) * dim;
    }
  });

  return (
    <group>
      {/* soft corona halo behind the star */}
      <sprite ref={haloRef} position={[0, 0, -1.2]}>
        <spriteMaterial map={glow} transparent depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0.16} />
      </sprite>

      {/* small electric-blue heart (Sentience-sized) */}
      <Core scale={0.32} />

      {/* the living star: photosphere + coronal ejections rotate together */}
      <group ref={spin}>
        <points geometry={photo.geo} material={photo.mat} />
        <points geometry={ejecta.geo} material={ejecta.mat} />
      </group>

      {/* a few drifting cyan sparks/spicules flung off the limb for extra life */}
      <WispParticles count={80} color={[0.7, 0.95, 1.0]} edgeColor={[0.1, 0.4, 1.0]} size={8} speed={0.6} twinkle={0.7} reactive position={[0, 0, 0]} />
    </group>
  );
}

const MED_BELL_VERT = /* glsl */ `
  attribute float aRim;     // 0 apex (top) .. 1 bell rim (skirt edge)
  attribute float aAng;     // azimuth 0..2PI around the bell
  attribute float aSeed;    // 0..1 per-point
  uniform float uTime;      // raw clock - only multiplied by CONSTANTS here
  uniform float uBellPulse; // CPU-integrated contraction phase (rate eased by amp/arousal)
  uniform float uAmp;
  uniform float uRadius;
  uniform float uSize;
  varying float vRim;
  varying float vGlow;
  varying float vSeed;
  void main(){
    vRim = aRim;
    vSeed = aSeed;

    // contraction signal in [-1,1]: the bell snaps closed (contract) then eases open (relax). This is
    // a SMOOTH continuous wave (phase integrated on the CPU), so the pulse flows like water. uAmp here
    // is the SMOOTHED amplitude (eased on the CPU) and only DEEPENS the throw - never a rate.
    float contract = sin(uBellPulse);
    float deep = 0.10 + uAmp * 0.30;                 // pulse depth grows with the (smoothed) voice

    // dome profile: a hemisphere whose skirt flares out and lifts as it relaxes (jet propulsion).
    float prof = sin(aRim * 1.5707963);              // 0 at apex -> 1 at rim
    float flare = 1.0 + contract * deep * (0.4 + 1.2 * aRim); // skirt moves most
    float horiz = uRadius * prof * flare;

    // bell height: dome tucks taller when contracting (water jetted down), flatter when relaxed
    float dome = cos(aRim * 1.5707963);              // 1 apex -> 0 rim
    float h = uRadius * 0.78 * dome * (1.0 - contract * deep * 0.55);

    // a soft scalloped frill running around the rim (constant spatial freq, constant time rate)
    float frill = sin(aAng * 9.0 + uTime * 1.3) * 0.05 * aRim * uRadius;

    // tiny apex scatter so the near-apex rings (where horiz -> 0) do NOT all collapse onto the
    // central axis and stack into an additive hot-spot under the Core. Fades out by mid-dome.
    float apexScatter = (1.0 - smoothstep(0.0, 0.32, aRim)) * (0.04 + 0.06 * aSeed) * uRadius;

    float rad = horiz + frill + apexScatter;
    float x = cos(aAng) * rad;
    float z = sin(aAng) * rad;
    float y = 0.55 * uRadius + h;                    // bell occupies the upper half; apex highest

    vec3 pos = vec3(x, y, z);

    // bioluminescent rim dots: brightest at the skirt edge, twinkling at a CONSTANT rate
    float tw = 0.55 + 0.45 * sin(uTime * 2.6 + aSeed * 41.0);
    float edge = smoothstep(0.45, 1.0, aRim);        // glow concentrates near the rim
    vGlow = (0.22 + 0.55 * edge) * tw + max(0.0, contract) * 0.25 + uAmp * 0.35;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    // taper size toward the extreme apex so the (denser) apex points cannot burn out
    float apexFade = smoothstep(0.04, 0.18, aRim);
    float sz = uSize * (0.55 + 0.7 * edge + 0.4 * vGlow) * (0.6 + 0.6 * aSeed) * (0.45 + 0.55 * apexFade);
    gl_PointSize = clamp(sz * (9.0 / -mv.z), 0.0, 40.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const MED_BELL_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;   // hot inner (core color)
  uniform vec3 uEdge;    // cool translucent membrane (edge color)
  uniform float uAmp;
  varying float vRim;
  varying float vGlow;
  varying float vSeed;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float soft = smoothstep(0.5, 0.0, d);
    float hot = smoothstep(0.2, 0.0, d);
    // translucent membrane toward the apex, hot bioluminescent rim toward the skirt
    vec3 col = mix(uEdge, uColor, clamp(vGlow * 0.85, 0.0, 1.0));
    col += hot * vec3(0.16) * smoothstep(0.5, 1.0, vRim);   // tiny hot point only at lit rim dots
    float a = (soft * soft * 0.4 + hot * 0.28) * clamp(0.35 + vGlow * 0.8, 0.0, 1.2);
    gl_FragColor = vec4(col * (1.0 + uAmp * 0.25), clamp(a, 0.0, 0.62));
  }
`;

// Tendrils + frilly oral arms: many vertical strands of points hanging below the bell. They
// sine-undulate at CONSTANT in-shader rates (per-strand phase from aStrand), drift/sway, and LAG
// behind the bell via uBellLag (the bell's pulse sampled a few frames in the past). Amplitude makes
// them writhe harder and brighten; nothing in-shader multiplies uTime by a varying rate.
const MED_TEND_VERT = /* glsl */ `
  attribute float aT;       // 0 root (at bell rim) .. 1 free tip
  attribute float aAng;     // azimuth of this strand's root around the rim
  attribute float aStrand;  // 0..1 per-strand random phase / identity
  attribute float aArm;     // 1.0 = short frilly oral arm, 0.0 = long trailing tendril
  uniform float uTime;      // raw clock - only multiplied by CONSTANTS here
  uniform float uBellLag;   // lagged bell contraction (tendrils follow the bell's wake)
  uniform float uAmp;
  uniform float uRadius;
  uniform float uReach;     // eased speaking energy 0..1 (writhe + length)
  uniform float uSize;
  varying float vT;
  varying float vGlow;
  varying float vSeed;
  void main(){
    vT = aT;
    vSeed = aStrand;

    // root attaches to the bell skirt; oral arms cluster nearer the centre, tendrils at the wide rim
    float rootR = uRadius * mix(0.92, 0.34, aArm);
    float rx = cos(aAng) * rootR;
    float rz = sin(aAng) * rootR;
    float ry = 0.55 * uRadius;                       // bell-skirt height (matches MED_BELL_VERT)

    // ROOT ANCHOR: a smooth gate that is 0.0 exactly at the root (aT==0) and eases to 1.0 just below
    // the rim. ALL displacement (sway + recoil) is multiplied by this, so the strand TOP is pinned to
    // its attachment point on the bell at every amplitude and can never lift outside/above the bell.
    float anchor = smoothstep(0.0, 0.16, aT);

    // strand length scales with the bell radius so the creature stays proportional when it grows;
    // oral arms short & frilly, tendrils long & trailing; lengthen a touch when speaking
    float len = mix(1.7, 0.62, aArm) * uRadius * (0.85 + 0.3 * aStrand) * (1.0 + uReach * 0.18);
    float down = aT * len;

    // undulation: travelling sine waves down the strand. CONSTANT in-shader rate; the SMOOTHED amplitude
    // and the lagged bell pulse scale the SWAY MAGNITUDE only (never the rate) so it flows, never spikes.
    float ph = aStrand * 6.2831;
    float wave = sin(aT * 6.0 - uTime * 1.8 + ph);
    float wave2 = sin(aT * 3.0 - uTime * 1.1 + ph * 1.7);
    float sway = (0.16 + 0.55 * aT) * anchor         // tips sway most, roots fully pinned
               * (0.20 + 0.45 * uReach + 0.40 * max(0.0, -uBellLag)); // bell down-stroke flings them
    // direction of sway derived from the root azimuth so strands fan outward coherently
    float sx = cos(aAng + 1.5707963);
    float sz2 = sin(aAng + 1.5707963);
    float ox = (wave * sx + wave2 * cos(aAng)) * sway * uRadius;
    float oz = (wave * sz2 + wave2 * sin(aAng)) * sway * uRadius;

    // the bell's relax/contract gently lifts & releases the strands (trailing recoil), but ONLY ever
    // pulls them DOWNWARD (max(0.0, ...) below) and is gated by the anchor + clamped, so a strand top
    // can NEVER rise above its bell attachment ry no matter how loud she speaks.
    float recoil = -max(0.0, -uBellLag) * (0.18 + 0.5 * aT) * anchor * uRadius * 0.22;

    float x = rx + ox;
    float z = rz + oz;
    // y starts at the anchored rim and only ever descends; clamp guarantees y <= ry at the root.
    float y = min(ry, ry - down + recoil);

    vec3 pos = vec3(x, y, z);

    // bioluminescent beads drifting down each strand + a constant-rate twinkle
    float beads = 0.5 + 0.5 * sin(aT * 18.0 - uTime * 2.4 + ph * 3.0);
    float tw = 0.5 + 0.5 * sin(uTime * 3.2 + aStrand * 55.0);
    vGlow = (0.18 + 0.5 * beads) * tw + (1.0 - aT) * 0.18 + uReach * 0.5 + uAmp * 0.3;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float sz = uSize * (0.45 + 0.9 * vGlow) * (0.6 + 0.6 * aStrand) * (1.0 - aT * 0.25);
    gl_PointSize = clamp(sz * (9.0 / -mv.z), 0.0, 36.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const MED_TEND_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;   // hot bead color
  uniform vec3 uEdge;    // cool strand color
  uniform float uAmp;
  varying float vT;
  varying float vGlow;
  varying float vSeed;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float soft = smoothstep(0.5, 0.0, d);
    float hot = smoothstep(0.22, 0.0, d);
    // hot near the bell, cooling and fading toward the trailing tips
    vec3 col = mix(uColor, uEdge, clamp(vT * 1.05, 0.0, 1.0));
    col += hot * vec3(0.14) * (1.0 - vT);
    float fade = 1.0 - vT * 0.55;                    // tips dimmer, never fully gone
    float a = (soft * soft * 0.4 + hot * 0.3) * clamp(vGlow, 0.0, 1.3) * fade;
    gl_FragColor = vec4(col * (1.0 + uAmp * 0.25), clamp(a, 0.0, 0.6));
  }
`;

/** MEDUSA - a bioluminescent deep-sea jellyfish of light. A translucent pulsing BELL contracts and
 *  relaxes (jet propulsion) on a CPU-integrated pulse phase, trailing many long undulating TENDRILS
 *  and frilly oral arms that ripple, sway and lag behind the bell's wake. Speaking quickens & deepens
 *  the pulse and energizes the tendrils into a brighter writhe. A creature, not a geometric object. */
function Medusa() {
  const drift = useRef<THREE.Group>(null);

  // CPU-integrated phases (any rate touched by amp/arousal MUST be integrated, never sin(uTime*rate))
  const bellPulse = useRef(0);
  const reach = useRef(0);
  const ampS = useRef(0); // CPU-smoothed amplitude: eased toward the raw reading so motion flows, not stutters
  // short ring-buffer of recent bell-contraction values so the tendrils can LAG behind the bell.
  const hist = useRef<number[]>(new Array(48).fill(0));
  const histIdx = useRef(0);

  const MED_RADIUS = 2.7; // BIG: inside the required ~2.6..3.4 band so it reads in the outer screen ring

  // ---- bell dome (parametric hemisphere of points) ----
  const bell = useMemo(() => {
    const RINGS = 26;     // apex -> rim
    const SECT = 84;      // around
    const total = RINGS * SECT;
    const pos = new Float32Array(total * 3); // required attribute, unused for placement
    const rim = new Float32Array(total);
    const ang = new Float32Array(total);
    const seed = new Float32Array(total);
    const rnd = makeRng(5150);
    let w = 0;
    for (let r = 0; r < RINGS; r++) {
      const rf = r / (RINGS - 1); // 0 apex .. 1 rim
      for (let s = 0; s < SECT; s++) {
        const a = (s / SECT) * Math.PI * 2 + rf * 0.4; // slight spiral so rings don't align into seams
        rim[w] = rf;
        ang[w] = a;
        seed[w] = rnd();
        w++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aRim", new THREE.BufferAttribute(rim, 1));
    geo.setAttribute("aAng", new THREE.BufferAttribute(ang, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 8);
    const uniforms = {
      uTime: { value: 0 },
      uBellPulse: { value: 0 },
      uAmp: { value: 0 },
      uRadius: { value: MED_RADIUS },
      uSize: { value: 9 },
      uColor: { value: new THREE.Color(0.6, 0.95, 1.0) },
      uEdge: { value: new THREE.Color(0.1, 0.4, 1.0) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: MED_BELL_VERT,
      fragmentShader: MED_BELL_FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { geo, mat, uniforms };
  }, []);

  // ---- tendrils + frilly oral arms ----
  const tend = useMemo(() => {
    const TENDRILS = 60;      // long trailing strands
    const ARMS = 28;          // short frilly oral arms near the centre
    const PER = 30;           // points per strand
    const strands = TENDRILS + ARMS;
    const total = strands * PER;
    const pos = new Float32Array(total * 3); // required attribute, unused for placement
    const aT = new Float32Array(total);
    const aAng = new Float32Array(total);
    const aStrand = new Float32Array(total);
    const aArm = new Float32Array(total);
    const rnd = makeRng(6160);
    let w = 0;
    for (let i = 0; i < strands; i++) {
      const isArm = i >= TENDRILS ? 1 : 0;
      const denom = isArm ? ARMS : TENDRILS;
      const idx = isArm ? i - TENDRILS : i;
      // even-ish azimuth spread with a jittered offset so strands aren't perfectly regular
      const base = (idx / denom) * Math.PI * 2;
      const a = base + (rnd() - 0.5) * 0.5;
      const sd = rnd();
      for (let p = 0; p < PER; p++) {
        const t = p / (PER - 1);
        aT[w] = t;
        aAng[w] = a;
        aStrand[w] = sd;
        aArm[w] = isArm;
        w++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
    geo.setAttribute("aAng", new THREE.BufferAttribute(aAng, 1));
    geo.setAttribute("aStrand", new THREE.BufferAttribute(aStrand, 1));
    geo.setAttribute("aArm", new THREE.BufferAttribute(aArm, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -2, 0), 12);
    const uniforms = {
      uTime: { value: 0 },
      uBellLag: { value: 0 },
      uAmp: { value: 0 },
      uRadius: { value: MED_RADIUS },
      uReach: { value: 0 },
      uSize: { value: 8.5 },
      uColor: { value: new THREE.Color(0.7, 0.95, 1.0) },
      uEdge: { value: new THREE.Color(0.08, 0.3, 0.95) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: MED_TEND_VERT,
      fragmentShader: MED_TEND_FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { geo, mat, uniforms };
  }, []);

  useEffect(
    () => () => {
      bell.geo.dispose();
      bell.mat.dispose();
      tend.geo.dispose();
      tend.mat.dispose();
    },
    [bell, tend]
  );

  const core = useRef(new THREE.Color());
  const edge = useRef(new THREE.Color());
  const warmC = useRef(new THREE.Color());

  useFrame((state, dt) => {
    const amp = getAmplitude();
    const mood = useJovaStore.getState().mood;
    const flame = moodToWispParams(mood, "flame"); // electric blue -> cyan
    const orb = moodToWispParams(mood, "orb");      // warm gold
    const et = state.clock.elapsedTime;
    const d = Math.min(0.05, dt);
    const arousal = Math.max(0, Math.min(1, mood.arousal));
    const warm = Math.max(0, Math.min(1, (mood.valence + 1) / 2));

    // FLUID, NOT STUTTERING: ease the amplitude toward its raw reading every frame. Everything that
    // amplitude drives (pulse rate, depth, reach, brightness) reads this smoothed value, so the whole
    // creature flows like water instead of jittering on the raw per-frame loudness. High arousal lets
    // it respond a touch quicker (sharper), low arousal makes it slow and languid.
    const smoothK = 5.5 + arousal * 4.5;
    ampS.current += (amp - ampS.current) * (1 - Math.exp(-d * smoothK));
    const aS = ampS.current;

    // bell jet-propulsion pulse: base hypnotic cadence, FASTER when aroused / speaking (integrated from
    // the SMOOTHED amplitude so the cadence glides between speeds instead of snapping). low valence =>
    // slower, calmer pulsing. This is the single continuous wave that drives the whole bell contraction.
    const pulseRate = (0.7 + arousal * 1.3 + aS * 3.2) * (0.6 + 0.4 * warm);
    bellPulse.current += d * pulseRate;

    // push current contraction into the lag ring-buffer; read an older sample for the tendrils' wake
    const contractNow = Math.sin(bellPulse.current);
    const buf = hist.current;
    buf[histIdx.current] = contractNow;
    histIdx.current = (histIdx.current + 1) % buf.length;
    // lag grows when calm (a slow drifting creature lags more); ~6..20 frames behind
    const lagFrames = Math.round(20 - arousal * 14);
    const lagPos = (histIdx.current - lagFrames + buf.length) % buf.length;
    const bellLag = buf[lagPos];

    // eased speaking energy for the tendrils (extend/writhe without snapping). Built from the SMOOTHED
    // amplitude and eased again, so the undulation swells and subsides as one continuous flow.
    const reachTarget = Math.min(1, aS * 1.25 + arousal * 0.25);
    reach.current += (reachTarget - reach.current) * (1 - Math.exp(-d * 6));

    // colours from mood every frame; warm valence pulls the cool membrane toward gold
    const cc = core.current.setRGB(...flame.coreColor).lerp(warmC.current.setRGB(...orb.coreColor), warm * 0.45);
    const ee = edge.current.setRGB(...flame.edgeColor);
    const dim = 0.6 + 0.4 * warm; // low valence dims the whole creature

    const bu = bell.uniforms;
    bu.uTime.value = et;
    bu.uBellPulse.value = bellPulse.current;
    bu.uAmp.value = aS;                       // smoothed amplitude only -> bloom-safe, flowing brightness
    bu.uSize.value = 9 * (1 + aS * 0.25);
    (bu.uColor.value as THREE.Color).copy(cc).multiplyScalar(dim);
    (bu.uEdge.value as THREE.Color).copy(ee).multiplyScalar(dim);

    const tu = tend.uniforms;
    tu.uTime.value = et;
    tu.uBellLag.value = bellLag;
    tu.uAmp.value = aS;                       // smoothed amplitude only -> no high-frequency jitter
    tu.uReach.value = reach.current;
    tu.uSize.value = 8.5 * (1 + aS * 0.2);
    (tu.uColor.value as THREE.Color).copy(cc).multiplyScalar(dim);
    (tu.uEdge.value as THREE.Color).copy(ee).multiplyScalar(dim);

    // whole-creature life: gentle vertical bob synced to the pulse (rises on jet down-stroke), a slow
    // sway/list, and a slow drift-rotation so the trailing tendrils swirl. Bob from the bounded,
    // continuous contraction signal scaled by the SMOOTHED amplitude -> jump-free, flowing.
    if (drift.current) {
      drift.current.position.y = -0.35 + contractNow * (0.12 + aS * 0.18) + Math.sin(et * 0.5) * 0.06;
      drift.current.rotation.y += d * (0.10 + arousal * 0.12 + aS * 0.15);
      drift.current.rotation.z = Math.sin(et * 0.27) * 0.10;  // gentle listing
      drift.current.rotation.x = Math.sin(et * 0.21) * 0.06;
    }
  });

  return (
    <group ref={drift}>
      {/* NO gold Core here - a jellyfish has no gold heart. The bioluminescence lives in the bell rim
          and the beaded tendrils only, keeping the silhouette a creature of pure blue light. */}
      <points geometry={bell.geo} material={bell.mat} />
      <points geometry={tend.geo} material={tend.mat} />
      {/* a few drifting bioluminescent spores in the surrounding water */}
      <WispParticles count={70} color={[0.7, 0.95, 1.0]} edgeColor={[0.12, 0.4, 1.0]} size={7} speed={0.5} twinkle={0.7} reactive position={[0, -0.3, 0]} />
    </group>
  );
}

const GLY_RING_VERT = /* glsl */ `
  attribute float aA;        // angle 0..2PI of this point around its ring
  attribute float aRadius;   // ring radius (units)
  attribute float aSeed;     // 0..1 unique per point
  attribute float aKind;     // 0 = main tick/glyph, 1 = inner micro-dot
  uniform float uTime;       // raw clock; only multiplied by CONSTANTS here
  uniform float uSpin;       // CPU-integrated rotation phase of this ring
  uniform float uIgnite;     // CPU-integrated ignition-pulse phase running around the ring
  uniform float uSweep;      // CPU-integrated radar-sweep angle (radians)
  uniform float uAmp;        // live amplitude 0..0.85
  uniform float uArousal;    // 0..1
  uniform float uFlash;      // 0..1 occasional full-ring flash
  uniform float uSeg;        // segments per ring (spatial frequency, constant over time)
  uniform float uSize;       // base point size
  uniform float uBreathe;    // breathing radius multiplier
  varying float vLit;        // total brightness for this point
  varying float vWarm;       // toward-core mix (radar/ignite => hotter)
  void main(){
    // rotate the point's angle by the ring's integrated spin
    float a = aA + uSpin;

    // segmented HUD: only some angular sectors are "on" (tick marks / glyph cells).
    // uSeg is a SPATIAL frequency (constant), so this can never spike over time.
    float seg = sin(a * uSeg);
    float onSeg = smoothstep(0.55, 0.95, abs(seg)); // crisp dashes around the ring

    // ignition pulse: a bright band sweeping around the ring (phase integrated on CPU)
    float ig = cos(a * 3.0 - uIgnite);
    float ignite = smoothstep(0.6, 1.0, ig);

    // radar sweep: angular distance from the sweep line lights a leading edge + a fading trail
    float da = a - uSweep;
    da = mod(da + 3.14159265, 6.2831853) - 3.14159265; // wrap to -PI..PI
    float trail = smoothstep(-1.4, 0.0, da) * smoothstep(0.12, 0.0, da); // comet behind
    float lead = smoothstep(0.0, 0.18, da) * smoothstep(0.6, 0.0, da);   // crisp leading line
    float sweep = max(trail * 0.9, lead * 0.5);

    // per-point twinkle (constant rate * uTime is safe)
    float tw = 0.55 + 0.45 * sin(uTime * 2.6 + aSeed * 41.0);

    // amplitude/arousal light MORE segments + brighten (modulates amount, not any rate)
    float ampBoost = uAmp * (0.5 + uArousal * 0.6);

    // dim baseline so rings are always faintly visible, plus the lit segments
    float baseLit = 0.10 + onSeg * (0.42 + 0.30 * tw);
    vLit = baseLit
         + ignite * (0.55 + ampBoost)        // ignition band
         + sweep * (0.8 + ampBoost)          // radar comet
         + uFlash * (0.5 + 0.4 * onSeg)      // full-ring flash
         + ampBoost * onSeg * 0.6;           // voice lights the dashes brighter

    vLit *= mix(1.0, 0.55, aKind);           // inner micro-dots subtler
    vWarm = clamp(ignite * 0.8 + sweep * 1.0 + uFlash * 0.5, 0.0, 1.0);

    float r = aRadius * uBreathe;
    vec3 pos = vec3(cos(a) * r, sin(a) * r, 0.0);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float sz = uSize * (0.55 + 0.9 * clamp(vLit, 0.0, 1.4)) * mix(1.0, 0.6, aKind);
    gl_PointSize = clamp(sz * (9.0 / -mv.z), 0.0, 34.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const GLY_RING_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;   // flame core (hot)
  uniform vec3 uEdge;    // flame edge (cool)
  uniform float uAmp;
  varying float vLit;
  varying float vWarm;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float soft = smoothstep(0.5, 0.0, d);   // soft glow
    float tick = smoothstep(0.26, 0.0, d);  // sharper HUD tick core
    float lit = clamp(vLit, 0.0, 1.6);
    vec3 col = mix(uEdge, uColor, clamp(lit * 0.7 + vWarm * 0.6, 0.0, 1.0));
    col += vec3(0.18) * tick * vWarm;       // hot heart on ignited/swept ticks only
    float a = (soft * soft * 0.30 + tick * 0.32) * (0.30 + 0.75 * lit);
    gl_FragColor = vec4(col * (1.0 + uAmp * 0.22), clamp(a, 0.0, 0.66));
  }
`;

// Radial spokes: thin lines from an inner radius outward; tips pushed out + brightened by the voice.
const GLY_SPOKE_VERT = /* glsl */ `
  attribute float aTip;     // 0 inner end, 1 outer end
  attribute float aAng;     // spoke angle (constant)
  attribute float aSeed;    // per-spoke random
  uniform float uTime;
  uniform float uSpin;      // CPU-integrated slow rotation of the spoke array
  uniform float uAmp;
  uniform float uArousal;
  uniform float uInner;     // inner radius
  uniform float uOuter;     // outer radius base
  varying float vTip;
  varying float vBright;
  void main(){
    float a = aAng + uSpin;
    // idle shimmer via constant per-spoke rate (aSeed is a fixed attribute, not eased/amp-driven);
    // voice (amplitude) extends the reach (amount, not rate)
    float bob = 0.5 + 0.5 * sin(uTime * (1.6 + fract(aSeed * 7.0)) + aSeed * 6.2831);
    float reach = uOuter + bob * 0.08 + uAmp * (0.5 + uArousal * 0.7) * (0.6 + 0.8 * fract(aSeed * 13.0));
    float r = mix(uInner, reach, aTip);
    vec3 pos = vec3(cos(a) * r, sin(a) * r, 0.0);
    vTip = aTip;
    vBright = (0.4 + uAmp * 1.0) * (1.0 - aTip * 0.4);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const GLY_SPOKE_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uEdge;
  varying float vTip;
  varying float vBright;
  void main(){
    vec3 col = mix(uColor, uEdge, vTip);
    float a = vBright * (1.0 - vTip * 0.7) * 0.55;
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.6));
  }
`;

/** GLYPH - an arcane sci-fi HUD: concentric, camera-billboarded rings of segmented glowing glyph-ticks,
 *  each ring counter-rotating at its own rate, with a radar sweep firing igniting comets around them,
 *  ignition pulses racing each ring, twinkle, breathing, occasional full-ring flashes, and radial spokes
 *  that reach out with the voice. The visible "thinking UI" of an AI. Speaking ignites more segments,
 *  speeds the sweep, brightens, and spins faster; high arousal = busier/faster; low valence = cool/dim. */
function Glyph() {
  const glow = getGlowTexture();
  const billboard = useRef<THREE.Group>(null);

  // ring configs: [radius, segments, points, spin direction]
  const RINGS: { radius: number; seg: number; pts: number; dir: number }[] = [
    { radius: 0.95, seg: 18, pts: 150, dir: 1 },
    { radius: 1.5, seg: 30, pts: 230, dir: -1 },
    { radius: 2.1, seg: 44, pts: 320, dir: 1 },
    { radius: 2.7, seg: 26, pts: 300, dir: -1 },
    { radius: 3.2, seg: 60, pts: 420, dir: 1 },
  ];

  // CPU-integrated phases (rates depend on amp/arousal -> integrate, never sin(uTime*rate))
  const spins = useRef<number[]>(RINGS.map(() => 0));
  const ignitePhase = useRef(0);
  const sweepPhase = useRef(0);
  const spokeSpin = useRef(0);
  const flash = useRef(0);          // 0..1 occasional full-ring flash, decays
  const flashTimer = useRef(2.5);
  const breatheEase = useRef(1);    // eased breathing so amp can't snap the radius

  const built = useMemo(() => {
    const rings = RINGS.map((cfg, ri) => {
      const N = cfg.pts;
      const rnd = makeRng(7000 + ri * 131);
      const pos = new Float32Array(N * 3); // required; shader places by angle
      const aA = new Float32Array(N);
      const aRadius = new Float32Array(N);
      const aSeed = new Float32Array(N);
      const aKind = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        aA[i] = (i / N) * Math.PI * 2;
        // a faint inner micro-band gives the ring depth (HUD double-line feel)
        const inner = rnd() < 0.28;
        aRadius[i] = cfg.radius - (inner ? 0.12 + rnd() * 0.05 : 0);
        aSeed[i] = rnd();
        aKind[i] = inner ? 1 : 0;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("aA", new THREE.BufferAttribute(aA, 1));
      geo.setAttribute("aRadius", new THREE.BufferAttribute(aRadius, 1));
      geo.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
      geo.setAttribute("aKind", new THREE.BufferAttribute(aKind, 1));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4.5);
      const uniforms = {
        uTime: { value: 0 },
        uSpin: { value: 0 },
        uIgnite: { value: 0 },
        uSweep: { value: 0 },
        uAmp: { value: 0 },
        uArousal: { value: 0.35 },
        uFlash: { value: 0 },
        uSeg: { value: cfg.seg },
        uSize: { value: 9 },
        uBreathe: { value: 1 },
        uColor: { value: new THREE.Color(0.85, 0.97, 1.0) },
        uEdge: { value: new THREE.Color(0.08, 0.35, 0.95) },
      };
      const mat = new THREE.ShaderMaterial({
        vertexShader: GLY_RING_VERT,
        fragmentShader: GLY_RING_FRAG,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      return { geo, mat, uniforms, dir: cfg.dir, ri };
    });

    // a handful of long radial spokes crossing the rings (lineSegments)
    const NSP = 8;
    const PER = 2;
    const sp = new Float32Array(NSP * PER * 3);
    const tip = new Float32Array(NSP * PER);
    const ang = new Float32Array(NSP * PER);
    const seed = new Float32Array(NSP * PER);
    const rnd = makeRng(424242);
    for (let s = 0; s < NSP; s++) {
      const a = (s / NSP) * Math.PI * 2 + rnd() * 0.2;
      const sd = rnd();
      for (let k = 0; k < PER; k++) {
        const idx = s * PER + k;
        tip[idx] = k; // 0 then 1
        ang[idx] = a;
        seed[idx] = sd;
      }
    }
    const spokeGeo = new THREE.BufferGeometry();
    spokeGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    spokeGeo.setAttribute("aTip", new THREE.BufferAttribute(tip, 1));
    spokeGeo.setAttribute("aAng", new THREE.BufferAttribute(ang, 1));
    spokeGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    spokeGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4.5);
    const spokeU = {
      uTime: { value: 0 },
      uSpin: { value: 0 },
      uAmp: { value: 0 },
      uArousal: { value: 0.35 },
      uInner: { value: 0.7 },
      uOuter: { value: 3.45 },
      uColor: { value: new THREE.Color(0.8, 0.95, 1.0) },
      uEdge: { value: new THREE.Color(0.1, 0.4, 1.0) },
    };
    const spokeMat = new THREE.ShaderMaterial({
      vertexShader: GLY_SPOKE_VERT,
      fragmentShader: GLY_SPOKE_FRAG,
      uniforms: spokeU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    return { rings, spokeGeo, spokeMat, spokeU };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // soft central hub so the HUD has a glowing heart
  const hub = useRef<THREE.Sprite>(null);

  useEffect(
    () => () => {
      built.rings.forEach((r) => {
        r.geo.dispose();
        r.mat.dispose();
      });
      built.spokeGeo.dispose();
      built.spokeMat.dispose();
    },
    [built]
  );

  const cCol = useRef(new THREE.Color());
  const eCol = useRef(new THREE.Color());

  useFrame((state, dt) => {
    const d = Math.min(0.05, dt);
    const amp = getAmplitude();
    const mood = useJovaStore.getState().mood;
    const p = moodToWispParams(mood, "flame"); // electric blue -> cyan
    const et = state.clock.elapsedTime;
    const arousal = Math.max(0, Math.min(1, mood.arousal));
    const warm = Math.max(0, Math.min(1, (mood.valence + 1) / 2));

    // billboard the whole rig to face the viewer (flat HUD silhouette)
    if (billboard.current) billboard.current.quaternion.copy(state.camera.quaternion);

    // integrate phases (rates rise with arousal + voice -> integrate, never spike)
    ignitePhase.current += d * (1.1 + arousal * 1.4 + amp * 5.0);
    sweepPhase.current += d * (0.7 + arousal * 0.9 + amp * 2.8); // radar speeds with the voice
    spokeSpin.current += d * (0.05 + arousal * 0.08 + amp * 0.15);
    for (let i = 0; i < built.rings.length; i++) {
      const rate = (0.06 + 0.05 * i) * (1 + arousal * 0.9) + amp * (0.25 + 0.12 * i);
      spins.current[i] += d * rate * built.rings[i].dir;
    }

    // occasional full-ring flash (a discrete HUD "blip"); busier when aroused
    flashTimer.current -= d;
    if (flashTimer.current <= 0) {
      flash.current = 1;
      flashTimer.current = 3.5 + Math.random() * 4.5 - arousal * 1.5;
    }
    flash.current += (0 - flash.current) * (1 - Math.exp(-d * 4.5));

    // breathing radius, eased so amp can't snap it
    const breatheTarget = (1 + Math.sin(et * 0.9) * 0.02) * (1 + amp * 0.05) * p.scale;
    breatheEase.current += (breatheTarget - breatheEase.current) * (1 - Math.exp(-d * 5));

    // colors from mood each frame; low valence => cooler & dimmer, warm => brighter
    const cc = cCol.current.setRGB(p.coreColor[0], p.coreColor[1], p.coreColor[2]).lerp(WHITE, warm * 0.1);
    const ee = eCol.current.setRGB(p.edgeColor[0], p.edgeColor[1], p.edgeColor[2]);
    const dim = 0.6 + 0.4 * warm;

    for (let i = 0; i < built.rings.length; i++) {
      const u = built.rings[i].uniforms;
      u.uTime.value = et;
      u.uSpin.value = spins.current[i];
      u.uIgnite.value = ignitePhase.current + i * 1.3;
      u.uSweep.value = sweepPhase.current * (1 + i * 0.04);
      u.uAmp.value = amp;
      u.uArousal.value = arousal;
      u.uFlash.value = flash.current * dim;
      u.uBreathe.value = breatheEase.current;
      u.uSize.value = 9 * (1 + amp * 0.25);
      (u.uColor.value as THREE.Color).copy(cc);
      (u.uEdge.value as THREE.Color).copy(ee).multiplyScalar(dim);
    }

    // spokes
    built.spokeU.uTime.value = et;
    built.spokeU.uSpin.value = spokeSpin.current;
    built.spokeU.uAmp.value = amp;
    built.spokeU.uArousal.value = arousal;
    (built.spokeU.uColor.value as THREE.Color).copy(cc);
    (built.spokeU.uEdge.value as THREE.Color).copy(ee).multiplyScalar(dim);

    // central hub
    if (hub.current) {
      const breathe = 1 + Math.sin(et * 1.4) * 0.05;
      const s = 0.9 * breathe * (1 + amp * 0.3);
      hub.current.scale.set(s, s, 1);
      const m = hub.current.material as THREE.SpriteMaterial;
      m.color.copy(cc);
      m.opacity = (0.3 + amp * 0.2) * dim;
    }
  });

  return (
    <group ref={billboard}>
      {/* soft central hub so the HUD has a glowing heart */}
      <sprite ref={hub} position={[0, 0, -0.02]}>
        <spriteMaterial map={glow} transparent depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0.3} />
      </sprite>

      {built.rings.map((r) => (
        <points key={r.ri} geometry={r.geo} material={r.mat} />
      ))}

      <lineSegments geometry={built.spokeGeo} material={built.spokeMat} />
    </group>
  );
}

// ===== MYCELIUM - an alien neural/fungal network ============================
// A branching dendritic web of glowing blue filaments that GROWS outward from a
// core and gently retracts, with bright PULSES of light travelling along the
// branches (thoughts firing) and NODES igniting at branch points. The
// protomolecule as a thinking neural net: living, spreading, electric.
//
// DISTINCT from Plasma (Plasma = short chaotic filaments churning a core).
// Mycelium = a far-reaching branching TREE/web with discrete pulses propagating
// along discrete branches and lighting discrete nodes.
//
// Concurrent life (>=4): (1) global GROWTH wave revealing the web from the core
// out and gently breathing back; (2) PULSES = moving bright bands racing along
// each branch's arc; (3) NODES igniting at branch points on their own phase;
// (4) per-filament idle sway/shimmer; (5) slow whole-web rotation + drifting
// spores. All amplitude/arousal-driven RATES are integrated on the CPU; only
// uTime*<constant> appears inside the shaders.

const MYC_FIL_VERT = /* glsl */ `
  attribute float aArc;     // cumulative arc distance from root, normalized 0..1 (reveal order)
  attribute float aLen;     // local position along this branch, 0 (start) .. 1 (tip)
  attribute float aBranch;  // 0..1 per-branch random
  attribute float aSeed;    // 0..1 per-vertex random
  attribute float aDepth;   // generation depth normalized 0..1 (root=0, fine tips=1)
  uniform float uTime;      // raw clock; only ever multiplied by CONSTANTS
  uniform float uGrowth;    // eased 0..~1.15 reveal front (CPU-integrated/eased)
  uniform float uPulse;     // CPU-integrated pulse phase (speaking speeds it)
  uniform float uPulse2;    // second slower CPU-integrated pulse phase
  uniform float uAmp;
  uniform float uArousal;
  uniform float uSize;
  varying float vBright;
  varying float vReveal;
  varying float vDepth;
  void main(){
    vDepth = aDepth;

    // ---- GROWTH reveal: a vertex appears once the growth front passes its arc ----
    // soft window so the front shimmers as it sweeps outward; bounded, never spikes.
    float reveal = smoothstep(aArc - 0.10, aArc + 0.02, uGrowth);
    vReveal = reveal;

    // ---- idle sway: per-branch CONSTANT-rate sway, amplitude scales DISPLACEMENT only ----
    // tips (high aLen / aDepth) sway more than the rooted base.
    float sway = (0.018 + 0.05 * aLen * aDepth) * (0.6 + uAmp * 1.4 + uArousal * 0.4);
    vec3 wob = vec3(
      sin(uTime * 0.8 + aBranch * 31.0 + aSeed * 4.0),
      cos(uTime * 0.7 + aBranch * 19.0 + aSeed * 6.0),
      sin(uTime * 0.6 + aBranch * 11.0 + aSeed * 8.0)
    );
    vec3 pos = position + wob * sway;

    // ---- PULSES: bright bands racing outward along the arc (thoughts firing) ----
    // phase is CPU-integrated; the spatial frequency (aArc * const) is time-invariant.
    float band1 = sin(aArc * 26.0 - uPulse + aBranch * 6.2831);
    float band2 = sin(aArc * 14.0 - uPulse2 + aBranch * 3.14159);
    float pulse = max(0.0, band1);
    pulse = pulse * pulse;                       // sharp travelling crest
    float pulse2 = max(0.0, band2) * 0.5;

    // base filament glow: brighter toward the rooted core, plus the travelling crests.
    float baseGlow = 0.14 + (1.0 - aDepth) * 0.18;
    float twinkle = 0.5 + 0.5 * sin(uTime * 3.0 + aSeed * 33.0); // constant-rate shimmer
    vBright = baseGlow
            + pulse * (0.50 + uAmp * 0.6 + uArousal * 0.22)
            + pulse2 * 0.20
            + twinkle * 0.07
            + uAmp * 0.10;
    vBright *= reveal;                           // un-grown filament is dark

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float sz = uSize * (0.45 + 1.0 * vBright) * (0.7 + 0.5 * aSeed);
    gl_PointSize = clamp(sz * (9.0 / -mv.z), 0.0, 34.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const MYC_FIL_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;   // hot core color (mood)
  uniform vec3 uEdge;    // deep electric-blue edge (mood)
  uniform float uAmp;
  varying float vBright;
  varying float vReveal;
  varying float vDepth;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float soft = smoothstep(0.5, 0.0, d);
    float hot = smoothstep(0.16, 0.0, d);
    float b = clamp(vBright, 0.0, 1.25);
    // deep blue along the cool web, igniting toward hot core-white where pulses pass.
    vec3 col = mix(uEdge, uColor, clamp(b, 0.0, 1.0));
    col += vec3(0.16, 0.20, 0.26) * hot * b;     // restrained hot heart (bloom-safe)
    float a = (soft * soft * 0.40 + hot * 0.28) * b * vReveal;
    gl_FragColor = vec4(col * (0.9 + uAmp * 0.16), clamp(a, 0.0, 0.56));
  }
`;

// Branch-point NODES: discrete glowing junctions that ignite on their own phase.
const MYC_NODE_VERT = /* glsl */ `
  attribute float aArc;     // reveal order (same metric as filaments)
  attribute float aBranch;  // 0..1 per-node random
  attribute float aBig;     // 0..1 node prominence (junction degree)
  uniform float uTime;      // raw clock, CONSTANTS only
  uniform float uGrowth;
  uniform float uIgnite;    // CPU-integrated ignition phase (speaking ignites more/faster)
  uniform float uAmp;
  uniform float uArousal;
  uniform float uSize;
  varying float vGlow;
  varying float vBig;
  void main(){
    vBig = aBig;
    float reveal = smoothstep(aArc - 0.06, aArc + 0.02, uGrowth);
    // staggered ignition: each node owns a phase offset; a travelling sine lights subsets.
    float ig = 0.5 + 0.5 * sin(uIgnite + aBranch * 6.2831);
    ig = pow(ig, 2.2);                            // most nodes dim, a few blaze (sparse firing)
    float breathe = 0.5 + 0.5 * sin(uTime * 1.6 + aBranch * 12.0); // constant-rate idle pulse
    vGlow = (0.16 + 0.09 * breathe + ig * (0.62 + uAmp * 0.7 + uArousal * 0.35)) * reveal;

    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    float sz = uSize * (0.5 + 0.9 * aBig) * (0.6 + 1.2 * vGlow);
    gl_PointSize = clamp(sz * (9.0 / -mv.z), 0.0, 38.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const MYC_NODE_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uEdge;
  uniform float uAmp;
  varying float vGlow;
  varying float vBig;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float soft = smoothstep(0.5, 0.0, d);
    float core = smoothstep(0.30, 0.0, d);
    float g = clamp(vGlow, 0.0, 1.3);
    vec3 col = mix(uEdge, uColor, clamp(g, 0.0, 1.0));
    col += vec3(0.15, 0.19, 0.24) * core * g;    // ignited junction flares cyan-white
    float a = (soft * soft * 0.28 + core * 0.36) * g;
    gl_FragColor = vec4(col * (0.9 + uAmp * 0.16), clamp(a, 0.0, 0.54));
  }
`;

export function Mycelium({ speakGlow = 1 }: { speakGlow?: number }) {
  const glow = getGlowTexture();
  const spin = useRef<THREE.Group>(null);
  const halo = useRef<THREE.Sprite>(null);

  // CPU-integrated phases (rates rise with amp/arousal -> integrate, never sin(uTime*rate))
  const growth = useRef(0.18);   // eased reveal front 0..~1.15
  const pulse = useRef(0);       // primary travelling-pulse phase
  const pulse2 = useRef(0);      // secondary slower pulse phase
  const ignite = useRef(0);      // node ignition phase

  // ---- build the branching web from a root, recursively, via makeRng ----
  const built = useMemo(() => {
    const rnd = makeRng(4241);

    // per-vertex filament buffers (grown lazily; pushed into arrays then typed)
    const fPos: number[] = [];
    const fArc: number[] = [];
    const fLen: number[] = [];
    const fBranch: number[] = [];
    const fSeed: number[] = [];
    const fDepth: number[] = [];

    // node buffers (one per branch junction / tip)
    const nPos: number[] = [];
    const nArc: number[] = [];
    const nBranch: number[] = [];
    const nBig: number[] = [];

    const MAX_DEPTH = 5;
    const SEG = 9;                 // points per branch segment
    const MAX_ARC = 4.0;           // rough max cumulative length (for normalization)
    const v = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const ortho = new THREE.Vector3();
    const ortho2 = new THREE.Vector3();
    const tmp = new THREE.Vector3();

    // grow one branch from `start` heading `heading`; spawn children at its tip.
    function grow(
      start: THREE.Vector3,
      heading: THREE.Vector3,
      length: number,
      arc0: number,
      depth: number,
      bSeed: number
    ) {
      dir.copy(heading).normalize();
      // a stable pair of orthogonals so the branch can bow in its own plane
      tmp.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
      ortho.copy(dir).cross(tmp).normalize();
      ortho2.copy(dir).cross(ortho).normalize();
      const bowAmt = (rnd() - 0.5) * 0.9 * (length * 0.6);
      const bowAmt2 = (rnd() - 0.5) * 0.6 * (length * 0.6);
      const depthN = depth / MAX_DEPTH;

      for (let i = 0; i < SEG; i++) {
        const t = i / (SEG - 1);
        // gentle S-bow off the heading -> organic, not straight
        const bow = Math.sin(t * Math.PI) * bowAmt;
        const bow2 = Math.sin(t * Math.PI * 0.5) * bowAmt2;
        v.copy(dir).multiplyScalar(t * length).add(start);
        v.addScaledVector(ortho, bow);
        v.addScaledVector(ortho2, bow2);
        const arcHere = arc0 + t * length;
        const arcN = Math.min(1, arcHere / MAX_ARC);
        fPos.push(v.x, v.y, v.z);
        fArc.push(arcN);
        fLen.push(t);
        fBranch.push(bSeed);
        fSeed.push(rnd());
        fDepth.push(depthN);
      }

      // the branch tip position (reuse v from loop end)
      const tip = v.clone();
      const tipArcN = Math.min(1, (arc0 + length) / MAX_ARC);

      // spawn children (a junction NODE lights here)
      if (depth < MAX_DEPTH) {
        const nKids = depth === 0 ? 5 : 2 + (rnd() < 0.5 ? 1 : 0);
        for (let k = 0; k < nKids; k++) {
          // child heading = parent heading rotated by a random cone, biased outward
          const spread = 0.55 + 0.35 * rnd();
          tmp.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize();
          const childDir = new THREE.Vector3()
            .copy(dir)
            .addScaledVector(tmp, spread)
            .addScaledVector(tip.clone().normalize(), 0.25) // bias away from origin
            .normalize();
          const childLen = length * (0.6 + 0.18 * rnd());
          grow(tip, childDir, childLen, tipArcN * MAX_ARC, depth + 1, rnd());
        }
        // junction node (bigger near the root, smaller out at fine forks)
        nPos.push(tip.x, tip.y, tip.z);
        nArc.push(tipArcN);
        nBranch.push(rnd());
        nBig.push(0.45 + (1 - depthN) * 0.55);
      } else {
        // terminal tip node (small bright bud)
        nPos.push(tip.x, tip.y, tip.z);
        nArc.push(tipArcN);
        nBranch.push(rnd());
        nBig.push(0.35);
      }
    }

    // seed the root: several primary trunks radiating from just outside the core
    const TRUNKS = 7;
    const seeds = fibSphere(TRUNKS, 1.0);
    for (let s = 0; s < TRUNKS; s++) {
      const h = new THREE.Vector3(seeds[s][0], seeds[s][1], seeds[s][2]).normalize();
      const startR = 0.5;
      const start = h.clone().multiplyScalar(startR);
      grow(start, h, 1.0 + rnd() * 0.35, startR, 0, rnd());
    }

    // ---- typed arrays + geometries ----
    const filGeo = new THREE.BufferGeometry();
    filGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(fPos), 3));
    filGeo.setAttribute("aArc", new THREE.BufferAttribute(new Float32Array(fArc), 1));
    filGeo.setAttribute("aLen", new THREE.BufferAttribute(new Float32Array(fLen), 1));
    filGeo.setAttribute("aBranch", new THREE.BufferAttribute(new Float32Array(fBranch), 1));
    filGeo.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(fSeed), 1));
    filGeo.setAttribute("aDepth", new THREE.BufferAttribute(new Float32Array(fDepth), 1));
    filGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);

    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(nPos), 3));
    nodeGeo.setAttribute("aArc", new THREE.BufferAttribute(new Float32Array(nArc), 1));
    nodeGeo.setAttribute("aBranch", new THREE.BufferAttribute(new Float32Array(nBranch), 1));
    nodeGeo.setAttribute("aBig", new THREE.BufferAttribute(new Float32Array(nBig), 1));
    nodeGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6);

    const filU = {
      uTime: { value: 0 },
      uGrowth: { value: 0.18 },
      uPulse: { value: 0 },
      uPulse2: { value: 0 },
      uAmp: { value: 0 },
      uArousal: { value: 0.35 },
      uSize: { value: 9 },
      uColor: { value: new THREE.Color(0.85, 0.97, 1.0) },
      uEdge: { value: new THREE.Color(0.05, 0.2, 0.85) },
    };
    const filMat = new THREE.ShaderMaterial({
      vertexShader: MYC_FIL_VERT,
      fragmentShader: MYC_FIL_FRAG,
      uniforms: filU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    const nodeU = {
      uTime: { value: 0 },
      uGrowth: { value: 0.18 },
      uIgnite: { value: 0 },
      uAmp: { value: 0 },
      uArousal: { value: 0.35 },
      uSize: { value: 16 },
      uColor: { value: new THREE.Color(0.9, 0.98, 1.0) },
      uEdge: { value: new THREE.Color(0.1, 0.4, 1.0) },
    };
    const nodeMat = new THREE.ShaderMaterial({
      vertexShader: MYC_NODE_VERT,
      fragmentShader: MYC_NODE_FRAG,
      uniforms: nodeU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    return { filGeo, filMat, filU, nodeGeo, nodeMat, nodeU };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      built.filGeo.dispose();
      built.filMat.dispose();
      built.nodeGeo.dispose();
      built.nodeMat.dispose();
    },
    [built]
  );

  const cCol = useRef(new THREE.Color());
  const eCol = useRef(new THREE.Color());
  const haloCol = useRef(new THREE.Color());

  useFrame((state, dt) => {
    const d = Math.min(0.05, dt);
    const amp = getAmplitude();
    // luminosity-only speaking amplitude: callers can dim her speaking GLOW (brightness + point size +
    // halo) without slowing her motion. The corner on the network side passes speakGlow=0.5.
    const aGlow = 0;
    const mood = useJovaStore.getState().mood;
    const p = moodToWispParams(mood, "flame"); // electric blue -> cyan-white
    const et = state.clock.elapsedTime;
    const arousal = Math.max(0, Math.min(1, mood.arousal));
    const warm = Math.max(0, Math.min(1, (mood.valence + 1) / 2));

    // ---- GROWTH: web reaches out, breathing back when silent; SURGES when speaking ----
    // target reveal front eased toward; low valence keeps the web pulled-in & dim.
    const breathe = 0.5 + 0.5 * Math.sin(et * 0.45);
    const growTarget =
      (0.62 + 0.14 * breathe) +           // idle: spreads ~3/4 of the way and breathes
      amp * 0.6 +                          // speaking surges the web outward
      arousal * 0.12;
    const reach = growTarget * (0.7 + 0.3 * warm); // withdrawn (low valence) -> retracts
    growth.current += (reach - growth.current) * (1 - Math.exp(-d * 2.4));

    // ---- PULSES race outward faster when aroused/speaking (integrate rate) ----
    pulse.current += d * (2.4 + arousal * 2.4 + amp * 8.0);
    pulse2.current += d * (1.1 + arousal * 1.0 + amp * 3.2);
    // ---- NODE ignition: more/faster firing when energized ----
    ignite.current += d * (1.3 + arousal * 1.8 + amp * 5.5);

    // colors from mood each frame; low valence => cooler/dimmer
    const cc = cCol.current.setRGB(p.coreColor[0], p.coreColor[1], p.coreColor[2]);
    const ee = eCol.current.setRGB(p.edgeColor[0], p.edgeColor[1], p.edgeColor[2]);
    const dim = 0.55 + 0.45 * warm;

    const fu = built.filU;
    fu.uTime.value = et;
    fu.uGrowth.value = growth.current;
    fu.uPulse.value = pulse.current;
    fu.uPulse2.value = pulse2.current;
    fu.uAmp.value = aGlow;
    fu.uArousal.value = arousal;
    fu.uSize.value = 9 * (1 + aGlow * 0.25);
    (fu.uColor.value as THREE.Color).copy(cc);
    (fu.uEdge.value as THREE.Color).copy(ee).multiplyScalar(dim);

    const nu = built.nodeU;
    nu.uTime.value = et;
    nu.uGrowth.value = growth.current;
    nu.uIgnite.value = ignite.current;
    nu.uAmp.value = aGlow;
    nu.uArousal.value = arousal;
    nu.uSize.value = 16 * (1 + aGlow * 0.3);
    (nu.uColor.value as THREE.Color).copy(cc).lerp(WHITE, 0.12);
    (nu.uEdge.value as THREE.Color).copy(ee);

    // slow whole-web rotation/precession (faster a touch when energized)
    if (spin.current) {
      spin.current.rotation.y += d * (0.05 + arousal * 0.08 + amp * 0.12);
      spin.current.rotation.x = Math.sin(et * 0.13) * 0.12;
      spin.current.rotation.z += d * 0.012;
    }

    // soft back-halo behind the root, breathing with the voice
    if (halo.current) {
      const br = 1 + Math.sin(et * 1.1) * 0.05;
      const s = 3.0 * br * (1 + aGlow * 0.25);
      halo.current.scale.set(s, s, 1);
      const m = halo.current.material as THREE.SpriteMaterial;
      m.color.copy(haloCol.current.copy(ee).lerp(cc, 0.3));
      m.opacity = (0.16 + aGlow * 0.14) * dim;
    }
  });

  return (
    <group>
      {/* soft back-wash so the web reads against the dark */}
      <sprite ref={halo} position={[0, 0, -0.6]}>
        <spriteMaterial map={glow} transparent depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0.16} />
      </sprite>

      {/* the thinking core at the root of the network */}
      <Core scale={0.34} />

      <group ref={spin}>
        {/* dendritic filament web */}
        <points geometry={built.filGeo} material={built.filMat} />
        {/* igniting branch-point nodes */}
        <points geometry={built.nodeGeo} material={built.nodeMat} />
      </group>

      {/* a few drifting spores cast off the network for ambient life */}
      <WispParticles count={70} color={[0.7, 0.92, 1.0]} edgeColor={[0.12, 0.4, 1.0]} size={7} speed={0.6} twinkle={0.7} reactive position={[0, 0, 0]} />
    </group>
  );
}

// ===== MOTHERSHIP =====
// A vast layered alien CRAFT: stacked counter-rotating geometric hull rings studded with running-light
// conduits + glyph cells, radial spires (docking pylons) with light pulses travelling out, and a glowing
// central spindle. DISTINCT from flat Glyph HUD rings: these rings are real 3D bands at different Y
// heights with depth, the whole thing tumbles in space, spires give it structural silhouette. Blue/cyan,
// ominous and huge. Speaking: running lights race, conduits surge, rotation energizes.

// Hull-ring shader: a tube of points around a ring radius. Running-light conduits race around the ring
// (CPU-integrated uRun phase), segmented glyph cells gate which sectors are lit (uSeg spatial freq,
// constant), plus a slow constant-rate twinkle. Vertical tube thickness gives the band real depth.
const SHIP_RING_VERT = /* glsl */ `
  attribute float aA;        // angle 0..2PI around the ring (spatial)
  attribute float aTube;     // -1..1 across the tube cross-section (gives the band thickness)
  attribute float aSeed;     // 0..1 unique per point
  uniform float uTime;       // raw clock; ONLY multiplied by CONSTANTS in-shader
  uniform float uSpin;       // CPU-integrated rotation phase of this ring
  uniform float uRun;        // CPU-integrated running-light phase (races around the ring)
  uniform float uSeg;        // glyph-cell segments per ring (spatial frequency, constant over time)
  uniform float uRadius;
  uniform float uThick;      // tube thickness in units
  uniform float uAmp;        // live amplitude 0..0.85
  uniform float uArousal;    // 0..1
  uniform float uSurge;      // 0..1 eased conduit-surge amount (speaking)
  uniform float uSize;
  varying float vLit;
  varying float vHot;        // toward-core mix (running lights run hot)
  void main(){
    float a = aA + uSpin;

    // segmented hull plating: only some angular sectors are lit glyph cells. uSeg is spatial -> safe.
    float seg = sin(a * uSeg);
    float onSeg = smoothstep(0.45, 0.92, abs(seg));

    // running-light conduits: a few bright nodes racing around the ring. uRun is CPU-integrated.
    float run = cos(a * 5.0 - uRun);
    float runLight = smoothstep(0.78, 1.0, run);

    // a second, slower counter-running conduit for a busy networked feel (constant freq on uRun)
    float run2 = cos(a * 3.0 + uRun * 0.6);
    float runLight2 = smoothstep(0.82, 1.0, run2);

    // constant-rate twinkle so plating shimmers even in silence
    float tw = 0.55 + 0.45 * sin(uTime * 2.4 + aSeed * 37.0);

    // amplitude/arousal brighten + the surge lights more conduits (amounts, never rates)
    float ampBoost = uAmp * (0.5 + uArousal * 0.6);

    float baseLit = 0.10 + onSeg * (0.34 + 0.26 * tw);
    vLit = baseLit
         + runLight * (0.55 + ampBoost + uSurge * 0.6)
         + runLight2 * (0.38 + ampBoost * 0.6)
         + ampBoost * onSeg * 0.40;

    vHot = clamp(runLight * 1.0 + runLight2 * 0.6 + uSurge * 0.3, 0.0, 1.0);

    // place on the ring, then offset along the tube cross-section (radial + vertical) for real thickness
    float r = uRadius + aTube * uThick * (0.6 + 0.4 * aSeed);
    float yy = aTube * uThick * 0.85 * (0.5 + 0.5 * sin(a * 2.0 + aSeed * 6.2831));
    vec3 pos = vec3(cos(a) * r, yy, sin(a) * r);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float sz = uSize * (0.5 + 0.95 * clamp(vLit, 0.0, 1.4));
    gl_PointSize = clamp(sz * (9.0 / -mv.z), 0.0, 36.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const SHIP_RING_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;   // flame core (hot)
  uniform vec3 uEdge;    // flame edge (cool)
  uniform float uAmp;
  uniform float uDim;    // valence dimming
  varying float vLit;
  varying float vHot;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float soft = smoothstep(0.5, 0.0, d);
    float node = smoothstep(0.24, 0.0, d);   // sharper conduit-node core
    float lit = clamp(vLit, 0.0, 1.6);
    vec3 col = mix(uEdge, uColor, clamp(lit * 0.65 + vHot * 0.6, 0.0, 1.0));
    col += vec3(0.12) * node * vHot;          // hot heart only on running lights (trimmed for bloom safety)
    float a = (soft * soft * 0.28 + node * 0.28) * (0.28 + 0.72 * lit) * uDim;
    gl_FragColor = vec4(col * (1.0 + uAmp * 0.2), clamp(a, 0.0, 0.62));
  }
`;

// Radial spire shader: line segments from an inner hub-radius outward (and tilted up/down), like docking
// pylons. A bright light-pulse travels out along each spire (CPU-integrated uPulse, per-spire phase via
// constant aSeed). Speaking surges the pulses and extends the reach (amounts, never rates).
const SHIP_SPIRE_VERT = /* glsl */ `
  attribute float aTip;      // 0 inner end (on hull) .. 1 outer tip
  attribute float aAng;      // spire azimuth (constant)
  attribute float aTilt;     // vertical tilt of this spire (constant)
  attribute float aSeed;     // per-spire random
  uniform float uTime;
  uniform float uSpin;       // CPU-integrated slow rotation of the spire array
  uniform float uPulse;      // CPU-integrated light-pulse travel phase
  uniform float uInner;
  uniform float uOuter;
  uniform float uAmp;
  uniform float uArousal;
  uniform float uSurge;      // eased speaking surge
  varying float vTip;
  varying float vPulse;
  void main(){
    float a = aAng + uSpin;
    // idle shimmer via constant per-spire rate; voice extends reach (amount, not rate).
    // aSeed is a fixed attribute, so (1.3 + fract(aSeed*7.0)) is a CONSTANT rate -> uTime*const is safe.
    float bob = 0.5 + 0.5 * sin(uTime * (1.3 + fract(aSeed * 7.0)) + aSeed * 6.2831);
    float reach = uOuter + bob * 0.08 + uAmp * (0.5 + uArousal * 0.7) * (0.6 + 0.8 * fract(aSeed * 13.0));
    float r = mix(uInner, reach, aTip);
    float yy = aTilt * aTip;   // tip rises/sinks so spires fan in 3D, not a flat disk
    vec3 pos = vec3(cos(a) * r, yy, sin(a) * r);

    // travelling light-pulse along the spire: a bright bump whose position is set by integrated uPulse
    // and a per-spire phase offset (aSeed is a fixed attribute). uPulse integrated -> never spikes.
    float head = fract(uPulse * (0.3 + 0.2 * fract(aSeed * 5.0)) + aSeed);
    float dist = abs(aTip - head);
    vPulse = smoothstep(0.16, 0.0, dist) * (0.5 + uSurge + uAmp * 0.6);

    vTip = aTip;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const SHIP_SPIRE_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uEdge;
  uniform float uDim;
  varying float vTip;
  varying float vPulse;
  void main(){
    vec3 col = mix(uColor, uEdge, vTip);
    col += vec3(0.18, 0.22, 0.25) * vPulse;             // pulse runs hot
    // base spire faint, brightened where the light-pulse is and near the hull
    float a = ((1.0 - vTip * 0.65) * 0.22 + vPulse * 0.5) * uDim;
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.6));
  }
`;

// Central spindle shader: a tall thin column of points forming the craft glowing core conduit. Energy
// surges up the spindle (CPU-integrated uFlow), constant-rate flicker, gentle amplitude swell.
const SHIP_SPINDLE_VERT = /* glsl */ `
  attribute float aY;        // -1..1 along the spindle height (spatial)
  attribute float aA;        // angle around the thin column (spatial)
  attribute float aSeed;
  uniform float uTime;
  uniform float uFlow;       // CPU-integrated upward energy-flow phase
  uniform float uHeight;
  uniform float uRadius;
  uniform float uAmp;
  uniform float uSize;
  varying float vGlow;
  void main(){
    float rad = uRadius * (0.7 + 0.5 * sin(aY * 3.14159 + 0.0)); // tapers at top + bottom
    float x = cos(aA) * rad;
    float z = sin(aA) * rad;
    float y = aY * uHeight;
    vec3 pos = vec3(x, y, z);

    // energy node travelling up the spindle (uFlow integrated) + constant-rate flicker
    float node = fract(uFlow * 0.25 + aSeed);
    float band = smoothstep(0.12, 0.0, abs((aY * 0.5 + 0.5) - node));
    float fl = 0.5 + 0.5 * sin(uTime * 6.0 + aSeed * 50.0);
    vGlow = 0.28 + band * (0.7 + uAmp * 0.6) + 0.18 * fl + uAmp * 0.2;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float sz = uSize * (0.6 + 1.0 * clamp(vGlow, 0.0, 1.3));
    gl_PointSize = clamp(sz * (9.0 / -mv.z), 0.0, 30.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const SHIP_SPINDLE_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uEdge;
  uniform float uDim;
  varying float vGlow;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float soft = smoothstep(0.5, 0.0, d);
    float g = clamp(vGlow, 0.0, 1.4);
    vec3 col = mix(uEdge, uColor, clamp(g, 0.0, 1.0));
    float a = soft * soft * (0.22 + 0.34 * g) * uDim;
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.6));
  }
`;

function Mothership() {
  const glow = getGlowTexture();
  const craft = useRef<THREE.Group>(null);
  const ring0 = useRef<THREE.Group>(null);
  const ring1 = useRef<THREE.Group>(null);
  const ring2 = useRef<THREE.Group>(null);
  const hub = useRef<THREE.Sprite>(null);

  // hull-ring configs: [radius, y-height, tube thickness, segments, direction]
  const SHIP_RINGS: { radius: number; y: number; thick: number; seg: number; dir: number }[] = [
    { radius: 3.4, y: -0.85, thick: 0.22, seg: 30, dir: 1 },
    { radius: 3.0, y: 0.0, thick: 0.3, seg: 22, dir: -1 },
    { radius: 2.6, y: 0.85, thick: 0.22, seg: 38, dir: 1 },
  ];

  // CPU-integrated phases (rates depend on amp/arousal -> integrate, never sin(uTime*rate))
  const ringSpin = useRef<number[]>(SHIP_RINGS.map(() => 0));
  const runPhase = useRef(0); // running-light race
  const pulsePhase = useRef(0); // spire light-pulse travel
  const flowPhase = useRef(0); // spindle upward flow
  const surge = useRef(0); // eased conduit-surge amount (speaking)

  const built = useMemo(() => {
    // ---- hull rings (tubes of points) ----
    const rings = SHIP_RINGS.map((cfg, ri) => {
      const N = 520;
      const rnd = makeRng(5100 + ri * 197);
      const pos = new Float32Array(N * 3); // required; shader places by angle/tube
      const aA = new Float32Array(N);
      const aTube = new Float32Array(N);
      const aSeed = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        aA[i] = (i / N) * Math.PI * 2 + rnd() * 0.02;
        aTube[i] = rnd() * 2 - 1; // across the tube cross-section
        aSeed[i] = rnd();
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      geo.setAttribute("aA", new THREE.BufferAttribute(aA, 1));
      geo.setAttribute("aTube", new THREE.BufferAttribute(aTube, 1));
      geo.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5);
      const uniforms = {
        uTime: { value: 0 },
        uSpin: { value: 0 },
        uRun: { value: 0 },
        uSeg: { value: cfg.seg },
        uRadius: { value: cfg.radius },
        uThick: { value: cfg.thick },
        uAmp: { value: 0 },
        uArousal: { value: 0.35 },
        uSurge: { value: 0 },
        uSize: { value: 9 },
        uDim: { value: 1 },
        uColor: { value: new THREE.Color(0.85, 0.97, 1.0) },
        uEdge: { value: new THREE.Color(0.06, 0.3, 0.92) },
      };
      const mat = new THREE.ShaderMaterial({
        vertexShader: SHIP_RING_VERT,
        fragmentShader: SHIP_RING_FRAG,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      return { geo, mat, uniforms, y: cfg.y, dir: cfg.dir, ri };
    });

    // ---- radial spires (line segments fanning out from the hull) ----
    const NSP = 24;
    const PER = 2;
    const sp = new Float32Array(NSP * PER * 3);
    const tip = new Float32Array(NSP * PER);
    const ang = new Float32Array(NSP * PER);
    const tilt = new Float32Array(NSP * PER);
    const seed = new Float32Array(NSP * PER);
    const rnd = makeRng(606060);
    for (let s = 0; s < NSP; s++) {
      const a = (s / NSP) * Math.PI * 2 + rnd() * 0.08;
      const tl = (rnd() * 2 - 1) * 1.0; // vertical fan of the spire tips
      const sd = rnd();
      for (let k = 0; k < PER; k++) {
        const idx = s * PER + k;
        tip[idx] = k; // 0 then 1
        ang[idx] = a;
        tilt[idx] = tl;
        seed[idx] = sd;
      }
    }
    const spireGeo = new THREE.BufferGeometry();
    spireGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
    spireGeo.setAttribute("aTip", new THREE.BufferAttribute(tip, 1));
    spireGeo.setAttribute("aAng", new THREE.BufferAttribute(ang, 1));
    spireGeo.setAttribute("aTilt", new THREE.BufferAttribute(tilt, 1));
    spireGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
    spireGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 5);
    const spireU = {
      uTime: { value: 0 },
      uSpin: { value: 0 },
      uPulse: { value: 0 },
      uInner: { value: 2.5 },
      uOuter: { value: 4.0 },
      uAmp: { value: 0 },
      uArousal: { value: 0.35 },
      uSurge: { value: 0 },
      uDim: { value: 1 },
      uColor: { value: new THREE.Color(0.8, 0.95, 1.0) },
      uEdge: { value: new THREE.Color(0.1, 0.4, 1.0) },
    };
    const spireMat = new THREE.ShaderMaterial({
      vertexShader: SHIP_SPIRE_VERT,
      fragmentShader: SHIP_SPIRE_FRAG,
      uniforms: spireU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    // ---- central spindle (thin tall column of points) ----
    const SN = 900;
    const sppos = new Float32Array(SN * 3); // required; shader places by aY/aA
    const spY = new Float32Array(SN);
    const spA = new Float32Array(SN);
    const spSeed = new Float32Array(SN);
    const rnd2 = makeRng(707070);
    for (let i = 0; i < SN; i++) {
      spY[i] = rnd2() * 2 - 1;
      spA[i] = rnd2() * Math.PI * 2;
      spSeed[i] = rnd2();
    }
    const spindleGeo = new THREE.BufferGeometry();
    spindleGeo.setAttribute("position", new THREE.BufferAttribute(sppos, 3));
    spindleGeo.setAttribute("aY", new THREE.BufferAttribute(spY, 1));
    spindleGeo.setAttribute("aA", new THREE.BufferAttribute(spA, 1));
    spindleGeo.setAttribute("aSeed", new THREE.BufferAttribute(spSeed, 1));
    spindleGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);
    const spindleU = {
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uHeight: { value: 1.7 },
      uRadius: { value: 0.42 },
      uAmp: { value: 0 },
      uSize: { value: 8 },
      uDim: { value: 1 },
      uColor: { value: new THREE.Color(0.85, 0.97, 1.0) },
      uEdge: { value: new THREE.Color(0.1, 0.45, 1.0) },
    };
    const spindleMat = new THREE.ShaderMaterial({
      vertexShader: SHIP_SPINDLE_VERT,
      fragmentShader: SHIP_SPINDLE_FRAG,
      uniforms: spindleU,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });

    return { rings, spireGeo, spireMat, spireU, spindleGeo, spindleMat, spindleU };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(
    () => () => {
      built.rings.forEach((r) => {
        r.geo.dispose();
        r.mat.dispose();
      });
      built.spireGeo.dispose();
      built.spireMat.dispose();
      built.spindleGeo.dispose();
      built.spindleMat.dispose();
    },
    [built]
  );

  const cCol = useRef(new THREE.Color());
  const eCol = useRef(new THREE.Color());

  useFrame((state, dt) => {
    const d = Math.min(0.05, dt);
    const amp = getAmplitude();
    const mood = useJovaStore.getState().mood;
    const p = moodToWispParams(mood, "flame"); // electric blue -> cyan, mood-driven
    const et = state.clock.elapsedTime;
    const arousal = Math.max(0, Math.min(1, mood.arousal));
    const warm = Math.max(0, Math.min(1, (mood.valence + 1) / 2));

    // integrate amp/arousal-driven phases (never sin(uTime*rate))
    runPhase.current += d * (1.1 + arousal * 1.6 + amp * 5.5); // running lights race with the voice
    pulsePhase.current += d * (0.6 + arousal * 0.8 + amp * 3.0); // spire pulses travel out
    flowPhase.current += d * (0.8 + arousal * 0.7 + amp * 2.6); // spindle energy surges up
    for (let i = 0; i < built.rings.length; i++) {
      const rate = (0.07 + 0.04 * i) * (1 + arousal * 0.9) + amp * (0.2 + 0.1 * i);
      ringSpin.current[i] += d * rate * built.rings[i].dir;
    }

    // eased conduit-surge: amplitude surges it, arousal sustains it, low valence damps it
    const surgeTarget = Math.min(1, amp * 1.3 + arousal * 0.2) * (0.6 + 0.4 * warm);
    surge.current += (surgeTarget - surge.current) * (1 - Math.exp(-d * 6));

    // colors from mood every frame; low valence => cooler & dimmer, warm => brighter
    const cc = cCol.current.setRGB(p.coreColor[0], p.coreColor[1], p.coreColor[2]).lerp(WHITE, warm * 0.08);
    const ee = eCol.current.setRGB(p.edgeColor[0], p.edgeColor[1], p.edgeColor[2]);
    const dim = 0.55 + 0.45 * warm;

    for (let i = 0; i < built.rings.length; i++) {
      const u = built.rings[i].uniforms;
      u.uTime.value = et;
      u.uSpin.value = ringSpin.current[i];
      u.uRun.value = runPhase.current + i * 1.1;
      u.uAmp.value = amp;
      u.uArousal.value = arousal;
      u.uSurge.value = surge.current;
      u.uSize.value = 9 * (1 + amp * 0.25);
      u.uDim.value = dim;
      (u.uColor.value as THREE.Color).copy(cc);
      (u.uEdge.value as THREE.Color).copy(ee);
    }

    // spires
    built.spireU.uTime.value = et;
    built.spireU.uSpin.value = ringSpin.current[1] * 0.4; // drift with the mid ring
    built.spireU.uPulse.value = pulsePhase.current;
    built.spireU.uAmp.value = amp;
    built.spireU.uArousal.value = arousal;
    built.spireU.uSurge.value = surge.current;
    built.spireU.uDim.value = dim;
    (built.spireU.uColor.value as THREE.Color).copy(cc);
    (built.spireU.uEdge.value as THREE.Color).copy(ee);

    // spindle
    built.spindleU.uTime.value = et;
    built.spindleU.uFlow.value = flowPhase.current;
    built.spindleU.uAmp.value = amp;
    built.spindleU.uSize.value = 8 * (1 + amp * 0.2);
    built.spindleU.uDim.value = dim;
    (built.spindleU.uColor.value as THREE.Color).copy(cc);
    (built.spindleU.uEdge.value as THREE.Color).copy(ee);

    // whole-craft slow tumble + gentle hover bob (constant-rate -> safe)
    if (craft.current) {
      craft.current.rotation.y += d * (0.05 + arousal * 0.05 + amp * 0.1);
      craft.current.rotation.z = Math.sin(et * 0.18) * 0.06; // slow listing
      craft.current.rotation.x = 0.32 + Math.sin(et * 0.13) * 0.05; // dramatic fixed tilt + drift
      craft.current.position.y = Math.sin(et * 0.5) * 0.08;
    }
    // hull rings wobble independently on their own axes for a layered, articulated feel
    if (ring0.current) ring0.current.rotation.x = Math.sin(et * 0.21) * 0.05;
    if (ring1.current) ring1.current.rotation.x = Math.cos(et * 0.17) * 0.04;
    if (ring2.current) ring2.current.rotation.x = Math.sin(et * 0.19 + 1.0) * 0.05;

    // central hub glow (soft wash; kept modest + behind so center does not white-out)
    if (hub.current) {
      const breathe = 1 + Math.sin(et * 1.3) * 0.05;
      const s = 3.2 * breathe * (1 + amp * 0.3);
      hub.current.scale.set(s, s, 1);
      const m = hub.current.material as THREE.SpriteMaterial;
      m.color.copy(ee);
      m.opacity = (0.16 + amp * 0.12) * dim;
    }
  });

  const ringRefs = [ring0, ring1, ring2];

  return (
    <group ref={craft} rotation={[0.32, 0, 0]}>
      {/* glowing central core heart of the craft */}
      <Core scale={0.34} />

      {/* soft central hub wash, pushed behind the core so additive layers do not pile up at the center */}
      <sprite ref={hub} position={[0, 0, -0.25]}>
        <spriteMaterial map={glow} transparent depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0.16} />
      </sprite>

      {/* central vertical spindle */}
      <points geometry={built.spindleGeo} material={built.spindleMat} />

      {/* stacked counter-rotating hull rings, each at its own height */}
      {built.rings.map((r) => (
        <group key={r.ri} ref={ringRefs[r.ri]} position={[0, r.y, 0]}>
          <points geometry={r.geo} material={r.mat} />
        </group>
      ))}

      {/* radial docking spires fanning out from the hull */}
      <lineSegments geometry={built.spireGeo} material={built.spireMat} />

      {/* drifting motes around the craft */}
      <WispParticles count={90} color={[0.75, 0.93, 1.0]} edgeColor={[0.12, 0.4, 1.0]} size={7} speed={0.5} twinkle={0.7} reactive position={[0, 0, 0]} />
    </group>
  );
}

// ---- COCOON ----
// A shared egg silhouette used by shell + veins so they trace the SAME pod surface. Pure ASCII GLSL
// (no backticks, no unicode) injected into the shaders that need it via ${COC_EGG_GLSL}. Declared
// FIRST so the shader consts below can interpolate it (no temporal-dead-zone error).
const COC_EGG_GLSL = /* glsl */ `
  // egg silhouette: prolate + asymmetric. v=0 bottom pole -> v=1 top pole.
  // returns vec2(horizRadiusFactor, yFactor) for a unit pod (caller scales by radius).
  vec2 COC_egg(float v){
    float a = v * 3.14159265;                          // 0..PI
    float ring = sin(a);                               // 0 at poles, 1 at equator
    float taper = 1.0 - 0.45 * smoothstep(0.5, 1.0, v); // top half pinches -> egg point, not a sphere
    float horiz = ring * taper;
    float y = (-cos(a)) * 1.18 + (v - 0.5) * 0.18;     // prolate stretch + fat-bottom shift
    return vec2(horiz, y);
  }
`;

// Shell: a translucent membrane of points on the egg surface. Breathes/flexes (CPU-integrated
// uBreathe), shows a holographic rim, and brightens gently when speaking. Displacement AMOUNT is
// amp-driven; in-shader temporal terms are CONSTANT-rate or use the integrated phase -> never spike.
const COC_SHELL_VERT = /* glsl */ `
  attribute float aU;       // azimuth 0..2PI
  attribute float aV;       // 0 bottom pole .. 1 top pole
  attribute float aSeed;    // 0..1 per-point
  uniform float uTime;      // raw clock - multiplied only by CONSTANTS here
  uniform float uBreathe;   // CPU-integrated breathing phase (rate eased by amp/arousal)
  uniform float uAmp;
  uniform float uArousal;
  uniform float uRadius;
  uniform float uSize;
  varying float vGlow;
  varying float vRim;
  ${COC_EGG_GLSL}
  void main(){
    vec2 egg = COC_egg(aV);
    float horiz = egg.x;
    float yy = egg.y;

    // tiny pole scatter so the points where horiz -> 0 (the two poles) do NOT all collapse onto the
    // central axis and stack into an additive hot-spot. Fades out away from the poles.
    float poleNear = max(1.0 - smoothstep(0.0, 0.16, aV), 1.0 - smoothstep(0.0, 0.16, 1.0 - aV));
    horiz += poleNear * (0.03 + 0.05 * aSeed);

    vec3 base = vec3(cos(aU) * horiz, yy, sin(aU) * horiz);
    vec3 nrm = normalize(base + vec3(0.0, 0.001, 0.0));

    // breathing: the whole shell swells and eases (bounded sin of the integrated phase).
    // amplitude DEEPENS the breath; the rate lives in uBreathe so it can never spike.
    float breath = sin(uBreathe);
    float swell = 1.0 + breath * (0.035 + uAmp * 0.09);

    // organic flex: low-frequency lobes wander over the shell (CONSTANT time rate).
    float flex = sin(aV * 5.0 + aU * 2.0 + uTime * 0.6)
               + 0.5 * sin(aU * 3.0 - uTime * 0.43 + aSeed * 6.2831);
    float disp = (0.018 + uAmp * 0.06) * flex;          // amplitude scales AMOUNT only

    vec3 pos = (base * swell + nrm * disp) * uRadius;

    // holographic rim: points facing the camera glow softer, edges read as the membrane silhouette
    vRim = 0.30 + 0.70 * smoothstep(-0.3, 1.0, nrm.z);

    // surface micro-veining + twinkle (all constant in-shader rates)
    float vein = 0.5 + 0.5 * sin(aV * 22.0 + sin(aU * 7.0) * 2.0 - uTime * 0.5);
    float tw = 0.6 + 0.4 * sin(uTime * 2.0 + aSeed * 30.0);
    vGlow = (0.20 + 0.30 * vein) * tw
          + max(0.0, breath) * 0.12
          + uAmp * (0.18 + uArousal * 0.18);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    // taper size toward the poles so the (denser) pole points cannot burn out additively
    float poleFade = 0.5 + 0.5 * smoothstep(0.04, 0.2, min(aV, 1.0 - aV));
    float sz = uSize * (0.55 + 0.8 * clamp(vGlow, 0.0, 1.3)) * (0.55 + 0.55 * aSeed) * poleFade;
    gl_PointSize = clamp(sz * (9.0 / -mv.z), 0.0, 36.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const COC_SHELL_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;   // hot inner membrane tint (core color)
  uniform vec3 uEdge;    // cool translucent shell (edge color)
  uniform float uAmp;
  varying float vGlow;
  varying float vRim;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float soft = smoothstep(0.5, 0.0, d);
    float core = smoothstep(0.2, 0.0, d);
    float g = clamp(vGlow, 0.0, 1.3);
    vec3 col = mix(uEdge, uColor, clamp(g, 0.0, 1.0));
    // alpha kept inside the bloom-safe band; rim makes the silhouette read against the dark
    float a = (soft * soft * 0.30 + core * 0.22) * vRim * (0.40 + 0.70 * g);
    gl_FragColor = vec4(col * (1.0 + uAmp * 0.18), clamp(a, 0.0, 0.6));
  }
`;

// Veins: glowing circulation channels running pole-to-pole over the shell. Each vein wanders
// azimuthally as it climbs (per-vein phase) so they look organic. A bright pulse of "flow" travels
// up every vein (CPU-integrated uFlow), surging brighter/faster when she speaks.
const COC_VEIN_VERT = /* glsl */ `
  attribute float aT;       // 0 bottom .. 1 top along the vein
  attribute float aVein;    // per-vein base azimuth (radians)
  attribute float aSeed;    // 0..1 per-vein random
  uniform float uTime;
  uniform float uFlow;      // CPU-integrated circulation phase (amp/arousal speed it)
  uniform float uBreathe;   // shared shell breathing phase (so veins ride the swell)
  uniform float uAmp;
  uniform float uRadius;
  uniform float uSize;
  varying float vFlow;      // 0..1 brightness of the travelling pulse at this point
  ${COC_EGG_GLSL}
  void main(){
    vec2 egg = COC_egg(aT);
    float horiz = egg.x;
    float yy = egg.y;

    // azimuth wanders as the vein climbs: a gentle S so channels branch organically
    float wander = sin(aT * 3.14159265 * 1.5 + aSeed * 6.2831) * 0.5
                 + 0.25 * sin(aT * 9.0 + aSeed * 12.0);
    float ang = aVein + wander;

    // keep the vein ends off the exact axis (a small navel at each pole, not a single stacked point)
    float poleNear = max(1.0 - smoothstep(0.0, 0.12, aT), 1.0 - smoothstep(0.0, 0.12, 1.0 - aT));
    horiz += poleNear * (0.04 + 0.03 * aSeed);

    // sit veins a hair PROUD of the shell so they read as raised channels
    float breath = sin(uBreathe);
    float swell = 1.0 + breath * 0.035;
    float proud = 1.0 + 0.05 + 0.02 * sin(aT * 30.0); // beaded relief along the vein
    float horizP = horiz * swell * proud;

    vec3 pos = vec3(cos(ang) * horizP, yy * swell, sin(ang) * horizP) * uRadius;

    // travelling circulation pulse: a bright band runs up each vein. uFlow is integrated on the CPU
    // so its SPEED can vary with the voice without ever spiking (no sin(uTime*variableRate)).
    float wave = sin(aT * 9.0 - uFlow + aSeed * 6.2831);
    vFlow = smoothstep(0.55, 1.0, wave);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float sz = uSize * (0.6 + 1.0 * vFlow) * (0.6 + 0.5 * aSeed);
    gl_PointSize = clamp(sz * (9.0 / -mv.z), 0.0, 34.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const COC_VEIN_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;   // hot pulse color (core, lerped toward white)
  uniform vec3 uEdge;    // dim resting vein color (edge)
  uniform float uAmp;
  varying float vFlow;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float soft = smoothstep(0.5, 0.0, d);
    float core = smoothstep(0.24, 0.0, d);
    vec3 col = mix(uEdge, uColor, vFlow);     // resting vein faint; the pulse lights it hot
    col += vec3(0.16) * core * vFlow;          // small hot heart only on the pulse crest
    float a = (soft * soft * 0.22 + core * 0.30) * (0.20 + 0.85 * vFlow) * (0.7 + uAmp * 0.4);
    gl_FragColor = vec4(col, clamp(a, 0.0, 0.62));
  }
`;

// Inner mass: a luminous gestating blob inside the pod. Points sit on a small inner sphere, pushed
// in/out by lobes so the surface stirs/roils (CPU-integrated uStir), and the whole mass swells on a
// CPU-integrated heartbeat (uPulse). It brightens and swells when she speaks.
const COC_MASS_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uStir;     // CPU-integrated stir phase (arousal/amp speed it)
  uniform float uAmp;
  uniform float uPulse;    // CPU-integrated heartbeat phase
  uniform float uRadius;   // inner mass radius
  uniform float uSize;
  varying float vGlow;
  void main(){
    vec3 dir = normalize(position);

    // roiling surface: low-frequency lobes that wander with the integrated stir phase.
    float n = sin(dir.x * 4.0 + uStir)
            + sin(dir.y * 5.0 - uStir * 0.8 + aSeed * 6.2831)
            + sin(dir.z * 3.0 + uStir * 0.6);
    n /= 3.0;

    // heartbeat: the whole mass swells on the integrated pulse; voice deepens it.
    float beat = sin(uPulse);
    float swell = 1.0 + beat * (0.06 + uAmp * 0.14);

    float r = uRadius * swell * (1.0 + n * (0.12 + uAmp * 0.10));
    vec3 pos = dir * r;

    float tw = 0.6 + 0.4 * sin(uTime * 2.6 + aSeed * 22.0);
    vGlow = (0.45 + 0.4 * max(0.0, n)) * tw
          + max(0.0, beat) * 0.25
          + uAmp * 0.4;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float sz = uSize * (0.6 + 0.9 * clamp(vGlow, 0.0, 1.4)) * (0.6 + 0.6 * aSeed);
    gl_PointSize = clamp(sz * (9.0 / -mv.z), 0.0, 34.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const COC_MASS_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;   // hot inner light (core, toward white)
  uniform vec3 uEdge;    // cooler outer glow (edge)
  uniform float uAmp;
  varying float vGlow;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float soft = smoothstep(0.5, 0.0, d);
    float core = smoothstep(0.26, 0.0, d);
    float g = clamp(vGlow, 0.0, 1.5);
    vec3 col = mix(uEdge, uColor, clamp(g, 0.0, 1.0));
    // mass sits at the exact center on top of Core + spores; keep the hot center add modest so the
    // stacked additive layers stay in the bloom-safe band under NoToneMapping.
    col += vec3(0.10) * core * g;
    float a = (soft * soft * 0.26 + core * 0.26) * (0.30 + 0.70 * g);
    gl_FragColor = vec4(col * (1.0 + uAmp * 0.2), clamp(a, 0.0, 0.58));
  }
`;

/** COCOON - a translucent organic alien egg/pod. A point-cloud membrane in an egg silhouette breathes
 *  and flexes; glowing CIRCULATION veins run pole-to-pole with bright pulses of flow surging up them;
 *  and a luminous gestating MASS stirs and pulses inside (a mind being born). When she speaks the inner
 *  mass brightens and swells, the veins surge with faster/brighter flow, and the shell flexes harder.
 *  Electric blue/cyan, mood-driven (warm valence = brighter; high arousal = faster; low valence = cool,
 *  dim, slow). Concurrent life even in silence: shell breathing/flex, vein circulation, inner-mass stir +
 *  heartbeat, whole-pod sway/rotation, and an ambient back-halo. */
function Cocoon() {
  const glow = getGlowTexture();
  const sway = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Sprite>(null);

  // CPU-integrated phases (any rate touched by amp/arousal MUST be integrated, never sin(uTime*rate))
  const breathe = useRef(0);
  const flow = useRef(0);
  const stir = useRef(0);
  const pulse = useRef(0);

  const COC_RADIUS = 2.9; // BIG: inside the required ~2.6..3.4 band so the pod fills the screen

  // ---- shell: points on the egg surface ----
  const shell = useMemo(() => {
    const RINGS = 56;   // bottom pole -> top pole
    const SECT = 90;    // around
    const total = RINGS * SECT;
    const pos = new Float32Array(total * 3); // required attribute, unused for placement
    const aU = new Float32Array(total);
    const aV = new Float32Array(total);
    const aSeed = new Float32Array(total);
    const rnd = makeRng(7311);
    let w = 0;
    for (let r = 0; r < RINGS; r++) {
      const v = r / (RINGS - 1);
      for (let s = 0; s < SECT; s++) {
        const u = (s / SECT) * Math.PI * 2 + v * 0.5; // slight spiral so rings dont seam
        aU[w] = u;
        aV[w] = v;
        aSeed[w] = rnd();
        w++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aU", new THREE.BufferAttribute(aU, 1));
    geo.setAttribute("aV", new THREE.BufferAttribute(aV, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 8);
    const uniforms = {
      uTime: { value: 0 },
      uBreathe: { value: 0 },
      uAmp: { value: 0 },
      uArousal: { value: 0.35 },
      uRadius: { value: COC_RADIUS },
      uSize: { value: 8.5 },
      uColor: { value: new THREE.Color(0.7, 0.95, 1.0) },
      uEdge: { value: new THREE.Color(0.08, 0.3, 0.95) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: COC_SHELL_VERT,
      fragmentShader: COC_SHELL_FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { geo, mat, uniforms };
  }, []);

  // ---- veins: pole-to-pole circulation channels ----
  const veins = useMemo(() => {
    const VEINS = 26;
    const PER = 64;
    const total = VEINS * PER;
    const pos = new Float32Array(total * 3); // required attribute, unused for placement
    const aT = new Float32Array(total);
    const aVein = new Float32Array(total);
    const aSeed = new Float32Array(total);
    const rnd = makeRng(8422);
    let w = 0;
    for (let i = 0; i < VEINS; i++) {
      const baseAng = (i / VEINS) * Math.PI * 2 + (rnd() - 0.5) * 0.3;
      const seed = rnd();
      for (let p = 0; p < PER; p++) {
        const t = p / (PER - 1);
        aT[w] = t;
        aVein[w] = baseAng;
        aSeed[w] = seed;
        w++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("aT", new THREE.BufferAttribute(aT, 1));
    geo.setAttribute("aVein", new THREE.BufferAttribute(aVein, 1));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(aSeed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 8);
    const uniforms = {
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uBreathe: { value: 0 },
      uAmp: { value: 0 },
      uRadius: { value: COC_RADIUS },
      uSize: { value: 9 },
      uColor: { value: new THREE.Color(0.85, 0.97, 1.0) },
      uEdge: { value: new THREE.Color(0.06, 0.28, 0.85) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: COC_VEIN_VERT,
      fragmentShader: COC_VEIN_FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { geo, mat, uniforms };
  }, []);

  // ---- inner gestating mass ----
  const mass = useMemo(() => {
    const N = 1100;
    const pts = fibSphere(N, 1.0);
    const mp = new Float32Array(N * 3);
    const ms = new Float32Array(N);
    const rnd = makeRng(9533);
    pts.forEach((p, i) => {
      mp[i * 3] = p[0];
      mp[i * 3 + 1] = p[1];
      mp[i * 3 + 2] = p[2];
      ms[i] = rnd();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(mp, 3));
    geo.setAttribute("aSeed", new THREE.BufferAttribute(ms, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 4);
    const uniforms = {
      uTime: { value: 0 },
      uStir: { value: 0 },
      uAmp: { value: 0 },
      uPulse: { value: 0 },
      uRadius: { value: COC_RADIUS * 0.42 },
      uSize: { value: 9 },
      uColor: { value: new THREE.Color(0.9, 0.98, 1.0) },
      uEdge: { value: new THREE.Color(0.15, 0.5, 1.0) },
    };
    const mat = new THREE.ShaderMaterial({
      vertexShader: COC_MASS_VERT,
      fragmentShader: COC_MASS_FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    return { geo, mat, uniforms };
  }, []);

  useEffect(
    () => () => {
      shell.geo.dispose();
      shell.mat.dispose();
      veins.geo.dispose();
      veins.mat.dispose();
      mass.geo.dispose();
      mass.mat.dispose();
    },
    [shell, veins, mass]
  );

  const cCol = useRef(new THREE.Color());
  const eCol = useRef(new THREE.Color());
  const hot = useRef(new THREE.Color());
  const haloCol = useRef(new THREE.Color());

  useFrame((state, dt) => {
    const amp = getAmplitude();
    const mood = useJovaStore.getState().mood;
    const p = moodToWispParams(mood, "flame"); // electric blue -> white-hot cyan
    const et = state.clock.elapsedTime;
    const d = Math.min(0.05, dt);
    const arousal = Math.max(0, Math.min(1, mood.arousal));
    const warm = Math.max(0, Math.min(1, (mood.valence + 1) / 2));

    // integrate phases: rates rise with arousal + speaking, never sin(uTime * variableRate).
    // low valence slows the whole pod (calm/withdrawn); warm valence quickens it slightly.
    const tempo = 0.6 + 0.4 * warm;
    breathe.current += d * (0.7 + arousal * 0.5 + amp * 1.6) * tempo;
    flow.current += d * (1.2 + arousal * 1.4 + amp * 5.0) * tempo;  // circulation surges with voice
    stir.current += d * (0.5 + arousal * 0.7 + amp * 2.2) * tempo;  // inner mass roils
    pulse.current += d * (0.9 + arousal * 0.6 + amp * 2.8) * tempo; // heartbeat

    // colours from mood every frame; low valence dims, warm valence brightens
    const cc = cCol.current.setRGB(...p.coreColor);
    const ee = eCol.current.setRGB(...p.edgeColor);
    const hh = hot.current.setRGB(...p.coreColor).lerp(WHITE, 0.3);
    const dim = 0.55 + 0.45 * warm; // low valence => dimmer whole pod

    // shell
    const su = shell.uniforms;
    su.uTime.value = et;
    su.uBreathe.value = breathe.current;
    su.uAmp.value = amp;
    su.uArousal.value = arousal;
    su.uSize.value = 8.5 * (1 + amp * 0.25);
    (su.uColor.value as THREE.Color).copy(cc).multiplyScalar(dim);
    (su.uEdge.value as THREE.Color).copy(ee).multiplyScalar(dim);

    // veins
    const vu = veins.uniforms;
    vu.uTime.value = et;
    vu.uFlow.value = flow.current;
    vu.uBreathe.value = breathe.current;
    vu.uAmp.value = amp;
    vu.uSize.value = 9 * (1 + amp * 0.3);
    (vu.uColor.value as THREE.Color).copy(hh).multiplyScalar(dim);
    (vu.uEdge.value as THREE.Color).copy(ee).multiplyScalar(dim * 0.9);

    // inner mass
    const mu = mass.uniforms;
    mu.uTime.value = et;
    mu.uStir.value = stir.current;
    mu.uPulse.value = pulse.current;
    mu.uAmp.value = amp;
    mu.uSize.value = 9 * (1 + amp * 0.3);
    (mu.uColor.value as THREE.Color).copy(hh).multiplyScalar(dim);
    (mu.uEdge.value as THREE.Color).copy(cc).multiplyScalar(dim);

    // whole-pod life: a slow turn so the veins read in the round, plus a gentle organic sway/tilt and
    // a subtle whole-body beat synced to the breathing phase (bounded sin -> jump-free).
    if (sway.current) {
      sway.current.rotation.y += d * (0.1 + arousal * 0.12 + amp * 0.18);
      sway.current.rotation.z = Math.sin(et * 0.27) * 0.06;
      sway.current.rotation.x = Math.sin(et * 0.19) * 0.04;
      const beat = 1 + Math.sin(breathe.current) * (0.012 + amp * 0.02);
      sway.current.scale.setScalar(beat);
    }

    // ambient back-halo breathes with the pod
    if (haloRef.current) {
      const br = 1 + Math.sin(et * 0.8) * 0.04;
      const s = 7.5 * br * (1 + amp * 0.18);
      haloRef.current.scale.set(s, s * 1.15, 1);
      const mm = haloRef.current.material as THREE.SpriteMaterial;
      mm.color.copy(haloCol.current.copy(ee));
      mm.opacity = (0.12 + amp * 0.08) * dim;
    }
  });

  return (
    <group>
      {/* soft back-halo so the translucent pod reads against the dark (declarative material -> auto-disposed) */}
      <sprite ref={haloRef} position={[0, 0, -1.2]}>
        <spriteMaterial map={glow} transparent depthWrite={false} fog={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0.12} />
      </sprite>

      <group ref={sway}>
        {/* luminous heart at the centre of the gestating mass (kept small so it never white-outs) */}
        <Core scale={0.34} />
        {/* inner gestating mass */}
        <points geometry={mass.geo} material={mass.mat} />
        {/* circulation veins */}
        <points geometry={veins.geo} material={veins.mat} />
        {/* translucent egg shell (drawn last) */}
        <points geometry={shell.geo} material={shell.mat} />
      </group>

      {/* a few drifting bioluminescent spores around the pod */}
      <WispParticles count={70} color={[0.7, 0.95, 1.0]} edgeColor={[0.12, 0.4, 1.0]} size={7} speed={0.5} twinkle={0.7} reactive position={[0, 0, 0]} />
    </group>
  );
}

/**
 * Jovas hero forms on the "just Jova" screen - chosen in Demo Controls' "Jova view" or the Settings Jova editor.
 * AmbientGlow washes behind whichever form is selected; each form supplies its own accents.
 */
export function JovaStage({ style }: { style: JovaStyle }) {
  return (
    <group>
      <AmbientGlow />
      {style === "mycelium" && <Mycelium />}
      {style === "glyph" && <Glyph />}
      {style === "medusa" && <Medusa />}
      {style === "cocoon" && <Cocoon />}
      {style === "resonance" && <Resonance />}
      {style === "mothership" && <Mothership />}
      {style === "corona" && <Corona />}
      {style === "plasma" && <Plasma />}
      {style === "singularity" && <Singularity />}
    </group>
  );
}
