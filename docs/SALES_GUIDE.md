# Lyra WatchLog — Guía comercial y propuesta de valor (documento VIVO)

> **Para qué es este documento.** Material **orientado al cliente** para **vender, explicar y
> sintonizar** con potenciales clientes: sirve de base para presentaciones, one-pagers, copy del
> sitio web, propuestas y demos. Habla de **beneficios** (qué gana el cliente), no de tecnología
> interna. Es un documento **VIVO**: se **enriquece en cada sesión** a medida que el producto crece
> (ver §0 y el changelog de valor al final).
>
> **Regla de honestidad (importante para no quemar credibilidad en una venta):** lo que está en
> "Qué hace hoy" **está construido y funcionando**. Lo que está bajo **"Hacia dónde va (visión)"**
> es roadmap; preséntalo como tal, nunca como disponible. Última actualización: **2026-06-17**.

---

## 0. Cómo mantener este documento (para el equipo)
- En cada sesión que agregue valor de cara al cliente, **mover/añadir** la capacidad a §3 "Qué hace
  hoy" con su **beneficio** (no solo la feature) y, si aplica, un **caso de uso**.
- Registrar la mejora en el **§12 Changelog de valor** (1 línea, fecha, en lenguaje de cliente).
- Mantener el tono: preciso, confiable, industrial, sin humo. Cifras de ROI siempre como
  *estimación/“hasta”*, no promesas absolutas.

---

## 1. En una frase (elevator pitch)

**Lyra WatchLog es la plataforma que reemplaza las bitácoras de papel y las planillas Excel de la
operación industrial por un sistema digital, trazable y a prueba de auditorías — instalado en la
infraestructura del propio cliente (on-premise), sin depender de la nube.**

Variantes cortas para web / slides:
- *"Tus bitácoras operacionales, digitales, trazables y auditables — en tu propia infraestructura."*
- *"Del papel al dato confiable: registro de turno, rondas e incidencias en una sola plataforma."*
- *"Operación bajo control: qué se registró, quién lo firmó y qué se hizo al respecto."*

---

## 2. El problema que resuelve (con el que el cliente se identifica)

La operación industrial todavía vive en **cuadernos de turno, planillas Excel y formularios en PDF**.
Eso genera dolores concretos:
- **Información que se pierde o no se encuentra** cuando se necesita (incidente, auditoría, reclamo).
- **Cero trazabilidad real:** ¿quién registró ese dato?, ¿cuándo?, ¿se modificó después?
- **Desviaciones que nadie ve a tiempo** (un valor fuera de rango se diluye en una planilla).
- **Incidentes que se repiten** porque no hubo seguimiento formal de acciones correctivas.
- **Auditorías lentas y estresantes** (reconstruir evidencia a mano).
- **Rondas y controles que “se hicieron”** pero no hay forma de demostrarlo.
- **Datos sensibles en la nube de terceros**, algo inaceptable para muchas operaciones críticas.

> Gancho de venta: *"Si hoy una auditoría te pide demostrar quién tomó una lectura hace tres meses y
> qué se hizo cuando se salió de rango, ¿cuánto te toma responder?"*

---

## 3. Qué hace hoy (capacidades construidas + beneficio)

### 📋 Bitácoras digitales configurables (sin programar)
Formularios de turno/ronda armados con un **diseñador visual** (arrastrar y soltar): campos
numéricos con **rangos y umbrales** (verde/amarillo/rojo), listas, fotos y evidencia, **firmas**,
tablas y matrices, escáner **QR** de equipos, lógica condicional y **reglas de negocio** (cálculos y
validaciones automáticas).
**Beneficio:** cada faena define sus propios formularios sin depender de TI; los datos entran
**validados en origen** (menos errores, menos retrabajo).

### ✍️ Firma electrónica y registro a prueba de auditorías
Flujos de revisión y aprobación con **firma electrónica re-autenticada** (estilo FDA 21 CFR Part 11)
y principios de trazabilidad **ALCOA+**: cada registro dice **quién, qué y cuándo**, el historial es
**inmutable** y nada se borra (se anula con motivo).
**Beneficio:** llegas a una auditoría con la evidencia **lista y defendible**, no reconstruida a mano.

