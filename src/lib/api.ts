import { useSyncExternalStore } from "react";
import { getSettings } from "./settings";
import type { AspectRatio, HealthInfo, VoiceCatalog } from "./types";

export class ApiError extends Error {
  status: number;
  code?: string;
  retryAfter?: number;
  constructor(message: string, status = 0, code?: string, retryAfter?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/* ── Backend detection ────────────────────────────────────────────────────── */

export type BackendMode = "proxy" | "direct" | "unknown";

export interface BackendState {
  mode: BackendMode;
  health?: HealthInfo;
  reason?: string;
  checkedAt: number;
}

let backendState: BackendState = { mode: "unknown", checkedAt: 0 };
const backendListeners = new Set<() => void>();

function setBackend(next: BackendState) {
  backendState = next;
  backendListeners.forEach((listener) => listener());
}

export function backendRoot(): string {
  const raw = getSettings().backendUrl.trim();
  if (!raw) return "/api";
  return `${raw.replace(/\/+$/, "")}/api`;
}

function authHeaders(): Record<string, string> {
  const settings = getSettings();
  const headers: Record<string, string> = {};
  if (settings.agnesKey.trim()) headers["x-agnes-key"] = settings.agnesKey.trim();
  if (settings.agnesBase.trim()) headers["x-agnes-base"] = settings.agnesBase.trim();
  if (settings.appToken.trim()) headers["x-app-token"] = settings.appToken.trim();
  return headers;
}

const ALLOWED_BASES = new Set(["https://apihub.agnes-ai.com", "https://api.agnes-ai.cn", "https://apihub.agnes-ai.cn"]);

function directBase(): string {
  const raw = (getSettings().agnesBase || "").trim().replace(/\/+$/, "");
  return ALLOWED_BASES.has(raw) ? raw : "https://apihub.agnes-ai.com";
}

function directKey(): string {
  const key = getSettings().agnesKey.trim();
  if (!key) {
    throw new ApiError(
      "No Agnes API key. Get a free key at platform.agnes-ai.com and paste it in API Configuration (or set AGNES_API_KEY on the server).",
      401,
      "missing_key",
    );
  }
  return key;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 45_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function parseFailure(res: Response): Promise<ApiError> {
  let message = `Request failed (HTTP ${res.status})`;
  let code: string | undefined;
  try {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = (await res.json()) as {
        error?: { message?: string; code?: string } | string;
        message?: string;
        code?: string;
      };
      if (typeof body.error === "object" && body.error?.message) {
        message = body.error.message;
        code = body.error.code;
      } else if (typeof body.error === "string") {
        message = body.error;
      } else if (body.message) {
        message = body.message;
        code = body.code;
      }
    } else if (res.status === 404) {
      message = "API backend not reachable at this address (404).";
      code = "no_backend";
    }
  } catch {
    /* ignore */
  }
  if (res.status === 401 && !code) message = "Invalid or missing API key.";
  return new ApiError(message, res.status, code, Number(res.headers.get("retry-after")) || undefined);
}

function isNetworkError(err: unknown): boolean {
  return (
    err instanceof TypeError ||
    (err instanceof DOMException && err.name === "AbortError") ||
    (err instanceof Error && /failed to fetch|network|load failed/i.test(err.message))
  );
}

/** True when the request likely failed because there is no same-origin backend. */
function isBackendMissing(err: unknown): boolean {
  return err instanceof ApiError && (err.status === 404 || err.status === 405 || err.code === "no_backend");
}

export async function probeBackend(force = false): Promise<BackendState> {
  if (!force && backendState.mode !== "unknown" && Date.now() - backendState.checkedAt < 60_000) {
    return backendState;
  }
  try {
    const res = await fetchWithTimeout(`${backendRoot()}/health`, { headers: authHeaders() }, 8_000);
    if (!res.ok) throw await parseFailure(res);
    const health = (await res.json()) as HealthInfo;
    setBackend({ mode: "proxy", health, checkedAt: Date.now() });
    return backendState;
  } catch (err) {
    const hasKey = Boolean(getSettings().agnesKey.trim());
    const missing = isBackendMissing(err) || isNetworkError(err);
    setBackend({
      mode: hasKey && missing ? "direct" : "proxy",
      checkedAt: Date.now(),
      reason: !missing
        ? (err as Error).message
        : hasKey
          ? "No server backend detected — using your browser key directly to reach Agnes AI."
          : "No server backend detected. Add your own Agnes key in API Configuration, or deploy the included Cloudflare Worker.",
    });
    return backendState;
  }
}

function subscribeBackend(listener: () => void) {
  backendListeners.add(listener);
  return () => backendListeners.delete(listener);
}

export function useBackend(): BackendState {
  return useSyncExternalStore(subscribeBackend, () => backendState, () => backendState);
}

export function backendLabel(state: BackendState): string {
  if (state.mode === "proxy" && state.health?.hasServerKey) return "Server key";
  if (state.mode === "proxy" && state.health) return "Proxy backend";
  if (state.mode === "direct") return "Direct · your key";
  return "Not configured";
}

/* ── Text ─────────────────────────────────────────────────────────────────── */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chat(
  messages: ChatMessage[],
  options: { temperature?: number; maxTokens?: number } = {},
): Promise<{ text: string; model: string; provider: string }> {
  const settings = getSettings();
  const body = {
    messages,
    temperature: options.temperature ?? 0.75,
    maxTokens: options.maxTokens ?? 4096,
    provider: settings.textProvider === "custom" ? ("custom" as const) : ("agnes" as const),
    baseUrl: settings.textProvider === "custom" ? settings.textBaseUrl : undefined,
    apiKey: settings.textProvider === "custom" ? settings.textApiKey : undefined,
    model: settings.textModel || undefined,
  };

  if (backendState.mode !== "direct") {
    try {
      const res = await fetchWithTimeout(
        `${backendRoot()}/chat`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders() },
          body: JSON.stringify(body),
        },
        150_000,
      );
      if (!res.ok) throw await parseFailure(res);
      return (await res.json()) as { text: string; model: string; provider: string };
    } catch (err) {
      if (!isNetworkError(err) && !isBackendMissing(err)) throw err;
      if (!getSettings().agnesKey.trim()) throw err;
      setBackend({ mode: "direct", checkedAt: Date.now(), reason: "Using direct browser access." });
    }
  }

