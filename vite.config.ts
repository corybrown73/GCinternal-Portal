import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tanstackStart(),
    viteReact(),
    tailwindcss(),
    // Deploy target: Vercel (Build Output API). `npm run build` emits .vercel/output.
    nitro({ preset: "vercel" }),
  ],
  resolve: {
    // One copy of React/TanStack across app + linked deps.
    dedupe: [
      "react",
      "react-dom",
      "@tanstack/react-router",
      "@tanstack/react-query",
      "@tanstack/react-start",
    ],
  },
  environments: {
    ssr: {
      build: {
        rollupOptions: {
          // Work around a rolldown chunking bug: the __exportAll runtime helper
          // lands in a chunk that circularly imports the server chunk, throwing
          // "TypeError: __exportAll is not a function" at SSR startup. A server
          // bundle needs no code splitting anyway.
          output: { inlineDynamicImports: true },
        },
      },
    },
  },
});
