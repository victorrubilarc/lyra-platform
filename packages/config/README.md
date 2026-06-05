# @lyra/config

Configuración compartida del monorepo: ESLint (flat config) y Prettier.

```js
// eslint.config.mjs
export { default } from "@lyra/config/eslint";

// prettier.config.mjs
export { default } from "@lyra/config/prettier";
```

La base de TypeScript vive en `tsconfig.base.json` en la raíz del repo; cada paquete la extiende con `"extends": "../../tsconfig.base.json"`.
