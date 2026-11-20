/**
 * Server-side types shared by the Vite dev middleware and the Cloudflare Worker.
 * Nothing in this folder imports Node builtins, so the same code runs in both.
 */
export type Env = Record<string, string | undefined>;

export interface AgnesCreds {
  key: string;
  base: string;
  source: "server" | "request";
}

export const DEFAULT_AGNES_BASE = "https://apihub.agnes-ai.com";
export const DEFAULT_AGNES_MODEL = "agnes-video-2.5-flash";
export const DEFAULT_TEXT_MODEL = "agnes-3.0-flash";
export const DEFAULT_IMAGE_MODEL = "agnes-image-2.5-flash";

/** Agnes allows only these aspect strings on the 2.5 protocol. */
export const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:5"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

/** Only the domains the provider actually publishes can ever receive a key. */
const ALLOWED_AGNES_HOSTS = new Set([
  "apihub.agnes-ai.com",
  "api.agnes-ai.cn",
  "apihub.agnes-ai.cn",
]);

export function normalizeBase(input: string | undefined | null): string {
  const raw = (input || DEFAULT_AGNES_BASE).trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return DEFAULT_AGNES_BASE;
  }
  if (url.protocol !== "https:" || !ALLOWED_AGNES_HOSTS.has(url.hostname)) {
    return DEFAULT_AGNES_BASE;
  }
  return `${url.protocol}//${url.hostname}`;
}

export function json(data: unknown, status = 200, extraHeaders: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(extraHeaders as Record<string, string>),
    },
  });
}

export function fail(message: string, status = 400, code?: string): Response {
  return json({ error: { message, code: code || undefined, status } }, status);
}
