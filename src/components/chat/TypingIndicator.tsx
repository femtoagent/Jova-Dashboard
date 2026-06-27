"use client";

/**
 * Discord-style "is typing" indicator — three dots bobbing in a forming bubble. Shown in place of the
 * assistant bubble while she's thinking (streaming, no content yet), so there's never an empty bubble.
 */
export function TypingIndicator({ color }: { color?: string }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.07] px-3 py-3">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 rounded-full animate-[typing-bounce_1.2s_ease-in-out_infinite]"
          style={{ backgroundColor: color ?? "rgba(165,243,252,0.85)", animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </div>
  );
}
