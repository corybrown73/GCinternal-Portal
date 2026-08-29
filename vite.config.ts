// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // Deploy target: Vercel (Build Output API). Local `npm run build` produces
  // .vercel/output; the Lovable sandbox overrides this preset inside Lovable.
  nitro: { preset: "vercel" },
  vite: {
    environments: {
      ssr: {
        build: {
          rollupOptions: {
            // Work around a rolldown chunking bug: the __exportAll runtime
            // helper lands in a chunk that circularly imports the server
            // chunk, throwing "TypeError: __exportAll is not a function" at
            // SSR startup. A server bundle needs no code splitting anyway.
            output: { inlineDynamicImports: true },
          },
        },
      },
    },
  },
});
