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
> Última actualización: **2026-06-23**.

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
- ✅ **Menú lateral por grupos** (Operación · Diseño y datos · Administración) + **Favoritos en el topbar** (§ El espacio de trabajo ▸ Menú lateral)
- ✍️ Pestañas, búsqueda ⌘K, idioma, densidad, tema claro/oscuro

### 3. Estructura organizacional  [Configurador/Admin]
- ✅ **Asistente: crear una nueva área** (wizard de 3 pasos: identidad → niveles → nodo raíz, deja el área operativa de una vez) (§ Estructura organizacional ▸ Asistente: crear una nueva área)
- ✅ **Múltiples estructuras organizacionales** (varias jerarquías en paralelo + selector de estructura activa) (§ Estructura organizacional ▸ Múltiples estructuras)
- ✅ **Ciclo de vida: archivar y ordenar estructuras** (archivar/reactivar sin borrar + reordenar el selector) (§ Estructura organizacional ▸ Ciclo de vida: archivar y ordenar)
- ✅ **Contexto visual y vista ejecutiva** (color/ícono por estructura + badge "Estás en" + Panorama cross-estructura) (§ Estructura organizacional ▸ Contexto visual y vista ejecutiva)
- ✍️ Árbol de niveles y nodos (crear/editar/mover/orden)
- ✍️ Código externo (integración ERP/CMMS) y alcance por nodo

### 4. Equipos (activos)  [Configurador/Admin]
- ✍️ CRUD de equipos, categorías, criticidad, baja lógica

### 5. Seguridad: usuarios, roles y permisos  [Admin]
- ✅ **Alcance del rol (por nodo y por plantilla)** — define el recorte una vez en el rol; se une al del usuario (§ Seguridad ▸ Alcance del rol)
- ✅ **Administración delegada por estructura** — un rol/usuario administra SOLO las estructuras que se le delegan; el super-admin, todas; red anti-bloqueo del último administrador (§ Seguridad ▸ Administración delegada por estructura)
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
- ✅ **Notificaciones**: comportamiento por defecto de los avisos de transición (§ Notificaciones ▸ Avisos a la medida)
- ✅ **Servidor de correo (SMTP)**: proveedor, credenciales cifradas, probar (§ Configuración ▸ Servidor de correo)
- ✅ **Inteligencia Artificial**: proveedor (ninguno/Anthropic/local), clave cifrada, "Probar" en vivo (§ Configuración ▸ Inteligencia Artificial)

### 13. Rondas  [Planificador · Operador]
- ✅ **Programación de rondas** (horario por turno/intervalo/calendario + rol responsable) (§ Rondas ▸ Programación de rondas)
- ✅ **Mis rondas** (worklist del operador: iniciar/continuar/omitir lo que te toca) (§ Rondas ▸ Mis rondas)

### 14. Notificaciones  [Admin · todos]
- ✅ **La campanita** (notificaciones in-app: contador, bandeja, marcar leídas, en tiempo real) (§ Notificaciones ▸ La campanita) [todos]
- ✅ **Avisos por correo** (qué se avisa: ronda vencida, SLA, transición, firma pendiente) (§ Notificaciones)
- ✅ **Mis notificaciones** (activar/desactivar avisos propios, por correo y en la app) (§ Notificaciones ▸ Mis preferencias)
- ✅ **Plantillas de mensaje** (con vista previa, diccionario de variables, `{{entry.summary}}`) y **correo saliente** (§ Notificaciones ▸ Plantillas / Correo saliente) [Admin]
- ✅ **Servidor de correo (SMTP)** — configurar el correo saliente (§ Configuración ▸ Servidor de correo) [Admin con `notification:config`]
- ✅ **Avisos a la medida** (qué transición avisa y a quién + plantillas por bitácora con comodines de campo + comportamiento por defecto) (§ Notificaciones ▸ Avisos a la medida) [Configurador de flujos · Admin de plantillas]

### 15. Incidencias  [todos los roles operativos]
- ✅ **Reportar y gestionar incidencias** (lista + tablero kanban + detalle con flujo) (§ Incidencias)
- ✅ **Acciones correctivas y preventivas (CAPA)** (con verificación de eficacia y bloqueo de cierre) (§ Incidencias ▸ Acciones CAPA)
- ✅ **Investigación de causa raíz (5 Porqués)** (cadena de "porqués", causa raíz que bloquea el cierre, enlace a CAPA) (§ Incidencias ▸ Investigación de causa raíz)
- ✅ **Reportabilidad (reportes a autoridades / obligaciones)** (obligaciones configurables, plazo, folio externo, bloqueo de cierre, vencido) (§ Incidencias ▸ Reportabilidad)
- ✅ **Plazos (SLA), avisos de vencimiento y escalamiento** (plazo de resolución automático por tipo, avisos por correo y campanita, escalamiento a un superior) (§ Incidencias ▸ Plazos y avisos (SLA))
- ✅ **Dashboard de incidencias** (tendencias e indicadores: MTTR, cumplimiento de SLA, Pareto por tipo, reincidencia, CAPA/reportes; con rango de fechas, export CSV y clic-para-filtrar) (§ Incidencias ▸ Dashboard)
- ✅ **Crear desde una bitácora** (botón "Reportar incidencia" en el visor de la entrada) (§ Incidencias ▸ Desde una bitácora)
- ✅ **Administrar los catálogos** (tipos y categorías de incidencia) (§ Incidencias ▸ Catálogos) [solo administrador]

### 16. Excepciones operacionales  [Supervisor · Operador con triage]
- ✅ **Revisar y triar excepciones** (panel en la bitácora + bandeja global; corregir/reconocer/convertir/asociar/descartar) (§ Excepciones operacionales)

### 17. Cambio de turno  [Supervisor saliente · Supervisor entrante]
- ✅ **Entregar y recibir el turno** (cockpit auto-compilado por área y turno, entrega firmada de dos partes, pendientes que ruedan, historial) (§ Cambio de turno)
- ✅ **Resumen de turno por IA EN VIVO** (botón "Generar con IA": el brief se escribe palabra por palabra, cancelable; grounded al turno, revisable; el crudo determinista siempre visible; la firma sigue siendo tuya) (§ Cambio de turno)
- ✅ **Descargar el acta de entrega (PDF)** (documento de grado auditoría desde una entrega firmada: identidad Lyra, snapshot congelado, dos firmas Part 11, folio + hash verificable; on-premise) (§ Cambio de turno ▸ Descargar el acta)

---

## Estructura organizacional ▸ Asistente: crear una nueva área  [Configurador/Admin]

**Para qué sirve.** Levantar un **área o negocio nuevo** (una estructura organizacional completa) **de una sola
vez y sin fricción**. Antes, dejar una estructura lista para usar exigía tres pasos sueltos y dispersos —crearla,
ir a definir sus niveles y después crear su primer nodo— y era fácil quedarse a medias con una estructura **vacía
que no servía** (no aparecía en el selector porque no tenía nodos). El **asistente** une esos tres pasos en un
**flujo guiado** y garantiza que, al terminar, el área queda **operativa** (con al menos un nodo) y lista para
empezar a trabajar.

**Cómo se usa.**
1. Abre el **selector de estructura activa** (arriba a la derecha) y elige **«Gestionar estructuras…»**.
2. Pulsa **«Nueva área»**. Se abre el asistente con tres pasos:
   - **Paso 1 · Identidad.** Escribe el **nombre** del área (la **clave** corta se autogenera, puedes ajustarla;
     no se podrá cambiar después), una **descripción** opcional y elige su **color e ícono** (los mismos de la
     identidad visual: verás una **vista previa** del distintivo «Estás en»). Si los dejas en **«Auto»**, se
     derivan solos de la clave.
   - **Paso 2 · Niveles base.** Define la **jerarquía** de mayor a menor (por ejemplo *Faena → Planta → Área →
     Equipo*). Puedes partir de una **plantilla rápida** (Minería, Manufactura o TI/Infraestructura) y ajustarla,
     o construirla **desde cero**. Agrega, quita, renombra y **reordena** los niveles con las flechas. Necesitas
     **al menos un nivel**.
   - **Paso 3 · Nodo raíz.** Crea el **primer nodo** (en el nivel más alto), con su **nombre** y un **código**
     opcional. Verás un **resumen** de todo lo que se va a crear.
