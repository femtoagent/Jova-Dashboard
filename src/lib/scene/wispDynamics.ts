"use client";

/**
 * Shared, render-free channel for the wisp's live motion — mirrors the amplitude.ts pattern so the
 * scene reads it in useFrame without re-rendering React. WispRig writes it every frame; the wisp's
 * particles (trail spread), her flame/orb (aliveness) and her light (illumination) read it.
 */

export interface WispDynamics {
  /** world position of the wisp core */
  x: number;
  y: number;
  z: number;
  /** world-space velocity (units/sec), drives how far particles trail behind her */
  vx: number;
  vy: number;
  vz: number;
  /** speed = |velocity|, convenience for trail spread */
  speed: number;
  /** 0 = gathered tight around the core (present), 1 = dispersed, orbiting the trunk (receded) */
  disperse: number;
  /** uniform scale of the wisp group (so children can convert world<->local distances) */
  scale: number;
}

const state: WispDynamics = {
  x: 0, y: 0, z: 0,
  vx: 0, vy: 0, vz: 0,
  speed: 0,
  disperse: 0,
  scale: 1,
};

export function setWispDynamics(next: Partial<WispDynamics>): void {
  Object.assign(state, next);
}

export function getWispDynamics(): Readonly<WispDynamics> {
  return state;
}
