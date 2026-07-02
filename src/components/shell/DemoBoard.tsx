"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useDocStore } from "@/lib/docs/useDocStore";
import type { Demo, Team } from "@/lib/network/types";
import { ArrowSquareOut, Play, ProjectorScreen, X } from "@phosphor-icons/react";

/**
 * The office TV on the wall. OFF when there's nothing to show — a dark screen with a standby
 * LED, pure set dressing. When the team readies a demo it TURNS ON: glow, play glyph, the
 * demo title as a slow ticker, and an "on air" lamp above the bezel. Tap → the demo modal
 * (vault paths open in the DocPanel, http links open in a new tab).
 */
export function DemoBoard({ team, style }: { team: Team; style?: CSSProperties }) {
  // select the stable array, filter OUTSIDE the selector (a filtering selector returns a fresh
  // array every snapshot and loops the render)
  const allDemos = useNetworkStore((s) => s.demos);
  const demos = allDemos.filter((d) => d.teamId === team.id);
  const [open, setOpen] = useState(false);
  const has = demos.length > 0;

  // if the last demo is dismissed elsewhere while the modal is up, close it
  useEffect(() => {
    if (!has) setOpen(false);
  }, [has]);

  return (
    <>
      <button
        data-demo-board
        data-on={has ? "true" : "false"}
        onClick={(e) => {
          e.stopPropagation();
          if (has) setOpen(true);
        }}
        disabled={!has}
        title={has ? `${demos.length} demo${demos.length === 1 ? "" : "s"} ready to show you` : "The office TV — off until the team has a demo"}
        className={`absolute block ${has ? "cursor-pointer" : "cursor-default"}`}
        style={style}
      >
        {/* on-air lamp above the bezel */}
        <span
          className={`absolute -top-2 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full ${has ? "motion-safe-anim animate-pulse" : ""}`}
          style={{ background: has ? "#f87171" : "#252c42", boxShadow: has ? "0 0 6px #f87171" : "none" }}
          aria-hidden
        />
        {/* the screen */}
        <span
          className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden rounded-[5px] border-2 transition-shadow duration-700"
          style={{
            background: has ? "linear-gradient(160deg, #0b2921 0%, #071912 60%, #05120d 100%)" : "linear-gradient(160deg, #0a0d17 0%, #070910 100%)",
            borderColor: "#1c2338",
            boxShadow: has ? "0 0 22px rgba(52,211,153,0.35), inset 0 0 18px rgba(52,211,153,0.12)" : "inset 0 1px 0 rgba(190,215,255,0.06)",
          }}
        >
          {has ? (
            <>
              <span className="grid h-6 w-6 place-items-center rounded-full border border-emerald-300/60 bg-emerald-400/15 text-emerald-200">
                <Play size={11} weight="fill" />
              </span>
              {demos.length > 1 && (
                <span className="absolute right-1 top-1 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-emerald-300 px-0.5 text-[8px] font-bold text-black">
                  {demos.length}
                </span>
              )}
              {/* title ticker along the bottom of the screen — padding-left:100% starts the text
                  just off the right edge so the crawl always crosses the whole screen */}
              <span className="absolute inset-x-0 bottom-0.5 overflow-hidden">
                <span
                  className="motion-safe-anim inline-block whitespace-nowrap text-[8px] font-medium tracking-wide text-emerald-100/85"
                  style={{ animation: "tv-ticker 7s linear infinite", paddingLeft: "100%" }}
                >
                  {demos[0]!.title}
                </span>
              </span>
            </>
          ) : (
            <>
              <ProjectorScreen size={13} className="text-[#20283e]" />
              {/* standby LED */}
              <span className="absolute bottom-1 right-1.5 h-1 w-1 rounded-full bg-[#2b3654]" aria-hidden />
            </>
          )}
        </span>
        {/* wall mount */}
        <span className="absolute -bottom-1.5 left-1/2 h-1.5 w-5 -translate-x-1/2 rounded-b-sm bg-[#1c2338]" aria-hidden />
      </button>

      {open && <DemoModal team={team} demos={demos} onClose={() => setOpen(false)} />}
    </>
  );
}

function DemoModal({ team, demos, onClose }: { team: Team; demos: Demo[]; onClose: () => void }) {
  const resolveDemo = useNetworkStore((s) => s.resolveDemo);
  const showDoc = useDocStore((s) => s.showDoc);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const view = (d: Demo) => {
    if (/^https?:\/\//i.test(d.url)) {
      window.open(d.url, "_blank", "noopener,noreferrer");
    } else {
      const name = d.url.split("/").pop() ?? d.url;
      const category = d.url.split("/").slice(0, -1).join("/");
      const kind = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "pdf";
      showDoc({ path: d.url, name, category, kind, mtime: Date.now() });
      onClose();
    }
  };

  return (
    <div
      data-demo-modal
      className="fixed inset-0 z-[900] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-[fade_150ms_ease]"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-[min(460px,94vw)] overflow-hidden rounded-2xl border border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <ProjectorScreen size={16} weight="fill" className="text-emerald-300" />
          <span className="text-sm font-semibold text-bright">{team.name} wants to show you</span>
          <button
            onClick={onClose}
            title="Close"
            className="ml-auto grid h-8 w-8 place-items-center rounded-lg text-faint transition hover:bg-raise hover:text-mist"
          >
            <X size={15} weight="bold" />
          </button>
        </div>

        <div className="max-h-[60dvh] space-y-3 overflow-y-auto p-4">
          {demos.map((d) => (
            <div key={d.id} className="rounded-xl border border-line bg-raise/50 p-3">
              <div className="mb-1 text-sm font-semibold text-bright">{d.title}</div>
              <p className="mb-2.5 text-[12px] leading-relaxed text-mist">{d.description}</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => view(d)}
                  className="flex items-center gap-1.5 rounded-lg border border-emerald-300/40 bg-emerald-400/15 px-3 py-1.5 text-[12px] font-medium text-emerald-100 transition hover:bg-emerald-400/25"
                >
                  <ArrowSquareOut size={13} weight="bold" />
                  View demo
                </button>
                <button
                  onClick={() => resolveDemo(d.id)}
                  className="rounded-lg border border-line bg-raise px-3 py-1.5 text-[12px] text-mist transition hover:bg-raise/70 hover:text-bright"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
