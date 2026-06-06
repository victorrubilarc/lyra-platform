# Backlog / Estado abierto — Lyra WatchLog

> **Registro único y autoritativo de todo lo que está ABIERTO.** Nada se cierra "de
> palabra": si está pendiente (por hacer, por probar, por publicar) vive aquí hasta
> que se complete. `PROGRESS.md` narra lo **hecho**; este archivo lista lo **abierto**.
>
> **Regla:** al cerrar cada sesión, revisa y actualiza este archivo (ver §0). Última
> actualización: **2026-06-06** (cierre de la sesión de MFA self-service).

---

## 0. Definición de "sesión cerrada de forma segura" (checklist)

Antes de declarar una sesión completa, TODO esto debe estar hecho o registrado aquí:

- [ ] `pnpm typecheck && pnpm lint && pnpm build && pnpm test` en verde.
- [ ] Smoke en vivo de lo construido (y registrado qué se probó y qué **no**, en §4).
- [ ] Docs actualizados: `PROGRESS.md`, los docs afectados y **este `BACKLOG.md`**.
- [ ] Commit(s) descriptivos.
- [ ] **Publicación decidida y ejecutada** (§1): push de la rama y/o merge a `main` y
      push de `main`. Un commit que solo vive en este disco **es trabajo en riesgo**.
- [ ] Toda decisión nueva en `DECISIONS.md`; toda deuda nueva en §3 de este archivo.

> Si algo queda a medias, no se borra del checklist: se mueve a la sección
> correspondiente de este backlog con el detalle exacto para retomarlo.

---

## 1. Git: ramas y commits SIN publicar (riesgo de pérdida) 🔴

> Estado al 2026-06-06 (todo publicado). Verificar con:
> `git rev-list --count origin/main..main` (debe dar 0) y `git branch --no-merged main`.

| Qué | Dónde | Estado | Acción pendiente |
|---|---|---|---|
| **Fase 1: Login + branding + reset de contraseña + docs + rutina** | `main` | ✅ publicado en `origin/main` | ninguna |
| **Fase 1: MFA self-service** | `main` (fusionado desde `feat/auth-mfa-self-service`) | ✅ fusionado y publicado en `origin/main` | ninguna |

**Estado:** **nada vive solo en local.** `main` = `origin/main`. La rama
`feat/auth-mfa-self-service` quedó fusionada por fast-forward; puede borrarse.

**Convención propuesta (a confirmar):** trabajar cada módulo en rama `feat/<modulo>`;
al cerrar la sesión → push de la rama + merge a `main` + push de `main`. Así `origin/main`
nunca queda más de una sesión atrás.

---

## 2. Pendiente por HACER (módulos / submódulos)

### Fase 1 — Seguridad + Estructura (en curso)
- [x] **App Shell / Workspace premium** ✅ (2026-06-06). Sidebar colapsable, top bar (breadcrumbs/
      búsqueda ⌘K/densidad/idioma/notificaciones/perfil), pestañas de trabajo acotadas, command palette
      (cmdk), favoritos/recientes, i18n-ready (react-i18next, es-CL), estado en localStorage, +9 primitivos
      `@lyra/ui`. **Pendiente solo el smoke visual** (ver §4).
- [ ] **UI Estructura organizacional** ← *siguiente sesión*. Árbol de nodos + CRUD sobre
      `/structure/*` (niveles + nodos con reparentado). Ruta `/estructura` gateada por
      `module:structure:view`; acciones por `orgnode:create/edit/delete`, `orglevel:manage`.
- [ ] **UI Seguridad** (sesión posterior) sobre `/security/*`:
  - [ ] Usuarios: listado, alta/edición, asignar roles, asignar alcance (scope).
  - [ ] Roles/permisos: CRUD de roles + matriz de permisos (catálogo de `@lyra/contracts`),
        editar `requireMfa` por rol.
  - [ ] Política de seguridad: editar contraseñas + **`mfaMode`** global.
  - [ ] **MFA de admin (la UI que quedó pendiente del backend ya hecho):** ver **estado de
        MFA** por usuario y **resetear MFA** (`POST /security/users/:id/mfa/reset`, permiso
        `user:reset-mfa`). *Backend ✅, UI ⬜.*
  - [ ] Lectura de auditoría (`/security/audit`).
- [ ] **Ampliar `@lyra/ui`** con los componentes que faltan: `Table`, `Drawer`,
      `Chip`/`NodeTag`, `Modal`, `EmptyState`, `Toggle` (CSS Modules sobre tokens).

### Fases siguientes (roadmap, ver PROGRESS §tabla)
- [ ] **Fase 2** — Plantillas / Form Builder + Bitácoras.
- [ ] **Fase 3** — Orígenes de datos.
- [ ] **Fase 4** — Motor de incidencias (workflow HSE).
- [ ] **Fase 5** — Cambio de turno + IA (resumen).
- [ ] **Fase 6** — Base de conocimiento + Dashboard + Asistente IA.
- [ ] **Fase 7** — Endurecimiento (ver §3 y §5).

