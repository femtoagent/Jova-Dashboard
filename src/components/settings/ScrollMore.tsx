"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * "▾ more" scroll affordance for the settings surfaces. Attach `scrollRef` to an `overflow-y-auto`
 * element; `more` is true while there's content below the fold. Recomputes on scroll, on content
 * changes (screen switch / async load / a form section expanding — via a MutationObserver on the
 * subtree), and on container/window resize. Render <ScrollMore show={more}/> inside the nearest
 * `relative` ancestor so the hint pins to the bottom edge.
 *
 * `scrollRef` is a CALLBACK ref so the observers re-bind when the scrolled node mounts/unmounts — e.g. a
 * screen that conditionally returns a full-screen takeover (the voice editor) and then comes back.
 */
export function useScrollMore() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const scrollRef = useCallback((node: HTMLElement | null) => setEl(node), []);
  const [more, setMore] = useState(false);

  useEffect(() => {
    if (!el) return;
    let raf: number | null = null;
    const check = () => {
      raf = null;
      // a 2px slack absorbs sub-pixel rounding so a non-scrolling page never flickers the hint
      setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 2);
    };
    const schedule = () => {
      if (raf == null) raf = requestAnimationFrame(check);
    };
    check();
    el.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule); // container resize (modal/window)
    ro.observe(el);
    const mo = new MutationObserver(schedule); // content grew/shrank (screen swap, data load)
    mo.observe(el, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    return () => {
      el.removeEventListener("scroll", schedule);
      ro.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", schedule);
      if (raf != null) cancelAnimationFrame(raf);
    };
  }, [el]);

  return { scrollRef, more };
}

/** The gradient + "▾ more" label, pinned to the bottom of the nearest `relative` ancestor. */
export function ScrollMore({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-8 items-end justify-center bg-gradient-to-t from-black/80 to-transparent">
      <span className="pb-1 text-[10px] text-white/45">▾ more</span>
    </div>
  );
}
