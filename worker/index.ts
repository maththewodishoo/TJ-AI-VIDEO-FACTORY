import { handleRequest } from "../server/handler";
import type { Env } from "../server/types";

/**
 * Cloudflare Worker entry — the recommended production backend.
 *
 *   wrangler secret put AGNES_API_KEY
 *   wrangler deploy
 *
 * Then set the Worker origin as the "API backend URL" in the app's
 * API Configuration screen (or proxy /api/* to it from the same domain).
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
} satisfies { fetch: (request: Request, env: Env) => Promise<Response> };
