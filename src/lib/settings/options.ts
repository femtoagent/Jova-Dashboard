import type { AgentClient, AgentRole } from "@/lib/network/types";

/** Role → display label (canonical lookup, shared by the settings screens). */
export const ROLE_LABEL: Record<AgentRole, string> = {
  pm: "Product Manager",
  developer: "Developer",
  qa: "QA / DevOps",
  devops: "DevOps",
  marketing: "Marketing",
  cx: "Customer Experience",
};

/** Roles you can add to a team. One PM per team, so PM is not offered. */
export const ADDABLE_ROLES: { role: AgentRole; label: string }[] = [
  { role: "developer", label: "Developer" },
  { role: "qa", label: "QA / DevOps" },
  { role: "devops", label: "DevOps" },
  { role: "marketing", label: "Marketing" },
  { role: "cx", label: "Customer Experience" },
];

/** Selectable backend clients (Letta is today's default; the others are net-new placeholders). */
export const CLIENTS: { value: AgentClient; label: string }[] = [
  { value: "letta", label: "Letta" },
  { value: "hermes", label: "Hermes" },
  { value: "openclaw", label: "Openclaw" },
];

/** Placeholder OpenRouter presets until the server supplies the real list. */
export const PRESET_SUGGESTIONS = ["jova-conversation", "fast-cheap", "balanced", "deep-reasoning"];

/** Default tool suggestions per role (editable in the agent editor). */
export const DEFAULT_TOOLS: Record<AgentRole, string[]> = {
  pm: ["plan", "assign_task", "contact_mesh_agent"],
  developer: ["write_code", "run_tests", "open_pr"],
  qa: ["run_tests", "file_bug", "audit_logs"],
  devops: ["deploy", "monitor", "rollback"],
  marketing: ["draft_copy", "schedule_post", "analyze_funnel"],
  cx: ["reply_ticket", "summarize_feedback", "escalate"],
};

/** Which roles surface a Skills section ("if applicable"). */
export function roleHasSkills(role: AgentRole): boolean {
  return role !== "pm";
}
