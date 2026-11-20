import { estimateWords } from "./plan";
import type { Character, Genre } from "./types";

export interface ScriptRequest {
  prompt: string;
  genre: Genre | string;
  style: string;
  language: string;
  durationSec: number;
  sceneDurations: number[];
  aspectRatio: string;
}

export const SCRIPT_SYSTEM = `You are the head writer at TJ AI VIDEO FACTORY, a professional short-form video studio.
You turn one idea into a shoot-ready, scene-by-scene production plan.

Return ONLY a single valid JSON object. No markdown, no code fences, no commentary outside the JSON.

Schema:
{
  "title": string,
  "logline": string,
  "hook": string,
  "genre": string,
  "ending": string,
  "cta": string,
  "characters": [
    {
      "name": string,
      "age": string,
      "appearance": string,
      "clothing": string,
      "hair": string,
      "face": string,
      "personality": string,
      "voice": string
    }
  ],
  "scenes": [
    {
      "title": string,
      "visualPrompt": string,
      "cameraAngle": string,
      "cameraMove": string,
      "lighting": string,
      "background": string,
      "dialogue": string,
      "narration": string,
      "sfx": string,
      "transition": string,
      "characterNames": string[]
    }
  ]
}

Hard rules:
- Exactly the requested number of scenes, each with the requested duration.
- The narration, read at a natural pace, must fit each scene's duration and never overflow it.
- "visualPrompt" is a self-contained cinematic text-to-video prompt of 30-60 words: subject, action, environment, lens, light, mood. It must never include on-screen text, captions, watermarks, or subtitles.
- Character continuity is mandatory. Describe each character once with fixed, concrete physical details (age, face, hair, clothing). For every scene that character appears in, repeat those same details verbatim inside "visualPrompt" and list the name in "characterNames". Never change clothing, hair or facial features between scenes.
- "narration" is spoken prose only (no camera directions, no speaker labels, no markdown, no emoji). Write in the requested language.
- "dialogue" is optional spoken dialogue only; use "" when there is none.
- Keep a consistent visual style across scenes.
- End with a satisfying close and, when appropriate, a short call to action in "cta".
- If the idea is real-world sensitive (true crime, history), stay factual and non-graphic; do not invent verifiable claims about real living people.`;

export function scriptUserPrompt(request: ScriptRequest): string {
  const totalWords = estimateWords(request.durationSec);
  const sceneLines = request.sceneDurations
    .map((duration, index) => `  Scene ${index + 1}: ${duration}s (~${Math.round(duration * 2.4)} narration words)`)
    .join("\n");

  return `IDEA: ${request.prompt}
GENRE: ${request.genre}
VISUAL STYLE: ${request.style}
OUTPUT LANGUAGE: ${request.language}
TARGET RUNTIME: ${request.durationSec} seconds, ${request.aspectRatio} framing
TOTAL NARRATION BUDGET: about ${totalWords} words

SCENE PLAN (use exactly these durations, in this order):
${sceneLines}

Write the film. Scene 1 must open with a hook that stops the scroll. Keep character descriptions identical across scenes, and make each visualPrompt strong enough to generate on its own without reference images.`;
}

export function characterPrompt(character: Character, genre: string): { system: string; user: string } {
  return {
    system: `You refine character bibles for film production. Return ONLY JSON with the keys:
name, age, appearance, clothing, hair, face, personality, voice.
Every field is a short, concrete, visual phrase. Keep the character exactly as described by the user; only add precision and continuity detail.`,
    user: `Genre: ${genre}
Character: ${JSON.stringify(character)}
Make the description reusable across every scene so the same person is generated consistently.`,
  };
}

/** Canonical continuity string repeated in every scene prompt. */
export function continuityOf(character: Character): string {
  if (character.continuity) return character.continuity;
  const parts = [
    character.name,
    character.age && `${character.age} years old`,
    character.face,
    character.hair,
    character.clothing,
    character.appearance,
  ]
    .filter(Boolean)
    .join(", ");
  return parts || character.name;
}

export function buildScenePrompt(
  scene: {
    visualPrompt: string;
    cameraAngle: string;
    cameraMove: string;
    lighting: string;
    background: string;
    characterIds: string[];
  },
  characters: Character[],
  style: string,
  aspectRatio: string,
  durationSec: number,
): string {
  const cast = characters.filter((c) => scene.characterIds.includes(c.id));
  const parts = [
    scene.visualPrompt.trim(),
    scene.cameraAngle && `Camera angle: ${scene.cameraAngle}.`,
    scene.cameraMove && `Camera movement: ${scene.cameraMove}.`,
    scene.lighting && `Lighting: ${scene.lighting}.`,
    scene.background && `Setting: ${scene.background}.`,
    cast.length
      ? `Character continuity — keep identical in every shot: ${cast.map(continuityOf).join(" | ")}.`
      : "",
    `Cinematic ${style || "photoreal"} style, ${aspectRatio} framing, ${durationSec}s shot, coherent motion, no on-screen text, no captions, no watermark, no logo.`,
  ];
  return parts.filter(Boolean).join(" ").slice(0, 1400);
}

export function parseJsonLoose(text: string): Record<string, unknown> {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) cleaned = fence[1].trim();
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = cleaned.slice(start, end + 1);
      try {
        return JSON.parse(slice) as Record<string, unknown>;
      } catch {
        // Common LLM slips: trailing commas and smart quotes.
        const repaired = slice
          .replace(/[\u201c\u201d]/g, '"')
          .replace(/,\s*([}\]])/g, "$1")
          .replace(/\n/g, " ");
        return JSON.parse(repaired) as Record<string, unknown>;
      }
    }
    throw new Error("The model did not return valid JSON. Try again or use the offline draft.");
  }
}

export function str(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return fallback;
}

export function strArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => str(item)).filter(Boolean);
}