3. Pulsa **«Crear área»**. El sistema crea la estructura, sus niveles y el primer nodo **en un solo paso seguro**,
   te deja **trabajando de inmediato** en la nueva área y te lleva a **Estructura organizacional** para seguir
   poblando su árbol.

**Quién puede.** Solo el **administrador general de estructura** (super-admin, permiso `module:structure:manage`).
A un administrador **delegado** (que administra solo ciertas estructuras) **no** se le ofrece el botón, y el
backend lo verifica igual. Para seguir agregando nodos dentro del área basta el permiso de gestión de nodos.

**Importante.**
- **Todo o nada.** La creación es **atómica**: si algo falla (por ejemplo, la clave ya existe), **no se crea nada
  a medias** —no quedan estructuras vacías dando vueltas. El asistente te muestra el error y puedes corregir y
  reintentar sin limpiar nada.
- La **clave** debe ser **única** y en minúsculas/números/guiones; si ya existe, el asistente te avisa.
- Para **solo renombrar** o cambiar el color/ícono de un área existente, usa el lápiz de edición en «Gestionar
  estructuras…» (no el asistente). El asistente es para **crear** áreas nuevas.

---

## Estructura organizacional ▸ Múltiples estructuras  [Configurador/Admin]

**Para qué sirve.** Una misma instalación de Lyra WatchLog puede modelar **varios negocios o casos de uso
muy distintos a la vez**, cada uno con su propia forma de organizarse. Por ejemplo, una jerarquía minera
*Faena → Planta → Área* y, en paralelo, una de infraestructura TI *Contrato → Dominio → Sitio*. Cada
**estructura** tiene su **propio set de niveles** (los nombres y la profundidad de la jerarquía) y su **propio
árbol de nodos**, totalmente independientes: lo que ocurre en una no se mezcla con la otra. (Las **plantillas,
flujos, tipos de incidencia y listas de referencia se comparten** entre todas las estructuras; lo que cambia
por estructura es el árbol, los niveles y los calendarios.)

**Cómo se usa.**
1. Entra a **Estructura organizacional**. Arriba a la derecha verás el **selector de estructura activa** (un
   botón con el nombre de la estructura y una flecha). Todo lo que ves —el árbol, los niveles, los calendarios
   y los selectores de nodo de toda la app— corresponde a la **estructura activa**.
2. Para **cambiar de estructura**, abre el selector y elige otra. La pantalla se actualiza a su árbol y niveles.
3. Para **crear o administrar** estructuras, abre el selector y elige **«Gestionar estructuras…»**. Para **crear**
   una estructura nueva, usa el botón **«Nueva área»**: un **asistente** que la deja operativa de una vez
   (identidad → niveles → primer nodo). Desde el mismo panel puedes **renombrar**, cambiar identidad, **archivar**
   o **eliminar** las existentes. (Ver § *Asistente: crear una nueva área*.)
4. Al terminar el asistente, el sistema te deja trabajando de inmediato en la nueva estructura, ya con su primer
   nodo. Sigue **poblando su árbol** como siempre. Los niveles que definiste valen **solo para esa estructura**.

**Quién puede.** Ver y cambiar de estructura: cualquiera con acceso al módulo de estructura (`orgnode:read`);
solo verás las estructuras que tu **alcance (ABAC) por nodo** te permite. Crear, renombrar o eliminar
estructuras: requiere el permiso de **gestión de niveles** (`orglevel:manage`). El backend siempre lo verifica.

**Importante.**
- **Aislamiento estricto:** un nodo pertenece a UNA estructura y **no se puede mover a otra**. Los niveles, los
  calendarios y la asignación de calendarios a nodos también son **por estructura**.
- **La estructura activa filtra TODA la operación, no solo la configuración** (desde 2026-06-24). Las grillas de
  **bitácoras, incidencias, excepciones, rondas, mis rondas, cambio de turno y el dashboard**, además de sus
  **KPIs y exportaciones** (CSV de bitácoras), muestran **solo** lo de la estructura activa. Cambia de estructura
  en el selector para ver la operación de otra. Si tu usuario está **acotado por alcance** y eliges una estructura
  donde no tienes nodos, las listas saldrán **vacías** (es lo correcto: nunca ves datos de un área ajena).
  *Excepción:* abrir un registro puntual por su enlace directo (p. ej. desde la **campanita** de avisos) funciona
  aunque sea de otra estructura, siempre que tu alcance te dé acceso a ese nodo —los enlaces no se rompen.
- **La «Estructura por defecto»** es la que ya existía antes de habilitar esta función: contiene **intactos**
  todos tus niveles, nodos, alcances, asignaciones de plantillas y calendarios previos. **No se puede eliminar.**
- Una estructura **no se puede eliminar si tiene nodos** (aunque estén dados de baja), porque arrastran
  historial (bitácoras, incidencias). Una estructura **solo con niveles** (sin nodos) sí se puede eliminar.
- Si tu usuario está **acotado por alcance**, verás solo las estructuras donde tienes algún nodo accesible. Un
  administrador sin restricción ve todas, incluidas las recién creadas aún sin nodos.

---

## Estructura organizacional ▸ Ciclo de vida: archivar y ordenar  [Configurador/Admin]

**Para qué sirve.** Gobernar el **estado** y el **orden** de tus estructuras sin perder información. Si una línea
o un negocio **deja de operar temporalmente**, en vez de borrarlo (lo que destruiría su historial) lo
**archivas**: desaparece del selector y de todos los listados operacionales, pero conserva intactos sus nodos,
bitácoras e incidencias y puedes **reactivarlo** cuando vuelva a operar. Además puedes **reordenar** las
estructuras para que aparezcan en el selector en el orden que tú quieras (las más usadas primero).

**Cómo se usa.**
1. Abre el selector de estructura activa (arriba a la derecha) y elige **«Gestionar estructuras…»**.
2. **Archivar:** en la fila de la estructura, pulsa el ícono de **archivar** (la caja). Queda marcada como
   *inactiva*, se atenúa en la lista y deja de aparecer en el selector y en las grillas operacionales. Su
   historial sigue ahí.
3. **Reactivar:** activa el interruptor **«Ver archivadas»** (arriba de la lista; aparece cuando hay alguna
   archivada), ubica la estructura y pulsa el ícono de **reactivar** (la caja con flecha). Vuelve a estar
   disponible de inmediato.
4. **Reordenar:** usa las **flechas ↑ / ↓** a la izquierda de cada estructura para subirla o bajarla. El nuevo
   orden se refleja al instante en el selector. La **«Estructura por defecto» va siempre primera** (no se mueve).

**Quién puede.** Archivar, reactivar y reordenar requiere el permiso de **gestión de niveles**
(`orglevel:manage`) — el mismo de crear/renombrar/eliminar estructuras. El backend siempre lo verifica.

**Importante.**
- **Archivar NO borra nada.** Una estructura archivada conserva todo su historial y **sigue siendo accesible por
  su enlace directo** (deep-link): si abres un registro suyo desde la campanita o un enlace guardado, funciona.
  Solo desaparece del selector y de los listados del día a día.
- **La «Estructura por defecto» no se puede archivar** (ni eliminar): es el ancla del sistema. Tampoco se puede
  archivar la **última estructura activa** (siempre debe quedar al menos una operativa).
- **Si archivas la estructura en la que estabas trabajando**, la app te lleva automáticamente a la estructura por
  defecto para que no quedes en un contexto vacío.
