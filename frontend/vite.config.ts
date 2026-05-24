import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendUrl = env.VITE_BACKEND_HTTP || "http://localhost:8080";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      host: true,
      proxy: {
        "/ws": {
          target: backendUrl,
          ws: true,
          changeOrigin: true,
        },
        "/login": {
          target: backendUrl,
          changeOrigin: true,
        },
        "/api": {
          target: backendUrl,
          changeOrigin: true,
        },
      },
    },
  };
});