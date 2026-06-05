import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Configuración ESLint base del monorepo Lyra WatchLog (flat config).
 * Las apps/paquetes la importan y la extienden si lo necesitan.
 */
export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/.vite/**",
      "**/coverage/**",
      "**/generated/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": "warn",
    },
  },
);
