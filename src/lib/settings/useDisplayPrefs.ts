"use client";

import { create } from "zustand";

const ROOM_KEY = "jova.teamRoom";
const THEME_KEY = "jova.officeTheme";

/**
 * Display preferences for the Default shell — currently the Team Room toggle (drop into a
 * decorated office when you focus a team) and its office theme. Persisted; hydrated once on
 * mount by CommandCenter like the other client-only pref stores.
 */
interface DisplayPrefs {
  /** show the gamified Team Room when a team is focused (off = keep the constellation map) */
  teamRoom: boolean;
  /** office backdrop theme id (see lib/network/officeThemes) */
  officeTheme: string;
  hydrate: () => void;
  setTeamRoom: (v: boolean) => void;
  setOfficeTheme: (id: string) => void;
}

export const useDisplayPrefs = create<DisplayPrefs>((set) => ({
  teamRoom: true,
  officeTheme: "midnight",
  hydrate: () => {
    if (typeof window === "undefined") return;
    try {
      const room = window.localStorage.getItem(ROOM_KEY);
      const theme = window.localStorage.getItem(THEME_KEY);
      set({
        ...(room !== null ? { teamRoom: room === "1" } : {}),
        ...(theme ? { officeTheme: theme } : {}),
      });
    } catch {}
  },
  setTeamRoom: (v) => {
    try {
      window.localStorage.setItem(ROOM_KEY, v ? "1" : "0");
    } catch {}
    set({ teamRoom: v });
  },
  setOfficeTheme: (id) => {
    try {
      window.localStorage.setItem(THEME_KEY, id);
    } catch {}
    set({ officeTheme: id });
  },
}));