- Para **operar** en una estructura archivada primero debes **reactivarla** (el botón «Trabajar aquí» está
  deshabilitado mientras esté archivada).
- Archivar es la **alternativa no destructiva** a eliminar: por eso una estructura con historial de nodos no se
  puede borrar, pero sí archivar.

---

## Estructura organizacional ▸ Contexto visual y vista ejecutiva  [Configurador/Admin · Gerencia]

**Para qué sirve.** Cuando trabajas con **varias estructuras** (p. ej. Industrial, TI, Logística), dos riesgos
aparecen: (1) **registrar datos en la estructura equivocada** por no notar en cuál estás, y (2) que la **gerencia**
no tenga una mirada del conjunto sin ir estructura por estructura. Esta funcionalidad resuelve ambos: da a cada
estructura una **identidad visual propia** (color + ícono) con un **badge "Estás en: …" siempre visible**, y ofrece
una **vista ejecutiva «Panorama»** que consolida los indicadores de **todas** las estructuras a las que tienes
alcance, a la vez.

**Cómo se usa.**
1. **Dar identidad a una estructura.** En el selector de estructura activa (arriba a la derecha) → **«Gestionar
   estructuras…»** → edita una estructura. En **«Apariencia»** elige un **acento de color** (paleta de marca) y un
   **ícono**; una **vista previa** muestra cómo se verá el badge. Si dejas ambos en **«Auto»**, el sistema asigna un
   color/ícono estable derivado de la estructura (siempre el mismo). Guarda.
2. **Saber dónde estás.** El **badge "Estás en: <estructura>"** del topbar toma ese color e ícono. Si hay más de una
   estructura operable, el badge es además el **selector**: haz clic, **busca** por nombre y cambia de estructura;
   cada opción muestra su color/ícono.
3. **Ver el Panorama (gerencia).** En el menú lateral entra a **«Panorama»** (solo aparece si tienes el permiso).
   Verás los **totales consolidados** (incidencias abiertas, críticas, vencidas, SLA excedido) y una **tarjeta por
   estructura** con su identidad y sus indicadores. Una **barra comparativa** muestra las incidencias abiertas por
   estructura. Haz clic en cualquier tarjeta para **bajar al detalle**: te lleva a Incidencias ya filtrado por esa
   estructura.

**Quién puede.** Configurar color/ícono: quien administra la estructura (super-admin o delegado de ella). Ver el
**Panorama**: solo quien tenga el permiso **«Vista ejecutiva consolidada»** (`module:dashboard:cross-view`) — pensado
para perfiles **gerenciales**; los operadores siguen acotados a su estructura activa y no ven esta pantalla.

**Importante.**
- **El Panorama respeta tu alcance de datos.** Cruza la estructura activa (es la **única** pantalla que lo hace), pero
  **NO** salta tu alcance por nodo: un gerente **sin** recorte ve **todas** las estructuras; uno **acotado** a ciertos
  nodos ve **solo** las estructuras donde tiene acceso, y los números cuentan **solo sus nodos**. La seguridad por
  nodo sigue siendo la frontera.
- **El color no es libre:** se elige de una **paleta curada** de la marca para que siempre se vea profesional y con
  buen contraste en tema claro y oscuro. El ícono se elige de una lista cuidada.
- **«Auto» nunca queda sin identidad:** si no eliges nada, el color/ícono se derivan de forma estable de la estructura
  (no cambian entre sesiones), así que el contexto siempre es reconocible.
- **Primer alcance del Panorama:** hoy consolida **incidencias**. Otros módulos (bitácoras, rondas, turnos) se sumarán
  más adelante.

---

## Seguridad ▸ Alcance del rol (por nodo y por plantilla)  [Admin]

**Para qué sirve.** El "alcance de datos" limita **qué** ve cada persona: a qué **nodos** de la estructura
(áreas, plantas, equipos) y a qué **plantillas** tiene acceso. Hasta ahora ese alcance se definía persona por
persona; ahora también puedes definirlo **en el rol**, una sola vez, y se aplica a **todos** los que tengan ese
rol. Ejemplo: creas el rol "Analista TI" y lo acotas al subárbol **TI**; cualquier usuario al que le asignes ese
rol queda automáticamente limitado a TI, sin tener que tocar su ficha. Ahorra trabajo y evita olvidos al dar de
alta gente nueva.

**Cómo se usa.**
1. Ve a **Seguridad → Roles**, abre el rol (o créalo) y entra a la pestaña **Alcance**.
2. Verás dos sub-secciones independientes:
   - **Alcance por nodo** — marca en el árbol los nodos que el rol puede ver. El interruptor "incluye
     descendientes" extiende el acceso a todo el subárbol bajo cada nodo marcado.
   - **Alcance por plantilla** — marca las plantillas que el rol puede ver y usar.
3. Guarda. El cambio aplica de inmediato a todos los miembros del rol.

**Cómo se combina con el alcance del usuario.** El alcance efectivo de una persona es la **UNIÓN** de su alcance
propio (su ficha de usuario) **más** el de todos sus roles: gana el más amplio. Es decir, los alcances **suman**.
Ejemplo: si el usuario tiene en su ficha el nodo *Bodega* y su rol está acotado a *TI*, verá *Bodega* **y** *TI*.
Si **le quitas el rol**, pierde *TI* al instante y queda solo con *Bodega* (no hace falta reconfigurar nada: se
recalcula en vivo). El eje de **nodo** y el de **plantilla** son independientes y se combinan en "Y": para ver un
dato debes cumplir ambos (estar en un nodo permitido **y** que la plantilla esté permitida). **Dejar un eje vacío
= sin restricción en ese eje** (lo ve todo en esa dimensión).

**Quién puede.** Configurar el alcance del rol requiere el permiso de **gestión de roles** (`role:manage`), el
mismo que ya gobierna crear/editar roles y sus permisos. La autorización siempre la decide el servidor: la
interfaz solo refleja lo que el backend permite.

**Importante.**
- El alcance del rol **respeta la estructura activa**: el árbol que ves al asignar nodos es el de la estructura
  seleccionada en el shell.
- Define alcance en el **rol** cuando varias personas comparten el mismo recorte (es lo mantenible); reserva el
  alcance **por usuario** para excepciones individuales.
- Como los alcances **suman**, no uses un rol acotado esperando que *restrinja* a alguien que ya tiene acceso más
  amplio por otro rol o por su ficha: para reducir, debes recortar **todas** las fuentes de su alcance.
- Un rol **sin** alcance por nodo no aporta restricción: sus miembros no ganan ni pierden nodos por él.

---

## Seguridad ▸ Administración delegada por estructura  [Admin]

**Para qué sirve.** Cuando tienes **varias estructuras** (p. ej. departamentos Industrial, TI y Logística, cada
uno con su propia jerarquía), no siempre quieres que un administrador pueda tocarlas **todas**. La administración
delegada te deja decir: *"este rol (o esta persona) administra **solo** la estructura TI"*. Esa persona podrá crear
y editar nodos, configurar niveles y archivar/renombrar **su** estructura, pero **no** las demás. El **administrador
general** (super-admin) sigue administrándolo todo y es quien reparte las delegaciones. Es la diferencia entre "el
dueño del sistema" y "el líder de cada área".

Ojo: esto es distinto del **alcance de datos** (§ Alcance del rol). El alcance dice *qué datos VE* una persona; la
administración delegada dice *qué estructura puede CONFIGURAR*. Son ejes separados: puedes delegar administrar TI sin
darle acceso a ningún dato operacional, y viceversa.

**Cómo se usa.**
1. Entra como **administrador general** (quien tiene el permiso "Administrar la estructura organizacional").
2. **Por rol** (lo recomendado): **Seguridad → Roles**, abre el rol → pestaña **Alcance** → sección **"Administración
   delegada de estructuras"**. Marca las estructuras que sus miembros podrán administrar. Guarda.
