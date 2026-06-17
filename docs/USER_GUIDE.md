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
> Última actualización: **2026-06-16**.

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
- ✅ **Catálogo de objetos del formulario** (Olas 1–4: básicos, selección, evaluación, **referencia**, **evidencia / terreno**, **estructurados / repetibles**, presentación) (§ Plantillas ▸ Objetos del formulario)
- ✅ Secciones y campos (tipos, obligatorios, ayuda) (§ Plantillas ▸ Secciones y campos)
- ✅ Ancho de campo / layout en grilla (completo / mitad / tercio)
- ✅ Umbrales de alerta (rangos warn/crit, ISA-18.2)
- ✅ Lógica condicional (mostrar campo según otro) (§ Plantillas ▸ Lógica condicional)
- ✅ Borrador / publicar (versión inmutable) (§ Plantillas ▸ Borrador y publicación)
- ✍️ Alcance de estructura (en qué nodos vive la plantilla)
- ✍️ Alcance por plantilla (quién ve qué plantillas) y acceso por rol
- ✅ Modo de equipo (ninguno/opcional/sugerido/requerido) (§ Plantillas ▸ Modo de equipo en la entrada)
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

### 13. Rondas  [Planificador · Operador]
- ✅ **Programación de rondas** (horario por turno/intervalo/calendario + rol responsable) (§ Rondas ▸ Programación de rondas)
- ✅ **Mis rondas** (worklist del operador: iniciar/continuar/omitir lo que te toca) (§ Rondas ▸ Mis rondas)

### 14. Notificaciones  [Admin · todos]
- ✅ **Avisos por correo** (qué se avisa: ronda vencida, SLA, transición, firma pendiente) (§ Notificaciones)
- ✅ **Mis notificaciones** (activar/desactivar avisos propios) (§ Notificaciones ▸ Mis preferencias)
- ✅ **Plantillas de mensaje** (con vista previa, diccionario de variables, `{{entry.summary}}`) y **correo saliente** (§ Notificaciones ▸ Plantillas / Correo saliente) [Admin]
- ✅ **Servidor de correo (SMTP)** — configurar el correo saliente (§ Configuración ▸ Servidor de correo) [Admin con `notification:config`]

### 15. Incidencias  [todos los roles operativos]
- ✅ **Reportar y gestionar incidencias** (lista + tablero kanban + detalle con flujo) (§ Incidencias)
- ✅ **Acciones correctivas y preventivas (CAPA)** (con verificación de eficacia y bloqueo de cierre) (§ Incidencias ▸ Acciones CAPA)
- ✅ **Crear desde una bitácora** (botón "Reportar incidencia" en el visor de la entrada) (§ Incidencias ▸ Desde una bitácora)
- ✅ **Administrar los catálogos** (tipos y categorías de incidencia) (§ Incidencias ▸ Catálogos) [solo administrador]

### 16. Excepciones operacionales  [Supervisor · Operador con triage]
- ✅ **Revisar y triar excepciones** (panel en la bitácora + bandeja global; corregir/reconocer/convertir/asociar/descartar) (§ Excepciones operacionales)

---

## Rondas ▸ Programación de rondas  [Planificador]

**Para qué sirve.** Hace que una bitácora se **abra sola cada vez que toca** — por turno,
cada cierto tiempo o en días y horas fijas — en lugar de depender de que alguien recuerde
crearla a mano. Aquí el **planificador** define y mantiene los horarios; el operador los
**ejecuta** desde *Mis rondas* (ver la sección siguiente). Así queda a la vista **qué rondas
están pendientes**, cuáles se **vencieron** y cuáles se **omitieron** (con su motivo). Es el
patrón de rondas de operador / planes de mantención de la industria (SAP PM, Maximo, j5).

**Cómo se usa.**
1. Entra a **Programación de rondas** (menú lateral) y aprieta **"Nuevo horario"**.
2. Elige la **plantilla** y el **nodo** de la estructura donde se hará la ronda (y, si
   corresponde, el **equipo**).
3. (Opcional) Elige el **rol responsable**: a quién le aparecerá la ronda en *Mis rondas*
   (p. ej. "Operador de Molienda"). Es responsabilidad del **puesto**, no de una persona, así
   que sobrevive a los cambios de turno. **Sin rol responsable** la ronda es visible a **todos**
   los del nodo en su turno.
4. Elige la **recurrencia**:
   - **Por turno** — una ronda por cada turno del calendario del nodo (opcionalmente solo
     algunos turnos, p. ej. A y B).
   - **Cada cierto tiempo** — cada N minutos/horas (p. ej. cada 6 h), con una hora de anclaje
     opcional.
   - **Días y horas fijas** — a las horas que indiques (p. ej. 08:00 y 20:00), en los días de
     la semana que elijas.
5. Indica el **plazo para cumplir** (minutos tras la hora programada antes de marcarse
   *vencida*) y el **horizonte** (cuántos días adelante se preparan las rondas). Deja
   **Activo** y guarda.
6. Las próximas rondas aparecen al toque en la lista (monitoreo). El botón **"Generar"** las
   refresca a mano (también se preparan solas al abrir la pantalla).

**Herramientas de la pantalla (para analizar y encontrar).** La pantalla está organizada como
los grandes sistemas de mantención (SAP PM, Maximo, Fiori Overview Page), con jerarquía clara:
- **KPIs de salud** arriba (sensibles a los filtros): horarios activos, pausados, rondas
  pendientes y vencidas — si filtras por un área, los KPIs reflejan esa área.
