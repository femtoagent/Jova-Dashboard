import type { PresetDetail, PresetSummary } from "./openrouter";

/**
 * Mock OpenRouter presets — served by the BFF routes when OPENROUTER_API_KEY is not set, so the
 * demo's preset picker works offline. Swap to the real API by setting the key (no UI change).
 */
export const MOCK_PRESETS: PresetSummary[] = [
  { slug: "jova-conversation", name: "Jova Conversation", description: "Warm, cheap conversational routing", status: "active" },
  { slug: "fast-cheap", name: "Fast & Cheap", description: "Lowest latency / cost", status: "active" },
  { slug: "balanced", name: "Balanced", description: "Balanced quality and cost", status: "active" },
  { slug: "deep-reasoning", name: "Deep Reasoning", description: "Highest-quality reasoning", status: "active" },
];

const MOCK_CONFIG: Record<string, { systemPrompt?: string; config: Record<string, unknown> }> = {
  "jova-conversation": {
    systemPrompt: "You are Jova — warm, direct, dry wit.",
    config: { model: "deepseek/deepseek-v3.2", temperature: 0.7, provider: { sort: "price" } },
  },
  "fast-cheap": { config: { model: "openai/gpt-4o-mini", temperature: 0.4, provider: { sort: "throughput" } } },
  "balanced": { config: { model: "anthropic/claude-haiku-4.5", temperature: 0.6, provider: { sort: "price" } } },
  "deep-reasoning": { config: { model: "anthropic/claude-opus-4.8", temperature: 0.3, provider: { sort: "quality" } } },
};

export function mockPresetDetail(slug: string): PresetDetail | null {
  const m = MOCK_CONFIG[slug];
  if (!m) return null; // unknown slug → let the route 404 so the UI shows "No config available"
  return { slug, name: slug, systemPrompt: m.systemPrompt ?? null, config: m.config };
}
