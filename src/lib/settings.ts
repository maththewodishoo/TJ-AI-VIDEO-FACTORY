import { useSyncExternalStore } from "react";
import type { Settings } from "./types";

const KEY = "tj-video-factory.settings.v1";

export const DEFAULT_SETTINGS: Settings = {
  agnesKey: "",
  agnesBase: "https://apihub.agnes-ai.com",
  textProvider: "agnes",
  textBaseUrl: "",
  textApiKey: "",
  textModel: "",
  ttsMode: "free",
  ttsBaseUrl: "",
  ttsApiKey: "",
  ttsModel: "tts-1",
  ttsVoice: "nova",
  ttsLang: "en",
  voiceRate: 1,
  backendUrl: "",
  appToken: "",
  concurrency: 2,
  pollIntervalSec: 15,
  sceneDuration: 5,
  subtitlesDefault: true,
  musicVolume: 0.18,
};

let cache: Settings = load();
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function getSettings(): Settings {
  return cache;
}

export function setSettings(patch: Partial<Settings>): Settings {
  cache = { ...cache, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* storage may be full or disabled — settings stay in memory */
  }
  listeners.forEach((listener) => listener());
  return cache;
}

export function resetSettings(): void {
  cache = { ...DEFAULT_SETTINGS };
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

/** Never render a full key. */
export function maskKey(key: string): string {
  if (!key) return "not set";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}${"•".repeat(Math.min(12, key.length - 8))}${key.slice(-4)}`;
}
