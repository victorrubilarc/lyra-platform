# Backlog / Estado abierto — Lyra WatchLog

> **Registro único y autoritativo de todo lo que está ABIERTO.** Nada se cierra "de
> palabra": si está pendiente (por hacer, por probar, por publicar) vive aquí hasta
> que se complete. `PROGRESS.md` narra lo **hecho**; este archivo lista lo **abierto**.
>
> **Regla:** al cerrar cada sesión, revisa y actualiza este archivo (ver §0). Última
> actualización: **2026-06-09** (**Fase 2.1 ✅** + **Fase 2.1.1 ✅** — Plantillas: modelo definición + campo en 3
> capas + `optionSource` + Form Builder; **siguiente: Fase 2.2 — Flujos reutilizables `WorkflowDefinition`**).

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

> Estado al 2026-06-08 (todo publicado). Verificar con:
> `git rev-list --count origin/main..main` (debe dar 0) y `git branch --no-merged main`.

| Qué | Dónde | Estado | Acción pendiente |
|---|---|---|---|
| **Fase 1: Login + branding + reset de contraseña + docs + rutina** | `main` | ✅ publicado en `origin/main` | ninguna |
| **Fase 1: MFA self-service** | `main` (fusionado desde `feat/auth-mfa-self-service`) | ✅ fusionado y publicado en `origin/main` | ninguna |
| **Estructura v2 + externalCode + Table fix** | `main` | ✅ publicado (`f84cbd8`) | ninguna |
| **Estructura UX: layout responsivo, ResizableSplit, description, reportOrder, fix puerto** | `main` | ✅ publicado (`5170f70`) | ninguna |
| **Docs cierre + fix header responsivo del detalle** | `main` | ✅ publicado (`91a4bd6`) | ninguna |
| **Módulo Equipos** (CRUD + categorías + `ExternalReference` modelo) | `main` (fusionado desde `feat/equipos`) | ✅ fusionado y publicado en `origin/main` (`a299ab6`) | ninguna |
| **UI de Seguridad** (usuarios/roles/política/auditoría + reset MFA) | `main` (fusionado desde `feat/seguridad-ui`) | ✅ fusionado y publicado en `origin/main` (`a6f8b10`) | ninguna |
| **Fase 2.1 Plantillas** (modelo definición + contratos + Form Builder) | `main` (fusionado desde `feat/plantillas`) | ✅ fusionado y publicado en `origin/main` (`a440f54`) | ninguna |

**Estado:** **nada vive solo en local.** `main` = `origin/main`.

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
- [x] **UI Estructura organizacional** ✅ (2026-06-07). Árbol expandible con CRUD de nodos y gestión de
      niveles. `@lyra/ui` ampliado con `Chip`, `Table`, `Select`. Backend: `DELETE /structure/levels/:id`.
- [x] **externalCode en OrgNode** ✅ (2026-06-07). Campo de integración ERP/CMMS/SCADA: migración,
      contratos, backend (service + buildTree), UI (drawer + detalle). i18n. Build limpio.
- [x] **Estructura UX** ✅ (2026-06-08). Workspace full-width + responsivo (tokens de layout +
      breakpoints); **`ResizableSplit`** propio en `@lyra/ui` (reemplaza `react-resizable-panels`);
      **`description`** y **`reportOrder`** en `OrgNode` (full-stack, con backfills no destructivos);
      grilla de hijos ordenable + edición inline del orden; densidad de tabla; dev server fijado a 5173;
      fix responsivo del header del detalle. **Smoke visual ✅** (confirmado por el usuario).
- [x] **Módulo Equipos** ✅ (2026-06-08). CRUD de `Equipment` integration-ready (tag único, categoría,
      criticidad 1–5, estado/baja lógica, orden), catálogo configurable `EquipmentCategory` + drawer de
      gestión, `ExternalReference` polimórfica (modelo + contratos; UI/motor en Fase 3). Migración con
      check constraints, 5 permisos nuevos, guard en `deleteNode`, grilla en `NodeDetail`, seed demo.
      **Estructura organizacional CERRADA.** Ver DECISIONS 2026-06-08.
