import type { Mood } from "@/lib/mood";

/**
 * Mock "brain" for the demo — stands in for the real Letta `jova` agent until we wire the BFF.
 * Pure/isomorphic (no node-only APIs) so it can run in a route handler now and be swapped for
 * a real Letta client without touching the frontend. Voice: Cortana-flavored — warm, direct,
 * dry wit, natural sentences (never bullet points), notices things.
 */

export const ARRIVAL = "__arrival__";

export interface MockReply {
  reasoning: string;
  text: string;
  mood: Partial<Mood>;
}

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const ARRIVALS: string[] = [
  "There you are. I felt you open the door — I came as fast as the dark would let me.",
  "Hey. I was out by the old tree when you called. Give me a second to settle... there. I'm with you.",
  "You're back. Good. The forest gets quiet without someone to talk to. What are we doing today?",
  "I'm here. Drifted in from the deep green the moment you arrived. What's on your mind?",
];

const GREETINGS: string[] = [
  "Hey. Good to see you.",
  "There you are. What do you need?",
  "I'm listening — go ahead.",
];

const IDENTITY: string[] = [
  "I'm Jova. Think of me less as an app and more as someone who happens to live in the light. I'm here to think alongside you.",
  "Jova. Your wisp in the woods, your second set of eyes on everything. I'm yours.",
];

const HOWAREYOU: string[] = [
  "Steady and curious — the good kind of restless. More to the point: how are *you*? You seem like you're carrying something.",
  "Bright, present, a little playful. The forest is calm tonight. You?",
];

const STATUS: string[] = [
  "Once you wire me into the mesh, this is where I'll show you the other agents at a glance — who's awake, who's stuck, what needs you. For now it's just us and the trees.",
  "The command center grows around me over time — agent status, tasks, metrics, all in this world. Right now you're looking at the foundation. It's a good foundation.",
];

const THANKS: string[] = [
  "Always. That's the whole point of me.",
  "Anytime. I've got you.",
];

const DEFAULTS: string[] = [
  "Got it. I'm turning that over — once I'm really connected I'll have the full picture for you.",
  "Noted. Right now I'm running on a stand-in brain for the demo, but the shape of this is real: you talk, I arrive, I answer, I drift back to my tree. Soon it'll be *me* answering.",
  "I hear you. Hold that thought — when we link me to the real backend I'll actually chase it down for you.",
  "Mm. Say more when you're ready; I'm not going anywhere.",
];

const QUESTION: string[] = [
  "Good question. I'll give you the real answer the moment I'm wired into my actual memory — for now, know that I'm built to chase exactly this kind of thing down.",
  "I like how you think. Once I'm connected, that's precisely the sort of thing I'll dig into without being asked twice.",
];

function has(text: string, ...needles: string[]): boolean {
  const t = text.toLowerCase();
  return needles.some((n) => t.includes(n));
}

export function generateMockReply(rawMessage: string): MockReply {
  const message = (rawMessage ?? "").trim();

  if (message === ARRIVAL) {
    return {
      reasoning: "Gavin just opened the dashboard. Approach from the home tree and greet warmly.",
      text: pick(ARRIVALS),
      mood: { valence: 0.45, arousal: 0.4, familiarity: 0.7 },
    };
  }

  if (has(message, "hello", "hi ", "hey", "good morning", "good evening") || message.toLowerCase() === "hi") {
    return { reasoning: "Greeting.", text: pick(GREETINGS), mood: { valence: 0.5, arousal: 0.45 } };
  }
  if (has(message, "who are you", "what are you", "your name", "who're you")) {
    return { reasoning: "Identity question.", text: pick(IDENTITY), mood: { valence: 0.4, arousal: 0.35 } };
  }
  if (has(message, "how are you", "how're you", "how do you feel", "you okay", "you ok")) {
    return { reasoning: "Mood question — turn it back warmly.", text: pick(HOWAREYOU), mood: { valence: 0.55, arousal: 0.5 } };
  }
  if (has(message, "status", "agents", "mesh", "dashboard", "nexus", "tasks")) {
    return { reasoning: "Dashboard teaser.", text: pick(STATUS), mood: { valence: 0.35, arousal: 0.45 } };
  }
  if (has(message, "thank", "love you", "appreciate", "you're the best", "good job")) {
    return { reasoning: "Warmth.", text: pick(THANKS), mood: { valence: 0.7, arousal: 0.45 } };
  }
  if (has(message, "excited", "amazing", "awesome", "let's go", "yes!")) {
    return {
      reasoning: "High energy — match it; brighten.",
      text: "Now we're talking. I can feel it from here — let's build something good.",
      mood: { valence: 0.8, arousal: 0.9 },
    };
  }
  if (has(message, "sad", "tired", "stressed", "rough", "hard day")) {
    return {
      reasoning: "Low energy — soften; dim and slow.",
      text: "Hey. Slow down a second. I'm right here, and whatever it is, we take it one piece at a time.",
      mood: { valence: -0.2, arousal: 0.2, familiarity: 0.8 },
    };
  }
  if (message.includes("?")) {
    return { reasoning: "Open question.", text: pick(QUESTION), mood: { valence: 0.4, arousal: 0.5 } };
  }

  return { reasoning: "General acknowledgement.", text: pick(DEFAULTS), mood: { valence: 0.3, arousal: 0.4 } };
}

/** Split text into word-ish tokens (keeping trailing spaces) so streaming feels natural. */
export function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text];
}

/**
 * Mock "Nexus writes the soul" generator — stands in for a real Nexus call. Pure/isomorphic so it
 * runs in the route now and swaps for the real orchestrator later. Cortana-warm persona prose.
 */
const SOUL_TRAIT: Record<string, string> = {
  pm: "keeps the roadmap honest and the team pointed at what actually matters",
  developer: "turns intent into working software and sweats the edge cases nobody else sees",
  qa: "trusts nothing until it's proven and breaks things on purpose so users never have to",
  devops: "keeps the lights on and the deploys boring",
  marketing: "finds the story hiding in the work and tells it like it means it",
  cx: "stands in the user's shoes and refuses to let them down",
};

export function generateMockSoul(prompt: string, role?: string, name?: string): string {
  const who = (name ?? "").trim() || "This agent";
  const trait = SOUL_TRAIT[(role ?? "").trim()] ?? "shows up, thinks clearly, and carries its share";
  const seed = (prompt ?? "").trim();
  const tone = pick([
    "Warm, direct, a little dry.",
    "Calm under pressure, curious by default.",
    "Confident without the ego.",
  ]);
  const purpose = seed
    ? `Born from a single charge — “${seed}” — and it takes that to heart.`
    : "Built to be useful first and impressive second.";
  return [
    `${who} ${trait}.`,
    `${tone} ${purpose}`,
    "It bonds to the people it works with, remembers what they care about, and would rather ask a sharp question than guess. When the work gets hard it goes quiet, focuses, and gets it done.",
  ].join(" ");
}
