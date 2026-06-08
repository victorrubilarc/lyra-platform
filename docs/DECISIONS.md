# Registro de decisiones — Lyra WatchLog

Formato: fecha · decisión · motivo. Las más recientes arriba.

---

### 2026-06-08 · UI de Seguridad (usuarios/roles/política/auditoría) sobre `/security/*`

Consume el backend de seguridad ya existente (RBAC/ABAC, política, MFA, reset de admin, auditoría). Decisiones (aprobadas tras propuesta):

**Navegación: sub-rutas anidadas + match por prefijo (UNA pestaña por módulo).** `/seguridad` es un `SecurityLayout` con barra de sub-tabs y `Outlet`; las sub-secciones son rutas anidadas reales (`/seguridad/{usuarios,roles,politica,auditoria}`), deep-linkables y gateadas cada una por su permiso (`user:read`/`role:read`/`security:policy:manage`/`audit:read`). El índice redirige a la primera sub-tab permitida. Para que el shell (pestañas/breadcrumb/sidebar) trate todo `/seguridad/*` como **un** módulo se añadieron helpers `routeForPath` (coincidencia por prefijo más largo) e `isRouteActive` en `navigation.ts`, y se ajustaron AppShell/WorkspaceTabs/Topbar/Sidebar. **Motivo:** deep-linking y breadcrumbs por área sin ensuciar la tira de pestañas con 4 entradas; patrón reutilizable para futuros módulos con sub-secciones (Plantillas, etc.).

**UX de usuarios: master-detail** (mismo patrón que Estructura, `ResizableSplit`). Lista a la izquierda; panel derecho con secciones independientes que guardan por separado contra los endpoints atómicos del backend: datos básicos (`PATCH :id`), roles (`PUT :id/roles`), alcance de datos (`PUT :id/scope`) y MFA (estado + reset `POST :id/mfa/reset`). **Selector de alcance (ABAC dim. 4):** árbol de la estructura con checkbox por nodo + toggle "incluye descendientes" por entrada. La vista node-centric/por-rol (asignar desde el propio árbol, "quién accede a este nodo") queda como ítem ABAC enterprise futuro (BACKLOG §2).

**Contrato de auditoría añadido** (`auditLogEntrySchema` + `AuditLogEntry` en `@lyra/contracts`): el `GET /security/audit` retornaba filas Prisma crudas sin tipo compartido. Se tipó el controller y se mapea `occurredAt`→ISO string (forma de respuesta idéntica en el cable; solo se formaliza). `before`/`after`/`metadata` son `unknown` (snapshots JSON). Paginación por cursor de `id` (UI con `useInfiniteQuery` + "cargar más").

**`scopeEntrySchema`: se quitó `.default(true)` de `includeDescendants` (campo explícito).** El default hacía que el tipo de **entrada** Zod (`includeDescendants?`) difiriera del de **salida**, y los helpers tipados del cliente (`apiJson`) infieren el de entrada → conflicto "dos tipos distintos con el mismo nombre". Hacerlo explícito (la UI siempre lo envía) alinea input/output y es más estricto. **Motivo:** correctitud de tipos extremo a extremo sin castings.

**Nuevo primitivo `@lyra/ui`: `Checkbox`** (CSS Module sobre tokens, dual theme, área táctil 44px, estado **indeterminado** para selección de grupo). Lo exige la matriz de permisos (agrupada por `group`/`dimension` del catálogo) y reutilizado en scope/roles.

**Hallazgo (honestidad técnica): el permiso `user:disable` no está enforced.** El cambio de `status` (ACTIVE↔DISABLED) viaja por `PATCH :id`, gateado por `user:edit`, no por `user:disable`; el permiso del catálogo queda sin guard que lo exija. La UI gatea el control de estado por `user:edit`; `user:disable` se registra como deuda en BACKLOG §3 (decidir: separar endpoint o retirar la clave). No se tocó el backend "cerrado" en esta sesión más allá del tipado de auditoría.

### 2026-06-08 · Módulo Equipos: modelo `Equipment` integration-ready + `ExternalReference` polimórfica (modelo) + catálogo de categorías

Cierre del módulo de Estructura. Reemplaza el placeholder "Equipos — próximamente" del nivel final por un CRUD real. Decisiones (aprobadas por el usuario tras propuesta):

