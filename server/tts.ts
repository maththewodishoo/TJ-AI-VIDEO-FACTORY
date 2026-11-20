/**
 * Narration (TTS) server module.
 *
 * Free path: Google Translate TTS, which returns MP3 and needs no key. It is an
 * undocumented, rate-limited public endpoint (roughly 200 chars per request), so
 * text is chunked and the chunks are joined. It has exactly ONE voice per
 * language and no gender selection — the UI states this explicitly.
 *
 * Optional path: any OpenAI-compatible /v1/audio/speech endpoint (user key or
 * server env), which unlocks real male/female voice choice.
 */
import { UpstreamError } from "./agnes";
import type { Env } from "./types";

export interface VoiceOption {
  id: string;
  label: string;
  gender: "neutral" | "male" | "female";
  provider: "google" | "openai";
}

/** Languages served by the free provider (verified working: en). */
export const FREE_VOICES: VoiceOption[] = [
  { id: "en", label: "English (US)", gender: "neutral", provider: "google" },
  { id: "en-GB", label: "English (UK)", gender: "neutral", provider: "google" },
  { id: "es", label: "Spanish", gender: "neutral", provider: "google" },
  { id: "fr", label: "French", gender: "neutral", provider: "google" },
  { id: "de", label: "German", gender: "neutral", provider: "google" },
  { id: "it", label: "Italian", gender: "neutral", provider: "google" },
  { id: "pt", label: "Portuguese (BR)", gender: "neutral", provider: "google" },
  { id: "hi", label: "Hindi", gender: "neutral", provider: "google" },
  { id: "ar", label: "Arabic", gender: "neutral", provider: "google" },
  { id: "ja", label: "Japanese", gender: "neutral", provider: "google" },
  { id: "ko", label: "Korean", gender: "neutral", provider: "google" },
  { id: "zh-CN", label: "Chinese (Mandarin)", gender: "neutral", provider: "google" },
  { id: "ru", label: "Russian", gender: "neutral", provider: "google" },
  { id: "tr", label: "Turkish", gender: "neutral", provider: "google" },
  { id: "id", label: "Indonesian", gender: "neutral", provider: "google" },
  { id: "vi", label: "Vietnamese", gender: "neutral", provider: "google" },
  { id: "th", label: "Thai", gender: "neutral", provider: "google" },
  { id: "pl", label: "Polish", gender: "neutral", provider: "google" },
  { id: "nl", label: "Dutch", gender: "neutral", provider: "google" },
  { id: "sv", label: "Swedish", gender: "neutral", provider: "google" },
  { id: "uk", label: "Ukrainian", gender: "neutral", provider: "google" },
  { id: "ur", label: "Urdu", gender: "neutral", provider: "google" },
];

const OPENAI_VOICES: VoiceOption[] = [
  { id: "alloy", label: "Alloy — neutral", gender: "neutral", provider: "openai" },
  { id: "echo", label: "Echo — male", gender: "male", provider: "openai" },
  { id: "fable", label: "Fable — expressive", gender: "neutral", provider: "openai" },
  { id: "onyx", label: "Onyx — deep male", gender: "male", provider: "openai" },
  { id: "nova", label: "Nova — female", gender: "female", provider: "openai" },
  { id: "shimmer", label: "Shimmer — female", gender: "female", provider: "openai" },
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

export function voiceCatalog(env: Env) {
  const hosted = Boolean(env.TTS_API_KEY && env.TTS_API_BASE);
  return {
    free: FREE_VOICES,
    hosted: OPENAI_VOICES,
    hostedConfigured: hosted,
    note: hosted
      ? "A server-side TTS provider is configured, so male/female voices are available."
      : "Free narration uses Google Translate TTS: one voice per language, no gender choice, rate-limited. Add an OpenAI-compatible TTS key in API Configuration for male/female voices.",
  };
}

function sanitize(text: string): string {
  return text
    .replace(/[*_#`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split into <=190 char chunks on sentence, then word, boundaries. */
export function chunkText(text: string, max = 190): string[] {
  const clean = sanitize(text);
  if (!clean) return [];
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  const sentences = clean.match(/[^.!?]+[.!?]+["')\]]*|\S[^.!?]*$/g) || [clean];
  for (const sentence of sentences) {
    if (sentence.length > max) {
      push();
      for (const word of sentence.split(/\s+/)) {
        if ((current + " " + word).trim().length > max) push();
        current = `${current} ${word}`.trim();
      }
      push();
    } else if ((current + " " + sentence).trim().length > max) {
      push();
      current = sentence.trim();
    } else {
      current = `${current} ${sentence}`.trim();
    }
  }
  push();
  return chunks;
}

async function googleTts(text: string, lang: string): Promise<Uint8Array> {
  const parts = chunkText(text);
  if (!parts.length) throw new UpstreamError("Nothing to narrate.", 400, "empty_text");
  if (parts.length > 40) throw new UpstreamError("Narration is too long for one clip.", 400, "text_too_long");

  const buffers: Uint8Array[] = [];
  for (const [i, part] of parts.entries()) {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(
      lang || "en",
    )}&q=${encodeURIComponent(part)}`;
    const res = await fetch(url, {
      headers: { "user-agent": UA, referer: "https://translate.google.com/" },
    });
    if (!res.ok) {
      throw new UpstreamError(
        `Free TTS is unavailable right now (HTTP ${res.status}). Try again later, shorten the narration, or configure a hosted TTS provider.`,
        502,
        "tts_unavailable",
      );
    }
    buffers.push(new Uint8Array(await res.arrayBuffer()));
    if (i < parts.length - 1) await new Promise((r) => setTimeout(r, 150));
  }
  const total = buffers.reduce((n, b) => n + b.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    out.set(b, offset);
    offset += b.length;
  }
  return out;
}

async function hostedTts(
  text: string,
  voice: string,
  base: string,
  key: string,
  model: string,
): Promise<Uint8Array> {
  const root = base.replace(/\/+$/, "");
  const res = await fetch(`${root}/audio/speech`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, input: sanitize(text), voice, response_format: "mp3" }),
  });
  if (!res.ok) {
    let message = `Hosted TTS failed (HTTP ${res.status}).`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body.error?.message) message = body.error.message;
    } catch {
      /* ignore */
    }
    throw new UpstreamError(message, res.status, "tts_failed");
  }
  return new Uint8Array(await res.arrayBuffer());
}

export async function synthesize(
  env: Env,
  body: { text: string; voice?: string; lang?: string; provider?: "free" | "hosted"; baseUrl?: string; apiKey?: string },
): Promise<{ audio: Uint8Array; provider: string }> {
  const text = (body.text || "").trim();
  if (!text) throw new UpstreamError("Narration text is empty.", 400, "empty_text");

  const wantsHosted = body.provider === "hosted";
  const base = (body.baseUrl || env.TTS_API_BASE || "").trim();
  const key = (body.apiKey || env.TTS_API_KEY || "").trim();

  if ((wantsHosted || (!body.provider && key && base)) && base && key) {
    const voice = body.voice && body.voice.length < 40 ? body.voice : "nova";
    const audio = await hostedTts(text, voice, base, key, env.TTS_MODEL || "tts-1");
    return { audio, provider: "hosted" };
  }

  const audio = await googleTts(text, body.lang || "en");
  return { audio, provider: "google" };
}
