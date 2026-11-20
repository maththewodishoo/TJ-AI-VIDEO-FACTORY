import type { Scene } from "./types";

export interface Cue {
  start: number;
  end: number;
  text: string;
  sceneIndex: number;
}

const DEFAULT_MAX_CHARS = 84;

function splitIntoChunks(text: string, maxChars: number): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const words = clean.split(" ");
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + " " + word).length <= maxChars) {
      current += ` ${word}`;
    } else {
      chunks.push(current);
      current = word;
    }
  }
  if (current) chunks.push(current);

  // A single very long word: hard-split it so the caption stays readable.
  return chunks.flatMap((chunk) =>
    chunk.length > maxChars * 1.6 ? chunk.match(new RegExp(`.{1,${maxChars}}`, "g")) || [chunk] : [chunk],
  );
}

/** Two readable lines, balanced by width — mobile safe. */
export function wrapCaption(text: string, maxLineChars = 42): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if (line.length + word.length + 1 <= maxLineChars) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3).join("\n");
}

export function buildCues(scenes: Scene[], options: { maxChars?: number } = {}): Cue[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const cues: Cue[] = [];
  let cursor = 0;

  scenes.forEach((scene, index) => {
    const text = (scene.narration || scene.dialogue || "").trim();
    const duration = scene.durationSec;
    if (!text) {
      cursor += duration;
      return;
    }
    const chunks = splitIntoChunks(text, maxChars);
    const totalChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0) || 1;
    let localStart = 0;
    chunks.forEach((chunk, chunkIndex) => {
      const share = (chunk.length / totalChars) * duration;
      const isLast = chunkIndex === chunks.length - 1;
      const end = isLast ? duration : Math.min(duration, localStart + Math.max(1, share));
      cues.push({
        start: cursor + localStart,
        end: cursor + end,
        text: chunk,
        sceneIndex: index,
      });
      localStart = end;
    });
    cursor += duration;
  });

  return cues;
}

export function srtTimestamp(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const rest = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(
    rest,
  ).padStart(3, "0")}`;
}

export function toSrt(cues: Cue[]): string {
  return cues
    .map((cue, index) => `${index + 1}\n${srtTimestamp(cue.start)} --> ${srtTimestamp(cue.end)}\n${cue.text}\n`)
    .join("\n");
}

/** Caption chunks for one scene, in scene-local seconds (used for drawtext burn-in). */
export function sceneCaptionSegments(scene: Scene, maxChars = DEFAULT_MAX_CHARS) {
  const text = (scene.narration || scene.dialogue || "").trim();
  if (!text) return [] as { start: number; end: number; text: string }[];
  const chunks = splitIntoChunks(text, maxChars);
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.length, 0) || 1;
  let cursor = 0;
  return chunks.map((chunk, index) => {
    const share = (chunk.length / totalChars) * scene.durationSec;
    const end = index === chunks.length - 1 ? scene.durationSec : Math.min(scene.durationSec, cursor + Math.max(1.2, share));
    const segment = { start: cursor, end, text: wrapCaption(chunk) };
    cursor = end;
    return segment;
  });
}

export function activeCueIndex(cues: Cue[], time: number): number {
  return cues.findIndex((cue) => time >= cue.start && time < cue.end);
}
