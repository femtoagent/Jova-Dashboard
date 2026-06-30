import type { PresetDetail, PresetSummary } from "./openrouter";

/**
 * Mock OpenRouter presets — served by the BFF routes when OPENROUTER_API_KEY is not set, so the
 * demo's preset picker works offline. Swap to the real API by setting the key (no UI change).
 */
// Mirror the REAL preset slugs so the offline fallback matches production (the live values come from
// OpenRouter when OPENROUTER_API_KEY is set).
export const MOCK_PRESETS: PresetSummary[] = [
  { slug: "jova-conversation", name: "Jova Conversation", description: "Warm, cheap conversational routing (text)", status: "active" },
  { slug: "jova-memory", name: "Jova Memory", description: "Memory / embedding routing", status: "active" },
  { slug: "image-light", name: "Image Light", description: "Vision turns — lightweight", status: "active" },
  { slug: "file-medium", name: "File Medium", description: "Document / file turns", status: "active" },
  { slug: "min", name: "Min", description: "Minimal / lowest-cost routing", status: "active" },
  { slug: "fren", name: "Fren", description: "Friendly conversational routing", status: "active" },
];

const MOCK_CONFIG: Record<string, { systemPrompt?: string; config: Record<string, unknown> }> = {
  "jova-conversation": { config: { model: "deepseek/deepseek-v4-flash", provider: { sort: "latency" } } },
  "jova-memory": { config: { model: "openai/text-embedding-3-small" } },
  "image-light": { config: { model: "google/gemini-3.1-flash-lite" } },
  "file-medium": { config: { model: "(file-capable model)" } },
  min: { config: { model: "(minimal model)" } },
  fren: { config: { model: "(friendly model)" } },
};

export function mockPresetDetail(slug: string): PresetDetail | null {
  const m = MOCK_CONFIG[slug];
  if (!m) return null; // unknown slug → let the route 404 so the UI shows "No config available"
  return { slug, name: slug, systemPrompt: m.systemPrompt ?? null, config: m.config };
}