- **Barra de filtros** que **gobierna toda la pantalla**: buscador (nombre/plantilla/área/equipo/
  responsable), estado (activos/pausados), tipo de recurrencia, área y **Bitácoras** (botón que
  abre un modal para elegir **una o varias**; las elegidas se muestran como chips).
- **Pestañas**:
  - **Horarios**: la tabla de horarios, con **orden por columna** y **paginación** (25/50/100).
    Muestra frecuencia legible ("Cada turno", "Cada 6 h", "08:00, 20:00 · Lun a Vie"), la
    **próxima ronda** (en rojo si está atrasada) y **pausar/activar en un clic** (columna *Estado*).
  - **Ocurrencias**: una **grilla** de lo generado, con orden y paginación, filtros rápidos
    (Pendientes/Hoy/Vencidas) y columnas Programada/Ronda/Equipo/Nodo/Turno/Estado/Vence. Respeta
    los filtros superiores (solo muestra las de los horarios filtrados).
  - **Resumen**: panel de análisis con gráficas — rondas pendientes por área, horarios por
    recurrencia y cumplimiento (% atrasadas).

**Quién puede.** Ver la programación requiere el permiso **"Ver rondas"** (`schedule:view`);
crear o editar horarios requiere **"Administrar rondas"** (`schedule:manage`). Es un rol de
**planificador**, distinto del que diseña la plantilla y del operador que las ejecuta. (Esta
pantalla **no ejecuta** rondas: la lista de ocurrencias es solo de **monitoreo**.)

**¿Qué bitácoras/áreas ve cada planificador?** (clave en empresas con varias áreas). La pantalla
respeta el **alcance de datos** del usuario en dos ejes que se combinan:
- **Por área (nodo):** un planificador asignado a un área (o a una rama de la estructura) solo ve
  los horarios de **esas** áreas. Áreas distintas quedan **aisladas** entre sí automáticamente.
- **Por bitácora (plantilla):** si además se le acota a ciertos tipos de bitácora, solo ve **esos**.
- **Sin alcance asignado** = ve **todo** (pensado para un rol corporativo/transversal).

El alcance se configura en **Seguridad** (por usuario o por rol) y no está fijo en el código. El
selector de **"Bitácoras"** del filtro solo ofrece las que el planificador tiene disponibles.

**Importante.**
- Cambiar la frecuencia o pausar un horario **NO** vuelve a publicar la plantilla: la
  programación es configuración viva. Las rondas **ya cumplidas** no se tocan; solo se
  recalculan las **futuras**.
- Eliminar un horario **cancela** sus rondas pendientes (las cumplidas quedan).
- Un horario por turno necesita que el nodo tenga un **calendario operacional** con turnos.

## Rondas ▸ Mis rondas  [Operador]

**Para qué sirve.** Es tu **lista de trabajo**: las rondas que **a ti te toca ejecutar ahora**
— ya filtradas por tu turno, tus nodos y tu rol. No administras nada aquí; solo **registras** la
que corresponde o, si por una razón válida no se hará, la **omites dejando constancia**. Es el
patrón *My Maintenance Tasks* (Fiori) / *Start Center* (Maximo) / shift logbook (j5).

**Cómo se usa.**
1. Entra a **Mis rondas** (menú lateral). Verás arriba tus contadores **Pendientes / Vencidas /
   De hoy** y la lista de lo que te toca. (También aparece un **aviso en la pantalla de inicio**
   cuando tienes rondas pendientes.)
2. Filtra con **Pendientes · Mi turno · Vencidas · Próximas**.
3. Aprieta **"Iniciar"** en una ronda: el sistema **crea la entrada de bitácora** ya ligada a
   esa ronda y te lleva a llenarla (si ya la habías empezado, el botón dice **"Continuar"**).
4. Al **completar y sellar** la entrada, la ronda queda **Cumplida** automáticamente.
5. Si una ronda **no se realizará**, aprieta **"Omitir"**, escribe el **motivo** (mínimo 5
   caracteres) y confirma: queda **Omitida** y auditada.

**Quién puede.** Requiere el permiso **"Ejecutar rondas"** (`round:execute`), pensado para el
**operador**: ver y ejecutar *Mis rondas* sin darle administración de horarios. Aparecen las
rondas cuyo **rol responsable** es uno de tus roles (o las que **no tienen** rol responsable, que
ve todo el nodo), dentro de tu **alcance** de nodos. Llenar la entrada resultante se rige por los
permisos normales de bitácora (`logentry:fill`/`view`).

**Importante.**
- Una ronda **no es** todavía una entrada: es un "pendiente". La entrada real recién se crea
  al **iniciar** (así no se llena la lista de borradores vacíos).
- **Vencida** = pasó su plazo sin completarse. Sigue **pendiente** (no se cierra sola): puedes
  completarla tarde u omitirla. Por defecto la lista **incluye las vencidas heredadas** del turno
  anterior (entrega de turno), no solo las de tu turno actual. En **Bitácoras** aparece un aviso
  **"N rondas vencidas"** que lleva aquí.
- Si **anulas** el borrador de una ronda iniciada, la ronda **vuelve a pendiente** y puede
  reiniciarse — no se pierde.

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

---

## Plantillas ▸ Diseñador visual de formularios  [Configurador]