**Modelo `Equipment` integration-ready (entidad separada, NO 4.º nivel de OrgNode).** Patrón SAP PM: Functional Location (OrgNode) 1:N Equipment. Campos: identidad (`name`, `code?` corto interno, **`tag?` @unique** = assetTag estable, clave de negocio/reportes), clasificación (`categoryId?` → catálogo configurable), `manufacturer/model/serialNumber`, `criticality?` (Int **1–5**, RCM/ISO 14224, reusa la escala Severidad 1–5 del DS), `active` (estado operacional) **+** `deletedAt` (borrado lógico — son conceptos distintos), `reportOrder` (orden en informes por nodo), y **`orgNodeId`** (FK a OrgNode). Decisiones de criterio que difieren del enunciado inicial y fueron aceptadas:
- **`orgNodeId`, no `processId`:** el DB no puede forzar "último nivel" (los niveles son configurables y un Proceso podría ganar hijos); el modelo admite cualquier nodo y la **UI** muestra la sección Equipos solo en el nivel final. Nombre consistente con `Scope.orgNodeId` / `ExternalReference`.
- **Sin `abbreviation`** (redundante con `code`) y **sin `externalCode` plano** en Equipment: los mapeos van por `ExternalReference`. El `externalCode` plano de OrgNode queda como deuda a migrar a `ExternalReference` (BACKLOG §3).
- **`criticality` acotada por check constraint** (`1..5` o NULL), análogo al check del Scope.

**Clasificación = catálogo configurable `EquipmentCategory`, NO enum ni texto libre.** Mismo espíritu que `OrgLevel`: `name`, `code?`, `isoRef?` (alineación **opcional** a ISO 14224, sin forzarla), `description?`, `reportOrder`, `active`. Texto libre rompería consistencia/reportes; un enum hardcodeado violaría "nunca hardcodear lo configurable" (madera ≠ minería) y obligaría a migrar por cliente. Se entrega con seed inicial editable **+ drawer de gestión** (molde `LevelsDrawer`) gateado por permiso nuevo `equipmentcategory:manage`, para que "configurable" sea real desde ya.

**`ExternalReference` polimórfica: modelo ahora, UI/motor en Fase 3.** Dueño `orgNodeId?` **XOR** `equipmentId?` (**check constraint raw SQL**, mismo patrón que `Scope` — validado en BD: ambos-nulos→falla, uno→OK, ambos→falla). Campos `systemType` (String, catálogo configurable que se define en Fase 3 — no enum), `externalId` (WebID/NodeId/Equipment Number), `externalPath` (PI AF/OPC browse path), `endpoint`, `metadata jsonb`, `enabled`. **Se descartó construir UI de mapeos esta sesión:** sin el motor de Fase 3 no se puede validar un WebID/NodeId ni probar conectividad → sería UI desechable (lo que CLAUDE.md prohíbe). El costo real a evitar era el modelo polimórfico + backfill, que queda resuelto. Un equipo mapea a varios sistemas a la vez ⇒ el `externalCode` único no bastaba.

**Permisos nuevos** (catálogo `@lyra/contracts`, asignación = dato en BD): `equipment:view/create/edit/delete` + `equipmentcategory:manage` (total catálogo: 20→25).

**Guard nuevo en `deleteNode`:** bloquea borrar un nodo con equipos activos (simétrico al bloqueo por hijos), evitando equipos huérfanos.

**Equipos NO es módulo de sidebar:** vive dentro de `/estructura` (en `NodeDetail` del nivel final), gateado por `module:structure:view`; las acciones gatean el CRUD interno. Sin cambios de navegación.

### 2026-06-08 · Estructura: UX de layout responsivo, splitter propio, `description` y `reportOrder`

Sesión de pulido de UX del mantenedor de Estructura (continuación). Decisiones:

**Workspace full-width y responsivo (token-first).** Se eliminaron los `max-width` (1320/1400px) y `margin:0 auto` que dejaban el contenido flotando con márgenes vacíos en monitores anchos, y el **doble padding** (shell + page). El padding del workspace pasa a tokens de layout nuevos en `@lyra/ui` (`--layout-content-pad-x/y`, `--layout-tree-width`) con breakpoints explícitos: mobile <768px (apilado), tablet/desktop, wide >1920px (padding y árbol crecen). Motivo: usar todo el ancho disponible en cualquier resolución; cambios en una sola fuente de verdad.

