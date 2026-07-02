/**
 * Catálogo de permisos atómicos — fuente de verdad compartida (UI + backend).
 *
 * IMPORTANTE: las CLAVES de permiso viven aquí en código porque los guards las
 * referencian y el seed las inserta en la BD. Lo que NUNCA se hardcodea es la
 * asignación rol→permiso y rol→usuario: eso es 100% dato en la base, editable
 * desde la UI. Este archivo solo declara qué permisos EXISTEN, no quién los tiene.
 *
 * Dimensiones de autorización (ver docs/SECURITY.md):
 *  1. MODULE   — acceso a pantallas/módulos.
 *  2. ACTION   — acciones/funcionalidades concretas.
 *  3. WORKFLOW — transiciones de flujo (incidencias, turnos).
 *  4. (datos)  — NO es un permiso: se modela con `Scope` (ABAC) y lo resuelve
 *               el ScopeService en el backend. No aparece en este catálogo.
 */

/** Dimensiones de permiso cubiertas por el catálogo (1–3). */
export const PERMISSION_DIMENSIONS = ["MODULE", "ACTION", "WORKFLOW"] as const;
export type PermissionDimension = (typeof PERMISSION_DIMENSIONS)[number];

/** Definición de un permiso atómico del catálogo. */
export interface PermissionDef {
  /** Clave única y estable (ej. `entry:create`). Convención `recurso:accion`. */
  readonly key: string;
  /** Dimensión a la que pertenece. */
  readonly dimension: PermissionDimension;
  /** Grupo para agrupar en la UI de administración (ej. `security`). */
  readonly group: string;
  /** Descripción legible para la pantalla de roles. */
  readonly description: string;
}

/**
 * Catálogo inicial (Fase 1). Crece por fase: las plantillas/bitácoras (Fase 2),
 * orígenes (Fase 3), incidencias y turnos (Fase 4–5) añaden sus claves aquí.
 */
