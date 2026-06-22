"use client";

export interface DateRange {
  from: number | null;
  to: number | null;
}

const DAY = 86_400_000;

function tsToLocal(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localToTs(s: string): number | null {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
}

/** True if ts falls within the (open-ended) range. */
export function inRange(ts: number, r: DateRange): boolean {
  return (r.from == null || ts >= r.from) && (r.to == null || ts <= r.to);
}

const PRESETS: { label: string; ms: number | null }[] = [
  { label: "24h", ms: DAY },
  { label: "7d", ms: 7 * DAY },
  { label: "30d", ms: 30 * DAY },
  { label: "All", ms: null },
];

/** A calendar date-time range filter: quick presets + native From/To pickers. */
export function DateRangeBar({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-white/35">Range</span>
      <div className="flex gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => onChange(p.ms == null ? { from: null, to: null } : { from: Date.now() - p.ms, to: null })}
            className="rounded px-2 py-0.5 text-[11px] text-white/45 transition hover:bg-white/10 hover:text-white/80"
          >
            {p.label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-1 text-[11px] text-white/40">
        From
        <input
          type="datetime-local"
          value={value.from != null ? tsToLocal(value.from) : ""}
          onChange={(e) => onChange({ ...value, from: localToTs(e.target.value) })}
          className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white outline-none [color-scheme:dark] focus:border-cyan-300/40"
        />
      </label>
      <label className="flex items-center gap-1 text-[11px] text-white/40">
        To
        <input
          type="datetime-local"
          value={value.to != null ? tsToLocal(value.to) : ""}
          onChange={(e) => {
            const t = localToTs(e.target.value);
            onChange({ ...value, to: t == null ? null : t + 59_999 }); // include the whole selected minute
          }}
          className="rounded border border-white/15 bg-white/5 px-2 py-1 text-[11px] text-white outline-none [color-scheme:dark] focus:border-cyan-300/40"
        />
      </label>
    </div>
  );
}