  // Direct mode: OpenAI-compatible chat from the browser (Agnes allows CORS).
  const custom = settings.textProvider === "custom";
  const base = custom ? settings.textBaseUrl.replace(/\/+$/, "") : directBase();
  const key = custom ? settings.textApiKey.trim() : directKey();
  if (!base || !key) throw new ApiError("Configure the text provider base URL and key first.", 400, "missing_provider");
  const res = await fetchWithTimeout(
    `${base}/chat/completions`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: settings.textModel || (custom ? "gpt-4o-mini" : "agnes-3.0-flash"),
        messages,
        temperature: options.temperature ?? 0.75,
        max_tokens: Math.min(options.maxTokens ?? 4096, 8192),
      }),
    },
    150_000,
  );
  if (!res.ok) throw await parseFailure(res);
  const data = (await res.json()) as { model?: string; choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content || "";
  if (!text.trim()) throw new ApiError("The text model returned an empty response.", 502, "empty_response");
  return { text, model: data.model || "agnes", provider: custom ? "custom" : "agnes" };
}

/* ── Video ────────────────────────────────────────────────────────────────── */

export interface SubmitVideoOptions {
  prompt: string;
  seconds: number;
  aspectRatio: AspectRatio;
  seed?: number;
  images?: string[];
}