### 🔁 Rondas y controles programados
Programación de **rondas recurrentes** (por turno, intervalo o calendario) que generan
automáticamente las tareas del operador. El operador ve **"Mis rondas"**: qué le toca, cuándo vence,
y ejecuta desde ahí.
**Beneficio:** se **demuestra** que los controles se hicieron, a tiempo, y se ve de inmediato lo
vencido.

### 🚨 Gestión de incidencias con cierre verificado (HSE, calidad, mantenimiento…)
Registro de eventos, desviaciones, fallas y no conformidades con **tipos/categorías configurables**,
**severidad y riesgo (ISO 31000)**, **flujo de estados configurable** (kanban) y **acciones
correctivas/preventivas (CAPA)** con responsable, plazo y **verificación de eficacia**. Una
incidencia **no se puede cerrar** si quedan acciones obligatorias sin resolver.
**Beneficio:** los problemas **se cierran de verdad** (con evidencia de que la solución funcionó),
no se "marcan como resueltos". Menos reincidencia.

### 🔍 Investigación de causa raíz (5 Porqués)
Para los eventos importantes, la plataforma guía la **investigación de causa raíz** con el método
**5 Porqués**: una cadena de preguntas que llega a la **causa de fondo**, no al síntoma. Esa causa
**justifica** las acciones correctivas, y en los tipos de incidencia que lo exigen (p. ej. seguridad,
medio ambiente) la incidencia **no se puede cerrar** sin una investigación completada.
**Beneficio:** dejas de "apagar incendios". Atacas la causa real, lo documentas para auditoría
(ISO 45001 / ISO 9001) y **reduces la reincidencia** porque cada acción está atada a una causa raíz.

### 📑 Reportes a la autoridad, sin que se te pasen los plazos
Cuando una incidencia obliga a **avisar a un organismo regulador, una gerencia o un cliente**, la
plataforma materializa ese **reporte** dentro de la incidencia: a **quién**, con qué **plazo** y en
qué **estado**. Marcas el envío guardando el **folio** que entrega la autoridad, o lo registras como
**«no aplica»** con justificación. Los reportes **obligatorios pendientes impiden cerrar** la
incidencia, y los que pasaron su plazo se marcan **vencidos** (con indicador y filtro propios). Todo
es **configurable**: defines tus obligaciones por tipo de evento y severidad, sin que el sistema
imponga un marco regulatorio fijo.
**Beneficio:** cumples tus obligaciones de **reportabilidad** con trazabilidad y sin depender de la
memoria de una persona; en una auditoría muestras qué se reportó, a quién, cuándo y con qué folio.

### 🔗 De la bitácora a la acción (sin saltos manuales)
Cuando un dato de una bitácora se sale de umbral, el sistema puede generar una **excepción
operacional** revisable y, si amerita, convertirla en **incidencia** — conservando el **valor
original**, el equipo, el turno y el contexto.
**Beneficio:** las desviaciones **no se pierden**; hay una cadena trazable de "lo detecté → lo revisé
→ abrí una acción".

### 🏭 Modela tu operación real (estructura + activos)
Jerarquía organizacional (empresa › sitio › área › nodo) y **equipos/activos** asociados, base para
filtrar, asignar responsabilidades y acotar permisos.
**Beneficio:** cada usuario ve y opera **solo lo de su alcance**; la información está ordenada como la
operación real.

### 🔐 Seguridad y permisos de grado empresarial
Control de acceso por **roles y atributos (ABAC)** en 4 dimensiones (pantallas, acciones,
transiciones de flujo y **alcance de datos por nodo/plantilla**), contraseñas con **Argon2id**,
**MFA**, y **auditoría inmutable** de la configuración sensible.
**Beneficio:** cada quien hace **solo lo que le corresponde**, y todo queda registrado.