---

## 3. Deuda técnica / seguridad REGISTRADA (no perder)

> Items con fundamento ya discutidos; aquí para que no se diluyan en `DECISIONS.md`.

- [ ] **`forcePasswordChange` con enforcement solo en UI.** Hoy `ProtectedRoute` redirige,
      pero el backend no bloquea otros endpoints. Igualarlo al gate de MFA (claim + guard).
      Ref: `SECURITY.md` §7 (residual). **Prioridad: media-alta** (auditoría).
- [ ] **Rechazo de contraseñas comprometidas** (NIST 800-63B §5.1.1.2; HIBP k-anonymity o
      lista local). Pluggable y **apagado por defecto** (on-premise). Aplica a change/force/
      reset. Ref: `DECISIONS.md` 2026-06-06 (reset). **Fase 7 / transversal.**
- [ ] **Anti-replay del mismo OTP** dentro de su ventana de validez (TOTP). Deuda menor.
      Ref: `SECURITY.md` §7.
- [ ] **`mfaMode = REQUIRED_BY_ROLE`: cambiar `requireMfa` no invalida tokens vigentes.** El
      gate se aplica al siguiente refresh (≤15 min). Decidir si se fuerza (revocar sesiones
      de los miembros del rol al activar el requisito) o se acepta la latencia. **Prioridad: baja.**
- [ ] **Bundle web grande** (~743 KB JS): code-splitting / `manualChunks`. **Fase 7.**
- [ ] **Ranura OIDC/LDAP**: diseñada, `AuthProvider` listo; se activa cuando un cliente lo pida.

### Recomendaciones de endurecimiento (Fase 7, ya registradas)
Respaldos Postgres/MinIO · observabilidad (pino/Prometheus/OpenTelemetry/Grafana/Loki) ·
rate-limit global + CSP/HSTS (Caddy) · exportación CSV/PDF · notificaciones SMTP
(SLA/escalamiento) · búsqueda full-text KB · i18n es-CL + multi-idioma · modo offline
terreno (PWA) · retención/borrado lógico · adjuntos/evidencias en MinIO · firma con validez
probatoria (hash+timestamp). Ref: `DECISIONS.md` (sección de recomendaciones).

---

## 4. Pendiente por PROBAR (gaps de verificación)

> Lo construido puede estar "verde en tests" pero no ejercido en condiciones reales.

- [ ] **App Shell — smoke VISUAL en navegador** (se verificó typecheck/lint/build/test + que el dev
      sirve; falta el clic): colapsar/expandir sidebar, abrir/cerrar/fijar pestañas (sin refrescos),
      ⌘K (saltar, densidad, idioma, tema, logout), cambiar idioma y densidad, menú de perfil, favoritos.
      App en `:5173`.
- [ ] **Modo claro — QA visual** (nuevo): revisar que TODO el workspace se vea premium en **claro**
      (contraste WCAG, glass, glows, severidades, tablas futuras, drawers/modales) y que `auto` siga al
      sistema. El default es oscuro; el login es siempre oscuro. Ref: DECISIONS 2026-06-06.
- [ ] **MFA en el navegador real** (se probó por API/curl, no la UI): escanear el
      QR con una app real, copiar/descargar recovery codes, ver el **redirect del gate**
      `/activar-mfa`, y `/perfil/seguridad` (activar/regenerar/desactivar). *Backend ✅ en vivo.*
- [ ] **`COOKIE_SECURE` solo-HTTPS en producción**: no ejercido (dev es HTTP en localhost).
      Requiere entorno HTTPS. Ref: `AUTH_FLOW.md` §12.1.
- [ ] **`httpOnly` frente a `document.cookie`**: flag presente, no ejecutado como ataque real
      en navegador. Ref: `AUTH_FLOW.md` §12.1.
- [ ] **Access 15 min → refresh transparente** al expirar: probado por unit/código, no
      cronometrado en vivo. Ref: `AUTH_FLOW.md` §12.1.
- [ ] **Build de imágenes de producción** (`docker-compose.prod.yml` + Caddy TLS): no
      construido aún. **Fase 7.**

---

## 5. Cómo retomar (arranque de sesión)

1. Lee `CLAUDE.md` + `docs/` (PROGRESS, ARCHITECTURE, DATA_MODEL, SECURITY, DECISIONS,
   AUTH_FLOW) **y este BACKLOG.md**.
2. Confirma el objetivo único de la sesión (un módulo/submódulo).
3. Revisa §1 (git): si hay trabajo sin publicar de la sesión anterior, **resuélvelo primero**.
4. Al cerrar, ejecuta el checklist §0 y actualiza este archivo.
