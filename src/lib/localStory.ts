import { scenePlan } from "./plan";
import type { Character, Script, ScriptScene } from "./types";

/**
 * Offline draft engine — used ONLY when no AI text model is reachable.
 * It is a deterministic story scaffold, not an AI: the UI labels it clearly and
 * the user can regenerate with a real model at any time.
 */

interface Flavour {
  palette: string;
  locations: string[];
  mood: string;
  names: [string, string][];
}

const FLAVOURS: Record<string, Flavour> = {
  Horror: {
    palette: "desaturated teal and sickly amber",
    locations: ["a fog-choked forest trail", "a decaying farmhouse hallway", "a basement lit by one bare bulb", "a rain-lashed porch"],
    mood: "dread-soaked, slow-burning",
    names: [["Mara", "29, pale, dark-eyed"], ["Silas", "54, gaunt, weathered"]],
  },
  Mystery: {
    palette: "cold blue night with warm practical lamps",
    locations: ["a rain-slick city street", "an archive room stacked with boxes", "a diner at 2 a.m.", "a house with every curtain drawn"],
    mood: "quietly tense and methodical",
    names: [["Elias", "41, sharp-eyed, tired"], ["Nadia", "36, composed, watchful"]],
  },
  "True crime": {
    palette: "documentary neutrals, sodium street light",
    locations: ["a quiet suburban cul-de-sac", "an evidence table under fluorescent light", "a windswept highway shoulder", "a courtroom corridor"],
    mood: "sober and investigative",
    names: [["Rowan", "46, sturdy, grey at the temples"], ["Iris", "38, precise, unwavering"]],
  },
  "Emotional story": {
    palette: "golden hour warmth with soft shadows",
    locations: ["a kitchen at dawn", "a nearly empty apartment", "a bus stop in the rain", "a shoreline at dusk"],
    mood: "tender, restrained, human",
    names: [["June", "33, open face, tired smile"], ["Andre", "37, gentle, broad-shouldered"]],
  },
  Documentary: {
    palette: "natural light, muted earth tones",
    locations: ["a windswept ridge", "a working harbour", "a cluttered workshop", "a vast open plain"],
    mood: "observational and cinematic",
    names: [["The subject", "middle-aged, weathered hands"]],
  },
  Historical: {
    palette: "candlelit amber and deep shadow",
    locations: ["a stone courtyard before dawn", "a lamplit study", "a crowded market lane", "a windswept coastal fort"],
    mood: "sweeping and grounded",
    names: [["Amara", "27, dark curls, period wool coat"], ["Tomas", "52, grey beard, heavy cloak"]],
  },
  "Science fiction": {
    palette: "cyan bioluminescence against black",
    locations: ["a corridor of humming conduits", "a observation deck above a ringed planet", "a dust-stormed outpost", "a server cathedral"],
    mood: "awe-struck and cold",
    names: [["Kai", "31, close-cropped hair, scarred brow"], ["Vela", "an android with mirrored eyes"]],
  },
  Motivation: {
    palette: "high-contrast dawn light",
    locations: ["an empty stadium at sunrise", "a steep mountain trail", "a bare room with one window", "a city skyline at first light"],
    mood: "driving and cinematic",
    names: [["The runner", "lean, determined, breath visible"]],
  },
  Educational: {
    palette: "clean daylight, crisp contrast",
    locations: ["a bright studio desk", "a workshop bench", "a slow-motion macro set", "a wall of annotated notes"],
    mood: "clear and inviting",
    names: [["The presenter", "friendly, mid-thirties, rolled sleeves"]],
  },
  Comedy: {
    palette: "saturated pastels, bright practicals",
    locations: ["a chaotic shared kitchen", "a too-small car", "an office break room", "a supermarket aisle"],
    mood: "deadpan and brisk",
    names: [["Theo", "26, rumpled, expressive eyebrows"], ["Priya", "29, immaculate, unimpressed"]],
  },
  "Cinematic advertisement": {
    palette: "glossy black with one hero accent colour",
    locations: ["a seamless studio void", "a rain-glazed city rooftop", "a slow-motion water set", "a minimalist interior"],
    mood: "premium and precise",
    names: [["The hero", "styled, confident, immaculate"]],
  },
};

