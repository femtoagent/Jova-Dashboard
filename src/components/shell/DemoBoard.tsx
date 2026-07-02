"use client";

import { useEffect, useState } from "react";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useDocStore } from "@/lib/docs/useDocStore";
import type { Demo, Team } from "@/lib/network/types";
import { ArrowSquareOut, ProjectorScreen, X } from "@phosphor-icons/react";

/**
 * The demo board on the wall — lights up when the team has something to SHOW you. Clicking it
 * opens a modal describing each demo with a link: vault paths open in the existing DocPanel,
 * http(s) links open in a new tab.
 */
export function DemoBoard({ team }: { team: Team }) {
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
        onClick={(e) => {
          e.stopPropagation();
          if (has) setOpen(true);
        }}
        disabled={!has}
        title={has ? `${demos.length} demo${demos.length === 1 ? "" : "s"} ready to show you` : "No demos yet"}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition ${
          has
            ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/20"
            : "cursor-default border-line bg-[#0d1120]/90 text-faint"
        }`}
        style={{ boxShadow: has ? "0 0 16px rgba(52,211,153,0.25)" : "0 3px 14px rgba(0,0,0,0.35)" }}
      >
        <ProjectorScreen size={15} weight={has ? "fill" : "regular"} className={has ? "motion-safe-anim animate-pulse" : ""} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">Demo</span>
        {has && (
          <span className="grid h-4 min-w-4 place-items-center rounded-full bg-emerald-300 px-1 text-[9px] font-bold text-black">
            {demos.length}
          </span>
        )}
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