3. **Por persona** (excepciones): **Seguridad → Usuarios**, abre la ficha → pestaña **Alcance** → sección
   **"Administración delegada de estructuras"**. Marca las estructuras y guarda.
4. El delegado, al entrar al selector de estructuras (ícono de estructura en el encabezado), verá **su** estructura
   —aunque todavía no tenga nodos— y podrá empezar a armarla. Los botones de administrar aparecen **solo** en las
   estructuras que tiene delegadas.

**Qué puede hacer cada quién.**
- **Administrador general (super-admin):** todo — crear estructuras nuevas, reordenar el selector, eliminar, y
  administrar cualquier estructura. Es también quien delega.
- **Administrador delegado de la estructura X:** dentro de X, crear/editar/mover nodos, configurar niveles, y
  renombrar/archivar/reactivar X. **No** puede crear estructuras nuevas, reordenar el selector global ni eliminar
  estructuras (son actos del super-admin), y **no** puede tocar ninguna estructura que no tenga delegada (recibe un
  aviso de "sin permiso" si lo intenta).
- **Leer** la estructura de otra área sigue rigiéndose por el alcance de datos normal: la delegación restringe
  **configurar**, no mirar.

**Quién puede.** Repartir delegaciones requiere el permiso **"Administrar la estructura organizacional"**
(`module:structure:manage`), que es la marca del **administrador general**. Si no lo tienes, verás las delegaciones
en modo **solo lectura**. La autorización siempre la decide el servidor.

**Red anti-bloqueo (por qué nunca te quedas sin administrador).** El sistema impide, por diseño, las tres formas de
"quedarse sin nadie que administre todo": (A) no se pueden **modificar los permisos** del rol de sistema
"Administrador"; (B) no se puede **quitar** ese rol al **último** administrador; (C) no se puede **deshabilitar** al
**último** administrador activo. En esos casos la acción se rechaza con un mensaje claro y no ocurre nada. Así, por
error o a propósito, siempre queda al menos una cuenta capaz de administrarlo todo.

**Importante.**
- La delegación se evalúa **en vivo**: si le quitas a un rol/usuario una estructura, pierde su administración al
  instante (igual que el alcance de datos).
- Como un usuario hereda las delegaciones de **todos** sus roles **más** las propias (se **suman**), para retirarle
  la administración de una estructura debes quitarla de **todas** sus fuentes.
- **Cierra un problema previo:** un administrador acotado ahora ve y puede armar una estructura **recién creada
  aunque todavía no tenga nodos** (antes la administración se deducía de los nodos, así que una estructura vacía era
  invisible para él).
- El backend es la fuente de verdad: aunque la interfaz oculte o deshabilite un botón, cualquier intento de
  administrar una estructura no delegada se rechaza en el servidor.

---

## El espacio de trabajo ▸ Menú lateral  [todos]

**Para qué sirve.** El menú lateral izquierdo es el mapa del sistema: lleva a cada módulo. Como
WatchLog tiene muchos módulos, el menú está **organizado en grupos con encabezado** para que se
encuentre todo de un vistazo, sin una lista interminable ni scroll. Los grupos siguen el ciclo de
trabajo: lo que se usa a diario arriba, lo que se configura en medio, lo de administración abajo.

**Cómo se usa.**
1. **Grupos.** El menú se divide en tres grupos fijos:
   - **Operación** (el día a día): Inicio · Bitácoras · Nueva entrada · Mis rondas · Incidencias · Excepciones.
   - **Diseño y datos** (cómo se arma el sistema): Plantillas · Flujos · Datos de referencia · Estructura ·
     Programación de rondas · Calendario operacional · Calendario fiscal.
   - **Administración** (gobierno del sistema): Seguridad · Notificaciones · Configuración.
2. **Plegar / desplegar un grupo.** Haz clic en el **encabezado del grupo** (Operación, Diseño y datos…)
   para plegarlo o desplegarlo. El sistema **recuerda** qué grupos dejaste plegados entre sesiones.
   El grupo del módulo en el que estás trabajando **se muestra siempre**, aunque lo tengas plegado.
3. **Colapsar el menú a íconos.** El botón `‹` arriba del menú lo reduce a un **riel de solo íconos**
   (más espacio para el contenido). En ese modo los grupos se separan con líneas sutiles y cada ícono
   muestra su nombre al pasar el mouse. El botón `›` lo vuelve a expandir.
4. **Favoritos (accesos rápidos).** Para fijar un módulo, pasa el mouse sobre su ítem en el menú lateral y
   haz clic en la **estrella**. Tus favoritos se consultan desde el **menú-estrella de la barra superior**
   (arriba a la derecha, junto a la campanita): ábrelo para **ir** a cualquiera con un clic, o **quítalo**
   tocando su estrella en la lista. La estrella de la barra aparece rellena cuando tienes al menos uno.

**Quién puede.** Todos los usuarios ven el menú; **cada quien ve solo los módulos para los que tiene
permiso** (un grupo del que no tienes ningún módulo visible simplemente no aparece). La organización en
grupos, el plegado y el modo riel son **preferencias personales** de tu navegador, no afectan a nadie más.

**Importante.**
- El menú **oculta** lo que no puedes ver, pero la autorización real la decide siempre el servidor.
- Plegar un grupo no "apaga" nada: es solo presentación. Los módulos siguen accesibles desde la
  búsqueda **⌘K / Ctrl+K** y desde Favoritos.
- Tus favoritos y el estado de los grupos viven en este equipo/navegador; en otro equipo parten del
  estado por defecto (todos los grupos desplegados).

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

## Notificaciones ▸ La campanita (notificaciones in-app)  [todos]

**Para qué sirve.** Es la **campanita 🔔 de la barra superior**: te avisa **dentro de la
aplicación** cuando pasa algo que te toca (los mismos sucesos del correo: ronda vencida,
SLA incumplido, transición de flujo, firma pendiente), sin depender de que abras tu correo.
Cada aviso llega **a ti** con estado **leído / no leído**, y la campanita muestra un
**contador de no leídas** que se actualiza **en tiempo real** (apenas ocurre el aviso,
aparece). Es **tuya**: solo ves tus propias notificaciones.

**Cómo se usa.**
- **El contador.** Si tienes notificaciones sin leer, la campanita muestra un **número**
  (hasta «99+»). Aparece solo, sin recargar la página.
- **El desplegable.** Haz clic en la campanita para ver tus **últimas notificaciones**
  (asunto + un extracto + hace cuánto). Una notificación **no leída** se marca con un
  **punto**.
- **Abrir una.** Haz clic en una notificación: te **lleva directo** a lo que la originó
  (la **bitácora/entrada**, tus **rondas**, la **incidencia**) y la marca como leída.
- **Marcar todas como leídas.** Botón en la cabecera del desplegable (vacía el contador).
- **Ver todas.** El enlace «Ver todas» abre tu bandeja completa en **Mis notificaciones ▸
  Bandeja**, con filtro **Todas / No leídas**, búsqueda y paginación; ahí también puedes
  marcar una o todas como leídas.
- **¿Quieres recibir menos?** En **Mis notificaciones ▸ Mis preferencias** puedes apagar
  un tipo de aviso **por canal**: columna **En la app** (la campanita) y columna **Correo**,
  de forma independiente. Por defecto ambos están activados.

**Quién puede.** **Cualquier usuario autenticado**: la campanita y la bandeja son **datos
propios** (no requieren ningún permiso). Nunca ves las notificaciones de otra persona.

**Importante.**
- La campanita **no reemplaza al correo**: por defecto recibes **ambos** (puedes silenciar
  cualquiera de los dos por evento en *Mis preferencias*). Apagar el correo **no** apaga la
  campanita, y viceversa.
