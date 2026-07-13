import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" — działa i na Vercel/Netlify, i na GitHub Pages bez zmian
export default defineConfig({
  plugins: [react()],
  base: "./",
});
