"use client";

import { create } from "zustand";
import type { StreamedDoc } from "@/lib/jova/types";

/**
 * State for the read-only live doc preview. Deliberately NOT a vault file-browser — it only tracks
 * the documents Jova produces during the session (so you can flip between, e.g., the two resumes she
 * just made) and which one is on screen. The panel auto-opens when a doc is filed (push-on-complete).
 */
interface DocState {
  open: boolean;
  /** the doc currently shown in the panel */
  current: StreamedDoc | null;
  /** docs produced this session, newest first, de-duped by path */
  recent: StreamedDoc[];
  /** a doc was just filed during a turn: record it + bring the panel forward onto it */
  showDoc: (doc: StreamedDoc) => void;
  setOpen: (open: boolean) => void;
  /** select one of the recent docs to view */
  select: (doc: StreamedDoc) => void;
}

const MAX_RECENT = 12;

export const useDocStore = create<DocState>((set) => ({
  open: false,
  current: null,
  recent: [],
  showDoc: (doc) =>
    set((st) => ({
      open: true,
      current: doc,
      recent: [doc, ...st.recent.filter((d) => d.path !== doc.path)].slice(0, MAX_RECENT),
    })),
  setOpen: (open) => set({ open }),
  select: (doc) => set({ current: doc, open: true }),
}));
