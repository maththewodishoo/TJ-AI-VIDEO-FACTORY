export const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:5"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const DURATIONS = [15, 30, 45, 60, 90, 120] as const;
export type DurationOption = (typeof DURATIONS)[number];

export const GENRES = [
  "Horror",
  "Mystery",
  "True crime",
  "Emotional story",
  "Documentary",
  "Historical",
  "Science fiction",
  "Motivation",
  "Educational",
  "Comedy",
  "Cinematic advertisement",
] as const;
export type Genre = (typeof GENRES)[number];

export type SceneStatus =
  | "draft"
  | "queued"
  | "submitting"
  | "generating"
  | "downloading"
  | "ready"
  | "failed";

export interface Character {
  id: string;
  name: string;
  age: string;
  appearance: string;
  clothing: string;
  hair: string;
  face: string;
  personality: string;
  voice: string;
  /** Locked descriptor appended to every scene prompt for continuity. */
  continuity: string;
  referenceUrl?: string;
  referenceBlobId?: string;
}

export interface Scene {
  id: string;
  index: number;
  title: string;
  durationSec: number;
  visualPrompt: string;
  cameraAngle: string;
  cameraMove: string;
  lighting: string;
  background: string;
  dialogue: string;
  narration: string;
  sfx: string;
  sfxPreset?: SfxPreset;
  transition: string;
  characterIds: string[];
  status: SceneStatus;
  taskId?: string;
  progress: number;
  attempts: number;
  videoBlobId?: string;
  sourceUrl?: string;
  error?: string;
  generatedAt?: number;
  startedAt?: number;
}

export interface ScriptScene {
  title: string;
  durationSec: number;
  visualPrompt: string;
  cameraAngle: string;
  cameraMove: string;
  lighting: string;
  background: string;
  dialogue: string;
  narration: string;
  sfx: string;
  transition: string;
  characterNames: string[];
}

export interface Script {
  title: string;
  logline: string;
  hook: string;
  genre: string;
  scenes: ScriptScene[];
  ending: string;
  cta: string;
  fullNarration: string;
  source: "ai" | "offline";
  model?: string;
  createdAt: number;
}

export interface NarrationState {
  voice: string;
  lang: string;
  hosted: boolean;
  rate: number;
  /** sceneId -> blobId */
  sceneAudio: Record<string, string>;
  generatedAt?: number;
  provider?: string;
  /** Set when a scene could not be narrated. */
  errors?: Record<string, string>;
}

export type MusicMode = "none" | "ambient" | "upload";
export type SfxPreset =
  | "whoosh"
  | "impact"
  | "riser"
  | "heartbeat"
  | "rain"
  | "sparkle"
  | "drone";

export interface MusicState {
  mode: MusicMode;
  blobId?: string;
  name?: string;
  volume: number;
  mood: "cinematic" | "tense" | "warm" | "uplifting";
}

export interface SfxState {
  enabled: boolean;
  volume: number;
}

export interface ExportState {
  status: "idle" | "rendering" | "ready" | "failed";
  progress: number;
  message?: string;
  blobId?: string;
  at?: number;
  aspect?: AspectRatio;
  width?: number;
  height?: number;
  bytes?: number;
  durationSec?: number;
  withNarration?: boolean;
  withSubtitles?: boolean;
  error?: string;
  log?: string[];
}

export interface GenerationState {
  stage: "idle" | "script" | "scenes" | "assembly";
  message?: string;
  startedAt?: number;
  error?: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  prompt: string;
  genre: Genre | string;
  style: string;
  language: string;
  aspectRatio: AspectRatio;
  durationSec: number;
  sceneDuration: number;
  script?: Script;
  characters: Character[];
  scenes: Scene[];
  narration: NarrationState;
  music: MusicState;
  sfx: SfxState;
  subtitles: { burnedIn: boolean };
  generation: GenerationState;
  export: ExportState;
}

export interface StoredBlob {
  id: string;
  blob: Blob;
  type: string;
  size: number;
  createdAt: number;
  label: string;
}

export type HistoryKind = "script" | "scene" | "video" | "tts" | "export" | "image";

export interface HistoryEntry {
  id: string;
  at: number;
  projectId?: string;
  projectName?: string;
  kind: HistoryKind;
  title: string;
  detail?: string;
  status: "ok" | "failed" | "info";
  durationMs?: number;
}

export interface Settings {
  agnesKey: string;
  agnesBase: string;
  textProvider: "agnes" | "custom";
  textBaseUrl: string;
  textApiKey: string;
  textModel: string;
  ttsMode: "free" | "hosted";
  ttsBaseUrl: string;
  ttsApiKey: string;
  ttsModel: string;
  ttsVoice: string;
  ttsLang: string;
  voiceRate: number;
  backendUrl: string;
  appToken: string;
  concurrency: number;
  pollIntervalSec: number;
  sceneDuration: number;
  subtitlesDefault: boolean;
  musicVolume: number;
}

export interface HealthInfo {
  ok: boolean;
  agnesBase: string;
  hasServerKey: boolean;
  hasServerTextProvider: boolean;
  hasServerTts: boolean;
  accessTokenRequired: boolean;
  rate: { remaining: number; perMinute: number };
  protocol: string;
  capabilities: Record<string, string | boolean>;
}

export interface VoiceOption {
  id: string;
  label: string;
  gender: "neutral" | "male" | "female";
  provider: "google" | "openai";
}

export interface VoiceCatalog {
  free: VoiceOption[];
  hosted: VoiceOption[];
  hostedConfigured: boolean;
  note: string;
}
