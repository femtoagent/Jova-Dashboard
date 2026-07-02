"use client";

import type { AgentRole } from "@/lib/network/types";
import { Bug, ChatCircleText, Code, Flag, Megaphone, Sparkle, Wrench, type Icon } from "@phosphor-icons/react";

/**
 * One glyph per role — the badge on a Team Room character's chest, and half of the
 * provenance stamp (sender accent color + sender glyph) on flying docs and pile sheets.
 */
const ROLE_ICON: Record<AgentRole, Icon> = {
  pm: Flag,
  developer: Code,
  qa: Bug,
  devops: Wrench,
  marketing: Megaphone,
  cx: ChatCircleText,
};

export function roleIcon(role: AgentRole): Icon {
  return ROLE_ICON[role] ?? Code;
}

/** Glyph for work with no visible sender (spawned by Nexus). */
export const NexusGlyph = Sparkle;