**Para qué sirve.** Diseñar cada sección del formulario **visualmente**, como en Canva o Power
Apps pero para formularios: arrastras los campos donde quieras, los **mueves** libremente y les
cambias el **ancho y el alto** con tiradores. Lo que ves al diseñar es lo que se llena y lo que se
revisa. Pensado para que la bitácora se vea bien también en **tablet y celular** (terreno).

**Cómo se usa.** El editor (`/plantillas/:id`, pestaña **Diseño ▸ Editor**) tiene **3 zonas**:

- **Izquierda — Objetos:** la biblioteca de campos, con buscador y categorías. **Arrástralos al
  lienzo** en la posición que quieras (o haz **clic** para agregarlos al final).
- **Centro — Lienzo:** tu formulario sobre una grilla. **Arrastra** un campo para moverlo; tira de
  sus **bordes o esquinas** para cambiar su tamaño (ancho y alto). Cada sección es un contenedor.
- **Derecha — Propiedades:** al seleccionar un campo, edita su **rótulo**, si es **obligatorio**, su
  **ancho** y **alto**, y verás su **posición**. El botón **"Opciones avanzadas…"** abre el panel con
  lo profundo (umbrales, opciones de lista, lógica condicional, fórmula, permisos por campo).

En la **barra superior** del lienzo: el selector de **dispositivo** (Escritorio · Tablet · Móvil) y
el interruptor de **cuadrícula**. En **Tablet/Móvil** ves una **vista previa** de cómo queda el
formulario en ese tamaño (se edita en Escritorio). Publica como siempre (borrador → publicar).

**Quién puede.** El **Configurador** que puede editar la plantilla (`template:edit`).

**Importante.**
- La **posición y el tamaño** de cada campo se **guardan** con la plantilla: al recargar siguen donde
  los dejaste. Es **diseño controlado** (viaja en la versión publicada): cambiarlo crea un nuevo
  borrador y se aplica a las entradas nuevas al publicar; las ya registradas conservan su diseño.
- El diseño es **solo presentación**: no cambia qué es obligatorio, los umbrales, la lógica
  condicional ni quién puede llenar cada campo.
- **Responsivo para terreno:** en **celular** todo se apila en **una columna** y en **tablet** se ven
  **2 por fila** (áreas táctiles amplias, para guantes), sin importar cómo lo acomodaste en escritorio.
  Los campos **nunca se cortan** ni se salen de la pantalla.
- Las **plantillas antiguas** (de antes del diseñador) se abren igual que siempre: el editor calcula
  una posición inicial razonable a partir de su orden y ancho.
- _En camino (no disponible aún):_ deshacer/rehacer, selección múltiple, alinear/distribuir, panel de
  capas, copiar/pegar y atajos de teclado.

---

## Plantillas ▸ Umbrales de alerta (rangos warn/crit)  [Configurador]

**Para qué sirve.** Avisar cuando un valor numérico se sale de lo normal sin tener que recordarlo
de memoria: el campo "pinta" una **advertencia** (ámbar) o una situación **crítica** (rojo) según
los límites que defina el diseñador. Sigue el estándar industrial **ISA-18.2** de gestión de
alarmas (niveles bajo-bajo / bajo / alto / alto-alto).

**Cómo se usa.**
1. En el builder, agrega o selecciona un campo de tipo **Número**.
2. Define el **rango válido** (mínimo / máximo): fuera de él el valor se rechaza.
3. Dentro de ese rango, define las **bandas de umbral**: *warn bajo / warn alto* (advertencia) y
   *crit bajo / crit alto* (crítico).
4. Al llenar, el campo muestra el aviso correspondiente; en Bitácoras la banda se resalta en la
   celda y en el resumen.

**Quién puede.** El **Configurador** que edita la plantilla (`template:edit`).

**Importante.**
- El **mínimo/máximo** es el límite **duro** (valor inválido); las **bandas** son señales dentro
  del rango válido (el valor se acepta pero queda marcado).
- La banda se **estampa al guardar** y queda en el registro: alimenta el "review-by-exception" de
  Bitácoras (filtrar solo lo que requiere atención) y, más adelante, las incidencias automáticas.
- Si el campo es **calculado** (motor de reglas), el umbral aplica sobre el **valor calculado**.

---

## Plantillas ▸ Objetos del formulario  [Configurador]

**Para qué sirve.** Construir una bitácora con el objeto correcto para cada dato, igual que en los
grandes sistemas de inspección y mantenimiento. Además de los básicos (texto, número, sí/no, fecha),
hay objetos especializados que capturan mejor la información de terreno y la dejan **reportable**.

**Cómo se usa.** En el builder, abre **＋ Agregar campo**: la paleta agrupa los objetos por categoría.
Elige uno (clic o arrástralo al lienzo) y ajústalo en el panel de propiedades.

- **Básicos.** Texto, Párrafo, Número (con unidad y umbrales), **Porcentaje**, **Moneda (CLP)**,
  **RUT** (valida el dígito verificador), **Correo / Teléfono / Enlace (URL)** (validan el formato),
  Sí/No, Fecha, Fecha y hora, **Hora**, **Duración (HH:MM)** y **Rango (mín–máx)**.
- **Selección.** Una opción: **Lista desplegable**, **Opción única visible** (radio) o **Segmentos**
  (chips de 1 toque). Varias opciones: **Casillas**, **Selección múltiple** o **Multiselección con
  modal** (ventana de búsqueda para listas largas). Todas pueden alimentarse de una **Lista de
  referencia** gobernada.