export const PERMISSION_CATALOG = [
  // --- Dimensión 1: módulos / pantallas ---
  {
    key: "module:security:view",
    dimension: "MODULE",
    group: "security",
    description: "Ver el módulo de seguridad (usuarios, roles, permisos).",
  },
  {
    key: "module:security:manage",
    dimension: "MODULE",
    group: "security",
    description: "Administrar el módulo de seguridad.",
  },
  {
    key: "module:structure:view",
    dimension: "MODULE",
    group: "structure",
    description: "Ver la estructura organizacional.",
  },
  {
    key: "module:structure:manage",
    dimension: "MODULE",
    group: "structure",
    description: "Administrar la estructura organizacional.",
  },

  // --- Dimensión 2: acciones — usuarios ---
  {
    key: "user:read",
    dimension: "ACTION",
    group: "users",
    description: "Listar y ver usuarios.",
  },
  {
    key: "user:create",
    dimension: "ACTION",
    group: "users",
    description: "Crear usuarios.",
  },
  {
    key: "user:edit",
    dimension: "ACTION",
    group: "users",
    description: "Editar datos de usuarios.",
  },
  {
    key: "user:disable",
    dimension: "ACTION",
    group: "users",
    description: "Habilitar o deshabilitar usuarios.",
  },
  {
    key: "user:assign-roles",
    dimension: "ACTION",
    group: "users",
    description: "Asignar o quitar roles a un usuario.",
  },
  {
    key: "user:assign-scope",
    dimension: "ACTION",
    group: "users",
    description: "Definir el alcance de datos (nodos) de un usuario.",
  },
  {
    key: "user:reset-mfa",
    dimension: "ACTION",
    group: "users",
    description: "Restablecer el segundo factor (MFA) de un usuario (dispositivo perdido).",
  },
  {
    key: "user:reset-password",
    dimension: "ACTION",
    group: "users",
    description: "Restablecer la contraseña de un usuario (asigna una temporal y fuerza el cambio).",
  },

  // --- Dimensión 2: acciones — roles y permisos ---
  {
    key: "role:read",
    dimension: "ACTION",
    group: "roles",
    description: "Listar y ver roles.",
  },
  {
    key: "role:manage",
    dimension: "ACTION",
    group: "roles",
    description: "Crear, editar y eliminar roles y sus permisos.",
  },

  // --- Dimensión 2: acciones — política de seguridad ---
  {
    key: "security:policy:manage",
    dimension: "ACTION",
    group: "security",
    description: "Editar la política de contraseñas y parámetros de seguridad.",
  },
  {
    key: "audit:read",
    dimension: "ACTION",
    group: "security",
    description: "Consultar la bitácora de auditoría.",
  },

  // --- Dimensión 2: acciones — estructura organizacional ---
  {
    key: "orglevel:manage",
    dimension: "ACTION",
    group: "structure",
    description: "Configurar los niveles de la estructura (Área, Proceso, Equipo…).",
  },
  {
    key: "orgnode:read",
    dimension: "ACTION",
    group: "structure",
    description: "Listar y ver nodos de la estructura.",
  },
  {
    key: "orgnode:create",
    dimension: "ACTION",
    group: "structure",
    description: "Crear nodos de la estructura.",
  },
  {
    key: "orgnode:edit",
    dimension: "ACTION",
    group: "structure",
    description: "Editar nodos de la estructura.",
  },
  {
    key: "orgnode:delete",
    dimension: "ACTION",
    group: "structure",
    description: "Eliminar (borrado lógico) nodos de la estructura.",
  },

  // --- Dimensión 2: acciones — equipos ---
  {
    key: "equipment:view",
    dimension: "ACTION",
    group: "structure",
    description: "Listar y ver equipos de un nodo de la estructura.",
  },
  {
    key: "equipment:create",
    dimension: "ACTION",
    group: "structure",
    description: "Crear equipos.",
  },
  {
    key: "equipment:edit",
    dimension: "ACTION",
    group: "structure",
    description: "Editar equipos.",
  },
  {
    key: "equipment:delete",
    dimension: "ACTION",
    group: "structure",
    description: "Eliminar (borrado lógico) equipos.",
  },
  {
    key: "equipmentcategory:manage",
    dimension: "ACTION",
    group: "structure",
    description: "Configurar el catálogo de categorías/clases de equipo.",
  },

  // --- Dimensión 1: módulo de plantillas (Fase 2) ---
  {
    key: "module:templates:view",
    dimension: "MODULE",
    group: "templates",
    description: "Ver el módulo de plantillas (Form Builder).",
  },
  {
    key: "module:templates:manage",
    dimension: "MODULE",
    group: "templates",
    description: "Administrar el módulo de plantillas.",
  },

  // --- Dimensión 2: acciones — plantillas (Fase 2) ---
  {
    key: "template:view",
    dimension: "ACTION",
    group: "templates",
    description: "Listar y ver plantillas y sus versiones.",
  },
  {
    key: "template:create",
    dimension: "ACTION",
    group: "templates",
    description: "Crear plantillas.",
  },
  {
    key: "template:edit",
    dimension: "ACTION",
    group: "templates",
    description: "Editar plantillas en borrador (estructura, secciones y campos).",
  },
  {
    key: "template:publish",
    dimension: "ACTION",
    group: "templates",
    description: "Publicar una plantilla (congela la versión, inmutable).",
  },
  {
    key: "template:delete",
    dimension: "ACTION",
    group: "templates",
    description: "Eliminar (borrado lógico) plantillas.",
  },

  // --- Dimensión 1: módulo de flujos (Fase 2.2) ---
  {
    key: "module:workflows:view",
    dimension: "MODULE",
    group: "workflows",
    description: "Ver el módulo de flujos (máquinas de estado reutilizables).",
  },
  {
    key: "module:workflows:manage",
    dimension: "MODULE",
    group: "workflows",
    description: "Administrar el módulo de flujos.",
  },

  // --- Dimensión 2: acciones — flujos (Fase 2.2) ---
  // Nota: la autorización POR TRANSICIÓN es DATO (roles permitidos en cada
  // transición del flujo), no una clave de catálogo; se honra en la ejecución
  // (2.5). Estas claves gobiernan el MANTENEDOR del catálogo de flujos.
  {
    key: "workflow:view",
    dimension: "ACTION",
    group: "workflows",
    description: "Listar y ver flujos y sus versiones.",
  },
  {
    key: "workflow:manage",
    dimension: "ACTION",
    group: "workflows",
    description: "Crear, editar, publicar y eliminar flujos.",
  },

  // --- Dimensión 1: módulo de datos de referencia / listas (Fase 2.x) ---
  {
    key: "module:referencedata:view",
    dimension: "MODULE",
    group: "referencedata",
    description: "Ver el módulo de datos de referencia (listas de valores).",
  },
  {
    key: "module:referencedata:manage",
    dimension: "MODULE",
    group: "referencedata",
    description: "Administrar el módulo de datos de referencia.",
  },

  // --- Dimensión 2: acciones — datos de referencia (Fase 2.x) ---
  {
    key: "referencelist:view",
    dimension: "ACTION",
    group: "referencedata",
    description: "Listar, ver y resolver listas de referencia y sus ítems.",
  },
  {
    key: "referencelist:manage",
    dimension: "ACTION",
    group: "referencedata",
    description: "Crear, editar y eliminar listas de referencia y sus ítems.",
  },

  // --- Dimensión 1: módulo de calendario operacional (Fase 2.3.0) ---
  {
    key: "module:opscalendar:view",
    dimension: "MODULE",
    group: "opscalendar",
    description: "Ver el módulo de calendario operacional (turnos y periodos).",
  },
  {
    key: "module:opscalendar:manage",
    dimension: "MODULE",
    group: "opscalendar",
    description: "Administrar el módulo de calendario operacional.",
  },

  // --- Dimensión 2: acciones — calendario operacional (Fase 2.3.0) ---
  {
    key: "opscalendar:view",
    dimension: "ACTION",
    group: "opscalendar",
    description: "Listar, ver y previsualizar calendarios operacionales.",
  },
  {
    key: "opscalendar:manage",
    dimension: "ACTION",
    group: "opscalendar",
    description: "Crear, editar, asignar a nodos y eliminar calendarios operacionales.",
  },

  // --- Períodos contables gobernados (Fase 2.7.1 → 2.7.1.1) ---
  // QUIÉN puede escribir en un período CLOSED es DATO: el permiso de excepción
  // `opsperiod:write-closed` se asigna a roles vía RBAC (patrón authorization group
  // de SAP OB52), nada hardcodeado. Tri-estado OPEN→CLOSED→LOCKED: el LOCKED es duro
  // (bloquea incluso al bypass) y reabrirlo exige el permiso superior `opsperiod:unlock`.
  {
    key: "opsperiod:view",
    dimension: "ACTION",
    group: "opsperiod",
    description: "Ver el estado de cierre de los períodos contables.",
  },
  {
    key: "opsperiod:close",
    dimension: "ACTION",
    group: "opsperiod",
    description: "Cerrar un período contable (OPEN → CLOSED, motivo obligatorio).",
  },
  {
    key: "opsperiod:reopen",
    dimension: "ACTION",
    group: "opsperiod",
    description: "Reabrir un período contable cerrado (CLOSED → OPEN, motivo obligatorio).",
  },
  {
    key: "opsperiod:lock",
    dimension: "ACTION",
    group: "opsperiod",
    description: "Bloquear en duro un período cerrado (CLOSED → LOCKED, motivo obligatorio).",
  },
  {
    key: "opsperiod:unlock",
    dimension: "ACTION",
    group: "opsperiod",
    description: "Desbloquear un período (LOCKED → CLOSED, permiso superior; motivo obligatorio).",
  },
  {
    key: "opsperiod:write-closed",
    dimension: "ACTION",
    group: "opsperiod",
    description: "Excepción: registrar o modificar entradas cuya fecha cae en un período cerrado (no aplica a LOCKED).",
  },

  // --- Configuración del sistema (Fase 2.7.1.1 UX) ---
  {
    key: "module:settings:view",
    dimension: "MODULE",
    group: "settings",
    description: "Ver la pantalla de configuración del sistema.",
  },
  {
    key: "settings:manage",
    dimension: "ACTION",
    group: "settings",
    description: "Editar los ajustes del sistema (p. ej. exigir MFA para gobernar períodos).",
  },

  // --- Dimensión 1: módulo de bitácoras / llenado (Fase 2.4) ---
  // Nota: QUIÉN puede llenar cada SECCIÓN es DATO (roles por sección de la
  // plantilla, TemplateSectionRole), no una clave de catálogo. Estas claves
  // gobiernan el acceso al módulo y las acciones de alto nivel.
  {
    key: "module:logbook:view",
    dimension: "MODULE",
    group: "logbook",
    description: "Ver el módulo de bitácoras (nueva entrada y registros).",
  },

  // --- Dimensión 2: acciones — bitácoras / entradas (Fase 2.4) ---
  {
    key: "logentry:view",
    dimension: "ACTION",
    group: "logbook",
    description: "Listar y ver entradas de bitácora.",
  },
  {
    key: "logentry:create",
    dimension: "ACTION",
    group: "logbook",
    description: "Crear (abrir) una nueva entrada de bitácora a partir de una plantilla.",
  },
  {
    key: "logentry:fill",
    dimension: "ACTION",
    group: "logbook",
    description: "Llenar/guardar secciones de una entrada y enviarla (según permiso de sección).",
  },
  {
    key: "logentry:transition",
    dimension: "ACTION",
    group: "logbook",
    description:
      "Ejecutar transiciones de flujo y firmar una entrada (QUIÉN puede cada transición es dato: roles por transición del flujo).",
  },
  // Espejo de `opsperiod:write-closed` (2.7.2): escribir pasada una guarda temporal.
  // A diferencia del bypass de período (silencioso), este override EXIGE motivo
  // auditado en cada escritura (GxP: la corrección excepcional se justifica).
  {
    key: "logentry:write-expired",
    dimension: "ACTION",
    group: "logbook",
    description:
      "Excepción: editar una entrada con la ventana de edición vencida (exige motivo auditado en cada escritura).",
  },
  // El AUTOR siempre puede anular su PROPIO borrador (ownership + ABAC); este
  // permiso habilita anular borradores AJENOS (limpieza supervisora de un borrador
  // abandonado). No aplica a entradas selladas (su anulación GxP es otro control).
  {
    key: "logentry:void",
    dimension: "ACTION",
    group: "logbook",
    description: "Anular (descartar) el borrador de OTRO usuario, con motivo auditado.",
  },

  // --- Programación de rondas (Fase 2.3) ---
  // El horario (LogSchedule) es gobernanza operacional VIVA (patrón Maintenance Plan
  // de SAP PM / PM de Maximo): el PLANIFICADOR lo administra, distinto del diseñador
  // de la plantilla (template:edit). `schedule:view` además gatea la pantalla /rondas.
  {
    key: "schedule:view",
    dimension: "ACTION",
    group: "schedules",
    description: "Ver el programa de rondas (horarios y ocurrencias pendientes/vencidas).",
  },
  {
    key: "schedule:manage",
    dimension: "ACTION",
    group: "schedules",
    description: "Crear, editar y eliminar horarios de rondas y generar ocurrencias (planificador).",
  },
  // Ejecutar una ronda (iniciar/continuar/omitir desde el worklist "Mis rondas") es
  // distinto de PLANIFICARLA (schedule:manage): el operador ejecuta su lista de trabajo
  // sin administrar horarios (patrón My Maintenance Tasks/Fiori · Start Center/Maximo).
  // La instancia es la "ronda" (RoundOccurrence), por eso su propio namespace de recurso.
  {
    key: "round:execute",
    dimension: "ACTION",
    group: "schedules",
    description: "Ver y ejecutar las rondas propias (Mis rondas): iniciar, continuar y omitir ocurrencias.",
  },

  // --- Notificaciones (Bloque N) ---
  // El motor de avisos por correo. Administrar PLANTILLAS de mensaje y la CONFIG de
  // eventos/suscripciones es de administrador; VER el correo saliente es una pantalla
  // de auditoría operacional (Req-1/Req-5). Las preferencias PROPIAS no requieren
  // permiso (dato personal, ownership — patrón SavedView).
  {
    key: "module:notifications:view",
    dimension: "MODULE",
    group: "notifications",
    description: "Ver el módulo de notificaciones (plantillas, correo saliente, preferencias).",
  },
  {
    key: "notiftemplate:manage",
    dimension: "ACTION",
    group: "notifications",
    description: "Administrar las plantillas de mensaje de notificación (asunto y cuerpo por evento).",
  },
  {
    key: "notification:view-outbox",
    dimension: "ACTION",
    group: "notifications",
    description: "Ver la bandeja de correo saliente (registro de envíos: a quién, qué, cuándo, estado).",
  },
  {
    key: "notification:admin",
    dimension: "ACTION",
    group: "notifications",
    description: "Administrar suscripciones a eventos de notificación de usuarios y roles.",
  },
  {
    key: "notification:config",
    dimension: "ACTION",
    group: "notifications",
    description: "Configurar el servidor de correo saliente (SMTP) del sistema y probar el envío.",
  },

  // --- Incidencias operacionales / HSE (Fase 4.0) ----------------------------
  // El ciclo de vida reutiliza WorkflowDefinition: QUIÉN puede ejecutar cada
  // transición es DATO (roles por transición del flujo). Estas claves gobiernan
  // el módulo y las acciones de alto nivel; la transición exige además el
  // rol-dato. El alcance de datos (nodo) lo resuelve el ScopeService (ABAC).
  {
    key: "module:incidents:view",
    dimension: "MODULE",
    group: "incidents",
    description: "Ver el módulo de incidencias (lista, tablero kanban y detalle).",
  },
  {
    key: "incident:view",
    dimension: "ACTION",
    group: "incidents",
    description: "Listar y ver incidencias.",
  },
  {
    key: "incident:create",
    dimension: "ACTION",
    group: "incidents",
    description: "Crear (reportar) incidencias, manualmente o desde una entrada de bitácora.",
  },
  {
    key: "incident:edit",
    dimension: "ACTION",
    group: "incidents",
    description: "Editar los atributos de una incidencia (severidad, prioridad, categoría, etc.).",
  },
  {
    key: "incident:assign",
    dimension: "ACTION",
    group: "incidents",
    description: "Asignar o cambiar el responsable de una incidencia.",
  },
  {
    key: "incident:comment",
    dimension: "ACTION",
    group: "incidents",
    description: "Agregar comentarios de gestión a una incidencia.",
  },
  {
    key: "incident:transition",
    dimension: "WORKFLOW",
    group: "incidents",
    description:
      "Ejecutar transiciones de flujo y firmar una incidencia (QUIÉN puede cada transición es dato: roles por transición del flujo).",
  },
  {
    key: "incident:cancel",
    dimension: "ACTION",
    group: "incidents",
    description: "Anular (cancelar) una incidencia con motivo auditado (sin borrado físico).",
  },
  {
    key: "incidentcatalog:manage",
    dimension: "ACTION",
    group: "incidents",
    description: "Administrar el catálogo de tipos y categorías de incidencia.",
  },

  // --- Excepciones operacionales desde bitácoras (Fase 4.1) ------------------
  // La capa Bitácora → Excepción → Incidencia. Ver una excepción usa
  // `module:incidents:view` (es parte del módulo). Estas claves gobiernan el
  // TRIAGE; el descarte de una excepción CRÍTICA exige un permiso superior. El
  // alcance de datos (nodo) lo resuelve el ScopeService (ABAC). Convertir una
  // excepción en incidencia exige además `incident:create`.
  {
    key: "exception:triage",
    dimension: "ACTION",
    group: "incidents",
    description:
      "Triar excepciones operacionales: reconocer, marcar revisada, asociar o agrupar en una incidencia.",
  },
  {
    key: "exception:dismiss",
    dimension: "ACTION",
    group: "incidents",
    description: "Descartar (con motivo auditado) una excepción de advertencia que no requiere acción.",
  },
  {
    key: "exception:dismiss-critical",
    dimension: "ACTION",
    group: "incidents",
    description: "Descartar una excepción CRÍTICA (con motivo auditado) — permiso superior al descarte normal.",
  },
  {
    key: "exception:correct",
    dimension: "ACTION",
    group: "incidents",
    description:
      "Corregir el valor que originó una excepción, preservando el original con motivo auditado (GxP/ALCOA+).",
  },

  // --- Acciones CAPA de incidencias (Fase 4.2a) ------------------------------
  // Acciones correctivas/preventivas/inmediatas con responsable, plazo, estado y
  // VERIFICACIÓN de eficacia. La verificación se separa (segregación de funciones:
  // quien ejecuta una acción no debería auto-verificarla). El alcance de dato lo
  // hereda de la incidencia (ABAC por nodo).
  {
    key: "incident:action:manage",
    dimension: "ACTION",
    group: "incidents",
    description: "Crear, editar, completar y cancelar acciones correctivas/preventivas de una incidencia.",
  },
  {
    key: "incident:action:verify",
    dimension: "ACTION",
    group: "incidents",
    description:
      "Verificar la eficacia de una acción CAPA (efectiva / no efectiva) — separado de gestionarla (segregación de funciones).",
  },

  // --- Cambio de turno / Shift Handover (Fase 5 — Slice 1) -------------------
  // La entrega de turno es un protocolo FIJO de 2 partes (compilar → firma del
  // saliente → acuse del entrante). Se SEGREGAN las funciones: quien compila/firma
  // (saliente) no es quien reconoce (entrante). El alcance de datos (nodo) lo
  // resuelve el ScopeService (ABAC): la compilación NUNCA muestra lo no autorizado.
  {
    key: "module:handover:view",
    dimension: "MODULE",
    group: "handover",
    description: "Ver el módulo de cambio de turno (cockpit e historial de entregas).",
  },
  {
    key: "shifthandover:view",
    dimension: "ACTION",
    group: "handover",
    description: "Ver entregas de turno y el historial (acotado por alcance de nodo).",
  },
  {
    key: "shifthandover:compile",
    dimension: "ACTION",
    group: "handover",
    description: "Compilar (armar) la entrega del turno saliente y gestionar sus pendientes.",
  },
  {
    key: "shifthandover:sign",
    dimension: "WORKFLOW",
    group: "handover",
    description: "Firmar la entrega como turno SALIENTE (firma electrónica Part 11 con re-autenticación).",
  },
  {
    key: "shifthandover:acknowledge",
    dimension: "WORKFLOW",
    group: "handover",
    description: "Reconocer (acusar recibo de) la entrega como turno ENTRANTE (firma Part 11 con re-autenticación).",
  },

  // --- Inteligencia Artificial administrable (Fase 5 — Slice 2) ---------------
  // La IA del ecosistema deja de configurarse por `.env` y pasa a ser un módulo
  // administrable desde la app. Este permiso gobierna ver/editar la config de IA
  // (proveedor, modelo, clave write-only) y el botón "Probar". El proveedor LOCAL
  // mantiene los datos dentro de la planta (on-prem).
  {
    key: "ai:config",
    dimension: "ACTION",
    group: "ai",
    description: "Configurar la Inteligencia Artificial del sistema (proveedor, modelo, clave) y probar la conexión.",
  },

  // --- Vista ejecutiva cross-estructura (L3 — UX premium) --------------------
  // Permiso de ALTO NIVEL (gerencial) para la pantalla "Panorama": consolida KPIs
  // de TODAS las estructuras accesibles a la vez, la EXCEPCIÓN EXPLÍCITA al filtro
  // por estructura activa (L1). NO rompe el ABAC por nodo: sigue siendo la frontera
  // de datos (un gerente sin alcance ve todo; uno acotado, solo sus nodos). Es la
  // única forma de cruzar la estructura activa; por eso una clave aparte y de módulo.
  {
    key: "module:dashboard:cross-view",
    dimension: "MODULE",
    group: "dashboards",
    description:
      "Ver la vista ejecutiva CONSOLIDADA de todas las estructuras (Panorama). Cruza la estructura activa, pero respeta el alcance por nodo.",
  },

  // --- Apariencia / Temas administrables (EST-TEMAS) -------------------------
  // Construir/editar/publicar PALETAS de color de marca y marcar la por defecto de
  // la instalación (tab "Apariencia" en `/configuracion`). ELEGIR una paleta publicada
  // NO requiere permiso (es preferencia del usuario, patrón ownership). El login se
  // mantiene SIEMPRE en la identidad oscura de marca: las paletas aplican al workspace.
  {
    key: "theme:manage",
    dimension: "ACTION",
    group: "appearance",
    description:
      "Construir, editar y publicar paletas de tema, y elegir la paleta por defecto del sistema.",
  },

  // --- Órdenes de Trabajo / Work Orders (OT / PTW) ------------------------------
  // Espejo de Incidencias. El ciclo de vida (S2, Puerta 1) reutiliza WorkflowDefinition:
  // QUIÉN puede ejecutar cada puerta/transición es DATO (roles por transición del
  // flujo), NO 4 permisos fijos de puerta (fork W2 aprobado): un ÚNICO
  // `workorder:transition` (dim. WORKFLOW) + WorkflowTransitionRole. Estas claves
  // gobiernan el módulo y las acciones de alto nivel; el alcance de datos (nodo) lo
  // resuelve el ScopeService (ABAC).
  {
    key: "module:workorders:view",
    dimension: "MODULE",
    group: "workorders",
    description: "Ver el módulo de órdenes de trabajo (solicitudes, lista y detalle).",
  },
  {
    key: "workorder:view",
    dimension: "ACTION",
    group: "workorders",
    description: "Listar y ver órdenes de trabajo.",
  },
  {
    key: "workorder:create",
    dimension: "ACTION",
    group: "workorders",
    description: "Crear solicitudes de orden de trabajo (manual o desde incidencia/excepción/bitácora/planificada).",
  },
  {
    key: "workorder:edit",
    dimension: "ACTION",
    group: "workorders",
    description: "Editar atributos de una OT (criticidad, prioridad, área, especialidad, fechas).",
  },
  {
    key: "workorder:assign",
    dimension: "ACTION",
    group: "workorders",
    description: "Asignar o cambiar el responsable de una orden de trabajo.",
  },
  {
    key: "workorder:comment",
    dimension: "ACTION",
    group: "workorders",
    description: "Agregar comentarios de gestión a una orden de trabajo.",
  },
  {
    key: "workorder:transition",
    dimension: "WORKFLOW",
    group: "workorders",
    description:
      "Ejecutar transiciones del flujo de una OT (enviar, aprobar/rechazar y demás puertas) y firmar cuando la transición lo exige. QUIÉN puede cada puerta es DATO (roles por transición del flujo).",
  },
  {
    key: "workorder:cancel",
    dimension: "ACTION",
    group: "workorders",
    description: "Anular (cancelar) una orden de trabajo con motivo auditado (sin borrado físico).",
  },
  {
    key: "workorder:checklist:manage",
    dimension: "ACTION",
    group: "workorders",
    description:
      "Agregar/quitar/instanciar checklists (permisos de trabajo) en una OT y revisarlos (Puerta 2). La segregación revisor≠responsable se aplica en el backend.",
  },
  {
    key: "workordercatalog:manage",
    dimension: "ACTION",
    group: "workorders",
    description: "Administrar el catálogo de tipos de OT, especialidades y reglas de checklist.",
  },
] as const satisfies readonly PermissionDef[];

/** Unión literal de todas las claves de permiso conocidas. */
export type PermissionKey = (typeof PERMISSION_CATALOG)[number]["key"];

/** Todas las claves del catálogo, como arreglo plano. */
export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = PERMISSION_CATALOG.map(
  (p) => p.key as PermissionKey,
);

/** Conjunto para chequeos O(1) de existencia de una clave. */
const PERMISSION_KEY_SET = new Set<string>(ALL_PERMISSION_KEYS);

/** ¿La cadena dada es una clave de permiso válida del catálogo? */
export function isPermissionKey(value: string): value is PermissionKey {
  return PERMISSION_KEY_SET.has(value);
}
