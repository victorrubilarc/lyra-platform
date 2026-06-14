# Manual de uso — Lyra WatchLog

> **Qué es este documento.** La guía de USO del sistema, contada como la vive el usuario
> (operador, supervisor, mantenedor, configurador, administrador, auditor) — **no** es
> documentación técnica (esa vive en `ARCHITECTURE.md`, `DATA_MODEL.md`, `SECURITY.md`,
> `DECISIONS.md`). Aquí se explica **para qué sirve cada cosa y cómo se hace**.
>
> **Es un documento VIVO.** Se actualiza al **cerrar cada sesión** que completa una
> funcionalidad (regla de cierre en `CLAUDE.md`). El **índice de abajo lista TODAS las
> funcionalidades existentes** aunque su detalle aún esté por redactar (✍️): así nada se
> olvida; el backfill de lo ya construido se llena de a poco (incremental).
>
> Última actualización: **2026-06-14**.

## Convención de cada sección
Cada funcionalidad se documenta con estas cuatro partes fijas:
- **Para qué sirve** — el problema de negocio que resuelve.
- **Cómo se usa** — el paso a paso en pantalla.
- **Quién puede** — permisos/rol necesarios (el sistema siempre lo verifica en el servidor).
- **Importante** — reglas, límites, validaciones y detalles que no hay que perder.

Audiencias (etiqueta al lado de cada tema): **[Operador]** terreno · **[Supervisor]** ·
**[Mantenedor]** · **[Configurador]** arma plantillas/flujos · **[Admin]** seguridad/sistema ·
**[Auditor]** lectura/trazabilidad.

Leyenda de estado de redacción: ✅ redactada · ✍️ por redactar (backfill pendiente).

---

## Índice de funcionalidades

### 1. Acceso y cuenta  [todos]
- ✍️ Iniciar sesión (correo + contraseña)
- ✍️ Segundo factor (MFA / código TOTP) y códigos de recuperación
- ✍️ Recuperar contraseña (autoservicio por correo)
- ✍️ Cambio de contraseña forzado en el primer ingreso
- ✍️ Mi seguridad (activar/regenerar/desactivar MFA)

### 2. El espacio de trabajo  [todos]
- ✍️ Barra lateral, pestañas, búsqueda ⌘K, idioma, densidad, tema claro/oscuro

### 3. Estructura organizacional  [Configurador/Admin]
- ✍️ Árbol de niveles y nodos (crear/editar/mover/orden)
- ✍️ Código externo (integración ERP/CMMS) y alcance por nodo

### 4. Equipos (activos)  [Configurador/Admin]
- ✍️ CRUD de equipos, categorías, criticidad, baja lógica

### 5. Seguridad: usuarios, roles y permisos  [Admin]
- ✍️ Usuarios (alta, contraseña temporal, asignar roles y alcance)
- ✍️ Roles y matriz de permisos (4 dimensiones), `requireMfa` por rol
- ✍️ Política de contraseñas y modo de MFA global
- ✍️ Reset de contraseña / reset de MFA por administrador
- ✍️ Lectura de auditoría (quién hizo qué, antes/después)

### 6. Plantillas / Form Builder  [Configurador]
- ✍️ Secciones y campos (tipos, obligatorios, ayuda)
- ✍️ Umbrales de alerta (rangos warn/crit, ISA-18.2)
- ✍️ Lógica condicional (mostrar campo según otro)
- ✍️ Borrador / publicar (versión inmutable)
- ✍️ Alcance de estructura (en qué nodos vive la plantilla)
- ✍️ Alcance por plantilla (quién ve qué plantillas) y acceso por rol
- ✍️ Modo de equipo (ninguno/opcional/sugerido/requerido)
- ✍️ Ventana de edición (plazo para corregir)
- ✍️ Campos del resumen en la grilla
- ✍️ Motor de reglas: campos calculados y validaciones cruzadas

### 7. Flujos (máquina de estados)  [Configurador]
- ✍️ Estados, transiciones y roles por transición
- ✍️ Firma electrónica por transición (Part 11) y MFA
- ✍️ SLA de permanencia por estado (atrasos)

### 8. Datos de referencia / Listas  [Configurador]
- ✍️ Listas e ítems (código + etiqueta + metadata)
- ✍️ Importar / exportar CSV

### 9. Calendarios y períodos  [Configurador/Admin]
- ✍️ Calendario operacional (turnos, día operacional)
- ✍️ Calendario fiscal y períodos (generar, cerrar, bloquear/desbloquear)
- ✍️ Período contable: efecto sobre el registro

