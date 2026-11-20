import type { Connect, Plugin } from "vite";
import { handleRequest } from "./handler";
import type { Env } from "./types";

/**
 * Development-only bridge that lets the browser call /api/* on the Vite origin.
 * The same handler is deployed as a Cloudflare Worker for production.
 */
export function apiMiddleware(env: Env): Plugin {
  return {
    name: "tj-api-middleware",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || "/";
        if (!rawUrl.startsWith("/api/")) return next();

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(Buffer.from(chunk as Buffer));
          const body = chunks.length ? Buffer.concat(chunks) : undefined;

          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === "string") headers.set(key, value);
            else if (Array.isArray(value)) headers.set(key, value.join(","));
          }

          const request = new Request(`http://${req.headers.host || "localhost"}${rawUrl}`, {
            method: req.method || "GET",
            headers,
            body: req.method && req.method !== "GET" && req.method !== "HEAD" ? body : undefined,
          });

          const response = await handleRequest(request, env);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            if (key === "content-encoding" || key === "content-length" || key === "transfer-encoding") return;
            res.setHeader(key, value);
          });
          const buffer = Buffer.from(await response.arrayBuffer());
          res.end(buffer);
        } catch (err) {
          server.config.logger.error(`[api] ${rawUrl} failed: ${(err as Error).message}`);
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: { message: (err as Error).message, code: "dev_proxy_error" } }));
        }
      });
    },
  };
}

export type { Connect };
