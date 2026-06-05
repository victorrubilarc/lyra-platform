import base from "@lyra/config/eslint";

export default [
  ...base,
  {
    files: ["**/*.ts"],
    rules: {
      // NestJS usa emitDecoratorMetadata para la inyección de dependencias:
      // forzar `import type` en los providers rompería el DI en runtime.
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
];