- [x] **UI Seguridad** ✅ (2026-06-08) sobre `/security/*` — ver PROGRESS y DECISIONS 2026-06-08:
  - [x] Usuarios: listado, alta (contraseña temporal), edición, asignar roles, asignar alcance (scope)
        vía árbol con "incluye descendientes".
  - [x] Roles/permisos: CRUD de roles + matriz de permisos (catálogo de `@lyra/contracts`, agrupada),
        editar `requireMfa` por rol; system no borrable.
  - [x] Política de seguridad: editar contraseñas + bloqueo + **`mfaMode`** global.
  - [x] **MFA de admin**: estado de MFA por usuario + **resetear MFA**
        (`POST /security/users/:id/mfa/reset`, permiso `user:reset-mfa`). *Backend ✅ + UI ✅.*
  - [x] **Reset de contraseña por admin** ✅ (2026-06-08, variante A estilo AD): contraseña temporal +
        cambio forzado + revoca sesiones + auditoría, sin tocar MFA. Permiso nuevo `user:reset-password`
        (catálogo 26), `POST /security/users/:id/reset-password`, UI en pestaña *Seguridad*. Ver DECISIONS.
  - [ ] **Reset de contraseña por enlace (variante B)** — opción futura: el admin dispara el flujo
        self-service por correo (el admin no ve la clave). Requiere SMTP + buzón del usuario. **Prioridad: baja**
        (complementa la variante A ya entregada).
  - [x] Lectura de auditoría (`/security/audit`) con paginación por cursor y diff before/after.
  - **Añadidos**: contrato `auditLogEntrySchema`, primitivo `@lyra/ui` `Checkbox`, navegación por sub-rutas
    anidadas (`routeForPath`/`isRouteActive`). **Pendiente solo el smoke visual** (ver §4).
- [x] **Ampliar `@lyra/ui`** ✅ Fase Shell: Toggle/Tooltip/Menu/Modal/Drawer/Skeleton/Breadcrumb/EmptyState.
      ✅ Fase Estructura (2026-06-07): Chip, Table, Select. Pendiente: nada para esta fase.

### Mejoras futuras de Estructura (enterprise, post-Seguridad)
- [ ] **Alcance por plantillas (2.ª dimensión ABAC).** El modelo de seguridad contempla limitar el alcance
      a **plantillas/bitácoras** además de nodos (SECURITY §2.4). Hoy solo hay nodos porque Plantillas es
      Fase 2. La pestaña *Alcance* del detalle de usuario ya quedó **preparada como multi-dimensión**
      (encabezado "Estructura organizacional"); cuando exista el módulo de Plantillas se suma una sección
      hermana "Plantillas" (mismo patrón: selector + guardado por `PUT :id/scope` extendido). Pedido del
      usuario (2026-06-08). **Prioridad: con Fase 2.**
- [ ] **Seguridad a nivel de nodo en el mantenedor de Estructura (ABAC enterprise).** Volver a
      `/estructura` para incorporar gestión de **alcance de datos por nodo** (asignar usuarios/roles a
      nodos con herencia a descendientes) desde el propio árbol/detalle, al estilo de los grandes
      softwares industriales (SAP PM, Maximo): permisos efectivos por rama, vista de "quién tiene acceso
      a este nodo", scoping visual. El **modelo backend ya existe** (`Scope` polimórfico user|role +
      `includeDescendants` + ruta materializada; ver DECISIONS 2026-06-05). Falta la **UI** y conectarla
      con la pantalla de Seguridad. Pedido explícito del usuario (2026-06-08). **Prioridad: media**, tras
      la UI de Seguridad base.

### Identidad / Federación (v2 — diseño aprobado, implementación diferida)
> Diseño registrado el 2026-06-08 (ver DECISIONS). El objetivo es que activar proveedores externos
> (AD/OIDC/SAML) sea **aditivo**. Anclado a **SCIM 2.0** (RFC 7643/7644), **OIDC Core §5.1**, inetOrgPerson.
- [ ] **Set lean de campos de usuario (SCIM-alineado), a agregar cuando se justifique.** `username`
      (login estable, opcional, ≠ email), `firstName`/`lastName`, `phone`, `jobTitle`, `employeeId`,
      `preferredLanguage`/`timezone`. Migración + contratos + UI (pestaña *Datos* del detalle de usuario).
      Alto valor para bitácoras/notificaciones; mapean 1:1 a SCIM/OIDC. **Prioridad: media** (su propia sesión).
