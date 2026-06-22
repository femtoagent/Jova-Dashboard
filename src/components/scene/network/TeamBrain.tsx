"use client";

import * as THREE from "three";
import { useEffect, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { getGlowTexture } from "../textures";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useSettingsStore } from "@/lib/settings/useSettingsStore";
import type { Team } from "@/lib/network/types";

/** A team's central "brain": a glowing core + faint wireframe shell + halo, with a label.
 *  Overview: click to fly in, or click-drag to reposition the team. Focused: click pops a radial
 *  (Edit team / Zoom out) and shows the team in the bottom-left panel. */
export function TeamBrain({ team }: { team: Team }) {
  const glow = getGlowTexture();
  const core = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Sprite>(null);
  const alert = useRef<THREE.Sprite>(null);
  const dragRef = useRef<{ cleanup: () => void } | null>(null);
  const focusTeam = useNetworkStore((s) => s.focusTeam);
  const selectAgent = useNetworkStore((s) => s.selectAgent);
  const focused = useNetworkStore((s) => s.focusedTeamId === team.id);
  const radialOpen = useNetworkStore((s) => s.radialTeamId === team.id);
  const setRadialTeam = useNetworkStore((s) => s.setRadialTeam);
  const setTeamPosition = useNetworkStore((s) => s.setTeamPosition);
  const setDraggingTeam = useNetworkStore((s) => s.setDraggingTeam);
  const openTeam = useSettingsStore((s) => s.openTeam);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  useEffect(() => () => {
    dragRef.current?.cleanup(); // tear down an in-flight drag if this brain unmounts
    document.body.style.cursor = "auto";
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const working = team.agents.some((a) => a.tasks.length > 0);
    const needs = team.approvals.length > 0;
    const pulse = 1 + Math.sin(t * (needs ? 5 : 1.5) + team.position[0]) * (needs ? 0.14 : 0.06);
    const bright = working ? 1.5 : 1.0;
    if (core.current) core.current.scale.setScalar(pulse * (focused ? 1.12 : 1));
    if (halo.current) {
      const s = 2.2 * pulse * bright;
      halo.current.scale.set(s, s, 1);
      (halo.current.material as THREE.SpriteMaterial).opacity = (focused ? 0.6 : 0.42) * bright;
    }
    if (alert.current) {
      const ap = needs ? 0.5 + 0.5 * Math.sin(t * 5) : 0;
      const s = 3.0 + ap * 1.4;
      alert.current.scale.set(s, s, 1);
      (alert.current.material as THREE.SpriteMaterial).opacity = needs ? 0.2 + ap * 0.4 : 0;
    }
  });

  // Focused: a click selects the team (bottom-left panel) and toggles the in-scene radial.
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!focused) return; // overview is handled by onPointerDown (click vs drag)
    const wasOpen = radialOpen;
    selectAgent(team.id, null); // deselect any agent → the team panel shows (also clears radials)
    setRadialTeam(wasOpen ? null : team.id);
  };

  // Overview: press-and-drag to move the team; a press without drag flies in.
  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (focused) return;
    const dom = gl.domElement;
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    let raf = 0;
    let pending: [number, number, number] | null = null;
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(camDir, new THREE.Vector3(...team.position));
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const hit = new THREE.Vector3();

    const flush = () => {
      raf = 0;
      if (pending) {
        setTeamPosition(team.id, pending);
        pending = null;
      }
    };
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
      if (!moved) {
        moved = true;
        setDraggingTeam(team.id); // freeze camera parallax so the brain pins to the cursor
        document.body.style.cursor = "grabbing";
      }
      const rect = dom.getBoundingClientRect();
      ndc.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -(((ev.clientY - rect.top) / rect.height) * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(plane, hit)) {
        pending = [hit.x, hit.y, hit.z];
        if (!raf) raf = requestAnimationFrame(flush); // coalesce writes to one per frame
      }
    };
    const cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      dom.removeEventListener("pointermove", move);
      dom.removeEventListener("pointerup", up);
      dom.removeEventListener("pointercancel", up);
      try {
        dom.releasePointerCapture(e.pointerId);
      } catch {
        /* capture may not be set */
      }
      document.body.style.cursor = "auto";
      setDraggingTeam(null);
      dragRef.current = null;
    };
    const up = () => {
      const didMove = moved;
      if (pending) {
        setTeamPosition(team.id, pending); // flush the final position
        pending = null;
      }
      cleanup();
      if (!didMove) focusTeam(team.id); // it was a click, not a drag → fly in
    };

    try {
      dom.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dom.addEventListener("pointermove", move);
    dom.addEventListener("pointerup", up);
    dom.addEventListener("pointercancel", up);
    dragRef.current = { cleanup };
  };

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = focused ? "pointer" : "grab";
  };
  const onOut = () => {
    document.body.style.cursor = "auto";
  };

  return (
    <group position={team.position}>
      {/* amber alert halo — only visible when an approval is pending */}
      <sprite ref={alert}>
        <spriteMaterial map={glow} color="#ffd27f" transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0} />
      </sprite>

      <sprite ref={halo}>
        <spriteMaterial map={glow} color={team.color} transparent depthWrite={false} toneMapped={false} blending={THREE.AdditiveBlending} opacity={0.42} />
      </sprite>

      {/* clickable / draggable solid core */}
      <mesh ref={core} onClick={onClick} onPointerDown={onPointerDown} onPointerOver={onOver} onPointerOut={onOut}>
        <icosahedronGeometry args={[0.5, 3]} />
        <meshBasicMaterial color={team.color} toneMapped={false} />
      </mesh>

      {/* faint wireframe shell — the "brain" texture */}
      <mesh scale={1.12}>
        <icosahedronGeometry args={[0.5, 2]} />
        <meshBasicMaterial color={team.color} wireframe transparent opacity={0.28} toneMapped={false} depthWrite={false} />
      </mesh>

      <Html position={[0, 1.05, 0]} center style={{ pointerEvents: "none" }}>
        <div
          style={{
            whiteSpace: "nowrap",
            fontSize: 12,
            letterSpacing: 1,
            fontWeight: 600,
            color: team.color,
            textShadow: "0 0 8px rgba(0,0,0,0.9)",
            opacity: focused ? 1 : 0.82,
            fontFamily: "ui-sans-serif, system-ui, sans-serif",
          }}
        >
          {team.name.toUpperCase()}
          {team.approvals.length > 0 && <span style={{ color: "#ffd27f" }}>{"  ⚠"}</span>}
        </div>
      </Html>

      {focused && radialOpen && (
        <Html position={[0, 0, 0]} center style={{ pointerEvents: "none" }}>
          <div style={{ position: "relative", width: 0, height: 0 }}>
            {[
              { icon: "✎", label: "Edit team", action: () => { setRadialTeam(null); openTeam(team.id); } },
              { icon: "⤢", label: "Zoom out", action: () => { setRadialTeam(null); focusTeam(null); } },
            ].map((o, i, arr) => {
              const spread = 60;
              const ang = -90 - (spread * (arr.length - 1)) / 2 + i * spread;
              const r = 56;
              const x = Math.cos((ang * Math.PI) / 180) * r;
              const y = Math.sin((ang * Math.PI) / 180) * r;
              return (
                <button
                  key={o.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    o.action();
                  }}
                  title={o.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border text-[14px] leading-none backdrop-blur-md transition hover:brightness-125"
                  style={{
                    position: "absolute",
                    left: x,
                    top: y,
                    transform: "translate(-50%, -50%)",
                    pointerEvents: "auto",
                    borderColor: `${team.color}aa`,
                    background: `${team.color}30`,
                    color: team.color,
                    boxShadow: `0 0 10px ${team.color}55`,
                    animation: "radial-pop 240ms cubic-bezier(0.34, 1.56, 0.64, 1) backwards",
                    animationDelay: `${i * 45}ms`,
                  }}
                >
                  {o.icon}
                </button>
              );
            })}
          </div>
        </Html>
      )}
    </group>
  );
}
