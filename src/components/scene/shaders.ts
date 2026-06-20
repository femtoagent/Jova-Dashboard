// GLSL for Jova's particle cloud — the spores that swirl around the Light Orb's core. All motion
// lives in the vertex shader (no per-frame CPU writes). uDisperse/uTrail stay 0 now (she's gathered
// and still), but the shader still supports them if motion is ever reintroduced.

export const WISP_PARTICLE_VERT = /* glsl */ `
  attribute float aSeed;
  attribute float aScale;
  uniform float uTime;
  uniform float uPhase;   // CPU-integrated swirl phase, so a changing speed never JUMPS the angle
  uniform float uSize;
  uniform float uDisperse;
  uniform float uAmplitude;
  uniform float uTwinkle;
  uniform vec3 uTrail;        // local-space trail vector (= -worldVelocity / groupScale)
  varying float vAlpha;
  varying float vSeed;
  float hash11(float p){ p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
  void main(){
    float seed = aSeed;
    vSeed = seed;
    float t = uPhase + seed * 6.2831;
    float life = fract(uTime * (0.22 + 0.4 * hash11(seed)) + seed);

    // alive swirl: helix that rises and widens off the core as it ages
    float ang = seed * 6.2831 + t * (0.8 + 0.6 * hash11(seed + 1.0));
    float baseR = mix(0.04, 0.16, hash11(seed + 2.0));
    float r = baseR * (1.0 + life * 1.4) * (1.0 + uDisperse * 3.4);
    float rise = mix(0.18, 0.5, hash11(seed + 3.0)) * life * (1.0 - uDisperse * 0.55);

    vec3 pos = vec3(cos(ang) * r, rise, sin(ang) * r);

    // spill a little below the core (cloud-with-a-core feel)
    float down = hash11(seed + 4.0);
    pos.y -= down * 0.18 * (1.0 - life);

    pos.y -= uDisperse * (0.3 + down * 0.7);
    pos.y += uDisperse * sin(t * 0.9 + seed * 5.0) * 0.25;

    pos += uTrail * (0.3 + 0.8 * hash11(seed + 5.0));

    float fade = sin(life * 3.14159265);
    float tw = mix(1.0, 0.45 + 0.55 * sin(t * 3.0 + seed * 12.0), uTwinkle);
    vAlpha = fade * tw;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    float size = uSize * aScale * (0.6 + 0.8 * hash11(seed)) * (1.0 + uAmplitude * 0.8);
    gl_PointSize = clamp(size * (10.0 / -mv.z), 0.0, 64.0);
    gl_Position = projectionMatrix * mv;
  }
`;

export const WISP_PARTICLE_FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uColor;
  uniform vec3 uEdgeColor;
  uniform float uAmplitude;
  varying float vAlpha;
  varying float vSeed;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float glow = smoothstep(0.5, 0.0, d);
    float coreDot = smoothstep(0.26, 0.0, d);
    float a = glow * glow * 0.55 + coreDot;       // soft halo + chunky bright center
    vec3 col = mix(uColor, uEdgeColor, vSeed);
    col += vec3(0.5, 0.42, 0.28) * coreDot;        // hot white-gold heart
    gl_FragColor = vec4(col * (1.0 + uAmplitude * 0.6), clamp(a, 0.0, 1.0) * vAlpha);
  }
`;