### 🖥️ On-premise: tus datos, en tu casa
Se instala en la **infraestructura del cliente** (servidores propios / datacenter), con base de
datos PostgreSQL y almacenamiento de evidencia propio. **No depende de un SaaS** ni saca los datos
fuera.
**Beneficio:** **soberanía y control total del dato**, requisito de muchas operaciones críticas y de
áreas de seguridad de la información.

### 🔔 Avisos por correo
Notificaciones configurables (p. ej. rondas vencidas, vencimientos de flujo) con plantillas propias.
**Beneficio:** lo importante **llega a quien corresponde** sin depender de que alguien "mire la pantalla".

---

## 4. Por qué Lyra WatchLog (diferenciadores)

| Diferenciador | Qué significa para el cliente |
|---|---|
| **On-premise real** | Sus datos no salen de su infraestructura. Sin rehén de un proveedor cloud. |
| **Configurable sin programar** | Formularios, flujos, tipos de incidencia y reglas los define el cliente. |
| **Trazabilidad de grado auditoría** | Quién/qué/cuándo, inmutable, firmas — pensado para pasar auditorías. |
| **Transversal a industrias** | El núcleo es genérico; las particularidades (HSE, calidad, minería…) son configuración, no software a medida. |
| **Del dato a la acción** | No solo registra: detecta desviaciones, abre incidencias y exige cerrar con acciones verificadas. |
| **Diseño industrial de terreno** | Pensado para tablet, alto contraste, áreas táctiles amplias (uso con guantes). |

---

## 5. A quién le sirve (industrias)

Minería, manufactura, alimentos e inocuidad, energía y utilities, construcción, logística, salud,
servicios industriales y, en general, **cualquier organización que gestione turnos, rondas, controles
operacionales, calidad, mantenimiento o incidentes**.

> El mismo producto sirve a una concentradora minera y a una planta de alimentos: **cambia la
> configuración, no el software**.

---

## 6. Beneficios por rol (para hablarle a cada interlocutor)

- **Gerente de Operaciones:** visibilidad en tiempo real del estado de turnos, rondas e incidencias;
  menos tiempo "apagando incendios" y reconstruyendo qué pasó.
- **Jefe HSE / Seguridad:** gestión de incidentes con CAPA y verificación de eficacia; evidencia lista
  para fiscalizaciones; menos reincidencia.
- **Jefe de Calidad:** no conformidades, desviaciones y acciones correctivas trazables; soporte a
  auditorías y certificaciones.
- **Mantenimiento / Confiabilidad:** rondas de inspección demostrables; fallas atadas al activo;
  acciones de mejora con seguimiento.
- **TI / Seguridad de la información:** on-premise, control de accesos robusto, sin datos en la nube
  de terceros.
- **Auditoría / Cumplimiento:** trazabilidad ALCOA+, historial inmutable, firmas — auditorías más
  rápidas y defendibles.

---

## 7. Cómo se beneficia el cliente al adoptarlo (el "para qué")

- **Menos papel y planillas** → menos errores de transcripción y menos tiempo administrativo.
- **Auditorías más rápidas** → la evidencia ya está, organizada y firmada.
- **Menos incidentes repetidos** → porque las acciones correctivas se cierran y se **verifican**.
- **Desviaciones atendidas a tiempo** → los datos fuera de rango se vuelven visibles y accionables.
- **Cumplimiento demostrable** → trazabilidad y firmas pensadas para estándares exigentes.
- **Control del dato** → todo en su infraestructura, sin dependencia de la nube.

> Nota para propuestas: expresar el ROI como **estimación** según el caso del cliente (horas de
> registro/consolidación ahorradas, tiempo de auditoría, reducción de reincidencia), no como cifra
> garantizada.

---

## 8. Mensajes listos para usar (web / slides / one-pager)

**Titular:** *Lyra WatchLog — La operación industrial, bajo control y a prueba de auditorías.*

**Subtítulo:** *Bitácoras digitales, rondas e incidencias con trazabilidad de grado auditoría,
instaladas en tu propia infraestructura.*