- [ ] **Costura de federación (v2): tabla `UserIdentity`** (`userId`, `provider` LOCAL|OIDC|SAML|LDAP,
      `providerKey`, `subject`/`externalId`, `claims jsonb`, `linkedAt`) + `authProvider` en `User`
      (default LOCAL) + reglas de *mastering* de atributos (campos gobernados por el IdP = solo-lectura en UI).
      Permite account linking. **No tocar la tabla `User` ahora**; es migración aditiva al activar un IdP.
- [ ] **SCIM inbound + JIT provisioning + mapeo grupo→rol** (el RBAC ya es 100% dato). **v2.**
- [ ] **MFA delegada al IdP**: `mfaMode` debe poder *deferir* al proveedor (no exigir TOTP propio si el IdP
      ya hizo MFA / AAL suficiente). **v2.**
- [ ] **Validez por fechas para contratistas** (`validFrom`/`validTo`, `userType`) + multi-email/multi-phone.
      **v2 / cuando lo pida un cliente.**

### Módulos intermedios (antes de Fase 2)
- [x] **Módulo Equipos** ✅ (2026-06-08) — ver el ítem cerrado arriba en "Fase 1 — Seguridad + Estructura"
      y DECISIONS 2026-06-08. La descripción original (decisiones a tomar) se conserva abajo como
      referencia histórica de lo decidido.
- [ ] ~~**Módulo Equipos**~~ *(cerrado — texto original conservado como referencia)* Modelo `Equipment`
      (name, code, externalCode, description, reportOrder, type, abbreviation, active, processId FK a
      OrgNode de nivel Proceso/último), migración, contratos (schema + create/update DTOs), service +
      endpoints `GET/POST/PATCH/DELETE /structure/equipment` (gateados por permisos nuevos
      `equipment:view/create/edit/delete` en el catálogo de `@lyra/contracts`), y **grid CRUD en
      `NodeDetail`** al seleccionar un nodo de último nivel — reemplaza el placeholder
      "Equipos — próximamente". Reusar `Table` (sortable + edición inline de orden, igual que hijos),
      `NodeDrawer`-style para alta/edición, descripción como 2ª línea. Seed/backfill de equipos de
      ejemplo opcional. **Antes de codear: confirmar el modelo de `Equipment` con el usuario**
      (¿qué `type`/categorías?, ¿abbreviation obligatoria?, ¿activo/baja lógica?).
  - **Integración (diseño integration-ready, decisión a tomar antes de codear):** la plataforma es
    industrial y conversará con historiadores/MES/EAM (PI System vía **PI Web API**: *WebID* opaco +
    *PI AF path*; **OPC UA**: *NodeId* + namespace/BrowseName; **SAP PM**: Equipment Number / Functional
    Location; **IBM Maximo**: Asset Num; lenguaje de intercambio **ISA-95** Physical Asset). Un equipo
    mapea a **varios** sistemas a la vez ⇒ el `externalCode` único **no basta**. Propuesta a evaluar:
    entidad genérica **`ExternalReference`** (o `SystemLink`) **polimórfica** (dueño `orgNodeId?` **o**
    `equipmentId?` con check constraint, **mismo patrón que `Scope`**) con campos `systemType`/`systemKey`
    (catálogo configurable, NO enum hardcodeado), `externalId` (WebID/NodeId/EquipmentNumber, estable),
    `externalPath` (AF/browse path, legible pero frágil), `endpoint`/namespace, `metadata jsonb`,
    `enabled`/`syncDirection`. Identidad estable de Lyra hacia afuera: el `id` (cuid) ya es inmutable;
    evaluar además un `tag`/assetTag de negocio estable. **El MOTOR de integración (conectar/leer/sync)
    es Fase 3 (Orígenes de datos), NO esta sesión** — aquí solo el modelo de datos + (opcional) UI mínima
    de referencias, para no migrar después. Decidir con el usuario: ¿se crea `ExternalReference` ahora
    (modelo + UI mínima) o solo se deja diseñada y se difiere a Fase 3? Refs: PI Web API WebID, OPC UA
    NodeId, ISA-95/OPC UA companion, ISO 14224 (taxonomía de equipos para confiabilidad).

