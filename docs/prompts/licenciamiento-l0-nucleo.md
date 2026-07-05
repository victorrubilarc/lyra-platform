# Prompt — Licenciamiento L0 (Núcleo `@lyra/licensing`)

Continuamos Lyra WatchLog (`g:\Development\BitacorasInteligentes`). Ejecuta la rutina de arranque de CLAUDE.md ANTES de nada: lee CLAUDE.md y `docs/` (PROGRESS, ARCHITECTURE, DATA_MODEL, SECURITY, DECISIONS, AUTH_FLOW, BACKLOG, USER_GUIDE, FORM_GUIDE). **LECTURA OBLIGADA de este módulo (fuente de verdad, léelas COMPLETAS): `docs/LICENSING_STRATEGY.md` (el porqué — Opción C, defensa en 6 capas), `docs/LICENSING.md` (la spec técnica) y `docs/LICENSING_PROCEDURE.md` (el runbook operacional).** Lee además el PoC ya probado `docs/poc/licencia-poc.mjs` (9/9 PASS): **es la semilla exacta de esta sesión**, no partes de cero. Revisa las entradas de `docs/DECISIONS.md` del 2026-07-04 (decisión Opción C + gobernanza). Revisa tu memoria persistente (MEMORY.md; en especial **licensing-strategy**, **stack-decisions**, **channel-business-model**, **product-name**, **challenge-dont-please**, **decide-well-align-to-leaders**, **leave-site-running-on-close**, **explain-and-document-userguide**, **regional-formatting**). No des nada por sentado: verifica en el código y en git.

**Antes de empezar:** confirma árbol limpio (`git rev-list --count origin/main..main` debe ser 0; la sesión de estrategia quedó publicada en `main`, hasta el commit `08e8c73`). Si hubiera algo sin publicar, resuélvelo antes.

**Recordatorios permanentes (regla challenge-dont-please + gobernanza de licenciamiento de CLAUDE.md):** la estrategia está **DECIDIDA = Opción C, solo software** — **NO propongas dongle** (Opción F) salvo que se reabra la decisión con fundamento. La **clave PRIVADA de emisión JAMÁS toca repo/imagen/`.env`**; en L0 las funciones reciben las llaves **por parámetro** (para ser puras y testeables), nunca las leen del entorno. La licencia **NUNCA secuestra datos** (el peor estado es solo-lectura + exportación). Este es el **cimiento de todo el módulo**: si ves un motivo de peso para desviarte del PoC/spec, **objétalo con fundamento ANTES de codificar**, no cambies el diseño en silencio.

== OBJETIVO DE ESTA SESIÓN (único, cerrable) — Licenciamiento L0: NÚCLEO `@lyra/licensing` ==
Crear el paquete **`packages/licensing`** como **librería PURA** (sin NestJS, sin Prisma, sin infra, sin I/O de red ni de disco), reutilizable por la API (L1) y por la futura CLI de emisión (L3). Es el PoC endurecido, tipado y testeado. Alcance EXACTO:

1. **Scaffolding del paquete** (`packages/licensing/`): `package.json` (`name: "@lyra/licensing"`, `type: "module"`, scripts `typecheck`/`lint`/`test` con vitest), `tsconfig.json`, `eslint.config.mjs`, `src/index.ts` (API pública). **Decide y justifica** si se consume desde **source** (como `@lyra/permissions`, `exports: "./src/index.ts"`) o desde **dist** (como `@lyra/contracts`, con `build`). Recomendación: mirror de `@lyra/permissions` (source-only) por simplicidad, salvo que la API lo requiera compilado — regístralo en DECISIONS. **Cero dependencias externas**: solo `node:crypto` nativo (igual que el PoC).

2. **Firma y verificación Ed25519 (capa 1 de la estrategia):**
   - `signLicense(payload, privateKeyPem): string` → JWS compacto (`header.payload.signature`, base64url), `alg: "EdDSA"`. (La usará la CLI de emisión en L3; aquí se expone y se testea.)
   - `verifyLicense(licString, publicKeyPem): { ok, payload } | { ok: false, reason }` → verifica la firma con la clave pública. Encode/decode del JWS compacto como helpers internos.
   - Manejo de errores explícito (firma inválida, formato corrupto, payload no-JSON): resultado tipado, **sin excepciones tragadas**.

3. **Huella de máquina / node-lock (capa 2):** `deriveFingerprint(signals): string` — hash estable (sha256) de señales del host (machine-id, cpu, disco, mac…), **puro** (recibe las señales, NO las recolecta del SO — la recolección real es de L1). Documenta en JSDoc la honestidad del clon perfecto de VM (se **detecta** por linaje en L4, no se previene aquí). Deja tipada la estructura de señales.

4. **Máquina de estados (LICENSING.md §5), pura:** `evaluateLicense(payload, { now, fingerprint, actuals }): LicenseEvaluation` que devuelva el estado — `VALIDA | POR_VENCER | EN_GRACIA | SOLO_LECTURA | LIMITE_EXCEDIDO | MODULO_NO_LICENCIADO | BLOQUEADA` — combinando: firma OK (si se le pasa ya verificada) + huella calza + `notBefore`/`expiresAt`+`graceDays` + límites (`maxNodes`/`maxNamedUsers`/`maxInstallations`) contra `actuals` + `modules[]`. **Nunca** un estado destructivo: el tope es SOLO_LECTURA. Helpers puros reutilizables (`isExpired`, `isWithinGrace`, `isModuleLicensed`, `exceedsLimits`).

