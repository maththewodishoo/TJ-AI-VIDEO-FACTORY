import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { apiMiddleware } from "./server/vitePlugin";

export default defineConfig(({ mode }) => {
  // Server-side values (non-VITE_ prefixed) stay in the Node middleware only.
  const env: Record<string, string | undefined> = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  const port = Number(process.env.PORT) || 5173;

  return {
    plugins: [react(), apiMiddleware(env)],
    server: {
      host: "0.0.0.0",
      port,
      strictPort: false,
      // Managed preview requires HMR to stay disabled.
      hmr: false,
    },
    preview: { host: "0.0.0.0", port },
    build: {
      target: "es2020",
      chunkSizeWarningLimit: 1600,
    },
  };
});