**Splitter de paneles propio, NO `react-resizable-panels`.** Se probó la librería (v4) y se descartó: aplica el `className` a un **div anidado** mientras su contenedor externo (con `overflow:hidden` y tamaño propio) **recortaba** el contenido del árbol (nombres invisibles, scroll horizontal), además de imponer topes de redimensionado arbitrarios. Se reemplazó por **`ResizableSplit`** (en `@lyra/ui`, ~120 líneas, sin dependencia): ancho izquierdo explícito en px, panel derecho `flex:1`, divisor con **pointer events + teclado (flechas) + táctil**, doble clic para resetear, ancho persistido en `localStorage`, re-clamp con `ResizeObserver`. Sin topes arbitrarios; solo mínimos sensatos (220px izq / 360px der) para que ningún panel colapse. **Promovido a `packages/ui`** para reúso (regla del monorepo). Motivo: control total del DOM/CSS = contenido siempre ajustado (ellipsis, no recorte) y comportamiento "inteligente" sin pelear con el modelo de la librería; bundle −32 KB.

**`description` (uso del nodo) en `OrgNode`, full-stack.** Campo `String?` (máx. 500). Se muestra como **segunda línea** en el árbol (truncada) y en la grilla de hijos (bajo el nombre), y en el header del detalle. Descripciones de demo (planta de remanufactura de madera, referencia tipo ITI) en **un módulo único** `prisma/structure-descriptions.ts` consumido por el seed (nodos nuevos) y por un **backfill no destructivo** (`db:backfill-descriptions`, solo `description IS NULL`).

**`reportOrder` (orden en informes) por nodo, relativo a hermanos.** Campo `Int @default(0)`. `getTree` ordena por `(reportOrder asc, name asc)` → afecta árbol y grilla. Decisiones de UX confirmadas con el usuario: **edición inline** en la grilla (input numérico por fila, persiste en blur/Enter) y **orden por defecto** por este campo. Orden inicial **escalonado** (10,20,30…) por grupo de hermanos vía helper único `prisma/report-order.ts` (seed + backfill `db:backfill-report-order`, no destructivo). Honesto: el escalonado inicial es **alfabético**, no el flujo físico real de la planta; el usuario lo ajusta desde la grilla.

**Grilla de hijos ordenable.** El `Table` de `@lyra/ui` ya era **controlado** (emite `onSort`, el padre ordena); `NodeDetail` ahora mantiene estado de sort y ordena los hijos localmente (columnas nombre/orden/código/cód. externo). Densidad de tabla reducida (padding `14→10`, `th 10→8`) con `min-height:44px` por fila para preservar el área táctil de terreno.

**Dev server fijado al puerto 5173.** `strictPort:true` en `vite.config` + script `predev` (`scripts/free-port.mjs`) que mata lo que ocupe 5173 antes de arrancar (cross-platform). Motivo: Vite derivaba a 5174+ en silencio y el usuario "no encontraba" la app.

### 2026-06-07 · Estructura v2: layout master-detail + Menu portal + Equipment como entidad separada

**Layout master-detail de dos paneles** (árbol izquierda, detalle derecha) adoptado como patrón estándar para la gestión de jerarquías. Es el patrón de SAP PM (Functional Location / Equipment), IBM Maximo (Asset/Location), Figma (Layers + Properties), VS Code (Explorer + Editor). Ventajas sobre el árbol + menú contextual: sin menús recortados por `overflow:hidden`, más espacio para atributos futuros, navegación por breadcrumb, acciones visibles y contextualizadas.

**Menu portal**: `@lyra/ui/Menu` migrado a `createPortal(panel, document.body)` con `position:fixed`. Solución estándar de la industria (Radix UI, Headless UI, Floating UI) para menus/tooltips/popovers que necesitan escapar de cualquier contexto de apilamiento CSS. El detector de click-fuera usa `panelRef` adicional al `triggerRef`.

**Equipos ≠ 4.º nivel de OrgNode**: los equipos industriales (máquinas) son una entidad operacional distinta de la jerarquía organizacional/funcional. Mezclarlos en OrgNode crearía columnas condicionales (code / externalCode / type / abbreviation / sortOrder / active solo tienen sentido para Equipo). El patrón correcto (SAP PM): Functional Location (OrgNode) 1:N Equipment. El modelo `Equipment` se implementará en sesión posterior con su propia migración, endpoints y grid en NodeDetail.

### 2026-06-07 · Fase 1 (UI): Estructura organizacional — árbol sin librería, MoveModal con ruta materializada
Árbol de nodos implementado como componente recursivo **sin dependencia de librería de árboles**
(custom `OrgTree` + `NodeBranch` en `features/structure/`). Justificación:
- Las estructuras industriales esperadas son de decenas a ~300 nodos: no se justifica virtual scrolling ni lazy loading.
- El árbol tiene comportamientos de dominio específicos (acciones por nodo gateadas por permiso, `Chip` de nivel, reparentado) que no encajan limpiamente en la mayoría de librerías.
- Coste marginal de un árbol recursivo manual es bajo dadas las capacidades ya existentes.

