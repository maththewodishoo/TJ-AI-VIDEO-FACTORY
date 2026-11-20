/**
 * Server-side Agnes AI client.
 *
 * Verified against the official provider docs (https://video.lichuanyang.top/en/api-docs)
 * and the open-source client (github.com/lcy362/agnes-video-generator):
 *   POST {base}/v1/videos            -> { video_id | task_id | id }
 *   GET  {base}/v1/videos/{id}       -> { status, progress, metadata.url }   (REST)
 *   GET  {base}/agnesapi?video_id=   -> legacy gateway endpoint
 *   POST {base}/v1/chat/completions  -> OpenAI-compatible chat
 *   POST {base}/v1/images/generations
 *   GET  {base}/v1/models
 *
 * The retired v2.0 protocol (width/height/num_frames) is NOT used. The current
 * 2.5 protocol is mode/seconds/size/aspect_ratio, with seconds clamped to 4-12.
 */
import {
  ASPECT_RATIOS,
  DEFAULT_AGNES_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_TEXT_MODEL,
  type AgnesCreds,
  type AspectRatio,
} from "./types";

export class UpstreamError extends Error {
  status: number;
  code?: string;
  retryAfter?: number;
  constructor(message: string, status = 502, code?: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

/* ── Shared 16 req/min token bucket (the provider's documented quota) ───────── */
const RATE_PER_MIN = 16;
const BUCKET_CAPACITY = 8;
let tokens = BUCKET_CAPACITY;
let lastRefill = Date.now();

function refill() {
  const now = Date.now();
  const gained = ((now - lastRefill) / 60_000) * RATE_PER_MIN;
  if (gained > 0) {
    tokens = Math.min(BUCKET_CAPACITY, tokens + gained);
    lastRefill = now;
  }
}

/** Throws a 429-shaped error instead of silently hammering the provider. */
export function takeToken(weight = 1) {
  refill();
  if (tokens < weight) {
    throw new UpstreamError(
      "Local rate limit reached (16 requests/minute, the provider quota). Retrying shortly.",
      429,
      "client_rate_limit",
      Math.ceil(((weight - tokens) / RATE_PER_MIN) * 60),
    );
  }
  tokens -= weight;
}

export function rateBudget() {
  refill();
  return { remaining: Math.floor(tokens), perMinute: RATE_PER_MIN };
}

async function upstream(
  creds: AgnesCreds,
  path: string,
  init: RequestInit = {},
  retries = 2,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${creds.base}${path}`, {
        ...init,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${creds.key}`,
          ...(init.headers as Record<string, string> | undefined),
        },
      });
      if (res.status === 429 || res.status >= 500) {
        const wait = Number(res.headers.get("retry-after")) || 2 + attempt * 3;
        if (attempt < retries) {
          await sleep(wait * 1000);
          lastError = new UpstreamError(`Agnes upstream busy (HTTP ${res.status})`, res.status);
          continue;
        }
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) await sleep(1200 * (attempt + 1));
    }
  }
  throw new UpstreamError(
    `Could not reach the Agnes API: ${lastError instanceof Error ? lastError.message : "network error"}`,
    502,
    "network",
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function readError(res: Response): Promise<UpstreamError> {
  let message = `Agnes API error (HTTP ${res.status})`;
  let code: string | undefined;
  try {
    const body = (await res.json()) as Record<string, unknown>;
    const err = body.error as Record<string, unknown> | string | undefined;
    if (err && typeof err === "object") {
      message = String(err.message || message);
      code = err.code ? String(err.code) : undefined;
    } else if (typeof err === "string") {
      message = err;
    } else if (body.message) {
      message = String(body.message);
      code = body.code ? String(body.code) : undefined;
    }
  } catch {
    /* non-JSON error body */
  }
  if (res.status === 401) message = "Invalid or missing Agnes API key. Add a free key in API Configuration.";
  return new UpstreamError(message, res.status, code, Number(res.headers.get("retry-after")) || undefined);
}

export interface ChatRequest {
  messages: { role: "system" | "user" | "assistant"; content: string }[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export async function chat(creds: AgnesCreds, body: ChatRequest): Promise<{ text: string; model: string }> {
  takeToken();
  const model = body.model?.trim() || DEFAULT_TEXT_MODEL;
  const res = await upstream(creds, "/v1/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model,
      messages: body.messages,
      temperature: body.temperature ?? 0.75,
      max_tokens: Math.min(Math.max(body.maxTokens ?? 4096, 256), 8192),
    }),
  });
  if (!res.ok) throw await readError(res);
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = data.choices?.[0]?.message?.content || "";
  if (!text.trim()) throw new UpstreamError("The text model returned an empty response.", 502, "empty_response");
  return { text, model };
}

export interface VideoSubmitRequest {
  prompt: string;
  seconds?: number;
  aspectRatio?: AspectRatio;
  size?: string;
  mode?: "text" | "reference";
  images?: string[];
  model?: string;
  seed?: number;
}

