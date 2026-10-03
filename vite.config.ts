import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const root = import.meta.dirname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(root, "client", "src"),
      "@shared": path.resolve(root, "shared"),
    },
  },
  root: path.resolve(root, "client"),
  build: {
    outDir: path.resolve(root, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          astronomy: ["astronomy-engine"],
          react: ["react", "react-dom"],
          leaflet: ["leaflet", "react-leaflet"],
        },
      },
    },
  },
  optimizeDeps: {
    // Pre-bundle everything up front so Vite never re-optimizes mid-session (which loads React twice).
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "wouter",
      "@tanstack/react-query",
      "lucide-react",
      "astronomy-engine",
      "class-variance-authority",
      "clsx",
      "tailwind-merge",
      "cmdk",
      "vaul",
      "react-hook-form",
      "@hookform/resolvers/zod",
      "zod",
      "react-day-picker",
      "date-fns",
      "leaflet",
      "react-leaflet",
      "@radix-ui/react-accordion",
      "@radix-ui/react-alert-dialog",
      "@radix-ui/react-aspect-ratio",
      "@radix-ui/react-avatar",
      "@radix-ui/react-checkbox",
      "@radix-ui/react-collapsible",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-hover-card",
      "@radix-ui/react-label",
      "@radix-ui/react-popover",
      "@radix-ui/react-progress",
      "@radix-ui/react-radio-group",
      "@radix-ui/react-scroll-area",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slider",
      "@radix-ui/react-slot",
      "@radix-ui/react-switch",
      "@radix-ui/react-tabs",
      "@radix-ui/react-toast",
      "@radix-ui/react-toggle",
      "@radix-ui/react-toggle-group",
      "@radix-ui/react-tooltip",
    ],
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
