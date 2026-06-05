# Seguridad — Lyra WatchLog

Última actualización: 2026-06-05 (Fase 0 — diseño; implementación en Fase 1).

Objetivo: pasar auditorías de ciberseguridad. Referencia: **OWASP ASVS**.

## 1. Autenticación

Construida **detrás de una abstracción con métodos enchufables**, para que cada instalación on-premise active lo que el cliente necesite **sin reescribir código**:

- **Local** (MVP, por defecto): email + contraseña.
  - Hash **Argon2id**.
  - **Access token** JWT de vida corta (~15 min) + **refresh token rotativo** en cookie `httpOnly` / `SameSite` / `Secure`. Revocación y detección de reuso.
  - **Protección contra fuerza bruta** + **bloqueo de cuenta** (Redis).
  - **MFA TOTP opcional** (el admin decide si lo exige).
  - **Política de contraseñas configurable** (longitud, complejidad, expiración).
  - **Expiración de sesión** configurable.
- **OIDC** (ranura lista; se activa por configuración): Azure AD / Entra ID, Google, Okta, Auth0, cualquier IdP OIDC.
- **LDAP / Active Directory** (fase posterior, solo si un cliente lo requiere).

Keycloak **descartado** para el MVP (complejidad operacional); si un cliente lo pide, entra como "otro proveedor OIDC" sin cambios en la app.

## 2. Autorización — RBAC + ABAC, 4 dimensiones

100% en base de datos y **administrable desde la UI** (nada hardcodeado). Permisos atómicos agrupados en roles + alcance de datos:

1. **Pantallas/módulos** — ej. `module:dashboard:view`, `module:security:manage`.
2. **Funcionalidades/acciones** — ej. `entry:create`, `entry:edit`, `incident:assign`, `template:publish`, `data:export`.
3. **Workflows** — permiso por transición: ej. `incident:transition:open->assigned`, `handover:deliver`, `handover:ack`.
4. **Datos (ABAC)** — `UserScope` ata usuario/rol a **nodos** de la estructura (con herencia a descendientes) y/o a **plantillas** específicas.

### Aplicación (regla de oro)
- **El backend SIEMPRE decide.** `PermissionsGuard` (NestJS) + decorador `@RequirePermission(...)` cubren dimensiones 1–3; un `ScopeService` aplica la dimensión 4 filtrando filas por `OrgNode`/template.
- **La UI solo oculta** (mejor UX), nunca es la fuente de verdad.
- El **catálogo de permisos** vive en `@lyra/contracts` (enum tipado), compartido por UI y backend.

## 3. Auditoría
- **AuditLog append-only / inmutable**: quién, qué, cuándo, valores antes/después. Cubre entradas, incidencias y configuración de seguridad.
- Edición de bitácoras: log de cambios con motivo obligatorio.

## 4. Secretos y datos sensibles
- Ningún secreto en el frontend.
- Credenciales de **orígenes de datos cifradas en reposo** (clave `DATA_SOURCE_ENC_KEY`); se usan solo en el servidor.
- Toda configuración por variables de entorno; `.env` fuera del repo (`.env.example` versionado).

## 5. Endurecimiento (transversal)
- Cabeceras de seguridad (Helmet ya activo), CSP/HSTS en producción (Caddy).
- Rate limiting (Redis), validación de entrada en backend con Zod (no se confía en el cliente).
- CSRF para flujos basados en cookies.
- Logs redactan `authorization`, `cookie`, `set-cookie`.

## Estado
Fase 0: cabeceras (Helmet) y validación de entorno activas. El módulo de seguridad completo (auth + RBAC/ABAC + auditoría) es el núcleo de la **Fase 1**.
