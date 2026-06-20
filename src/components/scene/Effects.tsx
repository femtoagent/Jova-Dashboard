"use client";

import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";

/** Bloom makes the wisp the light source of the scene; vignette deepens the mood. */
export function Effects() {
  return (
    <EffectComposer>
      <Bloom intensity={0.6} luminanceThreshold={0.5} luminanceSmoothing={0.3} mipmapBlur />
      <Vignette offset={0.32} darkness={0.62} />
    </EffectComposer>
  );
}
