"use client";

import { useDisplayPrefs } from "@/lib/settings/useDisplayPrefs";
import { OFFICE_THEMES } from "@/lib/network/officeThemes";

/**
 * Display settings for the Default shell — the Team Room toggle (drop into a decorated office
 * when you focus a team) and its office theme. Both persisted.
 */
export function DisplayScreen() {
  const teamRoom = useDisplayPrefs((s) => s.teamRoom);
  const setTeamRoom = useDisplayPrefs((s) => s.setTeamRoom);
  const theme = useDisplayPrefs((s) => s.officeTheme);
  const setTheme = useDisplayPrefs((s) => s.setOfficeTheme);

  return (
    <div>
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#7ad7ff", boxShadow: "0 0 8px #7ad7ff" }} />
          <h2 className="text-lg font-semibold text-cyan-100">Display</h2>
        </div>
        <p className="text-[12px] text-white/40">How the network shows its teams.</p>
      </div>

      <label
        data-team-room-toggle
        className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition hover:bg-white/[0.06]"
      >
        <input
          type="checkbox"
          checked={teamRoom}
          onChange={(e) => setTeamRoom(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-cyan-400"
        />
        <span>
          <span className="block text-sm font-medium text-white/90">Live team room</span>
          <span className="block text-[12px] leading-relaxed text-white/45">
            Focusing a team drops you into its office — watch each agent work, relax, and hand
            work across the room. Off keeps the constellation map while focused.
          </span>
        </span>
      </label>

      <div className="mb-1 mt-5 text-[10px] uppercase tracking-wider text-white/40">Office</div>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {OFFICE_THEMES.map((t) => {
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={`rounded-lg border p-2.5 text-left transition ${
                active ? "border-cyan-300/40 bg-cyan-400/15" : "border-white/10 bg-white/[0.03] hover:bg-white/10"
              }`}
            >
              <div className={`text-sm font-medium ${active ? "text-cyan-50" : "text-white/85"}`}>{t.name}</div>
              <div className="text-[11px] text-white/45">{t.desc}</div>
            </button>
          );
        })}
      </div>
      {OFFICE_THEMES.length === 1 && (
        <p className="mt-1.5 text-[11px] text-white/35">More offices are on the way — the room is built to swap them in.</p>
      )}
    </div>
  );
}