const BEATS: { narration: string; action: string; camera: string; lighting: string; sfx: string }[] = [
  { narration: "It began with something small enough to ignore.", action: "a single object resting in the centre of the frame", camera: "slow push-in, macro detail", lighting: "one hard light raking across the surface", sfx: "low room tone" },
  { narration: "But nothing stays small for long.", action: "the subject steps into the space and notices it", camera: "wide establishing shot, slight handheld drift", lighting: "cold ambient glow from one side", sfx: "distant wind" },
  { narration: "The first answer only made the question sharper.", action: "hands reach out, hesitate, then commit", camera: "over-the-shoulder close-up", lighting: "warm practical light against deep shadow", sfx: "fabric movement" },
  { narration: "So the search began, quietly at first.", action: "the subject moves through an unfamiliar place, searching", camera: "tracking shot from behind", lighting: "moody pools of light", sfx: "footsteps on concrete" },
  { narration: "Every clue pointed somewhere they did not want to go.", action: "a door opens onto a room that should be empty", camera: "slow dolly forward", lighting: "a single shaft of light through blinds", sfx: "door hinge creak" },
  { narration: "The past had been waiting there the whole time.", action: "dust drifts through a beam of light over old evidence", camera: "top-down insert, shallow focus", lighting: "soft directional daylight", sfx: "paper shifting" },
  { narration: "What they found changed the shape of everything after.", action: "the subject freezes, breath visible, eyes widening", camera: "extreme close-up on the eyes", lighting: "rim light and falloff", sfx: "heartbeat" },
  { narration: "There was no way back to the version of themselves that began this.", action: "the subject walks away from a lit doorway into darkness", camera: "static wide shot, subject small in frame", lighting: "high contrast silhouette", sfx: "low drone" },
  { narration: "Doubt arrived like weather.", action: "the subject sits alone, hands clasped, rain on glass", camera: "slow lateral slide", lighting: "cool blue window light", sfx: "rain on glass" },
  { narration: "But giving up was its own kind of answer, and it was not the one they wanted.", action: "the subject stands and makes a decision", camera: "low angle, slow rise", lighting: "warm light returning", sfx: "rising tone" },
  { narration: "They went back to the beginning and looked again.", action: "the subject retraces steps with new purpose", camera: "fast tracking shot", lighting: "uneven practical lights", sfx: "quickened footsteps" },
  { narration: "This time, the detail they had missed was impossible to unsee.", action: "a hand lifts a hidden object into the light", camera: "macro insert, slow rotation", lighting: "hard specular highlight", sfx: "metallic click" },
  { narration: "Everything moved faster now.", action: "intercut actions build momentum", camera: "whip pan between details", lighting: "strobing warm and cold", sfx: "pulse rising" },
  { narration: "The truth was close enough to feel.", action: "the subject runs toward a distant light", camera: "handheld chase", lighting: "blown-out highlights", sfx: "wind rush" },
  { narration: "And when it finally surfaced, it was not clean. It was human.", action: "two subjects face each other in silence", camera: "two-shot, slow push-in", lighting: "soft warmth, deep background", sfx: "single piano note" },
  { narration: "They chose what to carry and what to leave behind.", action: "the subject sets an object down and walks on", camera: "static wide, long lens", lighting: "golden hour", sfx: "ambient swell" },
  { narration: "The light changed, and with it, the room.", action: "sunlight floods an interior", camera: "slow tilt up", lighting: "bright break in the clouds", sfx: "soft chime" },
  { narration: "For the first time in a long time, the silence was not heavy.", action: "the subject exhales, shoulders lowering", camera: "close-up, shallow depth", lighting: "gentle backlight", sfx: "breath" },
  { narration: "Some stories end where they started, only with different eyes.", action: "the original location, now transformed", camera: "mirrored shot from scene one", lighting: "same angle, warmer colour", sfx: "theme motif" },
  { narration: "And the small thing that started it all was small again.", action: "the opening object, now in a new place", camera: "macro pull-back", lighting: "clean and quiet", sfx: "room tone" },
  { narration: "It stays with you, if you let it.", action: "the subject looks out over an open horizon", camera: "wide landscape, slow drift", lighting: "soft dawn", sfx: "wind through grass" },
  { narration: "Not as a warning. As a reminder.", action: "final portrait of the subject, still and steady", camera: "centred portrait, shallow focus", lighting: "single soft key", sfx: "low strings" },
  { narration: "The next step is yours.", action: "the subject turns toward camera and holds", camera: "locked-off close-up", lighting: "warm rim", sfx: "final tone" },
  { narration: "And that is where this chapter closes.", action: "the frame empties until only the light remains", camera: "slow fade with movement", lighting: "fading practicals", sfx: "tail reverb" },
];

const STOPWORDS = new Set([
  "a","an","the","of","in","on","at","to","for","with","and","or","but","who","that","this","is","are","was","were",
  "about","into","from","by","as","it","its","their","his","her","they","them","when","where","how","why","one","some",
]);

