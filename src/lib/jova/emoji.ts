/**
 * A compact, dependency-free emoji set for the reaction picker. Not the full Unicode catalog — a
 * curated few hundred across the categories people actually reach for in a chat, each with keywords
 * so the picker's search box finds them. The agent's cheap reactor can return ANY emoji; this list
 * only bounds what the human picker shows (the "free picker" the brief asked for, kept loadable).
 */

export interface EmojiDef {
  e: string; // the emoji
  k: string; // space-separated search keywords (includes a short name)
}

export interface EmojiGroup {
  name: string;
  items: EmojiDef[];
}

export const EMOJI_GROUPS: EmojiGroup[] = [
  {
    name: "Smileys",
    items: [
      { e: "😀", k: "grin happy smile" },
      { e: "😄", k: "happy joy smile" },
      { e: "😁", k: "grin beam" },
      { e: "😂", k: "laugh joy tears lol" },
      { e: "🤣", k: "rofl laugh rolling" },
      { e: "😊", k: "blush smile happy" },
      { e: "🙂", k: "slight smile" },
      { e: "😉", k: "wink" },
      { e: "😍", k: "love heart eyes adore" },
      { e: "🥰", k: "love hearts adore" },
      { e: "😘", k: "kiss love" },
      { e: "😋", k: "yum tasty" },
      { e: "😎", k: "cool sunglasses" },
      { e: "🤩", k: "star struck amazed wow" },
      { e: "🥳", k: "party celebrate" },
      { e: "🙃", k: "upside down silly" },
      { e: "😏", k: "smirk" },
      { e: "🤔", k: "thinking hmm" },
      { e: "🤨", k: "raised eyebrow skeptical" },
      { e: "😐", k: "neutral meh" },
      { e: "😑", k: "expressionless" },
      { e: "🙄", k: "eye roll" },
      { e: "😬", k: "grimace awkward" },
      { e: "😴", k: "sleep tired" },
      { e: "🥱", k: "yawn bored tired" },
      { e: "😪", k: "sleepy" },
      { e: "😮", k: "wow surprised oh" },
      { e: "😯", k: "surprised" },
      { e: "😲", k: "astonished shocked" },
      { e: "😢", k: "cry sad tear" },
      { e: "😭", k: "sob cry bawl" },
      { e: "😟", k: "worried" },
      { e: "😞", k: "disappointed sad" },
      { e: "😔", k: "pensive sad" },
      { e: "😕", k: "confused" },
      { e: "🥲", k: "happy tear bittersweet" },
      { e: "😤", k: "frustrated steam" },
      { e: "😠", k: "angry mad" },
      { e: "😡", k: "rage furious" },
      { e: "🤯", k: "mind blown shocked" },
      { e: "😳", k: "flushed embarrassed" },
      { e: "🥺", k: "pleading puppy eyes" },
      { e: "😱", k: "scream fear" },
      { e: "😨", k: "fearful scared" },
      { e: "😰", k: "anxious sweat" },
      { e: "🤗", k: "hug" },
      { e: "🤭", k: "giggle oops" },
      { e: "🤫", k: "shush quiet" },
      { e: "🫡", k: "salute respect" },
      { e: "🫠", k: "melting" },
      { e: "😇", k: "angel innocent" },
      { e: "🤓", k: "nerd geek" },
      { e: "🧐", k: "monocle inspect" },
      { e: "😷", k: "mask sick" },
      { e: "🤒", k: "sick ill" },
      { e: "🤕", k: "hurt injured" },
      { e: "🤮", k: "vomit sick gross" },
      { e: "🥴", k: "woozy dizzy" },
      { e: "😵", k: "dizzy" },
    ],
  },
  {
    name: "Gestures",
    items: [
      { e: "👍", k: "thumbs up yes good approve like" },
      { e: "👎", k: "thumbs down no bad dislike" },
      { e: "👏", k: "clap applause bravo" },
      { e: "🙌", k: "raise hands praise celebrate" },
      { e: "🙏", k: "pray thanks please please grateful" },
      { e: "🤝", k: "handshake deal agree" },
      { e: "💪", k: "muscle strong flex" },
      { e: "✌️", k: "peace victory" },
      { e: "🤟", k: "love you rock" },
      { e: "🤙", k: "call shaka hang loose" },
      { e: "👌", k: "ok perfect" },
      { e: "🤌", k: "chefs kiss italian" },
      { e: "🫶", k: "heart hands love" },
      { e: "👋", k: "wave hi bye hello" },
      { e: "🤚", k: "stop hand" },
      { e: "✋", k: "high five stop" },
      { e: "👀", k: "eyes looking watching" },
      { e: "🫵", k: "you point" },
      { e: "👉", k: "point right" },
      { e: "👈", k: "point left" },
      { e: "☝️", k: "point up one" },
      { e: "✍️", k: "writing" },
    ],
  },
  {
    name: "Hearts",
    items: [
      { e: "❤️", k: "red heart love" },
      { e: "🧡", k: "orange heart" },
      { e: "💛", k: "yellow heart" },
      { e: "💚", k: "green heart" },
      { e: "💙", k: "blue heart" },
      { e: "💜", k: "purple heart" },
      { e: "🖤", k: "black heart" },
      { e: "🤍", k: "white heart" },
      { e: "💖", k: "sparkling heart love" },
      { e: "💗", k: "growing heart" },
      { e: "💓", k: "beating heart" },
      { e: "💞", k: "revolving hearts" },
      { e: "💕", k: "two hearts love" },
      { e: "💘", k: "cupid heart arrow" },
      { e: "💔", k: "broken heart" },
      { e: "❣️", k: "heart exclamation" },
      { e: "💯", k: "100 hundred perfect" },
    ],
  },
  {
    name: "Symbols",
    items: [
      { e: "🔥", k: "fire lit hot awesome" },
      { e: "✨", k: "sparkles magic shiny" },
      { e: "⭐", k: "star" },
      { e: "🌟", k: "glowing star" },
      { e: "⚡", k: "lightning energy fast" },
      { e: "💥", k: "boom explosion" },
      { e: "🎉", k: "party tada celebrate" },
      { e: "🎊", k: "confetti celebrate" },
      { e: "🚀", k: "rocket launch fast ship" },
      { e: "✅", k: "check done yes correct" },
      { e: "☑️", k: "checkbox done" },
      { e: "❌", k: "x no wrong cross" },
      { e: "❓", k: "question" },
      { e: "❗", k: "exclamation important" },
      { e: "💡", k: "idea bulb" },
      { e: "🧠", k: "brain smart mind" },
      { e: "👑", k: "crown king queen best" },
      { e: "🏆", k: "trophy win" },
      { e: "🥇", k: "gold medal first" },
      { e: "🎯", k: "target bullseye" },
      { e: "💎", k: "gem diamond" },
      { e: "🌈", k: "rainbow" },
      { e: "🙈", k: "see no evil monkey shy" },
      { e: "🤖", k: "robot bot ai" },
      { e: "👻", k: "ghost boo" },
      { e: "💀", k: "skull dead dying lol" },
      { e: "🫥", k: "dotted face invisible" },
    ],
  },
  {
    name: "Things",
    items: [
      { e: "☕", k: "coffee tea" },
      { e: "🍕", k: "pizza food" },
      { e: "🍻", k: "beers cheers drink" },
      { e: "🥂", k: "cheers toast champagne" },
      { e: "🎂", k: "cake birthday" },
      { e: "🍿", k: "popcorn watching" },
      { e: "🎁", k: "gift present" },
      { e: "📈", k: "chart up growth" },
      { e: "📉", k: "chart down loss" },
      { e: "💰", k: "money bag rich" },
      { e: "⏰", k: "alarm clock time" },
      { e: "📌", k: "pin important" },
      { e: "🌙", k: "moon night" },
      { e: "☀️", k: "sun day" },
      { e: "🌊", k: "wave ocean water" },
    ],
  },
];

/** A small, sensible quick-row shown before the user opens the full picker / searches. */
export const QUICK_REACTIONS = ["❤️", "👍", "😂", "🔥", "✨", "🙏", "👀", "🎉", "💯", "🥲"];

// Drop any malformed placeholder entries that slipped in (defensive — keep the list clean).
function isEmoji(s: string): boolean {
  return /\p{Extended_Pictographic}/u.test(s);
}
for (const g of EMOJI_GROUPS) g.items = g.items.filter((it) => isEmoji(it.e));

/** Case-insensitive keyword search across all groups; empty query returns null (show groups). */
export function searchEmoji(query: string): EmojiDef[] | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const out: EmojiDef[] = [];
  for (const g of EMOJI_GROUPS) for (const it of g.items) if (it.k.includes(q)) out.push(it);
  return out;
}

/** Extract emoji characters from arbitrary model text (for the reactor's reply). Deduped, in order. */
export function extractEmojis(text: string): string[] {
  const matches = (text ?? "").match(/\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*/gu) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    if (!seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}