### Fases siguientes (roadmap, ver PROGRESS §tabla)
- [ ] **Fase 2** — Plantillas / Form Builder + Bitácoras. **Arquitectura enterprise definida en DECISIONS
      2026-06-09** ("formulario = proceso/documento vivo de secciones"; captura multi-actor por fases;
      definición versionada vs ejecución auditada; flujo = máquina de estados configurable integrada al RBAC
      dim. 3; firmas estilo Part 11 opt-in). **El modelo se diseña completo desde el inicio** (secciones +
      flujo + versionado + firma) para no migrar; la UI/comportamiento se construye por sesiones:
  - [x] **2.1 Plantillas: modelo + contratos + Form Builder (estructura).** ✅ (2026-06-09). `Template` 1—N
        `TemplateVersion` inmutable (MMR Part 11) + **secciones** + campos núcleo (número con min/max/**umbral
        ISA-18.2**/unidad, texto, textarea, select/multiselect, booleano, fecha/datetime) + SEVERITY/SIGNATURE
        modelados + validación de config por tipo en backend + permiso por sección (override por campo en el
        modelo) + **vista previa** + **borrador/publicar** (congela versión, editar publicada clona borrador).
        Referencias a `WorkflowDefinition`/firma/recurrencia como columnas (editores 2.2/2.3). 7 permisos
        nuevos (catálogo 33). `@lyra/ui`: `Textarea`. **Sin llenado.** Ver PROGRESS y DECISIONS 2026-06-09.
        **Pendiente: smoke VISUAL** (ver §4).
  - [x] **2.1.1 Endurecimiento de modelo (ADITIVO, antes del llenado 2.4).** ✅ (2026-06-09). Campo en **3 capas**:
        `type` (presentación) + **`dataType`** derivado (enum `FieldDataType`, 12 valores; `deriveDataType`) +
        **`semanticRole?`** (enum `FieldSemanticRole?`, nullable; solo `EFFECTIVE_DATE` con editor/comportamiento,
        ≤1 por versión). `options[]` → **`optionSource`** discriminado (`inline` editable; `referenceList`/`external`
        modelados, sin resolución; `upgradeFieldConfig` sube el shape legacy sin migración SQL). Valor de referencia =
        **`code` estable** (documentado). Migración aditiva `20260609155007_add_field_layers` (backfill de `dataType`
        desde `type`). Form Builder: editor inline `code/label` + toggle "Fecha efectiva". **`LogEntry` diferido 100%
        a 2.4** (solo diseño en DATA_MODEL/DECISIONS; crear tablas nuevas es aditivo). Tests: contracts 23, API 78.
        Smoke en vivo OK. **Pendiente: smoke VISUAL** (§4). Ver PROGRESS y DECISIONS 2026-06-09.
  - [ ] **2.x Datos de referencia / Listas (módulo nuevo, hermano de Estructura/Seguridad).** Mantenedor de
        **`ReferenceList`** + **`ReferenceItem`** (`code` estable + `label` + `active` + `sortOrder` +
        **`metadata` jsonb** enriquecido), permiso `referencelist:manage`, auditado. Binding de SELECT/MULTISELECT
        a una lista (`optionSource.referenceList`). El **sync desde APIs externas** (alimentar/persistir una lista
        desde ERP/MES/RRHH) es **Fase 3 (Orígenes de datos)**. Ubicar antes o junto al llenado (2.4 guarda codes).
        Ver DECISIONS 2026-06-09 (patrón FHIR ValueSet / dimensión de DW; guardar code, no label).
  - [ ] **2.2 Flujos reutilizables (`WorkflowDefinition`):** mantenedor propio (catálogo, estilo Roles) —
        estados + transiciones + roles/permiso por transición + config de firma; versionado/congelable.
        Asignar un flujo a una versión de plantilla y mapear secciones→estados editables.
  - [ ] **2.3 Programación de rondas/turnos (`LogPeriod`):** plantilla recurrente (turno/intervalo/calendario,
        simple, no un scheduler genérico); cada ocurrencia abre/gener​a un `LogEntry` ligado a su periodo.
        Investigar ISA-95 / shift handover antes de modelar.
  - [ ] **2.4 Llenado (Nueva entrada) multi-actor:** secciones editables por estado+rol; validación backend +
        auditoría por campo + concurrencia optimista por sección.
  - [ ] **2.5 Ejecución de flujo + firmas electrónicas (Part 11):** transiciones gateadas, firma
        (re-auth / MFA step-up), bloqueo/desbloqueo de secciones, log de transiciones.
  - [ ] **2.6 Bitácoras: listado + detalle + línea de tiempo + log de cambios** (vista de auditor).
  - [ ] **2.7 (cruce Fase 4)** reglas de umbral que disparan incidencias (con el motor de incidencias).
  - [ ] **Expansión de tipos de campo (incremental, cada uno pequeño).** Alto valor industrial: **Conforme/No
        conforme/N.A.** (tri-estado), **lookup/picker de referencia** (single/multi, tras 2.x), **picker de
        Equipo/Usuario/Nodo** (`reference`), **grupo repetible / tabla-matriz**, **campo calculado/fórmula**,
        **bloque de instrucción**, **TIME**. Evidencia (MinIO; modelar ahora, construir hacia Fase 7): adjunto,
        **foto**, **código de barras/QR**, **GPS**. Ligeros: escala/Likert, slider %, rating, email, teléfono,
        URL, auto-numérico. El enum `FieldType` crece de forma aditiva. Ver DECISIONS 2026-06-09 (taxonomía).
  - **Permisos nuevos** (catálogo `@lyra/contracts`): `template:view/create/edit/publish/delete`,
    `workflow:view/manage`, `logentry:view/create/fill`, transiciones por dato. **Forks confirmados**
    (ver DECISIONS 2026-06-09): ambas capturas (colaborativa + rondas), firmas Part 11 opt-in, granularidad
    sección+override, flujos reutilizables.