- **Básicos (Ola 2).** **Lectura con tolerancia** (defines un *valor esperado ± tolerancia*; el sistema
  marca solo la advertencia/crítico cuando la lectura se sale de la banda) y **Contador / acumulado**
  (lectura incremental tipo horómetro/medidor: muestra el **delta** contra la última lectura sellada del
  mismo equipo y, si lo activas, impide registrar un valor menor al anterior).
- **Evaluación.** **Conforme / No conforme / N.A.** (tri-estado de inspección, con N.A. opcional),
  **Severidad 1–5**, **Valoración** (estrellas, numérica o Likert con rótulos), **Matriz de riesgo**
  (probabilidad × consecuencia → nivel de riesgo, ISO 31000) y **Firma electrónica**.
- **Referencia** (apuntan a algo de la plataforma): **Equipo / activo** (acotado al nodo de la entrada),
  **Usuario / responsable**, **Nodo de estructura** y **Turno**. Eliges de una lista buscable; el sistema
  guarda la referencia y muestra su nombre.
- **Evidencia / Terreno (Ola 3).** **Foto / evidencia** (captura con la cámara de la tablet o sube de la
  galería; admite varias), **Archivo adjunto** (PDF/documento/imagen), **Nota de voz** (graba audio en
  terreno o sube un archivo), **Croquis / dibujo** (dibuja a mano en un lienzo y se guarda como imagen) y
  **Escáner QR / código de barras** (apunta la cámara a un código y rellena el campo — p. ej. el TAG de un
  equipo; **no** guarda un archivo, solo el valor leído).
- **Estructurados / repetibles (Ola 4).** **Tabla repetible** (una grilla donde el operador **agrega,
  quita y reordena filas**; cada columna es un sub-campo escalar —hora, número con umbral, lista, etc.—
  validado celda a celda), **Grupo repetible** (el mismo concepto en formato **tarjetas** apiladas, ideal
  para "agregar otro hallazgo") y **Matriz parámetro × turno** (una tabla de filas FIJAS = parámetros y
  columnas FIJAS = turnos/intervalos; cada celda es una lectura). El diseñador define las columnas/ejes y
  el tipo de cada celda.
- **Presentación** (no piden dato): **Encabezado**, **Texto / instrucción**, **Separador**, **Aviso**
  (información/advertencia/éxito/peligro), **Enlace a procedimiento** e **Imagen de referencia** (por URL).

**Quién puede.** El **Configurador** que edita la plantilla (`template:edit`).

**Importante.**
- Un objeto se ve **igual** en el diseñador, al llenar y en el visor (un solo motor de render).
- Los objetos de **Presentación** son solo guía visual: **no se llenan, no se validan** y no aparecen
  en reglas ni en el resumen de la grilla.
- **RUT, correo, %, hora, duración y rango** validan su formato al guardar (en el servidor, no solo en
  pantalla). La duración se guarda en minutos y los montos/porcentajes se muestran con el formato regional.
- Los objetos de **Referencia** se validan **en el servidor**: solo aceptan algo que **existe, está
  activo y está dentro de tu alcance** (p. ej. un equipo debe pertenecer al nodo de la entrada). Las
  opciones que ves ya están filtradas por tus permisos; el backend siempre decide.
- Los objetos de **Evidencia** suben el archivo **a través del servidor** (que valida tamaño y tipo antes
  de guardarlo); la **descarga** usa un enlace temporal firmado, así que solo quien puede ver la entrada
  ve su evidencia. Puedes **hacer clic en un adjunto para previsualizarlo** (la imagen se ve en grande, el
  audio/video se reproduce, el PDF se abre incrustado) y así corroborar que subiste el archivo correcto. Una vez que la entrada queda **sellada**, su evidencia es **inmutable** (no se cambia ni
  borra). El **escáner QR** funciona en navegadores con cámara; si no hay cámara, igual puedes escribir el
  valor a mano. *El diseñador puede limitar tipos permitidos, tamaño máximo y cantidad por campo.*
- La **matriz de riesgo** la configura el diseñador pintando la severidad de cada celda (ejes editables).
- En los objetos **estructurados** cada celda se valida **en el servidor** con las mismas reglas de su tipo
  (rango, catálogo, formato). Una **columna obligatoria** debe llenarse en cada fila que uses; si marcas la
  **tabla como obligatoria**, debe tener al menos una fila completa para poder completar la sección. Las
  filas que dejes totalmente vacías se ignoran. En tablet la tabla se desplaza en horizontal con el
  encabezado y la primera columna fijos. *(Por ahora estos objetos no aparecen en el resumen de la grilla
  ni en las reglas; eso llegará más adelante.)*
- Cambiar un objeto crea un nuevo **borrador**; aplica a las entradas nuevas al **publicar** (la versión
  publicada queda inmutable).

---

## Plantillas ▸ Borrador y publicación (versión inmutable)  [Configurador]

**Para qué sirve.** Separar el **diseño en curso** (lo que estás editando) de la **versión vigente**
que se usa para registrar. Así puedes ajustar una plantilla sin afectar las bitácoras en marcha, y
cuando esté lista la **publicas**: esa versión queda **congelada** (inmutable) para trazabilidad GxP.

