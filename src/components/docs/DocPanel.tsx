"use client";

import { useRef, useState } from "react";
import { useDocStore } from "@/lib/docs/useDocStore";

/** BFF route that serves a vault doc's bytes (PDF inline). */
const fileUrl = (path: string) => `/api/documents/file?path=${encodeURIComponent(path)}`;

const WIDTH_KEY = "jova.docPanelWidth";
const MIN_W = 360;

function initialWidth(): number {
  if (typeof window === "undefined") return 560;
  const saved = Number(window.localStorage.getItem(WIDTH_KEY));
  if (saved && saved >= 200) return clampWidth(saved);
  return clampWidth(Math.round(Math.min(window.innerWidth * 0.5, 680)));
}

function clampWidth(w: number): number {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1400;
  // on phones narrower than MIN_W + margin, the viewport (minus a sliver) wins over MIN_W
  const min = Math.min(MIN_W, vw - 16);
  const max = Math.max(min, vw - 80);
  return Math.max(min, Math.min(w, max));
}

/**
 * Read-only live preview of the documents Jova produces. Auto-opens when a doc is filed mid-turn
 * (the `doc` stream event -> useDocStore.showDoc). NOT a vault browser and NOT editable — to change
 * a doc you ask Jova and watch the new version replace it here. Resizable via the left-edge handle.
 */
export function DocPanel() {
  const open = useDocStore((s) => s.open);
  const current = useDocStore((s) => s.current);
  const recent = useDocStore((s) => s.recent);
  const setOpen = useDocStore((s) => s.setOpen);
  const select = useDocStore((s) => s.select);

  const [width, setWidth] = useState<number>(initialWidth);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    // panel is right-anchored, so its width is the distance from the cursor to the right edge
    setWidth(clampWidth(window.innerWidth - e.clientX));
  };
  const endDrag = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    try {
      window.localStorage.setItem(WIDTH_KEY, String(Math.round(width)));
    } catch {}
  };

  // Nothing has been produced and the panel was never opened -> stay out of the way entirely.
  if (!open && recent.length === 0) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="Open documents"
        className="fixed right-0 top-1/2 z-30 -translate-y-1/2 rounded-l-lg border border-r-0 border-white/15 bg-black/50 px-2 py-3 text-[11px] tracking-wide text-white/70 backdrop-blur-md transition hover:bg-white/10 [writing-mode:vertical-rl]"
      >
        Docs{recent.length ? ` · ${recent.length}` : ""}
      </button>
    );
  }

  return (
    <aside
      style={{ width }}
      className={`fixed right-0 top-0 z-50 flex h-dvh flex-col border-l border-white/10 bg-black/65 backdrop-blur-xl ${dragging ? "select-none" : ""}`}
    >
      {/* Left-edge drag handle — resize the panel. Pointer capture keeps the drag alive over the iframe. */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        title="Drag to resize"
        className={`absolute left-0 top-0 z-20 h-full w-1.5 cursor-ew-resize touch-none transition-colors ${
          dragging ? "bg-cyan-300/40" : "bg-white/5 hover:bg-cyan-300/30"
        }`}
      />

      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3 pl-5">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-cyan-100">Documents</div>
          <div className="truncate text-[11px] text-white/40">
            {current ? `${current.category ? current.category + " / " : ""}${current.name}` : "Live preview of what Jova creates"}
          </div>
        </div>
        <button
          onClick={() => setOpen(false)}
          title="Close"
          className="shrink-0 rounded-lg px-2 py-1 text-white/50 transition hover:bg-white/10 hover:text-white/80"
        >
          ✕
        </button>
      </header>

      {recent.length > 1 && (
        <div className="no-scrollbar flex gap-1 overflow-x-auto border-b border-white/10 px-3 py-2 pl-5">
          {recent.map((d) => (
            <button
              key={d.path}
              onClick={() => select(d)}
              title={d.path}
              className={`shrink-0 rounded-md border px-2 py-1 text-[11px] transition ${
                current?.path === d.path
                  ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-50"
                  : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
              }`}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}

      {/* while dragging, disable the iframe's pointer events so it can't swallow the drag */}
      <div className={`min-h-0 flex-1 ${dragging ? "pointer-events-none" : ""}`}>
        {!current ? (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-white/40">
            Documents Jova creates will appear here, live.
          </div>
        ) : current.kind === "pdf" ? (
          // key on path+mtime so a re-render of the SAME doc remounts the iframe and reloads the new version
          <iframe
            key={current.path + current.mtime}
            src={fileUrl(current.path)}
            title={current.name}
            className="h-full w-full border-0 bg-white"
          />
        ) : (
          <div className="grid h-full place-items-center px-6 text-center">
            <div>
              <div className="mb-1 text-sm text-white/80">{current.name}</div>
              <div className="mb-4 text-[11px] uppercase tracking-wide text-white/35">
                {current.kind || "file"} · {current.category || "vault"}
              </div>
              <a
                href={fileUrl(current.path)}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-cyan-300/30 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-50 transition hover:bg-cyan-400/20"
              >
                Open {(current.kind || "file").toUpperCase()}
              </a>
              <div className="mt-2 text-[11px] text-white/30">Inline preview is PDF-only; this opens in a new tab.</div>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