### 10. Bitácoras — registrar  [Operador/Supervisor/Mantenedor]
- ✍️ Crear una entrada (elegir plantilla, nodo y equipo)
- ✍️ Llenar por secciones (multi-actor, concurrencia)
- ✍️ Registro diferido (evento ocurrido antes, con motivo)
- ✍️ Firmar una sección y avanzar el flujo
- ✍️ Ventana de edición vencida (corregir con motivo)
- ✅ **Anular un borrador** (§ Bitácoras ▸ Anular)
- ✅ **Editar una entrada existente** (§ Bitácoras ▸ Editar)

### 11. Bitácoras — consultar y auditar  [Supervisor/Auditor]
- ✍️ Grilla por contenido, búsqueda, filtros y facetas
- ✍️ Vistas guardadas, columnas y orden múltiple
- ✍️ Vistazo lateral (peek), "Mi turno", revisión por excepción
- ✍️ Ficha del registro (visor), verificación de firmas, línea de tiempo, exportar

### 12. Configuración del sistema  [Admin]
- ✍️ `/configuracion`: MFA por acción, ventana de edición global

---

## Bitácoras ▸ Anular un borrador  [Operador/Supervisor/Mantenedor/Admin]

**Para qué sirve.** Descartar una entrada que quedó **en borrador** y no se va a usar
(plantilla equivocada, registro duplicado, abierto por error, prueba). En vez de dejarla
ensuciando la lista, se anula dejando constancia de por qué.

**Cómo se usa.**
1. Abre el borrador para editarlo (botón **Editar** desde la grilla de Bitácoras o desde la
   ficha del registro), o entra a su ficha en el visor.
2. Aprieta **"Anular borrador"**.
3. Escribe el **motivo** (mínimo 5 caracteres) — p. ej. *"plantilla equivocada"* o
   *"duplicado del folio anterior"*.
4. Confirma. El borrador pasa a estado **Anulada** y sale de la lista normal.

**Quién puede.**
- **El autor** puede anular **su propio** borrador, sin permiso especial.
- Anular el borrador **de otra persona** (p. ej. un supervisor limpiando un borrador que un
  operador dejó a medias al terminar su turno) requiere el permiso **"Anular borradores
  ajenos"** (`logentry:void`). Sin ese permiso, el sistema lo rechaza.

**Importante.**
- **No se borra de verdad.** La entrada queda en estado **Anulada**: desaparece de la grilla,
  los KPIs y las facetas por defecto, pero **sigue siendo trazable**. Para verla, filtra por
  estado **"Anulada"** en Bitácoras.
- Queda registrado **quién la anuló, cuándo y con qué motivo** — visible en la ficha del
  registro (banner) y en su **línea de tiempo** (evento "Borrador anulado"). La auditoría es
  inmutable.
- **Solo aplica a borradores.** Una entrada **ya sellada/firmada** (registrada oficialmente)
  **no** se puede anular por aquí: anular un registro firmado es un trámite distinto (con
  firma) que llegará más adelante.
- Un período contable cerrado o una ventana de edición vencida **no impiden** anular un
  borrador (anular no es modificar datos, es retirar el borrador).
- Una entrada anulada queda **terminal**: si la abres, verás el aviso de anulada y no se
  puede seguir editando.

## Bitácoras ▸ Editar una entrada existente  [Operador/Supervisor/Mantenedor]

**Para qué sirve.** Retomar una entrada **en curso** (borrador) para seguir completándola o
corregir lo registrado, desde una pantalla dedicada y separada de la de "crear nueva".

**Cómo se usa.**
1. En la grilla de Bitácoras (o en el vistazo lateral / la ficha del registro), aprieta
   **Editar** (ícono de lápiz).
2. Se abre la pantalla de edición (la dirección termina en `/editar`) con el rótulo
   **"Editar registro"** arriba, para que no se confunda con crear una nueva.
3. Edita y guarda por secciones como en el llenado normal.
4. **Volver** te devuelve a la ficha de esa misma entrada.

**Quién puede.** Quien tenga permiso de llenado (`logentry:fill`) sobre esa entrada; además,
cada sección respeta el rol que la tiene asignada. El sistema reaplica la autorización al
guardar.

**Importante.**
- Solo se editan entradas **en borrador**. Una entrada **sellada** se abre en **solo lectura**.
- La edición respeta la **ventana de edición** (si venció, se pide motivo para corregir) y el
  **período contable** (si está cerrado, se requiere permiso de excepción).