**Reparentado (MoveNodeModal):** se usa el campo `path` (ruta materializada) del backend para pre-deshabilitar en la UI los nodos que no pueden ser padre (el propio nodo y sus descendientes, con `path.startsWith(node.path)`). El backend sigue siendo la fuente de verdad con `assertValidReparent`; la UI mejora el UX sin relajar la seguridad.

**Componentes nuevos en `@lyra/ui`:** `Chip` (badge genérico, 6 variantes), `Table` (sortable, skeleton, dual theme), `Select` (mismo patrón que `Input`). `NodeTag`/`NodeTree` descartados — acoplan el DS al dominio.

**DELETE /structure/levels/:id** añadido al backend (bloquea si hay nodos activos — simétrico al DELETE de nodo que bloquea si tiene hijos).

### 2026-06-06 · Fase 1 (UI): tema claro / oscuro / auto en el workspace (revierte "dark-only v1")
A pedido del producto se incorpora **modo claro/oscuro/auto** en el workspace, **revirtiendo** la regla
de identidad "Dark mode … No hay modo claro en v1" (actualizada en `CLAUDE.md`). Implementación:
- **Token-first, sin tocar componentes**: el tema EFECTIVO se aplica como `data-theme="dark|light"` en
  `<html>`; los tokens se redefinen por tema en `packages/ui/src/tokens/index.css`
  (`[data-theme="dark"]` / `[data-theme="light"]`). Se definió una **paleta clara completa** (fondos,
  bordes, texto, glass, glows, sombras) y dos tokens de interacción nuevos: `--color-hover` (superficies
  hover/activas) y `--color-chrome` (fondo translúcido de sidebar/topbar/pestañas). Se barrieron los
  `rgba(255,255,255,…)` en duro de los componentes del workspace y se reemplazaron por tokens.
- **Preferencia** (`dark`/`light`/`auto`) en `theme-store` (Zustand + persist, `localStorage`,
  no secreto). `auto` resuelve con `prefers-color-scheme` y reacciona a cambios del sistema
  (`use-theme-controller`). Default = **oscuro**. Selector en el top bar y en la command palette (⌘K).
- **La entrada/login es SIEMPRE oscura** (experiencia de marca): `AuthLayout` fuerza `data-theme="dark"`
  en su raíz, por eso el tema solo afecta al workspace.
- **Pestañas de trabajo**: más estilo + animación sobria (línea de acento de marca al activarse,
  entrada `tabIn` fade/slide, se "conectan" al contenido); respeta `prefers-reduced-motion`.
**Pendiente:** QA visual del modo claro en navegador (BACKLOG §4). El default sigue oscuro.

### 2026-06-06 · Fase 1 (UI): App Shell / Workspace premium ANTES de los módulos
Antes de construir la UI de Estructura/Seguridad se construye un **shell de aplicación premium**
(el "área de trabajo"), porque es el marco donde viven todos los módulos y retrofitearlo después
obliga a re-alojar pantallas y, sobre todo, a meter i18n y pestañas en todo lo ya hecho.
- **Secuencia:** shell primero (una sesión enfocada) → luego Estructura nace dentro de él. Los
  primitivos de `@lyra/ui` que faltan (Tabs, Drawer, Modal, Menu, Tooltip, Skeleton, Breadcrumb,
  EmptyState, Toggle) se construyen aquí y se reutilizan en todos los módulos (no es trabajo perdido).
- **Paradigma de navegación: pestañas de trabajo ACOTADAS** (no MDI ilimitado). Tira de pestañas
  fijables (tope ~6); **cada pestaña es una ruta** y el estado se preserva por la **caché de TanStack
  Query** (con `staleTime`), no manteniendo árboles de componentes vivos. Logra el "no salir y entrar"
  sin **datos rancios/memoria** (el "ojo con los refrescos" del usuario) ni la hostilidad del MDI en
  **tablet/terreno con guantes**. Colapsa con gracia en pantallas chicas.
  - **Descartado:** MDI completo (memoria creciente, estancamiento, malo en tablet).
- **i18n-ready desde ahora** (no diferido a Fase 7): capa ligera con **es-CL por defecto** + selector
  de idioma visible; **todos los strings como claves**. Los catálogos de otros idiomas se llenan en
  Fase 7, pero no hay que retrofitear pantallas. On-prem, sin SaaS.
