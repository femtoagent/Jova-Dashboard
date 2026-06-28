"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { useJovaStore } from "@/lib/state/useJovaStore";
import { useConversation } from "@/lib/conversation/useConversation";
import { AuthGate } from "@/components/auth/AuthGate";
import { ChatSurface } from "@/components/chat/ChatSurface";
import { DemoControls } from "@/components/demo/DemoControls";
import { TeamInfoPanel } from "@/components/network/TeamInfoPanel";
import { NexusInfoPanel } from "@/components/network/NexusInfoPanel";
import { DreamerPane } from "@/components/network/DreamerPane";
import { SettingsGear } from "@/components/settings/SettingsGear";
import { SettingsOverlay } from "@/components/settings/SettingsOverlay";
import { WorldToggle } from "@/components/WorldToggle";
import { DocPanel } from "@/components/docs/DocPanel";
import { VoiceLayer } from "@/components/voice/VoiceLayer";
import { useVoicePrefs } from "@/lib/settings/useVoicePrefs";
import { useVoiceStatus } from "@/lib/settings/useVoiceStatus";
import { useAgentVoices } from "@/lib/settings/useAgentVoices";
import { useLogStore } from "@/lib/logs/useLogStore";
import { setOnVoiceUnavailable } from "@/lib/audio/tts";

// 3D world is client-only.
const SceneCanvas = dynamic(() => import("@/components/scene/SceneCanvas"), { ssr: false });

export function CommandCenter() {
  const { send } = useConversation();
  const greeted = useRef(false);
  const wispState = useJovaStore((s) => s.wispState);
  const fullMode = useJovaStore((s) => s.fullMode);
  const sessionCount = useJovaStore((s) => s.sessions.length);
  const createSession = useJovaStore((s) => s.createSession);
  const hydrateJovaStyle = useJovaStore((s) => s.hydrateJovaStyle);
  const hydrateVoicePrefs = useVoicePrefs((s) => s.hydrate);
  const hydrateAgentVoices = useAgentVoices((s) => s.hydrate);
  const refreshVoiceStatus = useVoiceStatus((s) => s.refreshAll);

  // Apply saved client-only preferences once after mount (localStorage isn't available during SSR).
  useEffect(() => {
    hydrateJovaStyle();
    hydrateVoicePrefs();
    hydrateAgentVoices();
    // voiceOn isn't persisted (it's the in-session quick-mute), so re-derive it from Jova's persisted
    // "Speak" each load — if Speak is on she should be audible without opening chat + clicking 🔊.
    if (useAgentVoices.getState().forKey("jova").enabled) useJovaStore.getState().setVoiceOn(true);
    void refreshVoiceStatus();
    // When TTS can't play, reflect it in the voice status + surface a message near the composer.
    setOnVoiceUnavailable((reason, info) => {
      if (reason === "exhausted") {
        if (info?.keyId) useVoiceStatus.getState().markKeyExhausted(info.keyId);
        useJovaStore.getState().setVoiceError("ElevenLabs credits are used up on that key — voice is paused.");
      } else if (reason === "error") {
        const msg = info?.detail ? `Voice error — ${info.detail}` : "Voice playback failed.";
        useJovaStore.getState().setVoiceError(msg.slice(0, 200));
        useLogStore.getState().addLog({ kind: "server", level: "error", source: "/api/tts", message: msg.slice(0, 300) });
      } else {
        useJovaStore.getState().setVoiceError("Voice isn't configured.");
      }
    });
    return () => setOnVoiceUnavailable(null);
  }, [hydrateJovaStyle, hydrateVoicePrefs, hydrateAgentVoices, refreshVoiceStatus]);

  // Ensure a session exists.
  useEffect(() => {
    if (sessionCount === 0) createSession("First contact");
  }, [sessionCount, createSession]);

  // Greet once on load (she's "present" from the start now), unprompted.
  useEffect(() => {
    if (!greeted.current && wispState === "present") {
      greeted.current = true;
      void send("", { arrival: true });
    }
  }, [wispState, send]);

  return (
    <AuthGate>
      <main className="relative h-dvh w-screen overflow-hidden bg-[#04070a] text-white">
        <div className="absolute inset-0">
          <SceneCanvas />
        </div>
        <WorldToggle />
        <DemoControls />
        {fullMode && <NexusInfoPanel />}
        {fullMode && <DreamerPane />}
        {fullMode && <TeamInfoPanel />}
        <ChatSurface />
        <VoiceLayer />
        <DocPanel />
        {/* The cog lives on both screens: the network opens full Settings; "just Jova" opens her editor. */}
        {fullMode ? <SettingsGear /> : <SettingsGear to="jova" title="Edit Jova" />}
        <SettingsOverlay />
      </main>
    </AuthGate>
  );
}
