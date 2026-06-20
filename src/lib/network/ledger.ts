"use client";

import type { Team, TeamMetrics } from "./types";
import type { MetricsWindow } from "./useNetworkStore";

/**
 * The Nexus ledger — the single source of truth for the network's money/token accounting.
 *
 * TODAY (demo): each team carries PER-DAY baseline figures; we scale them to the selected window
 * here. Nothing is persisted.
 *
 * STEP B (backend): Nexus becomes the system of record. Per-event usage (tokens, inference cost,
 * product spend, revenue) is written to a DATABASE via the BFF as agents work, and these functions
 * become windowed QUERIES against it (1D / 3D / 7D / 1M / All) returning real aggregates. The return
 * shape stays identical, so the panels don't change when we cut over.
 */

const ZERO: TeamMetrics = { tokensIn: 0, tokensOut: 0, tokenCost: 0, productCost: 0, revenue: 0 };

/** Scale a team's per-day metrics to a window ("all" => its lifetime, i.e. × ageDays). */
export function scaleMetrics(m: TeamMetrics, window: MetricsWindow, ageDays: number): TeamMetrics {
  const days = window === "all" ? Math.max(ageDays, 1) : window;
  return {
    tokensIn: m.tokensIn * days,
    tokensOut: m.tokensOut * days,
    tokenCost: m.tokenCost * days,
    productCost: m.productCost * days,
    revenue: m.revenue * days,
  };
}

/** Network-wide roll-up across all teams for the window. */
export function rollup(teams: Team[], window: MetricsWindow): TeamMetrics {
  return teams.reduce<TeamMetrics>((acc, c) => {
    const s = scaleMetrics(c.metrics, window, c.ageDays);
    return {
      tokensIn: acc.tokensIn + s.tokensIn,
      tokensOut: acc.tokensOut + s.tokensOut,
      tokenCost: acc.tokenCost + s.tokenCost,
      productCost: acc.productCost + s.productCost,
      revenue: acc.revenue + s.revenue,
    };
  }, { ...ZERO });
}

export const totalSpend = (m: TeamMetrics) => m.tokenCost + m.productCost;
export const net = (m: TeamMetrics) => m.revenue - totalSpend(m);