- **Recursos premium del shell:** sidebar colapsable (completo ↔ riel de íconos, persistido),
  **command palette ⌘K** (saltar a módulos/acciones/nodos), top bar con breadcrumbs + búsqueda +
  notificaciones + **menú de perfil** (Mi seguridad/MFA, Preferencias, Logout) + cambio de idioma +
  **toggle de densidad** (cómodo/compacto), **favoritos + recientes**, skeleton loaders + updates
  optimistas. Estado de UI (sidebar/densidad/idioma/pestañas) en `localStorage` (nunca tokens/secretos).
- **Tooling propuesto (a confirmar al implementar):** `react-i18next` (estándar, offline, plural/
  interpolación) y `cmdk` (headless, lo estilizamos con tokens Lyra) — ambos locales, sin SaaS.

### 2026-06-06 · Fase 1 (Auth): MFA self-service — política por rol + enrolamiento forzado
Segundo factor TOTP con enrolamiento **self-service** (el secreto solo lo conoce el dispositivo del
usuario; el admin NUNCA enrola por él). Estándar NIST 800-63B / OWASP ASVS v4 §2. Decisiones:
- **Política de requerimiento** en dos piezas: campo **`Role.requireMfa`** (granularidad por rol) +
  modo global **`PasswordPolicy.mfaMode`** = `OPTIONAL | REQUIRED_BY_ROLE | REQUIRED_FOR_ALL`. El piso
  es **OPCIONAL** (nadie forzado, pero cualquiera puede auto-enrolarse): **se descartó un modo
  "deshabilitado"** que impidiera el enrolamiento voluntario por ser un anti-feature de seguridad.
  Requerimiento **derivado**: `required = ALL || (BY_ROLE && algúnRol.requireMfa)`.
- **Enrolamiento forzado con enforcement en backend (no solo UI).** Análogo a `forcePasswordChange`,
  pero `forcePasswordChange` hoy solo redirige en la UI; para MFA eso **degradaría el AAL** (operar con
  solo-contraseña vía API). Se añadió un claim **`mfaPending`** al access token (recalculado en cada
  emisión/rotación) y un **`MfaEnrollmentGuard`** global que bloquea (**403 `MFA_ENROLLMENT_REQUIRED`**)
  todo salvo lo marcado con **`@AllowPendingEnrollment`** (me, logout, mfa/setup, mfa/verify,
  change-password). Al verificar, un `/auth/refresh` limpia el claim. *Pendiente registrado:* dar el
  mismo enforcement de backend a `forcePasswordChange` (hoy solo UI).
- **Throttle del 2.º factor** (faltaba; NIST §5.2.2 / ASVS §2.2.1): contador **propio** en
  `User.mfaFailedCount`/`mfaLockedUntil`, **separado** del lockout de contraseña (si se compartiera, una
  contraseña correcta reiniciaría el tope del 2.º factor). Tras `maxFailedAttempts` bloquea
  `lockoutMinutes`. Se fijó **ventana TOTP ±1** (RFC 6238) para desfase de reloj.
- **Reset de MFA por admin** (dispositivo perdido): `POST /security/users/:id/mfa/reset`, permiso nuevo
  **`user:reset-mfa`** (catálogo, no hardcodeado). Borra el factor y **revoca TODAS las sesiones** del
  objetivo (evita sesión rancia con el AAL anterior); si el rol sigue exigiendo MFA, cae al gate en el
  próximo login. El admin **no** enrola por el usuario.
- **Sesiones:** auto-activar / auto-desactivar mantienen la sesión actual; **reset de admin revoca
  todo**. Un factor **exigido por política no se puede auto-desactivar** (`disableMfa` lanza 403 si el
  rol lo requiere; solo el admin lo restablece). El reset de **contraseña** sigue sin tocar MFA.
- **Recovery codes:** 10, hasheados, single-use (ya existían); se añadió **regenerar** con
  reconfirmación de contraseña (invalida los anteriores). Se muestran **una sola vez** (copiar/descargar).
- **Frontend:** página de seguridad del perfil (`/perfil/seguridad`) y gate full-screen `/activar-mfa`
  comparten un `MfaEnrollFlow` (QR con **`qrcode.react`** desde el `otpauth://` del backend → verificar →
  códigos). `ProtectedRoute` prioriza cambio de contraseña y luego enrolamiento de MFA.
**Alcance:** el **reset de admin y la lectura de estado** se entregan como **backend + contratos** ahora;
su **UI vive en la pantalla de Seguridad/usuarios** (sesión posterior), para no construir UI desechable.
**Residual honesto:** no se implementa anti-replay del mismo OTP dentro de su ventana (deuda menor).

