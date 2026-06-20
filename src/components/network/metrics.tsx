"use client";

import { useNetworkStore } from "@/lib/network/useNetworkStore";
import type { MetricsWindow } from "@/lib/network/useNetworkStore";
import type { TeamMetrics } from "@/lib/network/types";

const WINDOWS: { d: MetricsWindow; label: string }[] = [
  { d: 1, label: "1D" },
  { d: 3, label: "3D" },
  { d: 7, label: "7D" },
  { d: 30, label: "1M" },
  { d: "all", label: "All" },
];

export const fmtTokens = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100000 ? 0 : 1)}k` : `${Math.round(n)}`);
export const fmtUsd = (n: number) => `$${n.toFixed(2)}`;

/** Shared 1D/3D/7D/1M/All selector — writes the global window so team + Nexus stay in sync. */
export function WindowPills() {
  const w = useNetworkStore((s) => s.metricsWindow);
  const set = useNetworkStore((s) => s.setMetricsWindow);
  return (
    <div className="mb-2 flex gap-1">
      {WINDOWS.map(({ d, label }) => (
        <button
          key={String(d)}
          onClick={() => set(d)}
          className={`rounded px-1.5 py-0.5 text-[10px] transition ${w === d ? "bg-white/20 text-white" : "text-white/40 hover:bg-white/10"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Revenue / total spend (token + product) / net / tokens. Expects ALREADY-windowed values. */
export function MetricRows({ metrics }: { metrics: TeamMetrics }) {
  const totalSpend = metrics.tokenCost + metrics.productCost;
  const net = metrics.revenue - totalSpend;
  return (
    <div className="space-y-0.5 text-[11px]">
      <Row label="Revenue" value={fmtUsd(metrics.revenue)} valueClass="text-emerald-300/90" />
      <Row label="Total spend" value={fmtUsd(totalSpend)} />
      <Row label="Token cost" value={fmtUsd(metrics.tokenCost)} sub />
      <Row label="Product cost" value={fmtUsd(metrics.productCost)} sub />
      <Row label="Net" value={`${net >= 0 ? "+" : "−"}${fmtUsd(Math.abs(net))}`} valueClass={net >= 0 ? "text-emerald-300/90" : "text-rose-300/90"} />
      <Row label="Tokens in / out" value={`${fmtTokens(metrics.tokensIn)} / ${fmtTokens(metrics.tokensOut)}`} muted />
    </div>
  );
}

function Row({ label, value, sub, muted, valueClass }: { label: string; value: string; sub?: boolean; muted?: boolean; valueClass?: string }) {
  return (
    <div className={`flex items-center justify-between ${sub ? "pl-3" : ""}`}>
      <span className={muted || sub ? "text-white/40" : "text-white/65"}>{label}</span>
      <span className={valueClass ?? (muted ? "text-white/50" : "text-white/85")}>{value}</span>
    </div>
  );
}