5. **Contratos/tipos del payload:** `LicensePayload` (con `licenseId`, `installationId`, `fingerprint`, `notBefore`, `expiresAt`, `graceDays`, `edition`, `modules[]`, `limits`, `whiteLabel`, `schemaVersion`, y **campos de linaje declarados** `renewalCounter`/`nonce` para L4, aunque su FLUJO sea L4), `LicenseLimits`, `LicenseEdition`, `LicenseModule`, `LicenseState` (enum), `LicenseEvaluation`. **Decide y justifica** si estos tipos viven en `@lyra/licensing` o en `@lyra/contracts` (criterio: ¿los necesita el web? si el banner de estado del front los consume, van a contracts). Regístralo.

6. **Tests (vitest, `src/**/*.spec.ts`):** replica los **9 casos del PoC** (`docs/poc/licencia-poc.mjs`: T1 legítima, T2 payload adulterado, T3 keygen con otra clave, T4 copia a otra máquina, T5 gracia→solo-lectura, T6 linaje/clon detectado) **+ bordes**: `notBefore` futuro, límites excedidos (nodos/usuarios), módulo no licenciado, JWS corrupto/truncado, payload no-JSON. Objetivo: cobertura de la lógica crítica (es "auth/permisos" en el sentido de CLAUDE.md → tests obligatorios).

== NADA HARDCODEADO / NADA SUELTO ==
Nada de claves embebidas ni rutas fijas: las llaves entran por parámetro. Los `modules`/`edition`/`limits` son DATO del payload, no constantes. La huella recibe señales, no las inventa. Todo el comportamiento temporal recibe `now` (nada de `Date.now()` interno → tests deterministas). Si algo de la spec (`LICENSING.md`) no calza con el PoC, **la spec manda** y lo alineas (registrando la diferencia).

== LO QUE L0 **NO** HACE (para no invadir sesiones siguientes) ==
- **NO** `LicenseService` de NestJS, guard de arranque ni verificación periódica → eso es **L1**.
- **NO** gating de módulos por entitlement en la API/web → **L2**.
- **NO** CLI de emisión ni custodia de clave (HSM) → **L3**.
- **NO** flujo challenge-response por USB (solo declara los tipos de linaje) → **L4**.
- **NO** bytecode/ofuscación/anti-tamper → **L5** (se hornea en CI, ver LICENSING_PROCEDURE §6).
- **NO** UI de estado/avisos ni marca blanca → **L6**.
- **NO** migración Prisma, permisos nuevos ni seed (L0 es lib pura, no toca BD).

== CONFIRMA ANTES DE CODIFICAR (es el cimiento) ==
Antes de escribir código, confírmame en pocas líneas: (a) la **API pública** de `@lyra/licensing` (firmas de funciones + tipos exportados), (b) source vs dist, (c) dónde viven los tipos (licensing vs contracts). **Espera mi visto bueno.** Si detectas una mejora sobre el PoC/spec, propónmela ahí.

== VERIFICACIÓN Y CIERRE (CLAUDE.md §Gestión de sesiones) ==
1. En verde: `pnpm typecheck && pnpm lint && pnpm build && pnpm test` (el `test` del monorepo debe incluir y pasar los specs nuevos de `@lyra/licensing`). Registra qué se probó y qué NO. **No hace falta levantar el stack Docker** (es lib pura); si lo levantas por algo, aplica la regla de "dejar el sitio operativo".
2. Actualiza `docs/PROGRESS.md` (L0 hecho + estado), `docs/BACKLOG.md` (marca L0 en §2(1), deja **L1** como próxima), `docs/DATA_MODEL.md` **solo si** moviste tipos a contracts, y `docs/LICENSING.md`/`docs/LICENSING_STRATEGY.md` como docs VIVOS si algo cambió respecto a la spec (regla de cierre §4 de CLAUDE.md). USER_GUIDE **no aplica** (L0 no es de cara al usuario todavía; anótalo).
3. Commit descriptivo en rama `feat/licenciamiento-l0` + merge a `main` + **push** (regla "nada se queda atrás"; incluye SIEMPRE `.claude/settings.json` si cambió). Verifica `git rev-list --count origin/main..main` = 0.
4. Actualiza la memoria (**licensing-strategy**: marca L0 hecho + nombre/rutas reales del paquete y su API pública real; deja L1 como siguiente).
5. Muéstrame el resumen y dime: "Esta sesión está completa. Por favor abre una sesión nueva para continuar con: Licenciamiento L1 (LicenseService NestJS + máquina de estados + guard de arranque)."

== ENTORNO Y GOTCHAS ==
Monorepo pnpm workspaces. Apps reales: `apps/watchlog-api` (NestJS, `:3000`, prefijo `/api`) y `apps/watchlog-web` (`:5173`). Packages reales: `config`, `contracts` (dist), `llm`, `permissions` (source), `ui` (source). Tests = **vitest** (`vitest run`). `@lyra/contracts` se consume desde **dist** → si mueves tipos ahí, **reconstruye** (`pnpm --filter @lyra/contracts build`) o el resto no los ve. PowerShell 5.1: NO `2>&1` con exes nativos; commits largos vía `git commit -F archivo` o here-string. Node ≥ 22 (Ed25519 nativo en `node:crypto`). El PoC de referencia corre con `node docs/poc/licencia-poc.mjs` (9/9).