### 2026-06-06 · Fase 1 (Auth): recuperación de contraseña self-service
Reset por correo siguiendo NIST 800-63B y OWASP ASVS §2.5 / Forgot Password Cheat Sheet.
- **Token**: aleatorio de 256 bits, se guarda **solo el hash SHA-256** (`PasswordResetToken`),
  **single-use** (`usedAt`) y **TTL corto** (`PASSWORD_RESET_TTL`, def. 30 min). Al pedir uno nuevo
  —o al cambiar la contraseña por cualquier vía— los pendientes se invalidan.
- **`POST /auth/forgot-password`**: respuesta **neutra siempre** (`{ok:true}`), sin enumeración de
  usuarios; el correo se envía **en segundo plano** para no filtrar por *timing*. **Rate-limit** por
  correo y por IP (contadores en `CacheService`); superar el tope no cambia la respuesta.
- **`POST /auth/reset-password`**: valida token (hash, no usado, no expirado) con **mensaje genérico**
  ("inválido o expirado"), impone la **política** (complejidad + historial), **revoca TODAS las
  sesiones** (`TokenService.revokeAllForUser`), limpia lockout/`forcePasswordChange`, **no toca MFA**
  (quien controle el correo sigue sin pasar el 2º factor) y **no auto-loguea** (redirige a `/login`).
- **Correo tras una interfaz abstracta `EmailService`** (token DI, patrón tipo `LlmProvider`) con
  implementación SMTP (**nodemailer**); en dev usa **Mailpit**. Sin SaaS obligatorio (on-premise).
  Se envía además una **notificación de seguridad** "tu contraseña fue cambiada".
- **Frontend**: `/recuperar-contrasena` (pedir correo + confirmación neutra) y nueva
  `/restablecer-contrasena?token=…`. **Endurecimiento del token en URL**: se borra de la URL al montar
  (`history.replaceState`) y `<meta name="referrer">` para no filtrarlo por *referer*.
- **Auditoría** append-only: `reset_requested` (con `delivered`), `reset_completed`, `reset_failed`,
  `reset_throttled`.
**Pendiente registrado (mejora transversal, NO en esta sesión):** rechazo de **contraseñas
comprometidas** (NIST 800-63B §5.1.1.2, ej. HIBP k-anonymity o lista local). Aplica a todo seteo de
contraseña (change/force/reset); se diseñará pluggable y apagado por defecto para respetar on-premise.

### 2026-06-05 · Fase 1 (UI): co-branding de la empresa licenciataria + entrada premium
La pantalla de acceso co-marca **producto (Lyra WatchLog) + empresa licenciataria**. Como es
single-tenant on-premise, la identidad del cliente (nombre, rubro, logo) se configura **por entorno**
(`VITE_LICENSEE_NAME/INDUSTRY/LOGO_URL`, `envDir` apunta al `.env` raíz), nunca hardcodeada; sin logo
se usa un **monograma** de iniciales (con fallback automático si el logo falla al cargar). El logo se
muestra sobre **placa clara** para legibilidad de cualquier color. Se añadió un gráfico vectorial
animado propio (constelación Lyra + telemetría operacional) y animaciones de entrada
(`prefers-reduced-motion` respetado).
**Bug corregido en tokens:** los componentes usaban `--space-*`, `--text-*`, `--transition-*` que NO
existían en `@lyra/ui/tokens` (solo `--spacing-*`), por lo que el espaciado y la tipografía colapsaban.
Se agregaron esos tokens (fuente de verdad), mejorando toda la app.

### 2026-06-05 · Fase 1 (UI): login estándar y recuperación asistida (reset self-service PENDIENTE)
El login incorpora lo estándar: mostrar/ocultar contraseña, **recordar correo** (nunca la contraseña),
**¿olvidaste tu contraseña?** y, en el segundo factor, opción de **código de recuperación** (fiel:
`assertSecondFactor` ya acepta TOTP o recovery code). La recuperación de contraseña es **asistida por
administrador** (patrón on-premise estándar) porque el **reset self-service por correo es backend no
implementado** (endpoints + SMTP) y, por regla, requiere aprobación antes de codear. No se simula envío
de correo.
**Decisión de diseño MFA (estándar de industria):** el enrolamiento de MFA es **self-service del
usuario** (el secreto TOTP solo lo conoce su dispositivo); el administrador NO "activa" MFA por usuario
con un booleano, sino que define la **política de requerimiento** (deshabilitado/opcional/requerido,
idealmente por rol) y puede **resetear** el MFA de un usuario (dispositivo perdido). Ver NIST 800-63B y
OWASP ASVS v4 (§2). Pendiente de implementar (próxima sesión de auth).