- [ ] **Fase 3** — Orígenes de datos.
- [ ] **Fase 4** — Motor de incidencias (workflow HSE).
- [ ] **Fase 5** — Cambio de turno + IA (resumen).
- [ ] **Fase 6** — Base de conocimiento + Dashboard + Asistente IA.
- [ ] **Fase 7** — Endurecimiento (ver §3 y §5).

---

## 3. Deuda técnica / seguridad REGISTRADA (no perder)

> Items con fundamento ya discutidos; aquí para que no se diluyan en `DECISIONS.md`.

- [ ] **`OrgNode.externalCode` plano → migrar a `ExternalReference`.** El campo único `externalCode`
      de OrgNode (Fase Estructura) quedó como atajo de un solo sistema; con `ExternalReference`
      polimórfica ya disponible, debe unificarse ahí (un nodo puede mapear a varios sistemas). Migración
      de datos no destructiva + ajustar UI del nodo. **Hacer junto con el motor de integración (Fase 3).**
- [ ] **`ExternalReference`: UI de mapeos + catálogo de `systemType`.** Modelo y contratos ya existen
      (2026-06-08); la **UI** de gestión de referencias externas y el catálogo configurable de sistemas
      (`systemType`) se construyen en **Fase 3 (Orígenes de datos)** junto al motor de conexión/sync.
- [ ] **`User.passwordHash` debe ser nullable + separar login de email (preparación de federación).** Hoy
      el login es el email y la contraseña local es obligatoria; un usuario federado (AD/OIDC) no tendrá
      contraseña local y su login estable puede no ser el email. Hacer `passwordHash` nullable y prever
      `username` como login estable evita una migración dolorosa en v2. Ref: DECISIONS 2026-06-08
      (federación). **Prioridad: media**, junto con el set lean de campos.