- Solo recibes avisos de **lo que podrías ver** (mismas reglas de acceso por nodo/plantilla
  que el correo). Los **destinatarios externos** (correos de contratistas/autoridades) **no**
  tienen campanita: eso es solo correo.
- Las notificaciones **leídas** se conservan un tiempo y luego se **limpian automáticamente**
  (no se acumulan para siempre).
- El tiempo real usa una conexión ligera del navegador; si tu red la bloquea, la campanita
  **igual se actualiza** sola cada cierto tiempo (un poco más lento, pero no se pierde nada).

**Caso de uso — paso a paso (un supervisor recibe y atiende un aviso en la campanita).**
1. Marta (supervisora) está trabajando en otra pantalla de Lyra WatchLog.
2. Un operador **sella una entrada** que, por el flujo, **avanza a un estado** del que Marta
   es responsable.
3. En segundos, la **campanita** de Marta muestra **«1»** (sin que ella recargue).
4. Marta hace clic en la campanita: ve **«Transición de flujo · Bitácora #1234 → Revisión
   del supervisor»**, con un punto de no leída.
5. Hace clic en la notificación: la app la **lleva a la entrada #1234** y la notificación
   queda **marcada como leída** (el contador baja a 0).
6. Más tarde quiere repasar lo que llegó hoy: abre el menú de su perfil ▸ **Mis
   notificaciones**, pestaña **Bandeja**, filtra **No leídas**, y con **«Marcar todas como
   leídas»** deja su bandeja al día.
7. Como prefiere no duplicar por correo, entra a **Mis preferencias** y, en la fila
   *Transición de flujo*, **apaga la columna Correo** dejando **En la app** encendida: desde
   ahora ese aviso le llega **solo por la campanita**.

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
  pestaña *Mis preferencias* en Notificaciones): un interruptor **por tipo de aviso y por
  canal** — columna **Correo** y columna **En la app** (la campanita) — para **activarlo o
  silenciarlo** de forma independiente. Por defecto recibes todos los que te corresponden,
  por ambos canales.
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
- Para **avisos a la medida** (qué transición avisa, a quién, con qué texto y con datos del
  propio registro) ve la sección siguiente, **Avisos a la medida**.

---

## Notificaciones ▸ Avisos a la medida  [Configurador de flujos · Admin de plantillas]

**Para qué sirve.** Adapta los avisos a la realidad de **cada bitácora y cada flujo**, en vez
de mandar siempre el mismo correo a los mismos roles. Tiene tres piezas: (1) decides **en qué
transición** del flujo se avisa y **a quién**; (2) creas **plantillas de mensaje propias de una
bitácora** (texto distinto para «Bitácora de Turno» que para «Permiso de Trabajo»); y (3) en esas
plantillas insertas **datos del propio registro** como comodines (p. ej. el valor de un campo).
Es el patrón de los grandes (ServiceNow, Jira Automation, SAP/Maximo): aviso disparado por
transición, con lista de destinatarios y plantilla con sustitución de campos.

**Cómo se usa — configurar el aviso de una transición.**
1. Entra a **Flujos**, abre el flujo y **edítalo** (si está publicado, "Editar" crea un borrador).
2. Despliega la **transición** que quieres (p. ej. «Enviar a aprobación»).
3. Activa **"Notificar en esta transición"**. Se abre el editor de destinatarios:
   - **Roles** y **Usuarios específicos** — elige de la lista (se avisa a los miembros del rol
     EN VIVO; reasignar el rol re-enruta los avisos).
   - **Según la entrada** — marca **Autor de la entrada**, **Quien ejecuta la transición** y/o
     **Roles del estado destino** (este último es la conducta clásica de aviso por transición).
   - **Correos externos** — escribe un correo y Enter para agregarlo como **chip**. ⚠️ Ojo: los
     externos **saltan los permisos y el alcance** (cualquiera en la lista recibe el aviso) y
     **cada envío queda auditado**.
   - **Plantilla** — déjala en **Automática** (usa la específica de la bitácora y, si no hay, la
     genérica) o elige una concreta.
4. ¿Varias transiciones con los mismos destinatarios? Usa **"Copiar destinatarios de…"** y elige
   otra transición ya configurada: copia roles, usuarios, marcas y externos de un saque.
5. **Guarda el borrador** y **Publica**. La regla de destinatarios queda **congelada** en esa
   versión del flujo (como la firma o los roles): las entradas que ya usan una versión anterior
   no cambian.

**Cómo se usa — crear una plantilla por bitácora con comodines de campo.**
1. Entra a **Notificaciones ▸ Plantillas** y aprieta **"Nueva plantilla"**.
2. Elige el **evento** (p. ej. «Transición de flujo»), la **bitácora** y el **idioma**. Guarda:
   se abre el editor.
3. En el editor, redacta **asunto y cuerpo**. A la derecha tienes el **diccionario**: las
   variables del evento (p. ej. `{{entry.folio}}`), `{{entry.summary}}` y —porque la plantilla
   está atada a una bitácora— una sección **"Campos de la bitácora"** con un comodín por cada
   campo (`{{campo.<clave>}}`). Haz clic para **insertarlo donde está el cursor**.
4. **Guarda**. Desde ahora, los avisos de ese evento **para esa bitácora** usan tu plantilla; el
   resto sigue con la genérica. En la lista, la columna **Ámbito** muestra «Por defecto»
   (genérica) o el **nombre de la bitácora** (específica). Puedes **borrar** las específicas; la
   genérica/del sistema no se borra.

**Cómo se usa — el comportamiento por defecto (Admin).** En **Configuración ▸ Notificaciones**
hay un interruptor: **"Las transiciones sin configuración avisan a los roles del estado destino"**.
Activado (por defecto), una transición que **no** definió su aviso se comporta como antes; apagado,
una transición sin configurar **no** notifica.

**Quién puede.** Configurar el aviso de una transición = permiso de **gestionar flujos**
(`workflow:manage`). Crear/editar/borrar plantillas = **administrar plantillas de notificación**
(`notiftemplate:manage`). El interruptor de comportamiento por defecto = **gestionar
configuración** (`settings:manage`).

**Importante.**
- Los destinatarios se resuelven **en el servidor respetando permisos**: un rol/usuario solo
  recibe el aviso si tiene acceso al registro. La **única excepción** son los **correos externos**,
  que por diseño saltan ese control (por eso van marcados y auditados).
- Si un **campo** usado como comodín no existe en la versión congelada del registro, el comodín
  se reemplaza por **vacío** (no rompe el envío).
- La configuración de la transición **viaja con la versión del flujo**: editar el flujo y
  republicar afecta a las entradas nuevas; las existentes conservan la regla con que nacieron.

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

## Configuración ▸ Inteligencia Artificial  [Admin]

**Para qué sirve.** Decide **qué motor de IA** usa Lyra WatchLog y **dónde corre**. Hoy la
IA potencia el **resumen de turno**; mañana, más capacidades. Antes esto vivía solo en
variables de entorno; ahora se administra desde la app y **se aplica sin reiniciar**. Puedes
elegir entre **no usar IA**, usar **Anthropic (en la nube)**, o un **modelo local** (Ollama,
vLLM…) que mantiene **los datos dentro de tu planta**.

**Cómo se usa.** En **Configuración ▸ Inteligencia Artificial**:
1. Elige el **proveedor**:
   - **Ninguno (sin IA):** el resumen de turno se arma de forma **determinista** (es el modo
     por defecto y siempre disponible).
   - **Anthropic (nube):** pega tu **API key** (se guarda **cifrada** y nunca se vuelve a
     mostrar) y, si quieres, el modelo (por defecto `claude-opus-4-8`).
   - **Local / OpenAI-compatible:** indica la **URL del endpoint** (p. ej. Ollama en
     `http://localhost:11434/v1`) y el **modelo** (p. ej. `qwen2.5:7b-instruct`). Un endpoint
     local **no requiere clave** y **los datos no salen de tu red**.
