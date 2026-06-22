"use client";

import { create } from "zustand";

export type LogKind = "server" | "mesh";
export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  id: string;
  ts: number;
  kind: LogKind;
  level: LogLevel;
  source: string;
  message: string;
}

let logSeed = 1;
const newId = () => `log-${logSeed++}`;
const MAX = 1000;
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** A spread of sample entries so the Logs screen (and its date filter) has history to show. */
function seed(): LogEntry[] {
  const now = Date.now();
  const e = (ago: number, kind: LogKind, level: LogLevel, source: string, message: string): LogEntry => ({
    id: newId(),
    ts: now - ago,
    kind,
    level,
    source,
    message,
  });
  // newest first
  return [
    e(2 * MIN, "server", "info", "/api/health", "GET /api/health → 200"),
    e(8 * MIN, "mesh", "info", "Forge / Developer", 'Completed "Fix payment bug"'),
    e(25 * MIN, "server", "info", "/api/chat", "POST /api/chat → 200 (1.2s)"),
    e(40 * MIN, "mesh", "warn", "Beacon / PM", "Needs sign-off: Pause the lowest-ROI ad channel"),
    e(2 * HOUR, "server", "error", "/api/nexus/soul", "POST /api/nexus/soul → 500 (timeout)"),
    e(5 * HOUR, "mesh", "info", "Atlas / DevOps", 'Started "Patch CVE-2026"'),
    e(1 * DAY, "server", "info", "/api/openrouter/presets", "GET /api/openrouter/presets → 200"),
    e(2 * DAY, "mesh", "info", "Halo / CX", 'Completed "Clear ticket queue"'),
    e(3 * DAY, "server", "warn", "letta", "JOVA_BACKEND unset — using the mock brain"),
  ];
}

interface LogState {
  entries: LogEntry[];
  /** append a log entry (newest first, capped) */
  addLog: (e: { kind: LogKind; level?: LogLevel; source: string; message: string; ts?: number }) => void;
}

export const useLogStore = create<LogState>((set) => ({
  entries: seed(),
  addLog: (e) =>
    set((st) => ({
      entries: [
        { id: newId(), ts: e.ts ?? Date.now(), kind: e.kind, level: e.level ?? "info", source: e.source, message: e.message },
        ...st.entries,
      ].slice(0, MAX),
    })),
}));

if (typeof window !== "undefined") {
  (window as unknown as { __logStore?: typeof useLogStore }).__logStore = useLogStore;
}
