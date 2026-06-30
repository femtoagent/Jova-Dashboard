/**
 * Character registry — display + gating metadata for the showcase "character" agents (Baal, Mira),
 * keyed by the REAL Letta agent NAME (the one identifier common to every surface: chat targets, the
 * Routing screen's AgentInfo, and the voice roster). This is the single source of truth for:
 *   - how a character looks (display name, subtitle, accent color, avatar emoji)
 *   - its voice defaults (Baal ships as eleven_v3 with his audio tags)
 *   - whether it's SECRET (hidden everywhere until a code is typed in the new-chat search)
 *
 * Discoverability is intentionally low: characters are found by typing their name in the new-chat
 * search, never advertised in a visible roster. Secret characters (Mira) are filtered out of the
 * chat search, the Voice panel, and Routing until unlocked — see useSecretAgents.
 */

import type { VoiceModel } from "@/lib/voice/types";

export interface CharacterMeta {
  /** the real Letta agent name (lowercase) — the join key across all surfaces */
  name: string;
  /** display name shown in the UI */
  display: string;
  /** short subtitle shown after the name, e.g. "Lord of Destruction" */
  label: string;
  /** accent color */
  color: string;
  /** avatar glyph */
  emoji?: string;
  /** present => hidden everywhere until the code is typed in the new-chat search */
  secret?: { code: string };
  /** voice defaults applied when this character is first materialized into the voice roster */
  voice?: { model?: VoiceModel; v3Tags?: string };
}

/** Our own assistant's agent name (never treated as a "character"; reached via openJovaChat). */
export const JOVA_AGENT_NAME = "jova";

/** Internal/specialist agents that should never appear in the chat picker or voice studio. */
export const SYSTEM_AGENT_NAMES = ["jova-docs", "jova-sleeptime"];

/** Critical agents that must never be deletable from the UI (core infra / the assistant herself). */
export const PROTECTED_AGENT_NAMES = ["jova", "jova-docs", "jova-sleeptime", "nexus"];

/** True if this agent is protected from deletion. */
export function isProtectedAgent(name: string | undefined | null): boolean {
  if (!name) return false;
  return PROTECTED_AGENT_NAMES.includes(name.toLowerCase());
}

export const CHARACTERS: CharacterMeta[] = [
  {
    name: "baal",
    display: "Baal",
    label: "Lord of Destruction",
    color: "#ff5a3c",
    emoji: "💀",
    voice: { model: "eleven_v3", v3Tags: "[evil] [Operatic Modulation] [mockery] [higher pitch] [faster]" },
  },
  {
    name: "mira",
    display: "Mira",
    label: "nekomimi",
    color: "#ff8ad1",
    emoji: "😺",
    secret: { code: "=^.^=" },
  },
];

/** Character metadata by agent name (case-insensitive), or undefined for a non-character agent. */
export function characterByName(name: string | undefined | null): CharacterMeta | undefined {
  if (!name) return undefined;
  const n = name.toLowerCase();
  return CHARACTERS.find((c) => c.name === n);
}

/** True for internal/specialist agents we never surface in the picker or voice studio. Also catches
 *  Letta's auto-created background companions (any "<name>-sleeptime" memory keeper). */
export function isSystemAgent(name: string | undefined | null): boolean {
  if (!name) return false;
  const n = name.toLowerCase();
  return SYSTEM_AGENT_NAMES.includes(n) || n.endsWith("-sleeptime");
}

/** A memory/specialist agent whose blocks are Jova's own memory — read-only from the dashboard's edit UI
 *  (e.g. jova-sleeptime keeps Jova's persona_growth / memory). The agent's own memory system still writes them. */
export function isMemoryAgent(name: string | undefined | null): boolean {
  if (!name) return false;
  return name.toLowerCase().endsWith("-sleeptime");
}

/** If `input` exactly matches a secret character's unlock code, return that character's name. */
export function matchSecretCode(input: string): string | null {
  const v = input.trim();
  if (!v) return null;
  const hit = CHARACTERS.find((c) => c.secret && c.secret.code === v);
  return hit ? hit.name : null;
}
