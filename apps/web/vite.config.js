/** Runtime configuration for the Relay web application. */

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    clearMocks: true,
    restoreMocks: true,
  },
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/api": { target: "http://localhost:8090", changeOrigin: true },
      "/socket.io": {
        target: "http://localhost:8090",
        changeOrigin: true,
        ws: true,
      },
      "/jobs": { target: "http://localhost:8090", changeOrigin: true },
      "/graphql": { target: "http://localhost:8090", changeOrigin: true },
      "/calls": { target: "http://localhost:8090", changeOrigin: true },
      "/docs": { target: "http://localhost:8090", changeOrigin: true },
      "/health": { target: "http://localhost:8090", changeOrigin: true },
      "/gateway/healthz": {
        target: "http://localhost:8090",
        changeOrigin: true,
        rewrite: () => "/healthz",
      },
      "/gateway/readyz": {
        target: "http://localhost:8090",
        changeOrigin: true,
        rewrite: () => "/readyz",
      },
      "/go/readyz": {
        target: "http://localhost:8083",
        changeOrigin: true,
        rewrite: () => "/readyz",
      },
      "/go/worker-health": {
        target: "http://localhost:8083",
        changeOrigin: true,
        rewrite: () => "/worker-health",
      },
      "/rabbitmqz": { target: "http://localhost:8083", changeOrigin: true },
      "/python/readyz": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: () => "/readyz",
      },
    },
  },

  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 30,
            },
            {
              name: "charts-vendor",
              test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor|internmap)[\\/]/,
              priority: 20,
            },
            {
              name: "icons-vendor",
              test: /node_modules[\\/]lucide-react[\\/]/,
              priority: 15,
            },
            {
              name: "vendor",
              test: /node_modules[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },

    chunkSizeWarningLimit: 500,
  },
});
