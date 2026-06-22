"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Type-to-confirm removal modal (the "special permission" gate). Shows what removal does, and only
 * enables the destructive button once the exact name is typed. Sits above the settings overlay.
 */
export function ConfirmRemoveDialog({
  kind,
  name,
  impact,
  onConfirm,
  onCancel,
}: {
  kind: "team" | "agent";
  name: string;
  impact: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const downOnScrim = useRef(false);
  const matches = typed.trim() === name.trim();

  // Own Escape at the window (capture phase) so it cancels THIS dialog and doesn't also tear down
  // the settings overlay's own window-level Escape handler.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-[fade_150ms_ease]"
      onMouseDown={(e) => {
        downOnScrim.current = e.target === e.currentTarget;
      }}
      onMouseUp={(e) => {
        if (downOnScrim.current && e.target === e.currentTarget) onCancel();
        downOnScrim.current = false;
      }}
    >
      <div className="w-[min(440px,94vw)] rounded-2xl border border-rose-300/20 bg-black/70 p-5 text-white/85 shadow-[0_0_60px_rgba(255,80,120,0.12)] backdrop-blur-xl">
        <div className="mb-2 text-sm font-semibold text-rose-200">
          Remove {kind} &ldquo;{name}&rdquo;?
        </div>
        <div className="mb-3 space-y-1 text-[12px] leading-relaxed text-white/65">{impact}</div>
        <label className="mb-1 block text-[11px] uppercase tracking-wider text-white/40">
          Type <span className="text-white/70">{name}</span> to confirm
        </label>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && matches) onConfirm();
          }}
          placeholder={name}
          className="mb-3 w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-white outline-none focus:border-rose-300/40"
        />
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white/70 transition hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!matches}
            className={`rounded-lg border px-3 py-1.5 text-sm transition ${
              matches
                ? "border-rose-300/40 bg-rose-500/30 text-rose-50 hover:bg-rose-500/40"
                : "cursor-not-allowed border-white/10 bg-white/5 text-white/30"
            }`}
          >
            Remove {kind}
          </button>
        </div>
      </div>
    </div>
  );
}
