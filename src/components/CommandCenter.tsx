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

// 3D world is client-only.
const SceneCanvas = dynamic(() => import("@/components/scene/SceneCanvas"), { ssr: false });

export function CommandCenter() {
  const { send } = useConversation();
  const greeted = useRef(false);
  const wispState = useJovaStore((s) => s.wispState);
  const sessionCount = useJovaStore((s) => s.sessions.length);
  const createSession = useJovaStore((s) => s.createSession);

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
        <DemoControls />
        <NexusInfoPanel />
        <DreamerPane />
        <TeamInfoPanel />
        <ChatSurface />
      </main>
    </AuthGate>
  );
}