**Cómo se usa.**
1. Editas la plantilla (secciones, campos, flujo, reglas): los cambios viven en un **borrador**.
2. **Guardar borrador** conserva el avance sin afectar a nadie.
3. **Publicar** crea una **versión nueva inmutable** y la deja vigente para las **entradas nuevas**.
4. Las entradas ya creadas conservan la versión con la que nacieron (no se "re-escriben").

**Quién puede.** El **Configurador** con `template:edit` (editar/guardar borrador) y la acción de
**publicar** de la plantilla.

**Importante.**
- La **gobernanza** del contenedor (identidad, alcance de nodos/plantilla, modo de equipo, ventana de
  edición, campos del resumen) se guarda **aparte** con *Guardar configuración* — **no** exige republicar.
- Publicar **no toca** las entradas existentes; solo cambia la versión que usarán las nuevas.
- Una plantilla **publicada** que vuelves a editar genera **otro borrador**; nada cambia hasta publicar.

---

## Plantillas ▸ Modo de equipo en la entrada  [Configurador]

**Para qué sirve.** Decidir, por plantilla, **cómo se trata el equipo/activo** al crear una entrada:
desde "no aplica" hasta "es obligatorio". Así una bitácora de ronda exige el equipo y una nota general
no lo pide (patrón de tipos de aviso de SAP PM / tipos de OT de Maximo).

**Cómo se usa.** En la configuración de la plantilla (*Identidad y gobernanza*), elige el **Modo de
equipo**:
- **Ninguno** — la entrada no lleva equipo (ni se ofrece el selector).
- **Opcional** — se ofrece, pero se puede dejar vacío (comportamiento por defecto).
- **Sugerido** — se ofrece y se **recomienda**; si el nodo tiene un único equipo, se autoselecciona.
- **Requerido** — **obliga** a elegir un equipo para poder crear la entrada.

**Quién puede.** El **Configurador** con `template:edit`. Es **gobernanza viva**: se guarda con *Guardar
configuración* (no exige republicar la versión).

**Importante.**
- El equipo se elige **dentro del nodo** de la entrada, y el backend **verifica** que pertenezca a él.
- El cumplimiento del modo se decide **en el servidor** (Requerido sin equipo ⇒ se rechaza; Ninguno con
  equipo ⇒ se rechaza), no solo en pantalla.
- Una vez elegido, el equipo se muestra en la cabecera del llenado y del visor, y en la grilla de Bitácoras.

---

## Plantillas ▸ Lógica condicional (mostrar un campo según otro)  [Configurador]

**Para qué sirve.** Mantener el formulario corto y relevante: un campo aparece **solo cuando hace
falta** (p. ej. "¿Hubo falla?" → si la respuesta es *Sí*, se muestra "Descripción de la falla").

**Cómo se usa.**
1. Agrega un campo **Sí/No** que actúe de interruptor.
2. Selecciona el campo que quieres condicionar y, en sus propiedades, usa **"Mostrar solo si"**.
3. Elige el campo Sí/No: el campo quedará oculto hasta que aquel esté en *Sí*.

**Quién puede.** El **Configurador** que edita la plantilla (`template:edit`).

**Importante.**
- La condición se evalúa **también en el servidor**: un campo oculto no se exige ni se valida (no
  bloquea completar la sección) y no guarda valor mientras esté oculto.
- Es una regla simple (un campo = un valor). Las validaciones **cruzadas** entre campos y los campos
  **calculados** viven en el **motor de reglas** (sub-pestaña *Reglas* del diseñador).

---

## Plantillas ▸ Secciones y campos  [Configurador]

**Para qué sirve.** Organizar la bitácora en **secciones** (bloques con título) que se llenan y, si
aplica, se firman por separado — la sección es la unidad de permiso, llenado y firma.

**Cómo se usa.**
1. En el diseñador, agrega una **sección** y dale título y descripción.
2. Agrega **campos** desde **＋ Agregar campo** (ver *Objetos del formulario*); marca los **obligatorios**
   y añade un **texto de ayuda** cuando convenga.
3. Acomoda los campos en el **lienzo** (ancho y posición) y, si la plantilla tiene flujo, define en qué
   **estado** es editable cada sección y qué **roles** pueden llenarla.

**Quién puede.** El **Configurador** que edita la plantilla (`template:edit`).

**Importante.**
- Cada campo tiene una **clave estable** que lo identifica entre versiones (no la cambies a la ligera:
  es la referencia para reglas, resumen y reportes).
- Los **obligatorios** se exigen al **completar** la sección, respetando la lógica condicional.
- El diseño viaja en una **versión inmutable** al publicar; las entradas en curso siguen con la versión
  con que nacieron.

---

## Notificaciones  [Admin · todos]

**Para qué sirve.** Avisa por **correo electrónico** cuando pasa algo que requiere tu
atención, sin que tengas que estar mirando la pantalla. Hoy avisa de cuatro cosas:
una **ronda vencida** (no se inició a tiempo), un **SLA incumplido** (una entrada lleva
demasiado en un estado del flujo), una **transición de flujo** (una entrada avanzó y te
toca actuar) y una **firma pendiente** (una entrada espera tu firma electrónica). Solo
correo (no SMS ni WhatsApp). Es la base sobre la que se construirán los avisos de
incidencias.