2. Activa el interruptor **Activar IA**.
3. Pulsa **Probar**: hace una **generación real corta** contra el proveedor del formulario (sin
   guardar) y te muestra la **respuesta y la latencia**, o el **error exacto** si algo falla.
4. **Guardar configuración**.

Luego, en **Cambio de turno**, el supervisor saliente verá el botón **"Generar con IA"** junto
al resumen: lo genera con el proveedor configurado, queda marcado **"generado por IA · revisar"**,
y **el resumen determinista (crudo) sigue visible al lado** para contrastar. El supervisor lo
**revisa, lo edita si quiere y lo firma él** (la IA nunca firma). Si la IA no está disponible o
falla, el sistema **cae automáticamente al resumen determinista** con un aviso — nunca se rompe.

**Quién puede.** Solo quien tenga el permiso **`ai:config`** (configurar la IA y probar). Es un
permiso aparte; sin él, el tab no aparece.

**Importante.**
- La **API key se guarda cifrada** y la aplicación **nunca** la devuelve (solo indica si hay una
  clave configurada). Déjala vacía para conservar la guardada.
- **On-premise / sin fuga:** con el proveedor **local**, el contenido del resumen **no sale de la
  planta**. Solo el proveedor **Anthropic** (o un endpoint remoto) envía ese contenido a la nube.
- El resumen por IA usa **solo los datos del turno** (lo que ves en el cockpit); no inventa cifras
  ni consulta fuentes externas. Toda cifra es rastreable al crudo de al lado.
- Si nunca guardas la config aquí, el sistema usa las **variables de entorno** (`.env`) como
  respaldo — la pantalla indica si la config actual viene «del sistema» o «del .env».

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

**Caso de uso — falla de equipo en planta (con verificación).**
1. Una bitácora reporta vibración alta en la bomba P-101 → se abre la incidencia **INC-0042**
   (tipo *Mantenimiento*; ese tipo está configurado para **exigir CAPA**).
2. El supervisor abre el detalle y crea **dos acciones**:
   - *Correctiva* — «Reemplazar rodamiento de P-101», responsable Juan Pérez, plazo mañana,
     marcada **Obligatoria**.
   - *Preventiva* — «Agregar P-101 a la ronda de vibraciones semanal», marcada **Obligatoria**.
3. El equipo trabaja la incidencia y la lleva hasta *En verificación*. Intenta **Cerrar** →
   el sistema lo **impide**: «No se puede cerrar: 2 acciones obligatorias sin completar».
4. Juan reemplaza el rodamiento y pulsa **«Completar»** con la nota «Rodamiento SKF cambiado,
   OT-3391». La acción queda *Realizada*. Hace lo mismo con la preventiva.
5. Intenta cerrar otra vez → **sigue bloqueado**: como el tipo exige CAPA, las acciones deben
   **verificarse**, no solo realizarse.
6. El ingeniero de confiabilidad (que tiene el permiso de **verificar**, distinto del que las
   ejecutó) abre cada acción, pulsa **«Verificar»** y marca **Eficaz** («vibración en rango tras
   72 h»). Las acciones quedan *Verificadas*.
7. Ahora **«Cerrar incidencia»** funciona. Todo el recorrido (quién creó/completó/verificó cada
   acción y cuándo) queda en el **timeline**.

> En un tipo que **no** exige CAPA (p. ej. *Operacional*), bastaría con **«Completar»** las
> acciones obligatorias para poder cerrar; la verificación es opcional. Y si al verificar se marca
> **«No eficaz»**, la acción se **reabre** y vuelve a bloquear el cierre hasta resolverse de verdad.

### Incidencias ▸ Reportabilidad (reportes a autoridades / obligaciones)

**Para qué sirve.** Muchas incidencias obligan a **avisar a una autoridad u obligación** (un
organismo regulador, una gerencia, un cliente por contrato) dentro de un **plazo**. La
reportabilidad lleva ese deber dentro de la incidencia: **qué** reportes corresponden, **a
quién**, con qué **plazo**, en qué **estado** (pendiente / enviado / no aplica), y guarda la
**evidencia del envío** (el folio que entrega la autoridad). Es **configurable** y **transversal**:
los marcos concretos de tu industria los defines tú como **obligaciones** (no vienen "cableados").

**Cómo se usa.**
- **Obligaciones (catálogo).** Un administrador define las obligaciones en **Incidencias ▸
  Catálogos ▸ Obligaciones de reporte**: nombre, **autoridad**, **plazo por defecto**, a **qué
  tipos** de incidencia aplica (vacío = todos) y desde **qué severidad**, y si es **obligatoria**
  (las obligatorias bloquean el cierre hasta resolverse).
