import * as THREE from "three";

/** Soft radial sprite used for the wisp's glow/halo and the home-tree glow. Canvas-built, no art file. */
export function makeGlowTexture(size = 128): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0.0, "rgba(255,255,255,1)");
  g.addColorStop(0.2, "rgba(255,255,255,0.7)");
  g.addColorStop(0.5, "rgba(255,255,255,0.22)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// One small texture reused for the whole app lifetime.
let _glow: THREE.Texture | null = null;
export function getGlowTexture(): THREE.Texture {
  if (!_glow) _glow = makeGlowTexture();
  return _glow;
}

/** Soft teardrop/petal alpha — base bright, tip fading. Used by Jova's "Bloom" (lotus of light). */
export function makePetalTexture(size = 128): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const cx = size / 2;
  // teardrop: pointed tip at top, rounded base at bottom
  ctx.beginPath();
  ctx.moveTo(cx, size * 0.06);
  ctx.bezierCurveTo(size * 0.92, size * 0.42, size * 0.78, size * 0.98, cx, size * 0.96);
  ctx.bezierCurveTo(size * 0.22, size * 0.98, size * 0.08, size * 0.42, cx, size * 0.06);
  ctx.closePath();
  // brightest in the lower-middle of the petal, fading to the tip and edges
  const g = ctx.createRadialGradient(cx, size * 0.66, 0, cx, size * 0.6, size * 0.62);
  g.addColorStop(0.0, "rgba(255,255,255,0.95)");
  g.addColorStop(0.45, "rgba(255,255,255,0.5)");
  g.addColorStop(1.0, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let _petal: THREE.Texture | null = null;
export function getPetalTexture(): THREE.Texture {
  if (!_petal) _petal = makePetalTexture();
  return _petal;
}