export async function submitVideo(
  creds: AgnesCreds,
  body: VideoSubmitRequest,
): Promise<{ videoId: string; model: string; seconds: number }> {
  if (!body.prompt || body.prompt.trim().length < 3) {
    throw new UpstreamError("A visual prompt is required.", 400, "bad_request");
  }
  takeToken();
  const model = body.model?.trim() || DEFAULT_AGNES_MODEL;
  const seconds = clampSeconds(body.seconds);
  const aspect = ASPECT_RATIOS.includes(body.aspectRatio || "16:9") ? (body.aspectRatio as AspectRatio) : "16:9";
  const images = (body.images || []).filter((i) => typeof i === "string" && i.length > 8).slice(0, 3);

  // Official mode exclusivity: "text" must not carry media fields; "reference" requires them.
  const mode = images.length > 0 ? "reference" : body.mode === "reference" ? "text" : "text";
  const payload: Record<string, unknown> = {
    model,
    prompt: body.prompt.trim(),
    mode,
    seconds: String(seconds),
    size: body.size || "720P",
    aspect_ratio: aspect,
  };
  if (mode === "reference") payload.reference = { images };
  if (typeof body.seed === "number" && Number.isFinite(body.seed)) payload.seed = Math.floor(body.seed);

  const res = await upstream(creds, "/v1/videos", { method: "POST", body: JSON.stringify(payload) });
  if (!res.ok) throw await readError(res);
  const data = (await res.json()) as Record<string, unknown>;
  const nested = (data.data || {}) as Record<string, unknown>;
  const videoId = String(data.video_id || data.task_id || data.id || nested.id || "");
  if (!videoId) throw new UpstreamError("Agnes accepted the request but returned no task id.", 502, "no_task_id");
  return { videoId, model, seconds };
}

function clampSeconds(value: number | undefined): number {
  const n = Math.round(Number(value) || 5);
  return Math.max(4, Math.min(12, n));
}

export interface VideoStatus {
  status: "pending" | "processing" | "completed" | "failed" | "unknown";
  progress: number;
  videoUrl?: string;
  error?: string;
  taskId: string;
}

function normalizeStatus(raw: unknown): VideoStatus["status"] {
  const s = String(raw || "").toLowerCase();
  if (s === "completed" || s === "succeeded" || s === "success" || s === "done") return "completed";
  if (s === "failed" || s === "error" || s === "cancelled") return "failed";
  if (s === "pending" || s === "queued" || s === "submitted") return "pending";
  if (s === "processing" || s === "running" || s === "generating") return "processing";
  return "unknown";
}

function extractUrl(payload: Record<string, unknown>): string | undefined {
  const candidates = [
    payload.video_url,
    payload.url,
    payload.remixed_from_video_id,
    (payload.data as Record<string, unknown> | undefined)?.video_url,
    (payload.data as Record<string, unknown> | undefined)?.url,
    (payload.metadata as Record<string, unknown> | undefined)?.url,
    (payload.metadata as Record<string, unknown> | undefined)?.video_url,
  ];
  const found = candidates.find((c) => typeof c === "string" && c.startsWith("http"));
  return found as string | undefined;
}

export async function pollVideo(creds: AgnesCreds, videoId: string): Promise<VideoStatus> {
  takeToken();
  const id = encodeURIComponent(videoId);
  let res = await upstream(creds, `/v1/videos/${id}`, { method: "GET" }, 0);
  let payload: Record<string, unknown> = {};

  if (res.status === 400 || res.status === 404) {
    // The mainland site only honours the legacy gateway for some tasks.
    const legacy = await upstream(creds, `/agnesapi?video_id=${id}`, { method: "GET" }, 0);
    if (legacy.ok) {
      payload = (await legacy.json()) as Record<string, unknown>;
    } else if (res.ok) {
      payload = (await res.json()) as Record<string, unknown>;
    } else {
      throw await readError(res.status === 404 ? legacy : res);
    }
  } else if (!res.ok) {
    throw await readError(res);
  } else {
    payload = (await res.json()) as Record<string, unknown>;
  }

  const status = normalizeStatus(payload.status);
  const progressRaw = Number(payload.progress ?? payload.internal_progress ?? 0);
  const progress = Number.isFinite(progressRaw) ? Math.max(0, Math.min(100, Math.round(progressRaw))) : 0;
  const errObj = payload.error as Record<string, unknown> | string | undefined;
  const error =
    status === "failed"
      ? typeof errObj === "string"
        ? errObj
        : String(errObj?.message || errObj?.code || "Generation failed upstream")
      : undefined;

  return { status, progress, videoUrl: extractUrl(payload), error, taskId: videoId };
}

export async function listModels(creds: AgnesCreds): Promise<unknown> {
  takeToken();
  const res = await upstream(creds, "/v1/models", { method: "GET" }, 0);
  if (!res.ok) throw await readError(res);
  return res.json();
}

export interface ImageRequest {
  prompt: string;
  model?: string;
  size?: string;
}

export async function generateImage(
  creds: AgnesCreds,
  body: ImageRequest,
): Promise<{ url?: string; pending?: boolean; note?: string }> {
  takeToken();
  const res = await upstream(creds, "/v1/images/generations", {
    method: "POST",
    body: JSON.stringify({
      model: body.model?.trim() || DEFAULT_IMAGE_MODEL,
      prompt: body.prompt,
      n: 1,
      size: body.size || "1024x1024",
      extra_body: { response_format: "url" },
    }),
  });
  if (!res.ok) throw await readError(res);
  const data = (await res.json()) as Record<string, unknown>;
  const arr = Array.isArray(data.data) ? (data.data as Record<string, unknown>[]) : [];
  const first = arr[0] || {};
  const url =
    (typeof first.url === "string" && first.url) ||
    (typeof data.url === "string" && data.url) ||
    (typeof first.b64_json === "string" ? `data:image/png;base64,${first.b64_json}` : undefined);
  if (url) return { url };
  return {
    pending: true,
    note: "The image endpoint queued the job but returned no direct URL. Use upload instead.",
  };
}
