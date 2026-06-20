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