### 2026-06-05 · Regla permanente: criterio y honestidad técnica
Se añadió a `CLAUDE.md` la regla de **no complacer a la primera**: contrastar mis propuestas con el
estándar de la industria y objetar con fundamento cuando convenga. Motivo: mejores decisiones de
producto/seguridad.

### 2026-06-05 · Fase 1 (UI): arquitectura del frontend de autenticación
Sesión enfocada **solo en Login + cimientos** (no las 3 pantallas a la vez), para cerrar por módulo según CLAUDE.md. Decisiones:
- **Access token en memoria** (`src/lib/session-token.ts`, módulo plano sin React, nunca en localStorage) + **refresh proactivo** ~30 s antes de expirar (`AuthProvider`). El refresh token va en cookie httpOnly; al arrancar la app se intenta un refresh silencioso para rehidratar la sesión.
- **Cliente HTTP central** (`src/lib/api-client.ts`): añade `Authorization: Bearer` + `credentials:"include"`; ante un **401 con token vigente** hace **un** refresh transparente (coalescido) y reintenta; si falla, marca la sesión como expirada. CSRF de doble envío (`wl_csrf` cookie → header `x-csrf-token`) en refresh/logout.
- **Estado de sesión** en Zustand (`auth-store.ts`): solo `status` + `SessionInfo` (usuario, permisos, scope), no el token.
- **Cliente de permisos** en paquete nuevo **`@lyra/permissions`** (TS puro: `can`/`canAll`/`canAny`/`createPermissionChecker`, tipado con `PermissionKey`). El hook React (`usePermissions`) y el componente `<Can>` viven en la web y lo consumen. La UI **solo oculta/deshabilita**; el backend decide.
- **Componentes premium** en **`@lyra/ui`** con **CSS Modules sobre tokens** (Button, Input, FormField, Card, Spinner, Toast). Área táctil 44px, dark-mode, Lucide.
**Motivo:** patrón resistente a XSS (token efímero en memoria) y a robo de refresh; límites de paquete limpios y reutilizables por el ecosistema Lyra; cumple "permisos nunca hardcodeados" reusando el catálogo de `@lyra/contracts`.

### 2026-06-05 · Fase 1: estrategia de tokens (access en memoria + refresh httpOnly rotativo)
Access JWT corto (15 min) por header `Authorization: Bearer`, guardado **en memoria** en el front. Refresh token opaco en cookie `httpOnly`/`Secure`/`SameSite=Strict`, del que solo se guarda el **hash SHA-256** en BD. **Rotación con familia y detección de reuso**: si un refresh ya rotado se reutiliza, se revoca toda la familia + sesión.
**Motivo:** resistente a XSS (el access no es robable desde JS persistente) y a robo de refresh (rotación + reuso ⇒ revocación). Patrón estándar de la industria.

### 2026-06-05 · Fase 1: CSRF de doble envío en endpoints con cookie
`refresh` y `logout` (que confían en la cookie) exigen un header `x-csrf-token` igual a una cookie CSRF **no httpOnly** que el SPA reenvía. Las llamadas normales usan Bearer (no vulnerables a CSRF).
**Motivo:** defensa en profundidad sobre `SameSite=Strict`.

### 2026-06-05 · Fase 1: catálogo de permisos como código, asignaciones como dato
Las **claves** de permiso (4D) viven en `@lyra/contracts` (las referencian los guards y las siembra el seed). La **asignación** rol→permiso y rol→usuario es 100% dato en BD, editable desde la UI.
**Motivo:** cumple "permisos nunca hardcodeados" sin perder el tipado/validación de las claves. Lo prohibido es hardcodear roles/reglas, no la existencia de las claves.

### 2026-06-05 · Fase 1: alcance de datos (Scope) con sujeto polimórfico
Tabla `Scope` con `userId?` **o** `roleId?` (check constraint que exige exactamente uno) + `orgNodeId` + `includeDescendants`. El alcance efectivo de un usuario = unión de sus scopes propios y los de sus roles, expandiendo descendientes vía la **ruta materializada** `OrgNode.path`.
**Motivo:** flexibilidad (alcance por usuario y por rol) sin multiplicar tablas; el `path` permite resolver descendientes en una sola query indexada.

### 2026-06-05 · Fase 1: AuditLog inmutable por trigger Postgres
Además de no exponer update/delete en la app, un trigger `BEFORE UPDATE OR DELETE` rechaza toda mutación de `AuditLog`.
**Motivo:** la inmutabilidad la garantiza la base, no solo la confianza en el código (requisito de auditoría).