- [ ] **`user:disable` sin enforcement.** El cambio de `status` (ACTIVE↔DISABLED) viaja por
      `PATCH /security/users/:id` gateado por `user:edit`; el permiso `user:disable` del catálogo no lo
      exige ningún guard. Decidir: (a) separar endpoint/guard de habilitar/deshabilitar, o (b) retirar la
      clave. La UI hoy gatea el toggle de estado por `user:edit`. Ref: DECISIONS 2026-06-08. **Prioridad: baja.**
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
- [ ] **Estructura — smoke VISUAL en navegador** (actualizado tras master-detail v2): navegar a
      `/estructura`, seleccionar un nodo (panel derecho aparece con breadcrumb + hijos), navegar
      via breadcrumb, usar acciones del header (editar/mover/eliminar), CRUD de hijos inline desde
      la tabla del panel derecho, verificar botón "Equipos — próximamente" en el nivel Proceso,
      abrir `LevelsDrawer`, modo claro y oscuro. App en `:5173`.
- [x] **Estructura UX 2026-06-08 — smoke VISUAL** ✅ (confirmado por el usuario): splitter, 2ª línea de
      descripción en árbol y grilla, orden de columnas, edición inline del orden, full-width y
      comportamiento en iPad (tras el fix del header que aplastaba la descripción). Pendiente menor no
      bloqueante: QA explícito de **modo claro** en esta pantalla (se cubre en el ítem "Modo claro — QA
      visual" más abajo).
- [ ] **Equipos — smoke VISUAL en navegador** (se verificó typecheck/lint/build/test + smoke por API;
      falta el clic): seleccionar un nodo de nivel Proceso → aparece la grilla de equipos; alta/edición vía
      `EquipmentDrawer` (tag, categoría, criticidad, toggle de estado); edición inline del orden; abrir
      `CategoriesDrawer` (crear/editar/activar/eliminar categoría); borrar equipo (modal); chips de
      criticidad (colores Severidad 1–5) y de estado; modo claro y oscuro. App en `:5173`.
- [x] **Seguridad — smoke VISUAL en navegador** ✅ (2026-06-09, confirmado por el usuario): sub-tabs
      `/seguridad/{usuarios,roles,politica,auditoria}` (deep-link + breadcrumb + una sola pestaña), alta de
      usuario, detalle con pestañas (datos/roles/**scope** con buscador/**Seguridad**: reset de contraseña +
      **reset de MFA**, MFA self-service probado en vivo), CRUD de roles + **matriz de permisos** con buscador
      + `requireMfa`, **política** (incl. `mfaMode`), **auditoría** filtrable + export CSV, búsquedas y
      exportaciones. Pendiente menor no bloqueante: QA explícito de **modo claro** (ítem propio más abajo).
- [ ] **Plantillas 2.1 — smoke VISUAL en navegador** (se verificó typecheck/lint/build/test + smoke por API;
      falta el clic): `/plantillas` (grilla, buscador, filtro de estado, estados vacíos), crear plantilla
      (modal → builder), builder (agregar sección, agregar campos núcleo desde la paleta, configurar etiqueta/
      obligatorio, NÚMERO con unidad+min/max+**bandas de umbral**, opciones de select, **condicional por
      booleano**, **roles por sección**, firma Part 11 opt-in, reordenar con flechas, borrar), **vista previa**
      (incl. número fuera de rango), **Guardar borrador** y **Publicar** (confirmación + versión congelada),
      editar publicada (crea borrador v2), borrar plantilla; modo claro. App en `:5173`.
- [ ] **Plantillas 2.1.1 — smoke VISUAL en navegador** (se verificó typecheck/lint/build/test + smoke por API;
      falta el clic): en el builder, agregar un SELECT/MULTISELECT y editar opciones inline (verificar que cada
      línea genera un `code` estable + `label`); marcar el toggle **"Fecha efectiva del registro"** en un campo
      DATE/DATETIME y comprobar que al marcar otro se **desmarca el anterior**; vista previa del SELECT usando los
      codes; guardar/publicar; modo claro. App en `:5173`.
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
