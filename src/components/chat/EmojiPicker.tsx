"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EMOJI_GROUPS, QUICK_REACTIONS, searchEmoji } from "@/lib/jova/emoji";

const WIDTH = 256; // w-64
const GAP = 6;
const MARGIN = 8;

/**
 * A glassy emoji popover for tapping a reaction onto a message. Rendered in a PORTAL with fixed
 * positioning anchored to the trigger button, so it floats above the chat (Discord-style) instead of
 * being clipped by the message list's overflow. It opens above the button when there's room, else
 * below, and clamps horizontally to stay on-screen. Closes on pick, Escape, or an outside click.
 */
export function EmojiPicker({
  anchorRef,
  onPick,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: "hidden" });
  const ref = useRef<HTMLDivElement>(null);
  const results = searchEmoji(q);

  // Position the popover (position: fixed, viewport coords) anchored to the trigger but CLAMPED to the
  // chat pane so it can't break out of the chat box, and capped at a Discord-ish height.
  useLayoutEffect(() => {
    const place = () => {
      const a = anchorRef.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      // clamp bounds = the chat pane's rect (falls back to the viewport if not found)
      const paneEl = a.closest("[data-chat-pane]") as HTMLElement | null;
      const pr = paneEl?.getBoundingClientRect();
      const top = (pr?.top ?? 0) + MARGIN;
      const bottom = (pr?.bottom ?? window.innerHeight) - MARGIN;
      const left0 = (pr?.left ?? 0) + MARGIN;
      const right0 = (pr?.right ?? window.innerWidth) - MARGIN;
      // never taller than the pane's usable height, and never more than a sensible cap
      const capH = Math.min(420, bottom - top);
      const left = Math.max(left0, Math.min(r.left, right0 - WIDTH));
      const roomAbove = r.top - GAP - top;
      const roomBelow = bottom - (r.bottom + GAP);
      if (roomAbove >= roomBelow) {
        // open up: bottom sits just above the button; height capped so the top stays inside the pane
        setStyle({ position: "fixed", left, bottom: window.innerHeight - r.top + GAP, maxHeight: Math.min(capH, roomAbove), zIndex: 1000 });
      } else {
        setStyle({ position: "fixed", left, top: r.bottom + GAP, maxHeight: Math.min(capH, roomBelow), zIndex: 1000 });
      }
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true); // reposition if the chat scrolls under it
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchorRef]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || anchorRef.current?.contains(t)) return; // inside picker or trigger
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, anchorRef]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={ref}
      style={{ width: WIDTH, ...style }}
      className="flex flex-col rounded-xl border border-white/15 bg-black/90 p-2 shadow-[0_8px_40px_rgba(0,0,0,0.6)] backdrop-blur-xl"
    >
      <div className="mb-1.5 flex shrink-0 flex-wrap gap-0.5">
        {QUICK_REACTIONS.map((e) => (
          <button key={e} onClick={() => onPick(e)} className="rounded-md px-1 py-0.5 text-lg leading-none transition hover:bg-white/15">
            {e}
          </button>
        ))}
      </div>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search emoji…"
        className="mb-1.5 w-full shrink-0 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[12px] text-white outline-none placeholder:text-white/35 focus:border-cyan-300/40"
      />
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto">
        {results ? (
          results.length ? (
            <div className="grid grid-cols-7 gap-0.5">
              {results.map((it) => (
                <button key={it.e} title={it.k} onClick={() => onPick(it.e)} className="rounded-md py-1 text-lg leading-none transition hover:bg-white/15">
                  {it.e}
                </button>
              ))}
            </div>
          ) : (
            <p className="px-1 py-3 text-center text-[11px] text-white/35">No emoji for “{q}”.</p>
          )
        ) : (
          EMOJI_GROUPS.map((g) => (
            <div key={g.name} className="mb-1">
              <div className="px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/30">{g.name}</div>
              <div className="grid grid-cols-7 gap-0.5">
                {g.items.map((it) => (
                  <button key={it.e} title={it.k} onClick={() => onPick(it.e)} className="rounded-md py-1 text-lg leading-none transition hover:bg-white/15">
                    {it.e}
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>,
    document.body,
  );
}