export async function submitVideo(
  options: SubmitVideoOptions,
): Promise<{ videoId: string; seconds: number; model: string }> {
  const seconds = Math.max(4, Math.min(12, Math.round(options.seconds)));

  if (backendState.mode !== "direct") {
    try {
      const res = await fetchWithTimeout(
        `${backendRoot()}/video`,
        {
          method: "POST",
          headers: { "content-type": "application/json", ...authHeaders() },
          body: JSON.stringify({ ...options, seconds }),
        },
        90_000,
      );
      if (!res.ok) throw await parseFailure(res);
      return (await res.json()) as { videoId: string; seconds: number; model: string };
    } catch (err) {
      if (!isNetworkError(err) && !isBackendMissing(err)) throw err;
      if (!getSettings().agnesKey.trim()) throw err;
      setBackend({ mode: "direct", checkedAt: Date.now(), reason: "Using direct browser access." });
    }
  }

  const base = directBase();
  const key = directKey();
  const images = (options.images || []).filter(Boolean).slice(0, 3);
  const payload: Record<string, unknown> = {
    model: "agnes-video-2.5-flash",
    prompt: options.prompt,
    mode: images.length ? "reference" : "text",
    seconds: String(seconds),
    size: "720P",
    aspect_ratio: options.aspectRatio,
  };
  if (images.length) payload.reference = { images };
  if (typeof options.seed === "number") payload.seed = options.seed;

  const res = await fetchWithTimeout(
    `${base}/v1/videos`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    },
    90_000,
  );
  if (!res.ok) throw await parseFailure(res);
  const data = (await res.json()) as Record<string, unknown>;
  const nested = (data.data || {}) as Record<string, unknown>;
  const videoId = String(data.video_id || data.task_id || data.id || nested.id || "");
  if (!videoId) throw new ApiError("The provider accepted the request but returned no task id.", 502, "no_task_id");
  return { videoId, seconds, model: "agnes-video-2.5-flash" };
}

export interface VideoStatusResult {
  status: "pending" | "processing" | "completed" | "failed" | "unknown";
  progress: number;
  videoUrl?: string;
  error?: string;
  taskId: string;
}

export async function getVideoStatus(videoId: string): Promise<VideoStatusResult> {
  if (backendState.mode !== "direct") {
    try {
      const res = await fetchWithTimeout(
        `${backendRoot()}/video?id=${encodeURIComponent(videoId)}`,
        { headers: authHeaders() },
        30_000,
      );
      if (!res.ok) throw await parseFailure(res);
      return (await res.json()) as VideoStatusResult;
    } catch (err) {
      if (!isNetworkError(err) && !isBackendMissing(err)) throw err;
      if (!getSettings().agnesKey.trim()) throw err;
      setBackend({ mode: "direct", checkedAt: Date.now(), reason: "Using direct browser access." });
    }
  }

  const base = directBase();
  const key = directKey();
  let res = await fetchWithTimeout(
    `${base}/v1/videos/${encodeURIComponent(videoId)}`,
    { headers: { authorization: `Bearer ${key}` } },
    30_000,
  );
  let payload: Record<string, unknown> = {};
  if (res.status === 400 || res.status === 404) {
    const legacy = await fetchWithTimeout(
      `${base}/agnesapi?video_id=${encodeURIComponent(videoId)}`,
      { headers: { authorization: `Bearer ${key}` } },
      30_000,
    );
    if (!legacy.ok) throw await parseFailure(res);
    payload = (await legacy.json()) as Record<string, unknown>;
  } else if (!res.ok) {
    throw await parseFailure(res);
  } else {
    payload = (await res.json()) as Record<string, unknown>;
  }

  const raw = String(payload.status || "").toLowerCase();
  const status: VideoStatusResult["status"] =
    ["completed", "succeeded", "success", "done"].includes(raw)
      ? "completed"
      : ["failed", "error", "cancelled"].includes(raw)
        ? "failed"
        : ["pending", "queued", "submitted"].includes(raw)
          ? "pending"
          : ["processing", "running", "generating"].includes(raw)
            ? "processing"
            : "unknown";
  const meta = (payload.metadata || {}) as Record<string, unknown>;
  const data = (payload.data || {}) as Record<string, unknown>;
  const url = [payload.video_url, payload.url, data.video_url, data.url, meta.url, meta.video_url].find(
    (v): v is string => typeof v === "string" && v.startsWith("http"),
  );
  const errObj = payload.error as { message?: string; code?: string } | string | undefined;
  return {
    status,
    progress: Math.max(0, Math.min(100, Number(payload.progress ?? payload.internal_progress ?? 0) || 0)),
    videoUrl: url,
    error: status === "failed" ? (typeof errObj === "string" ? errObj : errObj?.message || "Generation failed") : undefined,
    taskId: videoId,
  };
}