- **Se materializan solos.** Cuando creas una incidencia de un **tipo reportable** (o marcada
  reportable), el sistema **agrega automáticamente** los reportes de las obligaciones que aplican
  (por tipo y severidad), cada uno con su plazo. En el detalle, pestaña **Reportes**, los ves con
  su folio (REP-####), autoridad, plazo y estado.
- **Pestaña Reportes (en el detalle de la incidencia).** Puedes **Re-derivar** (volver a calcular
  los aplicables si cambió la severidad), **Agregar** uno manualmente, **Marcar enviado**
  (registras el **folio externo** y la fecha), **No aplica** (con motivo, si tras revisar no
  corresponde) o **Anular** (con motivo, si se materializó por error). Nada se borra: todo queda
  en la actividad de la incidencia.
- **Plazo y "vencido".** Un reporte **pendiente** cuyo plazo ya pasó se muestra en **rojo** como
  **vencido**. En la lista de incidencias hay un indicador **«Reporte vencido»** clicable y un
  filtro del mismo nombre, para ubicar de un vistazo lo que está fuera de plazo.

**Quién puede.** Ver los reportes: cualquiera con acceso a incidencias (`incident:view`). Gestionar
los reportes de una incidencia (enviar, marcar no aplica, anular, agregar): quien puede **editar
incidencias** (`incident:edit`). Administrar el **catálogo de obligaciones**: el administrador de
catálogos (`incidentcatalog:manage`). El alcance por nodo de la incidencia se aplica siempre.

**Importante.**
- **Una obligación OBLIGATORIA pendiente bloquea el cierre** de la incidencia. Para cerrar, debes
  **enviar** el reporte (registrando su folio) o marcarlo **«No aplica»** con motivo. Las
  obligaciones **no obligatorias** solo avisan, no bloquean.
- **Es configuración, no código.** Los reportes que existen y a quién se envían dependen 100% de
  las **obligaciones** que definas. Las de ejemplo que vienen sembradas están marcadas «(ejemplo)»:
  edítalas o créalas según tu marco real.
- **El aviso de "por vencer / vencido"** (recordatorio por correo) llega en una fase posterior
  (notificaciones avanzadas); por ahora el plazo y el estado **vencido** se ven en pantalla.
- **Trazabilidad.** El nombre de la autoridad y la obligatoriedad quedan **fijados** en el reporte
  al materializarse: cambiar el catálogo después no altera lo ya registrado (integridad histórica).

**Caso de uso paso a paso (evento grave reportable):**
1. Como administrador, en **Incidencias ▸ Catálogos ▸ Obligaciones de reporte** revisa que exista
   (o crea) una obligación **«Reporte a la autoridad — evento grave»**: autoridad *Autoridad
   competente*, plazo **24 h**, aplica a **todos los tipos**, **severidad ≥ 4**, **Obligatoria**.
2. Un supervisor **reporta una incidencia** de un tipo reportable con **severidad 5**. Al guardarla,
   en la pestaña **Reportes** aparece ya un reporte **REP-0001** *Pendiente*, plazo dentro de 24 h.
3. El equipo trabaja la incidencia (acciones, investigación). Al intentar **«Cerrar incidencia»**,
   el sistema **lo impide**: «1 reporte obligatorio sin enviar».
4. El responsable presenta el aviso a la autoridad y, en la pestaña Reportes, pulsa **«Marcar
   enviado»**, anota el **folio FOLIO-2026-123** y la fecha → el reporte queda **Enviado**.
5. Ahora **«Cerrar incidencia»** ya no se bloquea por reportabilidad (si el tipo además exige CAPA o
   investigación, esos deberán estar resueltos también). La incidencia cierra con todo su rastro:
   quién envió el reporte, cuándo y con qué folio.
6. Si otra incidencia generó un reporte que tras revisar **no corresponde**, en vez de enviarlo se
   usa **«No aplica»** con un motivo (p. ej. «Evento bajo el umbral reportable»): también desbloquea
   el cierre y queda auditado.

### Catálogos de incidencias (tipos y categorías)

**Para qué sirve.** Los **tipos** (p. ej. Seguridad, Equipos, Medio ambiente) y las
**categorías** (p. ej. Cuasi-accidente, Derrame) son las listas que eliges al reportar una
incidencia. Este mantenedor te deja crearlas y ajustarlas **sin tocar la base de datos**: un
tipo define su **flujo por defecto**, su **color**, y si las incidencias de ese tipo
**requieren investigación / CAPA / son reportables** por defecto.

**Cómo se usa.**
- Entra a **Incidencias** y pulsa **«Catálogos»** (arriba a la derecha; solo visible para
  administradores). También llegas por `/incidencias/catalogos`.
- Cambia entre las pestañas **Tipos**, **Categorías** y **Obligaciones de reporte**. Cada una
  tiene **buscador**, filtro **Activos/Inactivos** y **orden**, con paginación arriba y abajo.
  (La pestaña **Obligaciones de reporte** alimenta la reportabilidad; ver «Incidencias ▸
  Reportabilidad».)
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
- En un **tipo** puedes configurar además el **plazo de resolución (SLA)** y el **escalamiento**
  (ver «Incidencias ▸ Plazos y avisos (SLA)»).

---

### Incidencias ▸ Plazos y avisos (SLA)

**Para qué sirve.** Que cada incidencia tenga un **plazo de resolución claro** y que el sistema
**avise solo** cuando algo se está pasando de tiempo, por **correo y por la campanita**, sin que
nadie tenga que estar revisando. Cubre cuatro vencimientos:
- **Plazo de la incidencia** — la incidencia sigue abierta después de su fecha comprometida.
- **Permanencia en un estado** — lleva demasiado tiempo en el mismo paso del flujo (SLA de estado).
- **Acción CAPA vencida** — una acción correctiva/preventiva pasó su plazo.
- **Reporte por vencer** — un reporte a una autoridad no se ha enviado y venció su plazo.

**Cómo se usa.**
- **Definir el plazo automático (administrador).** En **Incidencias ▸ Catálogos ▸ Tipos**, al
  crear o editar un tipo, indica el **«Plazo de resolución (SLA)»** (en minutos, horas o días).
  Desde entonces, cada incidencia nueva de ese tipo nace con su **fecha de plazo calculada**
  (momento de creación + ese tiempo). Vacío = sin plazo automático.
- **Ajustar el plazo de una incidencia.** En el detalle de la incidencia, pestaña **Resumen**,
  el **«Plazo de resolución»** se puede **editar** (botón *Editar*). El cambio queda registrado
  en la actividad de la incidencia. Un plazo puesto a mano **manda** sobre el automático.
- **Configurar el escalamiento (administrador).** En el mismo tipo, define **«Escalar tras el
  plazo»** (cuánto tiempo después de vencido) y el **«Rol de escalamiento»** (a quién avisar
  además). Si una incidencia sigue vencida pasado ese tiempo, el aviso de plazo va **también**
  a ese rol superior.
- **Recibir los avisos.** Llegan por **correo** y por la **campanita** del topbar (según tus
  preferencias en *Mis notificaciones*). El aviso de plazo se **repite a diario** mientras la
  incidencia siga vencida; el de permanencia se manda una vez por cada vez que entra al estado.
- **Encontrar lo vencido.** En **Incidencias**, los recuadros (KPI) **«Plazo vencido»** y
  **«Permanencia excedida»** son clicables y filtran la lista; también están en el filtro
  desplegable. En la lista y el tablero, cada incidencia muestra una etiqueta **«Plazo vencido»**
  y/o **«Permanencia»** cuando corresponde.

**Quién puede.** Configurar el plazo/escalamiento de un tipo exige permiso de **catálogos de
incidencias**; **editar el plazo** de una incidencia exige permiso de **edición de incidencias**.
Los avisos llegan a quien corresponde según su rol y lo que puede ver (nunca se avisa de algo
fuera de su alcance). Recibir avisos no exige permiso especial: se ajusta en *Mis notificaciones*.

**Importante.**
- **«Plazo vencido» y «Permanencia excedida» son cosas distintas:** el primero es la fecha de
  resolución comprometida (el plazo de la incidencia); el segundo es llevar demasiado tiempo en
  un mismo estado del flujo. Se muestran y se filtran por separado.
- El plazo automático usa la **fecha de creación** (cuándo se reportó), no la fecha del evento.
- El escalamiento es a **un nivel** (un rol superior). Avisa **además** del responsable, no en
  vez de él.

---

### Incidencias ▸ Dashboard

**Para qué sirve.** Es la pantalla de **análisis** del módulo: en vez de buscar incidencia por
incidencia, muestra **tendencias e indicadores de gestión** del periodo que elijas —cuántas se
abren y se cierran en el tiempo, cuánto se demora en resolverlas (MTTR), qué tipos concentran el
problema (Pareto 80/20), en qué nodos/equipos/turnos ocurren más, cuántas se reportan tarde y si
las acciones correctivas están al día. Sirve para reuniones de seguridad/operación, para detectar
**reincidencias** (el mismo equipo fallando una y otra vez) y para rendir cuentas con datos.

**Cómo se usa.**
1. Entra a **Incidencias** y pulsa **«Dashboard»** (arriba a la derecha).
2. Arriba eliges el **rango de fechas** («Desde» / «Hasta», por defecto los últimos 90 días) y,
   si quieres acotar, **tipo**, **severidad** u **origen**. Todo se recalcula al instante.
3. Lee los **recuadros (KPI)**: creadas y cerradas en el periodo, abiertas/críticas ahora, plazo
   vencido y permanencia excedida, **MTTR** (horas promedio de resolución), **cumplimiento de SLA**
   (% cerradas dentro de plazo), CAPA abiertas/vencidas y su **eficacia**, y reportes pendientes/
   vencidos.
4. Mira los **gráficos**: la **tendencia** de creación vs. cierre en el tiempo, el **Pareto por
   tipo**, la **dona por severidad**, y barras por **nodo / origen / equipo / turno**. Abajo, una
   tabla de **reincidencia** (mismo tipo + equipo repetido en la ventana).
5. **Clic para filtrar (drill-down):** al hacer clic en una barra, un segmento o un KPI, saltas a
   la lista de **Incidencias** ya filtrada por eso (con el mismo rango de fechas), para ver el
   detalle de esas incidencias.
6. **«Exportar CSV»** descarga todas las tablas (indicadores, distribuciones, tendencia,
   reincidencia) para abrirlas en Excel o adjuntarlas a un informe.

**Quién puede.** Cualquiera que pueda **ver incidencias**. El dashboard respeta tu **alcance**:
solo agrega y muestra incidencias de los **nodos que tienes permitidos** —nunca verás datos de
áreas que no te corresponden.

**Importante.**
- Los KPI de **estado actual** (abiertas, críticas, plazo vencido, permanencia, CAPA, reportes)
  reflejan el **«ahora»** y no dependen del rango; los de **periodo** (creadas, cerradas, MTTR,
  cumplimiento, distribuciones, tendencia, reincidencia) sí se calculan dentro de las fechas
  elegidas.
- **MTTR** se mide de la creación al cierre; **cumplimiento de SLA** cuenta qué porcentaje de las
  cerradas terminó **dentro de su plazo**.
- Los **índices de frecuencia/gravedad (IF/IG)** todavía no están: requieren registrar las
  **horas-hombre trabajadas**, dato que el sistema aún no captura (está en el plan).

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

---

## Cambio de turno  [Supervisor saliente · Supervisor entrante]

**Para qué sirve.** La entrega de turno es uno de los momentos más críticos de la operación: si algo
queda sin comunicar entre el turno que sale y el que entra, se pierde (los accidentes de Texas City
y Piper Alpha empezaron así). Esta pantalla convierte la entrega en un **acto formal, firmado y
trazable**: el sistema **arma solo** el estado del turno (no hay que re-tipear nada), el supervisor
saliente **firma** lo que entrega, el entrante **revisa y reconoce** con su firma, y los **pendientes
ruedan** de un turno al siguiente hasta que se cierran. Nada se cae entre turnos.

**Cómo se usa.**
1. Entra a **Cambio de turno** en el menú (grupo *Operación*).
2. Elige tu **área (nodo)** en el selector de arriba. El sistema resuelve automáticamente **qué turno
   estás entregando** y su horario (según el calendario operacional del área) y **compila el cockpit**.
3. El cockpit tiene **tres zonas**:
   - **Izquierda — secciones:** Registros del turno · Excepciones · Incidencias · Acciones y reportes ·
     Rondas · **Pendientes**. Cada una muestra un número con lo ocurrido en tu turno y en tu área.
   - **Centro — el detalle** de la sección elegida (por ejemplo, las incidencias abiertas con su
     severidad y estado, o las lecturas fuera de umbral).
   - **Derecha — la entrega:** el turno que entregas → el que recibe, el **resumen** del turno
     (se genera solo; puedes editarlo y elegir el **estado general** al cierre), y el botón de firma.
4. En **Pendientes** agrega notas para el turno entrante ("reapriete de pernos en polín 14"). Los
   pendientes que escribiste y los objetos abiertos del área (incidencias, acciones, reportes)
   aparecen marcados; los que vienen del turno anterior se ven como **«Heredado»**.
5. Cuando esté listo, pulsa **«Firmar y entregar turno»**: confirma con tu **contraseña** (y MFA si tu
   cuenta lo tiene). Al firmar, **el contenido queda congelado** (ya no cambia) y el turno entrante
   recibe un **aviso** (correo + campanita).
6. **Para recibir el turno** (supervisor entrante): abre la entrega (desde el aviso de la campanita o
   el historial), revisa el resumen y los pendientes, marca **«Leí el resumen»** y **«Revisé los
   pendientes»**, anota observaciones si las hay, y pulsa **«Reconocer y recibir turno»** (de nuevo con
   tu firma). La entrega queda **Recibida** e inmutable.
7. La pestaña **Historial** lista las entregas anteriores de tu área (buscables y filtrables);
   ábrelas para tomar contexto. Son de **solo lectura**.

**Quién puede.** Ver y abrir el módulo: quien tenga *ver cambio de turno*. **Compilar y firmar la
entrega** (turno saliente) y **reconocerla** (turno entrante) son permisos **separados** (no es la
misma persona): el sistema **impide** que quien entregó reconozca su propia entrega. Cada quien ve y
entrega **solo las áreas de su alcance** (un supervisor de Flotación no ve ni recibe las de Molienda).

**Importante.**
- **El sistema arma la entrega, tú la certificas.** El resumen y las cifras salen de lo que ya
  registró el turno (entradas, excepciones, incidencias, rondas); revísalos antes de firmar.
- **Las dos firmas son electrónicas (Part 11):** piden re-autenticación y quedan registradas con su
  significado, quién y cuándo. No las hace el sistema por ti.
- **Una vez firmada, la entrega es inmutable** (foto congelada del turno) — es la evidencia de la
  continuidad operacional.
- **Los pendientes ruedan solos** hasta que se cierran: no dependen de que alguien los recuerde.
- **La pantalla se acomoda a ti:** arrastra los **divisores** entre las tres zonas para dar más espacio al listado o al resumen (doble-clic restablece; tu ajuste se recuerda). El **resumen** tiene un botón **"Ampliar"** que lo abre grande, con el resumen automático al lado para comparar. Y **cada ítem** (registro, excepción, incidencia, acción, ronda o pendiente) se **abre con un clic** en un panel lateral con todo su detalle y un acceso directo a su módulo de origen.
- **Generar el resumen con IA, EN VIVO.** El resumen se genera **determinista** por defecto, y —si un
  admin configuró la IA (Configuración ▸ Inteligencia Artificial)— puedes pulsar **"Generar con IA"** y
  ver el brief **escribirse palabra por palabra** sobre el panel (como en un chat). Mientras escribe,
  el botón cambia a **"Cancelar"** (puedes detenerlo y quedarte con lo que llevaba). Al terminar, el
  texto queda marcado **"generado por IA · revisar"**, el **crudo determinista sigue visible al lado**
  para contrastar cifra por cifra, y la **firma sigue siendo tuya** (la IA nunca firma). Si la IA falla
  o se corta, el sistema **reintenta sin streaming** y, si tampoco responde, usa el resumen
  determinista — nunca te deja sin resumen. Con un modelo **local**, los datos **no salen de la
  planta**; cuando el proveedor es de nube, los textos libres (correos, RUT, teléfonos) se **redactan**
  antes de enviarse.

### Descargar el acta de entrega (PDF)

**Para qué sirve.** Convierte una entrega **ya firmada** en un **documento portátil de grado
auditoría**: un PDF con la identidad Lyra, la foto congelada del turno, las **dos firmas
electrónicas**, el resumen tal como se firmó, los pendientes y un **folio + código de integridad**.
Es la evidencia que va a la **carpeta del regulador**, a una **auditoría ISO/HSE** o a un peritaje, y
que puedes **imprimir o adjuntar** sin depender de la app.

**Cómo se usa.**
1. Abre una entrega **firmada** (en el cockpit, una vez que la entregaste/reconociste, o desde el
   **Historial**).
2. Pulsa **"Descargar acta (PDF)"** (en el panel de la derecha del cockpit) o el **ícono de descarga**
   en la fila del historial. Verás "Generando acta…" un instante y el PDF se descargará con un nombre
   claro (p. ej. `acta-SH-0042-linea-sag-1-2026-06-19.pdf`).
3. Ábrelo, imprímelo o adjúntalo donde lo necesites.

**Quién puede.** Cualquiera que pueda **ver** esa entrega (mismo permiso que para abrirla), y siempre
**dentro de su alcance de áreas**: no puedes descargar el acta de un área que no te corresponde.

**Importante.**
- **Solo entregas firmadas.** Mientras la entrega está en preparación no hay acta (el botón no
  aparece): el documento oficial existe recién cuando hay firma y foto congelada.
- **Es fiel e inmutable.** El acta se arma del **snapshot congelado**, no de la vista en vivo; dos
  descargas de la misma entrega tienen el **mismo contenido y el mismo código de integridad** (hash) —
  así se verifica que el documento no fue alterado.
- **Trazable.** Cada descarga queda **registrada** (quién y cuándo). El acta lleva el **folio** y el
  **hash SHA-256** impresos para poder cotejarla.
- **Las firmas mandan; la IA nunca firma.** Si el resumen se generó con IA, el acta lo dice, pero la
  certificación es de las personas que entregaron y recibieron el turno. Si el entrante aún no
  reconoce, el acta lo indica como **"Pendiente de reconocimiento"**.
- **Se genera en el servidor, on-premise:** el documento no sale de tu instalación.
