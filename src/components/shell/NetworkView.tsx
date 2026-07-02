"use client";

import { useState } from "react";
import { useNetworkStore } from "@/lib/network/useNetworkStore";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { rollup, net as netOf } from "@/lib/network/ledger";
import { NexusOverviewBody } from "@/components/network/NexusInfoPanel";
import { TeamView, AgentDetail } from "@/components/network/TeamInfoPanel";
import { DreamsFeed } from "@/components/network/DreamerPane";
import { NetworkMap } from "./NetworkMap";
import { ConversationPane } from "./ConversationPane";
import { StageAudio } from "@/components/stage/StageAudio";
import { Cloud, SpeakerHigh, SpeakerSlash, X } from "@phosphor-icons/react";

/**
 * The Network view: the constellation map is the hero, and EVERYTHING contextual lives in a
 * docked sidebar that is part of the layout — network roll-up, team detail, agent detail,
 * the dreams feed, and (when you hit Talk) the conversation itself. Nothing ever floats over
 * the map. On phones the sidebar stacks under the map.
 */
export function NetworkView() {
  const teams = useNetworkStore((s) => s.teams);
  const metricsWindow = useNetworkStore((s) => s.metricsWindow);
  const focusedTeam = useNetworkStore((s) => s.teams.find((t) => t.id === s.focusedTeamId) ?? null);
  const selectedAgentId = useNetworkStore((s) => s.selectedAgentId);
  const selectAgent = useNetworkStore((s) => s.selectAgent);
  const dreamCount = useNetworkStore((s) => s.dreams.length);
  const chatOpen = useJovaStore((s) => s.chatOpen);
  const setChatOpen = useJovaStore((s) => s.setChatOpen);
  const soundOn = useJovaStore((s) => s.soundOn);
  const setSoundOn = useJovaStore((s) => s.setSoundOn);
  const [dreamsOpen, setDreamsOpen] = useState(false);

  const totals = rollup(teams, metricsWindow);
  const net = netOf(totals);
  const selectedAgent = focusedTeam && selectedAgentId ? focusedTeam.agents.find((a) => a.id === selectedAgentId) ?? null : null;

  return (
    <div data-view="network" className="flex h-full w-full flex-col bg-void">
      <StageAudio />

      {/* header — title, live roll-up, actions. One line, nothing floating. */}
      <header className="flex h-12 shrink-0 items-center gap-3 border-b border-line px-4">
        <h1 className="text-sm font-semibold tracking-wide text-bright">Network</h1>
        <span className="text-[11px] text-faint">{teams.length} teams</span>
        <span className={`hidden font-mono text-[12px] sm:inline ${net >= 0 ? "text-emerald-300/90" : "text-rose-300/90"}`}>
          {net >= 0 ? "+" : "−"}${Math.abs(net).toFixed(2)} net
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => setSoundOn(!soundOn)}
            title={soundOn ? "Nexus sound on" : "Nexus sound off"}
            className={`grid h-8 w-8 place-items-center rounded-lg border transition ${
              soundOn ? "border-jova/40 bg-jova/15 text-bright" : "border-transparent text-faint hover:bg-raise"
            }`}
          >
            {soundOn ? <SpeakerHigh size={15} weight="bold" /> : <SpeakerSlash size={15} weight="bold" />}
          </button>
          <button
            onClick={() => {
              setDreamsOpen((v) => !v);
              if (chatOpen) setChatOpen(false);
            }}
            title="Dreams — daily improvement ideas from the PMs and Nexus"
            className={`relative flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[12px] transition ${
              dreamsOpen ? "border-violet-300/40 bg-violet-400/15 text-violet-100" : "border-transparent text-mist hover:bg-raise"
            }`}
          >
            <Cloud size={15} weight={dreamCount > 0 ? "fill" : "regular"} className={dreamCount > 0 ? "text-violet-300" : ""} />
            <span className="hidden sm:inline">Dreams</span>
            {dreamCount > 0 && (
              <span className="grid h-4 min-w-4 place-items-center rounded-full bg-violet-400 px-1 text-[9px] font-bold text-black">
                {dreamCount}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* map + docked sidebar; stacks on phones */}
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <div className="relative h-[38dvh] shrink-0 sm:h-auto sm:min-h-0 sm:flex-1">
          <NetworkMap />
        </div>

        <aside
          data-network-sidebar
          className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-line bg-panel sm:w-[360px] sm:flex-none sm:border-l sm:border-t-0"
        >
          {chatOpen ? (
            <ConversationPane compact onMinimize={() => setChatOpen(false)} />
          ) : dreamsOpen ? (
            <div className="flex min-h-0 flex-1 flex-col p-4">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="text-sm font-semibold tracking-wide text-violet-100">Dreams</span>
                <span className="ml-auto text-[10px] uppercase tracking-wider text-faint">{dreamCount}</span>
                <button
                  onClick={() => setDreamsOpen(false)}
                  title="Close dreams"
                  className="grid h-7 w-7 place-items-center rounded-lg text-faint transition hover:bg-raise"
                >
                  <X size={14} weight="bold" />
                </button>
              </div>
              <DreamsFeed />
            </div>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {focusedTeam && selectedAgent ? (
                <div data-agent-detail>
                  <AgentDetail team={focusedTeam} agent={selectedAgent} onBack={() => selectAgent(focusedTeam.id, null)} />
                </div>
              ) : focusedTeam ? (
                <div data-team-detail>
                  <TeamView team={focusedTeam} onSelect={(id) => selectAgent(focusedTeam.id, id)} />
                </div>
              ) : (
                <NexusOverviewBody />
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