function keywords(prompt: string): string[] {
  const words = prompt
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  const unique: string[] = [];
  for (const word of words) if (!unique.includes(word)) unique.push(word);
  return unique.slice(0, 4);
}

function titleCase(text: string): string {
  return text.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

function flavourFor(genre: string): Flavour {
  return FLAVOURS[genre] || FLAVOURS.Mystery;
}

export function offlineCharacters(prompt: string, genre: string): Character[] {
  return castNames(prompt, genre);
}

function castNames(prompt: string, genre: string): Character[] {
  const flavour = flavourFor(genre);
  const names = keywords(prompt);
  const primary = flavour.names[0];
  const secondary = flavour.names[1];
  const isTalkingHead = genre === "Documentary" || genre === "Educational";
  const cast: Character[] = [
    {
      id: "char-1",
      name: isTalkingHead ? primary[0] : names[0] ? titleCase(names[0]) : primary[0],
      age: primary[1].split(",")[0],
      appearance: `${primary[1]}, wearing ${genre === "Historical" ? "period wool layers" : "weather-worn everyday clothes"}`,
      clothing: genre === "Historical" ? "heavy wool coat, leather boots" : "simple dark jacket, worn jeans",
      hair: "shoulder-length, slightly unkempt",
      face: "expressive eyes, faint lines around the mouth",
      personality: "observant, stubborn, quietly kind",
      voice: "low, measured, close to the microphone",
      continuity: "",
    },
  ];
  if (!isTalkingHead) {
    cast.push({
      id: "char-2",
      name: secondary[0],
      age: secondary[1].split(",")[0],
      appearance: secondary[1],
      clothing: "practical field clothing, muted colours",
      hair: "short and neat",
      face: "sharp features, steady gaze",
      personality: "guarded, precise, loyal",
      voice: "clear, dry, deliberate",
      continuity: "",
    });
  }
  cast.forEach((character) => {
    character.continuity = `${character.name}, ${character.age} years old, ${character.appearance}, ${character.hair}, ${character.clothing}`;
  });
  return cast;
}

export function offlineScript(input: {
  prompt: string;
  genre: string;
  style: string;
  durationSec: number;
  sceneDuration: number;
  aspectRatio: string;
  language: string;
}): Script {
  const durations = scenePlan(input.durationSec, input.sceneDuration);
  const flavour = flavourFor(input.genre);
  const subjectWords = keywords(input.prompt);
  const subject = subjectWords.length ? subjectWords.slice(0, 2).join(" ") : "the story";
  const cast = offlineCharacters(input.prompt, input.genre);
  const hero = cast[0];
  const heroContinuity = `${hero.name}, ${hero.age} years old, ${hero.appearance}, ${hero.hair}, ${hero.clothing}`;

  const scenes: ScriptScene[] = durations.map((duration, index) => {
    const beat = BEATS[index % BEATS.length];
    const location = flavour.locations[index % flavour.locations.length];
    const secondBeat = BEATS[(index + 6) % BEATS.length];
    const action = index % 3 === 0 ? beat.action : secondBeat.action;
    const narration =
      index === 0
        ? `${titleCase(subject)}. ${beat.narration}`
        : index === durations.length - 1
          ? beat.narration
          : beat.narration;
    const visualPrompt = `${location}, ${heroContinuity}, ${action}. ${flavour.palette} palette, ${flavour.mood} atmosphere, ${beat.camera}, ${beat.lighting}, shallow depth of field, 35mm film still, ${input.style}.`;
    return {
      title: `${index + 1}. ${titleCase(beat.narration.split(" ").slice(0, 5).join(" "))}`,
      durationSec: duration,
      visualPrompt,
      cameraAngle: beat.camera.split(",")[0],
      cameraMove: beat.camera.split(",")[1] || "slow push-in",
      lighting: beat.lighting,
      background: location,
      dialogue: "",
      narration,
      sfx: beat.sfx,
      transition: index === 0 ? "fade in" : index % 4 === 3 ? "soft dissolve" : "hard cut",
      characterNames: [hero.name],
    };
  });

  return {
    title: titleCase(subject),
    logline: `${titleCase(input.prompt.slice(0, 120))} — a ${input.genre.toLowerCase()} short told in ${durations.length} scenes.`,
    hook: scenes[0]?.narration || "",
    genre: input.genre,
    scenes,
    ending: scenes[scenes.length - 1]?.narration || "",
    cta: input.genre === "Cinematic advertisement" ? "Available now." : "Follow for the next story.",
    fullNarration: scenes.map((scene) => scene.narration).join(" "),
    source: "offline",
    createdAt: Date.now(),
  };
}
