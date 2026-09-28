import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // `.claude/worktrees` holds ephemeral per-agent git worktrees — each a full
  // nested checkout of this repo. Without it, `npm run lint` reports errors from
  // other branches' in-progress code as if they were yours.
  { ignores: ["dist", ".output", ".vinxi", ".vercel", ".nitro", ".claude"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      // A browser confirm/alert/prompt freezes the page, cannot be styled and
      // reads as a fault. Ask through `ask()` from components/ui/ask instead.
      "no-restricted-globals": [
        "error",
        { name: "confirm", message: "Use ask() from @/components/ui/ask." },
        { name: "alert", message: "Show the message inline or use ask()." },
        { name: "prompt", message: "Use ask({ prompt }) from @/components/ui/ask." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "window", property: "confirm", message: "Use ask() from @/components/ui/ask." },
        { object: "window", property: "alert", message: "Show the message inline or use ask()." },
        {
          object: "window",
          property: "prompt",
          message: "Use ask({ prompt }) from @/components/ui/ask.",
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // The data layer leans on `as any` around supabase-js generics by
      // convention; typecheck still runs in CI.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  eslintPluginPrettier,
);