**3 bullets de portada:**
- *Registra una vez, encuentra siempre:* datos validados, firmados e inmutables.
- *Del dato a la acción:* detecta desviaciones, abre incidencias y ciérralas con acciones verificadas.
- *Tus datos, en tu casa:* 100% on-premise, sin depender de la nube.

**Llamado a la acción:** *Agenda una demo con tus propios formularios.*

---

## 9. Preguntas frecuentes de venta (objeciones típicas)

- **"¿Es en la nube?"** → No por defecto: es **on-premise**, en la infraestructura del cliente. Los
  datos no salen de su entorno.
- **"¿Sirve para mi industria?"** → Sí: el núcleo es genérico y se **configura** (formularios, flujos,
  tipos de incidencia, reglas). No es software a medida por industria.
- **"¿Necesito programadores para configurarlo?"** → No para el uso diario: los formularios, flujos y
  catálogos se arman desde la aplicación.
- **"¿Aguanta una auditoría?"** → Está **diseñado** para eso: trazabilidad ALCOA+, historial inmutable
  y firmas electrónicas re-autenticadas. (No se promete "certificación" formal: se ofrecen los
  **principios** de trazabilidad y los controles.)
- **"¿Funciona en terreno, con tablet y guantes?"** → Sí: interfaz de alto contraste, áreas táctiles
  amplias y modo claro/oscuro.

---

## 10. Hacia dónde va (visión — roadmap, NO disponible aún)

Preséntalo como evolución, no como funcionalidad actual:
- **Inteligencia operacional con IA** (resúmenes de turno, asistente de consulta) con opción de
  modelo **local on-premise** (sin enviar datos a la nube).
- **Conexión con sistemas de planta** (SCADA / historiadores) para traer lecturas automáticamente.
- **Dashboards y analítica** (tendencias, reincidencia, tiempos de resolución).
- **Reportabilidad regulatoria configurable** por industria y país.
- **Notificaciones avanzadas** (más canales, escalamiento, recordatorios).

---

## 11. Marca y tono (para mantener coherencia comercial)

- **Producto:** Lyra WatchLog · **Empresa:** ITESICWS · **Ecosistema:** Lyra (cada producto es una
  estrella; producto hermano conocido: *Lyra Vega*, inventarios).
- **Tono:** preciso, confiable, moderno, industrial. Estética oscura premium, sobria, de alto estándar.
- **Evitar:** promesas absolutas, jerga técnica interna en material de cliente, comparaciones sin
  sustento.

---

## 12. Changelog de valor (qué valor nuevo ofrecer al cliente, por sesión)

> Una línea por hito, en lenguaje de cliente. Lo más reciente arriba.

- **2026-06-17** — **Reportabilidad configurable:** las incidencias pueden gatillar **reportes a
  autoridades u obligaciones** con plazo, estado y **folio de envío**; los reportes obligatorios
  pendientes impiden cerrar y los vencidos se marcan solos. Defines tus obligaciones por tipo y
  severidad (sin marco regulatorio impuesto). *(Argumento de venta: cumples plazos de reportabilidad
  con trazabilidad de auditoría; nada depende de la memoria de una persona.)*
- **2026-06-17** — Las incidencias importantes ahora exigen **investigación de causa raíz (5
  Porqués)** antes de cerrarse: se llega a la causa de fondo y cada acción correctiva queda atada a
  ella. *(Argumento de venta: dejas de apagar incendios; menos reincidencia; evidencia ISO 45001/9001.)*
- **2026-06-17** — Las incidencias ahora se **cierran con acciones correctivas/preventivas
  verificadas** (CAPA): no se puede dar por resuelto un problema si la solución no se ejecutó y, cuando
  corresponde, no se verificó que funcionó. *(Argumento de venta: menos reincidencia, cierre real.)*
- **2026-06-17** — Catálogos de incidencias (tipos y categorías) **administrables desde la aplicación**
  por el propio cliente.
