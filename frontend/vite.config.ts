import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const API_TARGET = process.env.STUDIO_API_TARGET ?? "http://127.0.0.1:8000"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    // Listen on the network, so a phone on the same Wi-Fi can open the Studio.
    host: true,
    // The app calls /api on its own origin. In production nginx proxies it;
    // in development this does. Neither needs a CORS rule.
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
    },
  },
})