### 2026-06-05 · Fase 1: MFA TOTP completo en backend; lockout en BD
Enrolamiento TOTP end-to-end (setup/verify/disable + recovery codes hasheados, secreto cifrado con `APP_ENC_KEY`). El **lockout por fuerza bruta** usa un contador persistente en `User` (`failedLoginCount`/`lockedUntil`), no Redis, que queda como acelerador opcional de caché.
**Motivo:** MFA listo de punta a punta para cuando llegue la UI; contador en BD = durable, testeable y sin depender de Redis on-prem.

### 2026-06-05 · Fase 1: ajustes de tooling (dotenv-cli, otplib v12, fastify directo)
Scripts Prisma cargan el `.env` raíz vía `dotenv-cli` (monorepo). `otplib` fijado a v12 (API `authenticator` síncrona; v13 es una reescritura async incompatible). `fastify` añadido como dependencia directa del API (los tipos no estaban expuestos por transitividad).
**Motivo:** que `pnpm db:migrate/seed` funcione sin fricción y evitar romper el código con una mayor de otplib.

### 2026-06-05 · Fase 0: andamiaje del monorepo
Se construye la base: pnpm workspaces, NestJS+Prisma+Postgres, React+Vite+Tailwind v4, Docker (dev/prod) + Caddy, tokens del Design System en `@lyra/ui`, contratos en `@lyra/contracts`, API con healthchecks.
**Motivo:** establecer cimientos correctos y verificables antes de la lógica de negocio.

### 2026-06-05 · Nombre del producto: **Lyra WatchLog**
Marca paraguas *Lyra*; producto *WatchLog* ("watch" = turno de guardia + vigilar; "log" = bitácora/registro). Codename interno *Sheliak* opcional.
**Motivo:** memorable y autoexplicativo en B2B industrial; "Sheliak" no convencía comercialmente.

### 2026-06-05 · Backend: NestJS + Prisma + PostgreSQL
**Motivo:** madurez, modularidad (seguridad/incidencias/orígenes), Guards para autorización en servidor, tipado fuerte, migraciones versionadas estándar. Se descarta Drizzle al no necesitar RLS (single-tenant).

### 2026-06-05 · Despliegue single-tenant on-premise (sin multi-tenant)
Un cliente = un stack Docker + su BD. Sin `tenant_id` ni RLS.
**Motivo:** cautela; evita la complejidad SaaS (cobros, infra). El modelo de datos se mantiene limpio por si se evalúa SaaS a futuro, pero no se construye ahora.

### 2026-06-05 · Autenticación enchufable (local + ranura OIDC/LDAP)
Auth local (Argon2id, refresh rotativo, lockout, MFA TOTP opcional) tras una abstracción; OIDC (Azure/Entra, Google…) y LDAP se activan por configuración por despliegue. Keycloak descartado para el MVP.
**Motivo:** clientes distintos tendrán necesidades distintas; la abstracción evita "casarse" con un método y no obliga a reescribir.

### 2026-06-05 · IA abstracta en el backend
Interfaz `LlmProvider` con implementaciones nube (Anthropic/OpenAI/Gemini/Deepseek) o local (Ollama/vLLM).
**Motivo:** agnóstico al proveedor; on-premise puede requerir modelo local. **Hallazgo del prototipo:** llamaba a la IA desde el frontend (fuga de API key) — se mueve al backend.

### 2026-06-05 · Monorepo con pnpm workspaces (sin Turborepo aún)
**Motivo:** simplicidad; se evaluará Turborepo cuando el repo crezca (varias apps del ecosistema).

### 2026-06-05 · Tailwind v4 cableado a los tokens Lyra
**Motivo:** el Design System es token-first; Tailwind v4 (`@theme`) mapea los tokens CSS sin duplicarlos.

## Recomendaciones registradas para incorporar (fase de endurecimiento u oportuna)
Mover IA/orígenes al backend (hecho como principio) · adjuntos/evidencias en MinIO · firma con validez probatoria (hash+timestamp) · respaldos Postgres/MinIO · observabilidad (pino/Prometheus/OpenTelemetry/Grafana/Loki) · healthchecks (hechos) · rate-limit + CSP/HSTS · exportación CSV/PDF · notificaciones SMTP (SLA/escalamiento) · búsqueda full-text KB · i18n es-CL + multi-idioma · **modo offline terreno (PWA) como fase posterior** · retención/borrado lógico · tests de lógica crítica desde Fase 1.
