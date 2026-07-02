"use client";

import { useEffect, useRef } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { moodToWispParams } from "@/lib/mood";
import { getAmplitude } from "@/lib/audio/amplitude";

const to255 = (c: [number, number, number]) =>
  `${Math.round(c[0] * 255)} ${Math.round(c[1] * 255)} ${Math.round(c[2] * 255)}`;

/**
 * Jova on the default (2D) stage — the light-on-old-devices sibling of the WebGL hero forms.
 * Layered CSS gradients driven by the same signals as the 3D wisp: mood through
 * `moodToWispParams` (colors / intensity / speed / scale via CSS variables), live speech
 * amplitude through `getAmplitude` (an rAF sets `--amp` while she speaks), plus the
 * listening ring and a thinking sheen. Transform/opacity only — no filters per frame.
 */
export function JovaPresence({ docked = false }: { docked?: boolean }) {
  const wispState = useJovaStore((s) => s.wispState);
  const listening = useJovaStore((s) => s.listening);
  const thinking = useJovaStore((s) => s.thinking);
  const mood = useJovaStore((s) => s.mood);
  const openJovaChat = useJovaStore((s) => s.openJovaChat);
  const rootRef = useRef<HTMLButtonElement>(null);

  const speaking = wispState === "speaking";
  const receded = wispState === "receded";

  // Live speech amplitude -> --amp. Runs only while she speaks; parks at 0 otherwise.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (!speaking) {
      el.style.setProperty("--amp", "0");
      return;
    }
    let raf = 0;
    const loop = () => {
      el.style.setProperty("--amp", getAmplitude().toFixed(3));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [speaking]);

  const p = moodToWispParams(mood, "flame");
  const size = docked ? "clamp(56px, 9vmin, 76px)" : "clamp(190px, 42vmin, 360px)";

  return (
    <button
      ref={rootRef}
      onClick={openJovaChat}
      title="Talk to Jova"
      aria-label="Jova — open her chat"
      data-jova-presence={docked ? "docked" : "hero"}
      className="group relative grid place-items-center rounded-full outline-offset-8 transition-opacity duration-700"
      style={
        {
          width: size,
          height: size,
          opacity: receded ? 0.5 : 1,
          "--core": to255(p.coreColor),
          "--edge": to255(p.edgeColor),
          "--glow": String(p.intensity),
          "--amp": "0",
          "--breathe": `${(docked ? 5.2 : 6.4) / Math.max(p.speed, 0.2)}s`,
        } as React.CSSProperties
      }
    >
      {/* aura — the wide soft field around her */}
      <span
        aria-hidden
        className="motion-safe-anim pointer-events-none absolute inset-[-55%] rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgb(var(--edge) / calc(0.34 * var(--glow))) 0%, rgb(var(--edge) / 0.08) 42%, transparent 68%)",
          animation: "presence-breathe var(--breathe) ease-in-out infinite",
        }}
      />

      {/* speaking ripples */}
      {speaking && (
        <>
          {[0, 1].map((i) => (
            <span
              key={i}
              aria-hidden
              className="motion-safe-anim pointer-events-none absolute inset-0 rounded-full border"
              style={{
                borderColor: "rgb(var(--edge) / 0.5)",
                animation: `presence-ripple 1.9s ease-out ${i * 0.85}s infinite`,
              }}
            />
          ))}
        </>
      )}

      {/* thinking sheen — a slow rotating highlight ring */}
      {thinking && (
        <span
          aria-hidden
          className="motion-safe-anim pointer-events-none absolute inset-[-7%] rounded-full"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, rgb(var(--core) / 0.5) 40deg, transparent 90deg)",
            WebkitMask: "radial-gradient(circle, transparent 62%, black 66%, black 72%, transparent 76%)",
            mask: "radial-gradient(circle, transparent 62%, black 66%, black 72%, transparent 76%)",
            animation: "presence-spin 2.6s linear infinite",
          }}
        />
      )}

      {/* listening ring — “she hears you” */}
      {listening && (
        <span
          aria-hidden
          className="motion-safe-anim pointer-events-none absolute inset-[-13%] rounded-full border-2"
          style={{
            borderColor: "rgb(var(--core) / 0.75)",
            boxShadow: "0 0 22px rgb(var(--core) / 0.45)",
            animation: "presence-breathe 1.5s ease-in-out infinite",
          }}
        />
      )}

      {/* core — scales with breath at rest, with her voice while speaking */}
      <span
        aria-hidden
        className="motion-safe-anim relative block h-[62%] w-[62%] rounded-full transition-transform duration-100"
        style={{
          background:
            "radial-gradient(circle at 38% 34%, rgb(var(--core) / 0.98) 0%, rgb(var(--core) / 0.85) 22%, rgb(var(--edge) / 0.9) 58%, rgb(var(--edge) / 0.35) 82%, transparent 100%)",
          boxShadow:
            "0 0 34px rgb(var(--edge) / calc(0.65 * var(--glow))), 0 0 110px rgb(var(--edge) / calc(0.4 * var(--glow))), inset 0 0 26px rgb(var(--core) / 0.5)",
          transform: speaking ? "scale(calc(1 + var(--amp) * 0.22))" : undefined,
          animation: speaking ? "none" : "presence-breathe var(--breathe) ease-in-out infinite",
        }}
      />

      {/* inner spark */}
      <span
        aria-hidden
        className="pointer-events-none absolute h-[16%] w-[16%] rounded-full"
        style={{
          background: "radial-gradient(circle, rgb(255 255 255 / 0.95) 0%, rgb(var(--core) / 0.55) 55%, transparent 100%)",
          filter: "blur(1px)",
          opacity: speaking ? "calc(0.65 + var(--amp) * 0.35)" : 0.75,
        }}
      />
    </button>
  );
}
