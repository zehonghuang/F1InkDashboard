import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  base: "/charts/",
  plugins: [vue()],
  server: {
    port: 5173,
    allowedHosts: ["winpc-f1.normal-person.icu"],
    proxy: {
      "/api": {
        target: process.env.VITE_PROXY_TARGET || "http://127.0.0.1:8008",
        changeOrigin: true
      },
      "/ws": {
        target: process.env.VITE_PROXY_TARGET || "http://127.0.0.1:8008",
        changeOrigin: true,
        ws: true
      }
    }
  }
});