export async function downloadMedia(url: string): Promise<Blob> {
  if (backendState.mode !== "direct") {
    try {
      const res = await fetchWithTimeout(`${backendRoot()}/download?url=${encodeURIComponent(url)}`, {}, 240_000);
      if (!res.ok) throw await parseFailure(res);
      const blob = await res.blob();
      if (blob.size < 1024) throw new ApiError("Downloaded file looks empty.", 502, "empty_media");
      return blob;
    } catch (err) {
      if (!isNetworkError(err) && !isBackendMissing(err)) throw err;
    }
  }
  // Direct: may work when the media CDN sends CORS headers.
  const res = await fetchWithTimeout(url, {}, 240_000);
  if (!res.ok) {
    throw new ApiError(
      `Could not download the clip (HTTP ${res.status}). Deploy the included Cloudflare Worker backend to proxy media downloads.`,
      502,
      "download_blocked",
    );
  }
  return res.blob();
}

/* ── Images, TTS, diagnostics ─────────────────────────────────────────────── */

export async function generateImage(prompt: string): Promise<{ url?: string; pending?: boolean; note?: string }> {
  if (backendState.mode === "direct") {
    const base = directBase();
    const key = directKey();
    const res = await fetchWithTimeout(
      `${base}/v1/images/generations`,
      {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: "agnes-image-2.5-flash", prompt, n: 1, size: "1024x1024" }),
      },
      120_000,
    );
    if (!res.ok) throw await parseFailure(res);
    const data = (await res.json()) as { data?: { url?: string; b64_json?: string }[]; url?: string };
    const first = data.data?.[0];
    const url = first?.url || data.url || (first?.b64_json ? `data:image/png;base64,${first.b64_json}` : undefined);
    return url ? { url } : { pending: true, note: "Queued without a direct URL." };
  }
  const res = await fetchWithTimeout(
    `${backendRoot()}/image`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ prompt }),
    },
    120_000,
  );
  if (!res.ok) throw await parseFailure(res);
  return (await res.json()) as { url?: string; pending?: boolean; note?: string };
}

/** Narration audio requires the proxy backend (the free TTS endpoint has no CORS). */
export async function synthesizeSpeech(text: string, options: { hosted?: boolean } = {}): Promise<Blob> {
  const settings = getSettings();
  if (backendState.mode === "direct") {
    throw new ApiError(
      "Narration needs the server backend. Set AGNES_API_KEY on the included Cloudflare Worker (or run the app with `bun dev`) so narration can be generated without exposing the free TTS endpoint to browser CORS limits.",
      503,
      "tts_needs_backend",
    );
  }
  const hosted = options.hosted ?? settings.ttsMode === "hosted";
  const res = await fetchWithTimeout(
    `${backendRoot()}/tts`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({
        text,
        voice: settings.ttsVoice,
        lang: settings.ttsLang,
        provider: hosted ? "hosted" : "free",
        baseUrl: settings.ttsBaseUrl || undefined,
        apiKey: settings.ttsApiKey || undefined,
      }),
    },
    120_000,
  );
  if (!res.ok) throw await parseFailure(res);
  return res.blob();
}

export async function getVoices(): Promise<VoiceCatalog> {
  const res = await fetchWithTimeout(`${backendRoot()}/tts/voices`, { headers: authHeaders() }, 20_000);
  if (!res.ok) throw await parseFailure(res);
  return (await res.json()) as VoiceCatalog;
}

export async function testConnection(): Promise<{
  ok: boolean;
  models?: string[];
  message: string;
  source?: string;
}> {
  if (backendState.mode === "direct") {
    const base = directBase();
    const key = directKey();
    const res = await fetchWithTimeout(`${base}/v1/models`, { headers: { authorization: `Bearer ${key}` } }, 30_000);
    if (!res.ok) throw await parseFailure(res);
    const data = (await res.json()) as { data?: { id?: string }[] };
    const models = (data.data || []).map((m) => m.id).filter((v): v is string => Boolean(v));
    return { ok: true, models, message: `Connected directly to ${base}.`, source: "browser key" };
  }
  const res = await fetchWithTimeout(
    `${backendRoot()}/test`,
    { method: "POST", headers: { "content-type": "application/json", ...authHeaders() }, body: "{}" },
    40_000,
  );
  if (!res.ok) throw await parseFailure(res);
  const data = (await res.json()) as { models?: string[]; base?: string; keySource?: string };
  return { ok: true, models: data.models, message: `Connected to ${data.base}.`, source: data.keySource };
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
