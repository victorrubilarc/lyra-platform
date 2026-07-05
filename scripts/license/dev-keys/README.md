# Llaves de licenciamiento — SOLO DESARROLLO (NO son un secreto)

> ⚠️ **Este par de llaves es EXCLUSIVAMENTE para desarrollo y CI.** La privada está
> committeada A PROPÓSITO: su único poder es firmar licencias que aceptan los builds
> que embeben la pública DEV (`apps/watchlog-api/src/licensing/license-public-key.ts`).
> No protege nada de producción.

- `dev-private.pem` — firma licencias DEV (`pnpm license:dev`). Ed25519 PKCS#8.
- `dev-public.pem` — la pública embebida HOY como constante en la API. Ed25519 SPKI.

**Reglas de producción (gobernanza de `docs/LICENSING.md` / CLAUDE.md §Licenciamiento):**

1. La clave de emisión de PRODUCCIÓN será **OTRO par**, generado en la sesión **L3**
   (CLI de emisión) bajo custodia real (HSM/gestor de secretos). **La privada de prod
   JAMÁS toca el repo, una imagen o un `.env`.**
2. En L3/L5 el build de producción del CI **reemplaza la constante embebida** por la
   pública de prod (sustitución en build, nunca por variable de entorno: una pública
   configurable sería un bypass trivial — el atacante la cambia por la suya y se firma
   licencias con keygen).
3. Mientras ese reemplazo no exista, **ninguna imagen construida desde este repo es
   apta para venderse**: cualquiera con acceso al repo puede firmar licencias que esos
   builds aceptan. Registrado en `docs/BACKLOG.md §2(1)`.