**Cómo se usa.**
- **Mis preferencias** (todos, desde el menú de tu perfil ▸ «Mis notificaciones», o la
  pestaña *Mis preferencias* en Notificaciones): un interruptor por tipo de aviso para
  **activarlo o silenciarlo**. Por defecto recibes todos los que te corresponden.
- **Correo saliente** (Admin): la **bandeja de salida** lista cada correo que el sistema
  envió o intentó enviar — a quién, qué evento, asunto, fecha y **estado** (Enviado /
  Pendiente / Fallido / Suprimido). Puedes **filtrar** por estado o buscar, **abrir** un
  correo para ver su contenido tal cual salió, y **reintentar** uno que falló.
- **Plantillas** (Admin): edita el **asunto y el cuerpo** de cada aviso. Los textos usan
  **variables** entre llaves (p. ej. `{{entry.folio}}`, `{{schedule.name}}`): haz clic en
  una variable disponible para insertarla. Solo se permiten las variables propias de ese
  evento; si usas una que no corresponde, el sistema te lo avisa al guardar.

**Quién puede.** **Cualquier usuario** gestiona **sus propias** preferencias (no requiere
permiso). Para **administrar plantillas** se necesita el permiso *administrar plantillas de
notificación*; para **ver el correo saliente**, el permiso *ver correo saliente*. Un aviso
**solo llega a quien tiene acceso** al registro o la ronda en cuestión: nunca se notifica
algo que el destinatario no podría ver en la aplicación.

**Importante.**
- Los avisos de **ronda vencida** van al **rol responsable** del horario (no a un equipo;
  un equipo es un activo, no personas). Si el horario no tiene rol responsable, el aviso por
  correo solo llega a quienes se **suscribieron** explícitamente (la ronda igual aparece en
  «Mis rondas» de todos los del área).
- Si el servidor de correo está caído, **nada se pierde**: los correos quedan en la bandeja
  como *Pendiente* o *Fallido* y se **reintentan** automáticamente.
- No se duplican: un mismo suceso genera **un solo correo por persona**, aunque el sistema
  lo revise varias veces.
- El **resumen agrupado (digest)**, la **gestión de suscripciones desde la pantalla** y los
  **recordatorios escalonados** están planificados pero aún no disponibles.

---

## Configuración ▸ Servidor de correo (SMTP)  [Admin]

**Para qué sirve.** Define **cómo y desde dónde** salen los correos de Lyra WatchLog
(notificaciones, recuperación de contraseña). Antes esto vivía solo en variables de
entorno; ahora se configura desde la aplicación y **se aplica sin reiniciar**.

**Cómo se usa.** En **Configuración ▸ Correo saliente**:
1. Elige un **proveedor** (Gmail/Workspace, Microsoft 365, Amazon SES, SendGrid,
   Mailpit para desarrollo, o Personalizado): rellena host/puerto/seguridad y te
   muestra una **pista** con qué credencial usar.
2. Completa **usuario** y **contraseña** (la contraseña se guarda **cifrada** y nunca
   se vuelve a mostrar; déjala vacía para no cambiarla), y el **remitente** (nombre +
   correo, que debe ser de un dominio verificado en tu proveedor).
3. **Probar conexión** valida las credenciales sin enviar nada; **Enviar prueba**
   manda un correo real al destinatario que indiques (si falla, te mostramos el
   motivo exacto del servidor). Luego **Guardar configuración**.
4. El interruptor **Correo activado** apaga el envío globalmente (los avisos quedan en
   la bandeja como «suprimidos»; nada se rompe).

**Quién puede.** Solo quien tenga el permiso **`notification:config`** (configurar el
servidor de correo). Es un permiso aparte del de plantillas y del de bandeja.

**Importante.**
- La **contraseña SMTP se guarda cifrada** en el sistema; la API nunca la devuelve.
- Si nunca guardas la config aquí, el sistema usa las **variables de entorno** (`.env`)
  como respaldo — la pantalla indica si la config actual viene «del sistema» o «del .env».
- En **plantillas** de notificación tienes **vista previa en vivo** (con datos de
  ejemplo), un **diccionario** que explica cada variable y la inserta donde está el
  cursor, y la variable **`{{entry.summary}}`** para incrustar los campos de resumen de
  la bitácora (los que configuraste en «Resumen en la grilla»).

---

## Incidencias

**Para qué sirve.** Gestionar de forma formal y trazable los eventos, desviaciones,
condiciones inseguras, fallas, impactos ambientales o incumplimientos que requieren un
responsable, un estado, evidencia y un cierre auditado. Cubre casos reales de minería e
industria (seguridad, salud ocupacional, medio ambiente, calidad, mantenimiento,
geomecánica, continuidad operacional, cumplimiento). Cada incidencia avanza por un
**flujo de estados** configurable (reusa el mismo motor de flujos del sistema).

**Cómo se usa.**
- Entra a **Incidencias** en el menú. Arriba ves **indicadores** (abiertas, críticas,
  vencidas, sin responsable, desde bitácora, reportables): cada uno es un atajo que filtra.
- La **barra de filtros** (en una línea) permite buscar por folio/título y filtrar por
  estado, tipo, severidad, prioridad y vistas rápidas (mis incidencias, sin responsable,
  vencidas, reportables, desde bitácora). Cambia entre **Lista** y **Tablero (kanban)** con
  el botón de la derecha.
