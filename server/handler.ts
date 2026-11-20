/**
 * The single HTTP surface used by the React app.
 *
 * Runs unchanged in:
 *   • the Vite dev server (server/vitePlugin.ts -> this handler)
 *   • a Cloudflare Worker (worker/index.ts -> this handler)
 *
 * Secrets resolution order: request header (user's own key, stored only in the
 * browser) → server env var. The env value never leaves the server.
 */
import {
  UpstreamError,
  chat,
  generateImage,
  listModels,
  pollVideo,
  rateBudget,
  submitVideo,
  type VideoSubmitRequest,
} from "./agnes";
import { synthesize, voiceCatalog } from "./tts";
import { json, fail, normalizeBase, type AgnesCreds, type Env } from "./types";

const CORS_HEADERS = {
  "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
  "access-control-allow-headers":
    "content-type,x-agnes-key,x-agnes-base,x-app-token,x-text-base,x-tts-base",
  "access-control-max-age": "86400",
};

function cors(req: Request, env: Env): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allow = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const allowedOrigin = allow.length === 0 ? "*" : allow.includes(origin) ? origin : allow[0];
  return { ...CORS_HEADERS, "access-control-allow-origin": allowedOrigin };
}

function credsFor(req: Request, env: Env): AgnesCreds {
  const headerKey = req.headers.get("x-agnes-key")?.trim();
  const key = headerKey || env.AGNES_API_KEY?.trim() || "";
  const base = normalizeBase(req.headers.get("x-agnes-base") || env.AGNES_BASE_URL);
  return { key, base, source: headerKey ? "request" : "server" };
}

function requireKey(creds: AgnesCreds): Response | null {
  if (creds.key) return null;
  return fail(
    "No Agnes AI API key configured. Get a free key at platform.agnes-ai.com, then paste it in API Configuration (or set AGNES_API_KEY on the server).",
    401,
    "missing_key",
  );
}

async function readJson<T>(req: Request, limit = 8 * 1024 * 1024): Promise<T> {
  const text = await req.text();
  if (text.length > limit) throw new UpstreamError("Request body is too large.", 413, "payload_too_large");
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamError("Request body must be valid JSON.", 400, "bad_json");
  }
}

const PRIVATE_HOST = /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|\[::1\]|metadata\.|.*\.internal$)/i;

function safeRemoteUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UpstreamError("Invalid media URL.", 400, "bad_url");
  }
  if (url.protocol !== "https:") throw new UpstreamError("Only https media URLs are allowed.", 400, "bad_url");
  if (PRIVATE_HOST.test(url.hostname)) throw new UpstreamError("That host is not allowed.", 400, "bad_host");
  return url;
}

async function downloadProxy(req: Request): Promise<Response> {
  const raw = new URL(req.url).searchParams.get("url");
  if (!raw) return fail("Missing ?url=", 400, "bad_request");
  const url = safeRemoteUrl(raw);
  const upstream = await fetch(url.toString(), {
    headers: { "user-agent": "TJ-AI-Video-Factory/1.0", accept: "video/*,audio/*,image/*,*/*" },
    redirect: "follow",
  });
  if (!upstream.ok) return fail(`Media fetch failed (HTTP ${upstream.status}).`, 502, "upstream_error");
  const type = upstream.headers.get("content-type") || "application/octet-stream";
  if (!/^(video|audio|image|application\/octet-stream)/i.test(type)) {
    return fail(`Unexpected media type: ${type}`, 415, "bad_media_type");
  }
  const length = Number(upstream.headers.get("content-length") || 0);
  if (length > 120 * 1024 * 1024) return fail("Media file is larger than the 120 MB proxy limit.", 413, "too_large");
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": type,
      "cache-control": "no-store",
      "content-disposition": "inline",
    },
  });
}

