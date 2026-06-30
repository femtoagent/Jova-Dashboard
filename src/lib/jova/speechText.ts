/**
 * Helpers for the ElevenLabs "audio tag" emphasis cues — bracketed delivery directives an agent can
 * drop inline for v3 (e.g. "[angry]", "[whispers]", "[higher pitch]"). v3 reads them as performance
 * cues; we hide them from the chat transcript (toggleable) and strip them from non-v3 speech.
 *
 * The pattern matches a short alphabetic bracketed token NOT followed by "(" (so markdown links
 * "[label](url)" are left intact).
 */
export const AUDIO_TAG_RE = /(?<!\[)\[[A-Za-z][A-Za-z0-9 ,'\-]{0,38}\](?![([])/g;

/** Remove audio-tag cues from text, tidying the leftover spacing (keeps newlines/paragraphs). */
export function stripAudioTags(text: string): string {
  return (text ?? "")
    .replace(AUDIO_TAG_RE, "")
    .replace(/[^\S\n]{2,}/g, " ") // collapse runs of spaces/tabs, preserve newlines
    .replace(/[^\S\n]+([.,!?;:])/g, "$1"); // drop a space left before punctuation
}
