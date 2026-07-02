/**
 * The Team Room's character library — the illustrated "crewmates" you can assign to each agent.
 * Art is code-drawn SVG (see shell/AgentActor): each character is a palette + an accessory
 * silhouette, so the whole cast stays consistent, tintable, and weightless on phones. The
 * registry is deliberately data-only so a character's art can later become an external asset
 * (SVG file / .riv) without touching the room code.
 *
 * NOTE: not to be confused with lib/agents/characters.ts (the secret chat personas Baal/Mira).
 */

import type { AgentNode, AgentRole } from "@/lib/network/types";

export type CharacterAccessory =
  | "antenna" // bobble antenna
  | "cap" // peaked cap
  | "headphones"
  | "sprout" // little leaf on top
  | "band" // hard-hat band
  | "ears" // cat ears
  | "halo" // floating ring
  | "spike"; // tall mohawk-ish fin

export interface RoomCharacter {
  id: string;
  name: string;
  desc: string;
  /** main body color */
  body: string;
  /** trim / identity color — used for provenance stamps (flying docs, pile sheets) */
  accent: string;
  /** visor tint */
  visor: string;
  accessory: CharacterAccessory;
}

export const ROOM_CHARACTERS: RoomCharacter[] = [
  { id: "bolt", name: "Bolt", desc: "Wired-in builder with a signal antenna", body: "#3fa8e8", accent: "#7dd8ff", visor: "#dff4ff", accessory: "antenna" },
  { id: "scout", name: "Scout", desc: "Keeps the map — always knows what's next", body: "#e8a33f", accent: "#ffd27f", visor: "#fff3d6", accessory: "cap" },
  { id: "pixel", name: "Pixel", desc: "Lives in the feed, headphones always on", body: "#a678f0", accent: "#d3b5ff", visor: "#efe4ff", accessory: "headphones" },
  { id: "patch", name: "Patch", desc: "Grows tests like a garden", body: "#3fd68f", accent: "#8ff5c4", visor: "#e0fff0", accessory: "sprout" },
  { id: "rig", name: "Rig", desc: "Hard hat on, keeps the lights green", body: "#f08a4b", accent: "#ffc49a", visor: "#ffeede", accessory: "band" },
  { id: "echo", name: "Echo", desc: "Hears every user — soft ears, sharp notes", body: "#ef6f96", accent: "#ffb3c9", visor: "#ffe4ec", accessory: "ears" },
  { id: "nova", name: "Nova", desc: "Quietly brilliant, ring of light", body: "#8fb6d8", accent: "#cfe8ff", visor: "#f0f9ff", accessory: "halo" },
  { id: "umbra", name: "Umbra", desc: "Night-shift specialist with a dorsal fin", body: "#6b7490", accent: "#aab3cc", visor: "#dde3f2", accessory: "spike" },
];

export const DEFAULT_CHARACTER_BY_ROLE: Record<AgentRole, string> = {
  pm: "scout",
  developer: "bolt",
  qa: "patch",
  devops: "rig",
  marketing: "pixel",
  cx: "echo",
};

const byId = new Map(ROOM_CHARACTERS.map((c) => [c.id, c]));

/** Resolve an agent's character: its chosen one, else the role default, else Bolt. */
export function characterFor(agent: Pick<AgentNode, "character" | "role">): RoomCharacter {
  return byId.get(agent.character ?? "") ?? byId.get(DEFAULT_CHARACTER_BY_ROLE[agent.role]) ?? ROOM_CHARACTERS[0]!;
}

/** Nexus's identity for provenance when work has no visible sender (fromAgentId null). */
export const NEXUS_SENDER = { name: "Nexus", accent: "#9fe8ff" };