export async function handleRequest(req: Request, env: Env = {}): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const headers = cors(req, env);

  if (!path.startsWith("/api/")) return fail("Not found", 404, "not_found");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });

  const appToken = env.APP_ACCESS_TOKEN?.trim();
  if (appToken && path !== "/api/health") {
    const provided = req.headers.get("x-app-token")?.trim();
    if (provided !== appToken) {
      return new Response(JSON.stringify({ error: { message: "Access token required.", code: "unauthorized" } }), {
        status: 401,
        headers: { ...headers, "content-type": "application/json" },
      });
    }
  }

  const withHeaders = (res: Response) => {
    const merged = new Headers(res.headers);
    for (const [k, v] of Object.entries(headers)) merged.set(k, v);
    return new Response(res.body, { status: res.status, headers: merged });
  };

  try {
    let res: Response;

    if (path === "/api/health") {
      res = json({
        ok: true,
        service: "tj-ai-video-factory",
        agnesBase: normalizeBase(env.AGNES_BASE_URL),
        hasServerKey: Boolean(env.AGNES_API_KEY?.trim()),
        hasServerTextProvider: Boolean(env.TEXT_API_BASE && env.TEXT_API_KEY),
        hasServerTts: Boolean(env.TTS_API_BASE && env.TTS_API_KEY),
        accessTokenRequired: Boolean(appToken),
        rate: rateBudget(),
        capabilities: {
          textToVideo: true,
          imageToVideo: true,
          storyLlm: true,
          freeTts: true,
          imageGeneration: true,
          videoAssembly: "browser (ffmpeg.wasm)",
        },
        protocol: "agnes-video-2.5 (mode/seconds/size/aspect_ratio)",
      });
    } else if (path === "/api/test") {
      const creds = credsFor(req, env);
      const missing = requireKey(creds);
      if (missing) return withHeaders(missing);
      const data = (await listModels(creds)) as { data?: { id?: string }[]; models?: unknown[] };
      const ids = Array.isArray(data.data)
        ? data.data.map((m) => m.id).filter((v): v is string => Boolean(v))
        : [];
      res = json({ ok: true, base: creds.base, keySource: creds.source, count: ids.length, models: ids.slice(0, 60) });
    } else if (path === "/api/chat") {
      const body = await readJson<{
        messages: { role: "system" | "user" | "assistant"; content: string }[];
        model?: string;
        temperature?: number;
        maxTokens?: number;
        provider?: "agnes" | "server" | "custom";
        baseUrl?: string;
        apiKey?: string;
      }>(req);
      if (!Array.isArray(body.messages) || body.messages.length === 0) {
        return withHeaders(fail("messages[] is required.", 400, "bad_request"));
      }

      const wantsCustom =
        body.provider === "custom" || (body.provider !== "agnes" && body.provider !== "server" && body.baseUrl);
      const customBase = (body.baseUrl || env.TEXT_API_BASE || "").replace(/\/+$/, "");
      const customKey = (body.apiKey || env.TEXT_API_KEY || "").trim();

      if (wantsCustom) {
        if (!customBase || !customKey) {
          return withHeaders(fail("Custom text provider needs a base URL and key.", 400, "missing_provider"));
        }
        res = await proxyOpenAiChat(customBase, customKey, body);
      } else {
        const creds = credsFor(req, env);
        const missing = requireKey(creds);
        if (missing) return withHeaders(missing);
        const out = await chat(creds, body);
        res = json({ ...out, provider: "agnes" });
      }
    } else if (path === "/api/models") {
      const creds = credsFor(req, env);
      const missing = requireKey(creds);
      if (missing) return withHeaders(missing);
      res = json({ ok: true, models: await listModels(creds) });
    } else if (path === "/api/video" && req.method === "POST") {
      const creds = credsFor(req, env);
      const missing = requireKey(creds);
      if (missing) return withHeaders(missing);
      const body = await readJson<VideoSubmitRequest>(req);
      res = json({ ok: true, ...(await submitVideo(creds, body)) });
    } else if (path === "/api/video" && req.method === "GET") {
      const id = url.searchParams.get("id");
      if (!id) return withHeaders(fail("Missing ?id=", 400, "bad_request"));
      const creds = credsFor(req, env);
      const missing = requireKey(creds);
      if (missing) return withHeaders(missing);
      res = json({ ok: true, ...(await pollVideo(creds, id)) });
    } else if (path === "/api/image") {
      const creds = credsFor(req, env);
      const missing = requireKey(creds);
      if (missing) return withHeaders(missing);
      res = json({ ok: true, ...(await generateImage(creds, await readJson(req))) });
    } else if (path === "/api/tts" && req.method === "POST") {
      const body = await readJson<{
        text: string;
        voice?: string;
        lang?: string;
        provider?: "free" | "hosted";
        baseUrl?: string;
        apiKey?: string;
      }>(req);
      const out = await synthesize(env, body);
      const audioBuffer = out.audio.buffer.slice(
        out.audio.byteOffset,
        out.audio.byteOffset + out.audio.byteLength,
      ) as ArrayBuffer;
      res = new Response(audioBuffer, {
        status: 200,
        headers: {
          "content-type": "audio/mpeg",
          "cache-control": "no-store",
          "x-tts-provider": out.provider,
        },
      });
    } else if (path === "/api/tts/voices") {
      res = json(voiceCatalog(env));
    } else if (path === "/api/download") {
      res = await downloadProxy(req);
    } else {
      res = fail("Unknown API route.", 404, "not_found");
    }
    return withHeaders(res);
  } catch (err) {
    if (err instanceof UpstreamError) {
      const extra: Record<string, string> = {};
      if (err.retryAfter) extra["retry-after"] = String(err.retryAfter);
      return withHeaders(fail(err.message, err.status, err.code));
    }
    const message = err instanceof Error ? err.message : "Unexpected server error";
    return withHeaders(fail(message, 500, "server_error"));
  }
}

async function proxyOpenAiChat(
  base: string,
  key: string,
  body: { messages: unknown; model?: string; temperature?: number; maxTokens?: number },
): Promise<Response> {
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: body.model || "gpt-4o-mini",
      messages: body.messages,
      temperature: body.temperature ?? 0.75,
      max_tokens: body.maxTokens ?? 4096,
    }),
  });
  if (!res.ok) {
    let message = `Text provider failed (HTTP ${res.status}).`;
    try {
      const data = (await res.json()) as { error?: { message?: string } };
      if (data.error?.message) message = data.error.message;
    } catch {
      /* ignore */
    }
    return fail(message, res.status, "text_provider_error");
  }
  const data = (await res.json()) as { model?: string; choices?: { message?: { content?: string } }[] };
  const text = data.choices?.[0]?.message?.content || "";
  if (!text.trim()) return fail("Text provider returned an empty response.", 502, "empty_response");
  return json({ text, model: data.model || body.model || "custom", provider: "custom" });
}