- **Reportar** una incidencia: botón «Reportar incidencia». Completa título, tipo (y
  categoría), severidad real, potencial de gravedad, prioridad, el **nodo/ubicación**, el
  **equipo/activo** (opcional; el desplegable muestra los equipos de ese nodo) y la **fecha y
  hora del evento** (cuándo OCURRIÓ; puede ser anterior al reporte — si la dejas vacía se usa
  el momento del reporte). Se le asigna un **folio** (INC-####) y arranca en el primer estado
  del flujo. Si reportas **desde una bitácora** con equipo, ese equipo se **hereda** salvo que
  elijas otro.
- **Gestionarla**: haz clic en una fila o tarjeta para abrir el **detalle**. Ahí ves el
  flujo (stepper), el **origen**, asignas **responsable**, escribes **comentarios**, ves el
  **timeline** y avanzas de estado con los botones de transición. Al llegar al estado final
  se cierra (puedes registrar un resumen de cierre). Si una transición exige **firma**, se
  te pedirá reconfirmar tu contraseña (y MFA si aplica).
- **Anular**: si una incidencia se creó por error o está duplicada, «Anular incidencia»
  con un motivo. No se borra: queda trazable.

**Desde una bitácora.** En el visor de una entrada de bitácora, el botón **«Reportar
incidencia»** abre el formulario con el **nodo preseleccionado** y deja la incidencia
**ligada a esa entrada** (en el detalle, el bloque «Origen» enlaza de vuelta a la bitácora).

**Quién puede.** Ver: `incident:view` (+ módulo `module:incidents:view`). Crear:
`incident:create`. Editar atributos: `incident:edit`. Asignar: `incident:assign`. Comentar:
`incident:comment`. Avanzar de estado: `incident:transition` (además, **quién** puede cada
transición lo define el flujo por rol). Anular: `incident:cancel`. Administrar tipos/
categorías: `incidentcatalog:manage`. Todo se verifica en el servidor y respeta tu
**alcance por nodo** (solo ves/gestionas incidencias de los nodos a tu alcance).

**Importante.**
- La **severidad real** (lo que pasó) es distinta del **potencial de gravedad** (lo que
  pudo pasar): un cuasi-accidente puede ser severidad baja y potencial fatal.
- El **timeline es inmutable** (append-only) y la incidencia **nunca se borra**: se anula
  con motivo. Cada cambio relevante (estado, responsable, severidad, prioridad) queda
  registrado con quién y cuándo.
- Las incidencias se pueden originar **manualmente**, **desde una bitácora** o **desde una
  excepción operacional** (ver más abajo); la apertura **automática por reglas** llega en una
  fase siguiente.

### Incidencias ▸ Acciones correctivas y preventivas (CAPA)

**Para qué sirve.** Una incidencia no se cierra "porque sí": se resuelve con **acciones**.
Aquí registras las **acciones correctivas** (corrigen lo que pasó), **preventivas** (evitan
que se repita) o **inmediatas** (contención), cada una con responsable, plazo y estado, y
—si corresponde— su **verificación de eficacia**. Es lo que distingue gestionar una
incidencia de solo anotarla.

**Cómo se usa.**
- Abre el detalle de una incidencia: bajo el origen verás **«Acciones correctivas/preventivas»**.
- **«Nueva acción»**: elige tipo (correctiva/preventiva/inmediata), título, responsable y plazo
  opcionales, y marca **«Obligatoria»** si esa acción **debe** resolverse antes de poder cerrar
  la incidencia.
- A medida que se trabaja: **«Completar»** (con una nota de qué se hizo) la deja *Realizada*.
- **«Verificar»** (permiso aparte): confirma si la acción fue **eficaz** (se da por cerrada) o
  **no eficaz** (se **reabre** para retrabajarla).
- **Editar** o **Anular** (con motivo) mientras siga abierta. Nada se borra.
- Si intentas **cerrar** la incidencia con acciones obligatorias sin resolver, el sistema lo
  **impide** y te dice cuántas faltan.

**Quién puede.** Crear/editar/completar/anular acciones: `incident:action:manage`. **Verificar
eficacia**: `incident:action:verify` (separado a propósito — quien ejecuta una acción no debería
auto-verificarla). Todo respeta tu **alcance por nodo** (heredado de la incidencia).

**Importante.**
- Una acción **obligatoria** abierta **bloquea el cierre**. Si el **tipo** de incidencia exige
  CAPA, además **debe estar verificada** (no basta con "realizada"); si no lo exige, basta con
  realizarla.
- Una verificación **«no eficaz»** reabre la acción: una acción que no funcionó sigue pendiente.
- Las acciones quedan en el **timeline** de la incidencia (quién, qué, cuándo). Sin borrado físico.
- *Por ahora:* la **evidencia con archivos** en la acción y el **rol como responsable** desde la
  pantalla llegan en una actualización siguiente (el cierre ya admite notas de texto).

### Catálogos de incidencias (tipos y categorías)

**Para qué sirve.** Los **tipos** (p. ej. Seguridad, Equipos, Medio ambiente) y las
**categorías** (p. ej. Cuasi-accidente, Derrame) son las listas que eliges al reportar una
incidencia. Este mantenedor te deja crearlas y ajustarlas **sin tocar la base de datos**: un
tipo define su **flujo por defecto**, su **color**, y si las incidencias de ese tipo
**requieren investigación / CAPA / son reportables** por defecto.

**Cómo se usa.**
- Entra a **Incidencias** y pulsa **«Catálogos»** (arriba a la derecha; solo visible para
  administradores). También llegas por `/incidencias/catalogos`.
- Cambia entre las pestañas **Tipos** y **Categorías**. Cada una tiene **buscador**, filtro
  **Activos/Inactivos** y **orden**, con paginación arriba y abajo.
- **Nuevo / Editar:** completa el formulario. La **clave** (key) identifica al elemento y solo
  se define al crear (no se puede cambiar después). En un **tipo** eliges además el flujo por
  defecto (de los flujos **publicados**; vacío = el flujo global de incidencias), el color del
  chip y los interruptores de comportamiento. En una **categoría** eliges a qué **tipo**
  pertenece, o la dejas **transversal** (disponible para todos los tipos).
- **Activar / desactivar:** el interruptor de cada fila retira el elemento de los desplegables
  del alta **sin borrarlo**. Las incidencias antiguas que ya lo usaban lo siguen mostrando.

**Quién puede.** Administrar los catálogos exige `incidentcatalog:manage`. El resto de los
usuarios no ve el botón ni la pantalla (y el servidor lo rechaza igual). Ver las incidencias y
sus tipos/categorías ya viene con `incident:view`.

**Importante.**
- **No hay borrado:** un tipo/categoría referenciado por incidencias no se elimina, se
  **desactiva**. Así se preserva la trazabilidad histórica.
- La **clave es la identidad**: si intentas crear una con una clave que ya existe, el sistema
  lo impide (no la sobrescribe).
- El **flujo por defecto debe estar publicado**: un borrador de flujo no se puede usar porque
  la incidencia congela el flujo al crearse.

---

## Excepciones operacionales

**Para qué sirve.** Cuando una lectura de la bitácora queda **fuera de umbral** (advertencia
o crítica), una regla de negocio se dispara, o un operador anota algo anómalo, el sistema lo
registra como una **excepción**: una desviación con estado, que alguien debe **revisar**
(triar) en vez de que se pierda. Es la antesala de la incidencia: separa "esto se salió de
rango" de "esto amerita abrir una incidencia formal". Conserva el **valor original** aunque
después se corrija (trazabilidad GxP / ALCOA+).

**Cómo se usa.**
- **En la bitácora.** Al llenar o consultar una entrada, si tiene excepciones aparece arriba
  un **panel de revisión** plegable con el resumen «N críticas · N advertencias · N posibles
  inválidos». Al abrirlo ves cada excepción (campo, valor, rango esperado, estado) y puedes
  actuar sobre ella. Si completas una sección con valores **críticos**, un aviso te lo
  recuerda con atajos para revisarlos (no te bloquea: el dato ya quedó guardado).
- **Acciones por excepción** (abre el detalle haciendo clic): **Corregir dato** (escribe el
  valor correcto + motivo; el original se conserva; si la entrada ya está sellada se te pide
  reconfirmar tu contraseña), **Reconocer / revisar** (acuse sin cambiar el dato), **Crear /
  asociar incidencia** (abre una incidencia nueva prellenada o la liga a una existente; te
  sugiere si ya hay una incidencia abierta para el mismo equipo en las últimas 24 h), y
  **Descartar** con motivo (descartar una **crítica** requiere un permiso superior).
- **Agrupar varias.** En el panel o en la bandeja, marca varias excepciones con su casilla y
  **Agrupar en una incidencia**: se crean/asocian todas de una vez.
- **Bandeja global `/excepciones`.** En el menú, **Excepciones** abre la lista de TODA la
  operación (acotada a tu alcance): indicadores clicables, filtros en una línea (estado,
  severidad, origen, "sin incidencia") y búsqueda, con paginación arriba y abajo.
- **Trazabilidad.** En el detalle de una incidencia, el bloque de excepciones de origen lista
  las que la generaron, cada una enlazada a su entrada de bitácora (campo y sección).

**Quién puede.** Ver: `module:incidents:view`. Reconocer / convertir / asociar / agrupar:
`exception:triage` (convertir exige además `incident:create`). Corregir: `exception:correct`.
Descartar: `exception:dismiss`; descartar una **crítica**: `exception:dismiss-critical`. Todo
respeta tu **alcance por nodo** y queda auditado.

**Importante.**
- El **valor original nunca se pierde**: una corrección lo preserva y queda registrada (quién,
  cuándo, por qué). Las correcciones sobre entradas selladas exigen reconfirmar identidad.
- Una excepción **no obliga** a abrir incidencia: el flujo normal es revisar y, si corresponde,
  corregir, reconocer o descartar. Convertir es para lo que sí amerita gestión formal.
- Qué genera excepción se configura en el **formulario**: un valor **crítico siempre** la
  genera; una **advertencia** solo si el campo numérico tiene activado «Una advertencia genera
  excepción» (en el builder, junto a los umbrales/tolerancia).
- **Excepción / incidencia automática por regla.** Una **regla de negocio** (que compara varios
  campos) puede configurarse para que, **al firmar** el registro, **genere una excepción** o
  **abra una incidencia** sola — sin que nadie la cree a mano (se elige en el diseñador, sub-pestaña
  *Reglas*; ver «Plantillas ▸ Reglas»). Estas excepciones llevan el **mensaje de la regla** (no un
  valor de campo, así que no se "corrigen") y la incidencia automática queda con **origen = Regla**.
  Aparecen segundos después de firmar (se procesan en segundo plano para no demorar la firma).
