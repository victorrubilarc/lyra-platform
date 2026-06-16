# FORM_GUIDE.md — Mapa de Capacidades del Formulario (Lyra WatchLog)

> **Qué es este documento.** Un mapa **vivo** y en **lenguaje simple** de TODO lo que el
> formulario puede hacer hoy: cada objeto que puedes poner en una bitácora, qué valida y
> cómo se usa, con ejemplos concretos de planta. No es el manual del usuario final
> (`USER_GUIDE.md`); este es para **entender el sistema a fondo** sin perderse.
>
> **Es VIVO:** cuando cambie un objeto o se agregue uno nuevo, esta guía se actualiza en la
> misma sesión (ver §0.3). Si encuentras algo que no calza con la app, **el código manda** y
> esta guía está desactualizada: avísalo.
>
> **Fuentes de verdad** (de dónde sale cada afirmación de aquí):
> - Tipos y configuración: `packages/contracts/src/templates/field-types.ts`
> - Validación / umbrales / obligatoriedad: `packages/contracts/src/log-entries/log-entries.ts`
>   (`validateFieldValue`, `thresholdBandFor`, `requiredFieldError`, `isEmptyValue`)
> - Motor de reglas: `packages/contracts/src/rules/*`
> - Paleta y render: `apps/watchlog-web/src/features/templates/` (`builder-model.ts`,
>   `FieldControl.tsx`, `FieldGrid.tsx`, `BuilderConfigPanel.tsx`, `ExpressionEditor.tsx`)

---

## 0. Cómo leer este mapa

### 0.1 La plantilla de 7 partes (se repite en CADA objeto)
- **• Qué es** — una frase.
- **• Para qué sirve** — con un ejemplo real de planta/terreno.
- **• Cómo se ve / cómo se usa** — qué hace el operador.
- **• Cómo se configura** — qué decide el diseñador de la plantilla.
- **• Qué valida** — qué acepta y qué rechaza (✅ válido / ❌ rechazado).
- **• Ejemplo de punta a punta** — con valores reales.
- **• Qué se le podría agregar** — 1–3 ideas concretas.

### 0.2 Tres palabras que se repiten (glosario express; el largo está en el Apéndice C)
- **Diseñador**: quien arma la plantilla (el "molde" de la bitácora) en el *builder*.
- **Operador**: quien llena la bitácora en terreno.
- **Umbral**: "luz de alerta" de un número (amarilla = advertencia, roja = crítico). **No
  rechaza el dato**; solo lo marca. Sigue la lógica de **ISA-18.2** (norma de alarmas de
  planta que define niveles alto/bajo y muy-alto/muy-bajo).
- **`code` vs `label`**: en las listas se **guarda un código estable** (`ok`) y se **muestra
  un texto** (`Operativo`). Así el reporte no se rompe si mañana cambias el texto visible.

### 0.3 Regla de doc vivo (para quien mantenga el sistema)
Cuando una sesión **agregue, cambie o elimine** un objeto del formulario, una opción de
configuración, una regla de validación o una capacidad transversal (layout, reglas,
condicional, gobernanza), **debe actualizar esta guía** en la misma sesión: la ficha del
objeto (7 partes), el índice y el Apéndice A. Es parte del cierre de sesión, igual que
`PROGRESS.md` / `BACKLOG.md` / `USER_GUIDE.md`.

---

## 1. El formulario de un vistazo

### 1.1 Las 3 capas de un campo
Cada campo son **tres cosas separadas** (para que la pantalla sea simple pero el dato sea serio):
1. **Cómo se ve** (`type`): el *widget* — una casilla de número, una lista, una firma…
2. **Cómo se guarda/valida/reporta** (`dataType`): se **deriva** del tipo, no lo elige el
   usuario. Ej.: una "Lista" se ve como desplegable pero se guarda como **código** reportable.
3. **Qué significa** (`semanticRole`, opcional): si un campo es "la fecha efectiva" del
   registro, la plataforma lo usa para fechar la entrada. Casi siempre vacío.

### 1.2 Render ÚNICO: builder = llenado = visor
El **mismo** componente dibuja el campo en los tres lados: cuando el diseñador lo arma, cuando
el operador lo llena y cuando alguien lo revisa después. Por eso **lo que ves en la vista
previa es exactamente lo que verá el operador**. No hay tres pantallas que se desincronicen.

### 1.3 Borrador vs. versión publicada
- El diseñador trabaja en un **borrador**. Al **publicar**, la estructura (campos, su
  configuración, reglas, posiciones) queda **congelada** en una **versión inmutable**: las
  entradas viejas siguen viéndose como cuando se llenaron (trazabilidad GxP).
- Hay cosas que **no** se congelan y se cambian "en vivo" sin republicar (la *gobernanza* de
  la plantilla: alcance, ventana de edición, qué columnas salen en la grilla…). Ver §4.1.

---

## 2. Catálogo de objetos

> Orden y nombres = **paleta real** del builder (categorías `Básicos · Selección · Evaluación
> · Referencia · Evidencia/Terreno · Estructurados · Presentación`).

---

## 2.1 Básicos

### Texto  *(paleta: «Texto»)*
- **• Qué es.** Una línea de texto corto.
- **• Para qué sirve.** *Planta:* anotar el N.º de OT (orden de trabajo) o un código de lote.
- **• Cómo se ve / se usa.** Casilla de una línea; el operador escribe. Si el diseñador puso
  mín./máx. de caracteres, aparece un **contador discreto** bajo la casilla ("Quedan 188"), que
  vira a **ámbar** si aún no llega al mínimo y a **rojo** si se pasa del máximo. Es una línea
  pequeña y atenuada, alineada a la derecha: **no invade** el formulario.
- **• Cómo se configura.** Texto de ayuda (placeholder), **Mín. caracteres** y **Máx.
  caracteres** (ambos en el panel del builder), **patrón** (una expresión regular para exigir un
  formato), una **máscara de entrada** que formatea al teclear (`#`=dígito, `A`=letra,
  `*`=alfanumérico, el resto literales; p. ej. `OT-#####` → `OT-04934`), y opcionalmente un
  **formato semántico** (RUT, correo, teléfono, URL — esos tienen ficha propia más abajo; si hay
  formato semántico, manda sobre la máscara). El diseño rechaza poner un mínimo mayor que el máximo.
- **• Qué valida.** Con `minLength=3, maxLength=10`: ✅ `OT-7788` · ❌ `AB` ("mínimo 3
  caracteres") · ❌ 11+ caracteres ("máximo 10 caracteres"). Si hay patrón y no calza →
  "formato inválido".
- **• Ejemplo.** Campo "N.º OT", min 3 / max 12 → el operador escribe `OT-` y ve "Quedan 9";
  al escribir `OT-2026-014` el contador llega a "Quedan 1" y el dato es válido.
- **• A futuro.** (1) Máscaras de entrada visuales; (2) autocompletar desde catálogos;
  (3) sugerencia/normalización a mayúsculas.

### Área de texto  *(paleta: «Área de texto»)*
- **• Qué es.** Texto largo de varias líneas.
- **• Para qué sirve.** *Planta:* describir una observación de ronda o un evento del turno.
- **• Cómo se ve / se usa.** Caja multilínea; el operador redacta. Igual que el Texto corto,
  muestra el **contador discreto** de caracteres ("Quedan N", ámbar bajo el mínimo, rojo sobre
  el máximo) cuando hay mín./máx. configurados.
- **• Cómo se configura.** Placeholder, **alto** (filas 2–20), **Mín. caracteres** y **Máx.
  caracteres** (hasta 20.000). El diseño rechaza un mínimo mayor que el máximo.
- **• Qué valida.** Con `minLength=20, maxLength=2000`: ✅ texto entre 20 y 2.000 · ❌ menos de
  20 ("mínimo 20 caracteres") · ❌ pasar el máximo ("máximo 2000 caracteres").
- **• Ejemplo.** "Observaciones del turno", 5 filas, mín 20 / máx 2.000 → relato del operador
  con el contador guiándolo.
- **• A futuro.** (1) Plantillas de texto; (2) formato enriquecido; (3) resumen con IA del relato.

### Número  *(paleta: «Número»)*  — objeto bandera
- **• Qué es.** Una casilla para un número, con unidad y "luces de alerta" opcionales.
- **• Para qué sirve.** *Planta:* temperatura del descanso del molino (normal 60–75 °C,
  preocupante >80, crítico >90).
- **• Cómo se ve / se usa.** Casilla numérica con la unidad al lado (`°C`). Si el valor cruza
  un umbral, el campo se pinta (amarillo/rojo) sin impedir guardar. **Formateo en vivo:** si el
  diseñador fija decimales, al **salir del campo** el número se muestra con separador de miles y
  los decimales regionales (`1.250.000,50`); mientras escribes se edita en plano. (Un número sin
  decimales configurados —año, folio— no se agrupa, para no mostrar "2.026".)
- **• Cómo se configura.** Unidad, **decimales**, **rango válido duro** (min/max, fuera de
  esto **rechaza**), y **umbrales** ISA-18.2 que **no rechazan** sino que marcan:
  `warnLow/warnHigh` (amarillo) y `critLow/critHigh` (rojo). **Genera excepción (Fase 4.1):**
  una lectura en **crítico** SIEMPRE materializa una **excepción operacional** (entidad con
  triage); una en **advertencia** solo si activas **`warnRaisesException`** en el campo (por
  defecto NO, para no inundar de excepciones). La banda efímera (badge en la grilla) sigue
  igual; esto es lo que la convierte en algo accionable. Igual en columnas/celdas de Tabla y Matriz.
- **• Qué valida.** Con `°C, min 0, max 120, 1 decimal, warnHigh 80, critHigh 90`:
  ✅ `72` (sin alerta) · ✅ `92` (válido, **marcado "alto crítico"** → la entrada entra a
  "Excepciones") · ❌ `130` ("por encima del máximo (120)") · ❌ `72,55` ("máximo 1 decimal") ·
  ❌ `caliente` ("debe ser un número").
- **• Ejemplo.** "Temp. descanso molino", `°C`, 0–120, warnHigh 80 / critHigh 90 → operador
  escribe `91.3` → guarda en rojo → en Bitácoras aparece con badge de excepción.
- **• A futuro.** (1) **Histéresis/banda muerta** (ISA-18.2) para que un valor que oscila no
  prenda/apague la luz; (2) unidad convertible (°C↔°F); (3) umbral que dependa del equipo/turno.

### Porcentaje  *(paleta: «Porcentaje» — es un Número con formato %)*
- **• Qué es.** Un número acotado a 0–100 que se muestra con `%`.
- **• Para qué sirve.** *Planta:* % de humedad del mineral, % de avance de tarea.
- **• Cómo se ve / se usa.** Casilla con sufijo `%`; al salir del campo muestra los decimales
  regionales configurados.
- **• Cómo se configura.** Igual que Número (decimales, umbrales), con `format=percent`.
- **• Qué valida.** ✅ `0`…`100` · ❌ `120` ("el porcentaje debe estar entre 0 y 100") ·
  ❌ `-5` (idem). Los umbrales y decimales aplican igual que en Número.
- **• Ejemplo.** "Humedad mineral", 0–100, warnHigh 12 → `14` queda marcado advertencia.
- **• A futuro.** (1) Permitir base ≠ 100 (fracciones); (2) mostrar como barra de progreso.

### Moneda  *(paleta: «Moneda» — Número con formato moneda)*
- **• Qué es.** Un número que representa dinero, formateado por **locale** (CLP por defecto).
- **• Para qué sirve.** *Planta:* costo estimado de un repuesto o de una detención.
- **• Cómo se ve / se usa.** Mientras escribes, número plano; al **salir del campo** se muestra
  con separador de miles y los decimales configurados (`1.250.000`), con el código de moneda al
  lado (CLP). Se guarda el número; el formato es solo presentación.
- **• Cómo se configura.** `format=currency`, código ISO de moneda (`currency`, default `CLP`),
  decimales, umbrales.
- **• Qué valida.** ✅ número válido (rango/decimales como Número) · ❌ no-número.
- **• Ejemplo.** "Costo detención", CLP → `1250000` se muestra `$ 1.250.000`.
- **• A futuro.** (1) Conversión de divisas; (2) separación de impuestos.

### RUT  *(paleta: «RUT» — Texto con formato rut)*
- **• Qué es.** Texto que debe ser un **RUT chileno válido** (con dígito verificador correcto).
- **• Para qué sirve.** *Planta:* identificar al responsable o a un contratista.
- **• Cómo se ve / se usa.** Casilla de texto; **mientras escribes** la UI va poniendo el patrón
  `12.345.678-5` (puntos de miles + guion del dígito verificador), de forma incremental. Solo
  conserva dígitos y K; el último caracter es el DV.
- **• Cómo se configura.** Texto con `format=rut`.
- **• Qué valida.** ✅ `12.345.678-5` (si el DV calza por módulo 11) · ❌ `12.345.678-9`
  ("RUT inválido (verifique el dígito verificador)"). Acepta con/sin puntos; vacío lo gobierna
  "obligatorio", no el formato.
- **• Ejemplo.** "RUT responsable" → `16.789.123-K` válido si el DV es correcto.
- **• A futuro.** (1) Validar contra el padrón de usuarios; (2) soportar otros documentos (DNI/CI).

### Correo  *(paleta: «Correo» — Texto con formato email)*
- **• Qué es.** Texto que debe parecer un correo electrónico.
- **• Para qué sirve.** *Planta:* correo de contacto del contratista.
- **• Cómo se configura.** Texto con `format=email`.
- **• Qué valida.** ✅ `juan@planta.cl` · ❌ `juan@` / `juan planta.cl` ("correo electrónico inválido").
- **• Ejemplo.** "Email contacto" → `contratista@empresa.com`.
- **• A futuro.** (1) Verificación real (enviar confirmación); (2) lista blanca de dominios.

### Teléfono  *(paleta: «Teléfono» — Texto con formato phone)*
- **• Qué es.** Texto que debe parecer un teléfono (permite +, espacios, guiones, paréntesis).
- **• Para qué sirve.** *Planta:* teléfono del turno saliente para coordinación.
- **• Cómo se configura.** Texto con `format=phone`.
- **• Qué valida.** Necesita **al menos 7 dígitos**. ✅ `+56 9 1234 5678` · ❌ `12345` ("teléfono inválido").
- **• Ejemplo.** "Fono turno" → `+56 2 2345 6789`.
- **• A futuro.** (1) Formato E.164 estricto por país; (2) selector de prefijo de país.

### URL  *(paleta: «URL» — Texto con formato url)*
- **• Qué es.** Texto que debe ser una dirección web válida (`http`/`https`).
- **• Para qué sirve.** *Planta:* enlace a un documento o tablero externo.
- **• Cómo se configura.** Texto con `format=url`.
- **• Qué valida.** ✅ `https://docs.planta.cl/p1` · ❌ `docs.planta.cl` (sin `http(s)://` → "URL inválida").
- **• Ejemplo.** "Enlace procedimiento" → `https://intranet/procedimiento-7`.
- **• A futuro.** (1) Comprobar que responda; (2) vista previa del enlace.

### Sí/No  *(paleta: «Sí/No»)*
- **• Qué es.** Un interruptor de verdadero/falso.
- **• Para qué sirve.** *Planta:* "¿Equipo bloqueado/enclavado (LOTO)?".
- **• Cómo se ve / se usa.** *Toggle*. **Arranca apagado = No** (para que las reglas que
  comparan `=No` se evalúen aunque el operador no lo toque).
- **• Cómo se configura.** Rótulos personalizados de verdadero/falso (ej. "Sí"/"No", "OK"/"Falla").
- **• Qué valida.** ✅ verdadero/falso · ❌ cualquier otra cosa ("debe ser verdadero/falso").
- **• Ejemplo.** "¿Bloqueo LOTO aplicado?" → No por defecto; el operador lo pone en Sí.
- **• A futuro.** (1) Tercer estado "N.A."; (2) exigir evidencia cuando es Sí.

### Fecha  *(paleta: «Fecha»)*
- **• Qué es.** Una fecha (sin hora).
- **• Para qué sirve.** *Planta:* fecha de la última mantención.
- **• Cómo se ve / se usa.** Selector de fecha; se muestra según el **locale** activo.
- **• Cómo se configura.** Sin opciones extra. Puede marcarse como "fecha efectiva" del registro.
- **• Qué valida.** Formato interno `YYYY-MM-DD`. ✅ `2026-06-15` · ❌ `15/06/2026` crudo / fecha imposible.
- **• Ejemplo.** "Fecha última mantención" → `2026-05-30`.
- **• A futuro.** (1) Mín/máx de fecha; (2) bloquear fechas futuras.

### Fecha y hora  *(paleta: «Fecha y hora»)*
- **• Qué es.** Fecha con hora.
- **• Para qué sirve.** *Planta:* momento exacto de un evento o detención.
- **• Cómo se ve / se usa.** Selector de fecha + hora; formato por locale.
- **• Cómo se configura.** Sin opciones extra.
- **• Qué valida.** ✅ momento válido (parseable) · ❌ texto no interpretable como fecha-hora.
- **• Ejemplo.** "Inicio detención" → `2026-06-15 03:42`.
- **• A futuro.** (1) Zona horaria explícita; (2) "ahora" de un toque.

### Hora  *(paleta: «Hora»)*
- **• Qué es.** Una hora del día (HH:MM, 24h).
- **• Para qué sirve.** *Planta:* hora de la lectura o del relevo de turno.
- **• Cómo se ve / se usa.** Casilla de hora.
- **• Cómo se configura.** Sin opciones extra.
- **• Qué valida.** Rango `00:00`–`23:59`. ✅ `07:30` · ❌ `25:00` / `7:5` ("hora inválida (HH:MM)").
- **• Ejemplo.** "Hora de lectura" → `06:15`.
- **• A futuro.** (1) Segundos; (2) franjas válidas por turno.

### Duración (HH:MM)  *(paleta: «Duración»)*
- **• Qué es.** Una duración en horas:minutos, **guardada en minutos**.
- **• Para qué sirve.** *Planta:* tiempo total de una detención.
- **• Cómo se ve / se usa.** El operador ingresa HH:MM; internamente son minutos.
- **• Cómo se configura.** Sin opciones extra.
- **• Qué valida.** Entero ≥ 0 (minutos). ✅ `02:30` (=150 min) · ❌ negativo ("duración inválida").
- **• Ejemplo.** "Duración detención" → `01:45` → se guarda `105`.
- **• A futuro.** (1) Días; (2) sumas/promedios de duración en reglas.

### Rango (mín–máx)  *(paleta: «Rango»)*
- **• Qué es.** Dos números que definen un rango `{desde, hasta}`.
- **• Para qué sirve.** *Planta:* rango de presión observado durante el turno (mín–máx).
- **• Cómo se ve / se usa.** Dos casillas: desde / hasta, con unidad.
- **• Cómo se configura.** Unidad, decimales, cotas duras (min/max) que aplican a **ambos** extremos.
- **• Qué valida.** ✅ `{desde:2, hasta:5}` · ❌ `{desde:5, hasta:2}` ("el mínimo no puede
  superar al máximo") · ❌ extremo fuera de las cotas duras · ❌ no-número en un extremo.
- **• Ejemplo.** "Presión turno (bar)", cota 0–10 → `{desde: 3.2, hasta: 6.8}`.
- **• A futuro.** (1) Umbrales sobre el ancho del rango; (2) marcar si el rango excede tolerancia.

### Lectura con tolerancia  *(paleta: «Tolerancia» — Número con objetivo ± tolerancia)*
- **• Qué es.** Un Número con un **objetivo** y una **tolerancia**: el sistema **deriva solo**
  las luces de alerta a partir de `objetivo ± tolerancia`.
- **• Para qué sirve.** *Planta:* torque de apriete objetivo 80 N·m ± 5 (advertencia) ± 10 (crítico).
- **• Cómo se ve / se usa.** Casilla numérica que muestra "objetivo ± tol"; si se sale, marca.
- **• Cómo se configura.** `expected` (objetivo), `tolerance` (advertencia), `critTolerance`
  (crítico, ≥ tolerance). El sistema arma las bandas warn/crit; **no hace falta** escribir las 4 a mano.
- **• Qué valida.** Con `expected 80, tolerance 5, critTolerance 10`: ✅ `83` (dentro) ·
  ✅ `87` (válido, marcado advertencia) · ✅ `92` (marcado crítico). En el diseño: ❌ poner
  tolerancia sin objetivo ("la tolerancia exige un valor esperado"); ❌ crítica < advertencia.
- **• Ejemplo.** "Torque perno crítico", 80 ± 5 / ± 10 N·m → `91` → crítico → entra a excepciones.
- **• A futuro.** (1) Tolerancia asimétrica (+/− distintas); (2) tolerancia en % del objetivo.

### Contador / acumulado  *(paleta: «Contador» — Número incremental)*
- **• Qué es.** Una lectura **incremental** (horómetro, contador de partidas) que **no debería
  bajar**; el sistema calcula el **delta** contra la última lectura del mismo equipo.
- **• Para qué sirve.** *Planta:* horómetro de la bomba; cuántas horas corrió desde ayer.
- **• Cómo se ve / se usa.** Casilla numérica; el sistema muestra el delta vs la lectura previa sellada.
- **• Cómo se configura.** `counter=true` y, si quieres, `counterNonDecreasing=true` (no puede
  bajar). El control del "no decrece" se valida **en el servidor** contra la lectura anterior.
- **• Qué valida.** Como Número. Si `counterNonDecreasing`, una lectura menor que la previa del
  mismo equipo+campo → rechazada. *(El delta es presentación, no se guarda aparte.)*
- **• Ejemplo.** "Horómetro bomba", previa `1.200,5 h` → hoy `1.245,0` → delta `+44,5 h`.
  Si escribes `1.100` → rechazado por decrecer.
- **• A futuro.** (1) Estampar el delta como dato; (2) alerta por delta anómalo (consumo fuera de patrón).

---

## 2.2 Selección

> Las cuatro presentaciones de lista comparten **el mismo motor**: guardan un `code` y validan
> contra el catálogo. Solo cambia el *widget*. El catálogo puede ser **inline** (opciones
> escritas en el propio campo) o una **lista de referencia** gobernada (listas reutilizables).

### Lista desplegable  *(paleta: «Lista» — SELECT dropdown)*
- **• Qué es.** Elegir **una** opción de una lista (combo buscable).
- **• Para qué sirve.** *Planta:* estado mecánico del equipo (Operativo / Degradado / Fuera de servicio).
- **• Cómo se ve / se usa.** Desplegable buscable; el operador elige una.
- **• Cómo se configura.** Fuente de opciones (`inline` {code,label} o `referenceList`).
- **• Qué valida.** ✅ un code del catálogo · ❌ un code que no está ("opción fuera del catálogo").
- **• Ejemplo.** "Estado mecánico" → `{operativo:Operativo, degradado:Degradado, fs:Fuera de servicio}` → elige `degradado`.
- **• A futuro.** (1) Opciones dependientes de otro campo (cascada); (2) opción "otro" con texto libre.

### Opción única (radio)  *(paleta: «Opción única» — SELECT radio)*
- **• Qué es.** Lo mismo que Lista, pero con las opciones **visibles** (1 toque).
- **• Para qué sirve.** *Planta:* turno (Día / Noche) — pocas opciones, elección rápida con guantes.
- **• Cómo se ve / se usa.** Círculos seleccionables, todos a la vista.
- **• Cómo se configura.** Igual que Lista (`displayAs=radio`).
- **• Qué valida.** Igual que Lista.
- **• Ejemplo.** "Turno" → `Día / Noche`.
- **• A futuro.** (1) Disposición en columnas; (2) descripción por opción.

### Segmentos  *(paleta: «Segmentos» — SELECT segmented)*
- **• Qué es.** Lo mismo, como chips/segmentos en línea (pocas opciones).
- **• Para qué sirve.** *Planta:* prioridad (Baja / Media / Alta).
- **• Cómo se ve / se usa.** Botones contiguos tipo "pestañas".
- **• Cómo se configura.** Igual que Lista (`displayAs=segmented`).
- **• Qué valida.** Igual que Lista.
- **• Ejemplo.** "Prioridad" → `Baja / Media / Alta`.
- **• A futuro.** (1) Color por segmento; (2) ícono por opción.

### Casillas  *(paleta: «Casillas» — MULTISELECT checkboxes)*
- **• Qué es.** Elegir **varias** opciones con casillas visibles.
- **• Para qué sirve.** *Planta:* EPP usado (Casco / Lentes / Guantes / Arnés).
- **• Cómo se ve / se usa.** Lista de casillas; marca todas las que apliquen.
- **• Cómo se configura.** Fuente de opciones (`displayAs=checkboxes`).
- **• Qué valida.** ✅ varios codes del catálogo, **sin repetir** · ❌ repetidos ("opciones
  repetidas") · ❌ code fuera del catálogo.
- **• Ejemplo.** "EPP usado" → `[casco, guantes, arnes]`.
- **• A futuro.** (1) Mínimo/máximo de selecciones; (2) "ninguno/todos".

### Multiselección  *(paleta: «Multiselección» — MULTISELECT dropdown)*
- **• Qué es.** Varias opciones en un desplegable con tags.
- **• Para qué sirve.** *Planta:* sistemas afectados por un evento (varios).
- **• Cómo se ve / se usa.** Combo que va agregando "tags" de lo elegido.
- **• Cómo se configura.** Igual que Casillas (`displayAs=dropdown`).
- **• Qué valida.** Igual que Casillas.
- **• Ejemplo.** "Sistemas afectados" → `[hidraulico, lubricacion]`.
- **• A futuro.** (1) Agrupar opciones; (2) buscar y pegar varias a la vez.

### Multiselección modal  *(paleta: «Multiselección modal» — MULTISELECT modal)*
- **• Qué es.** Varias opciones elegidas desde una **ventana de búsqueda** (Value Help), para
  catálogos grandes.
- **• Para qué sirve.** *Planta:* elegir varias fallas de un catálogo largo de modos de falla.
- **• Cómo se ve / se usa.** Botón que abre un buscador emergente con filtros.
- **• Cómo se configura.** Igual que Multiselección (`displayAs=modal`).
- **• Qué valida.** Igual que Casillas.
- **• Ejemplo.** "Modos de falla" → buscar y marcar varios de una lista de 200.
- **• A futuro.** (1) Carga por demanda (paginada); (2) recientes/favoritos.

---

## 2.3 Evaluación

### Conformidad  *(paleta: «Conformidad»)*
- **• Qué es.** Tri-estado de inspección: **Conforme / No conforme / N.A.**
- **• Para qué sirve.** *Planta:* checklist pre-arranque ("¿Guardas de seguridad OK?").
- **• Cómo se ve / se usa.** Tres botones claros; un toque.
- **• Cómo se configura.** `allowNa` permite u oculta la opción "No aplica" (por defecto la permite).
- **• Qué valida.** Códigos cerrados `CONFORME / NO_CONFORME / NA`. Si `allowNa=false`, `NA` →
  "opción fuera del catálogo".
- **• Ejemplo.** "Guardas de seguridad" → `NO_CONFORME` (queda como hallazgo).
- **• A futuro.** (1) Exigir comentario/foto cuando es No conforme; (2) abrir incidencia automática (Fase 4).

### Severidad 1–5  *(paleta: «Severidad»)*
- **• Qué es.** Una escala fija de severidad **1 a 5** (con su color del sistema de diseño).
- **• Para qué sirve.** *Planta:* gravedad de un hallazgo o evento.
- **• Cómo se ve / se usa.** Escala de 5 niveles con colores (verde→rojo).
- **• Cómo se configura.** Sin opciones (escala estándar del producto).
- **• Qué valida.** Entero 1–5. ✅ `3` · ❌ `0` / `6` ("severidad fuera de rango (1–5)").
- **• Ejemplo.** "Severidad del evento" → `4`.
- **• A futuro.** (1) Rótulos por nivel configurables; (2) matriz que la derive (ver Matriz de riesgo).

### Valoración  *(paleta: «Valoración» — RATING)*
- **• Qué es.** Una nota ordinal: estrellas, número o escala Likert.
- **• Para qué sirve.** *Planta:* estado general percibido del área (1–5 estrellas).
- **• Cómo se ve / se usa.** Estrellas/botones/escala con rótulos.
- **• Cómo se configura.** `style` (`stars`/`numeric`/`likert`), `max` (2–10), rótulos opcionales (Likert).
- **• Qué valida.** Entero 1..max. ✅ `4` (con max 5) · ❌ `0` / `7` ("valoración fuera de rango (1–5)").
- **• Ejemplo.** "Orden y limpieza" → 5 estrellas → `4`.
- **• A futuro.** (1) Medias estrellas; (2) "N.A."; (3) promedio en reglas.

### Matriz de riesgo  *(paleta: «Matriz de riesgo» — ISO 31000)*
- **• Qué es.** Eliges **probabilidad × consecuencia** y el sistema **deriva el nivel de
  riesgo** (severidad 1–5) según una cuadrícula que define el diseñador.
- **• Para qué sirve.** *Planta:* evaluar el riesgo de una tarea o de un hallazgo (estándar **ISO 31000**).
- **• Cómo se ve / se usa.** Una cuadrícula coloreada; el operador toca una celda (prob × cons)
  y ve el nivel resultante.
- **• Cómo se configura.** Rótulos de cada eje (2–7 niveles) y la cuadrícula `cells` con la
  severidad 1–5 de cada combinación. La matriz queda congelada en la versión.
- **• Qué valida.** Valor `{probability, consequence}` (índices desde 1). ✅ una combinación que
  cae dentro de la matriz · ❌ falta un eje ("indique probabilidad y consecuencia") · ❌ índices
  fuera de los ejes ("combinación de riesgo fuera de la matriz").
- **• Ejemplo.** Ejes 5×5; `{probability:4, consequence:5}` → la celda dice severidad `5` (rojo).
- **• A futuro.** (1) Riesgo residual (antes/después de control); (2) banda de excepción por nivel;
  (3) acción obligatoria si nivel ≥ X.

### Firma  *(paleta: «Firma» — Part 11)*
- **• Qué es.** Una firma electrónica con significado (aprobar/revisar), atada a la identidad.
- **• Para qué sirve.** *Planta:* el supervisor firma el cierre de turno (**FDA 21 CFR Part 11**:
  firma electrónica con su significado y trazabilidad).
- **• Cómo se ve / se usa.** **No se llena como un campo normal**: la firma se ejecuta al
  **avanzar el flujo** (transición), donde se pide re-autenticación.
- **• Cómo se configura.** `meaning` (el significado declarado de la firma).
- **• Qué valida.** Si alguien intenta "escribirla" como dato en el formulario → "la firma se
  realiza al ejecutar el flujo".
- **• Ejemplo.** "Firma supervisor de turno" con meaning "Aprobación de cierre" → se captura al
  pasar la entrada a "Aprobada".
- **• A futuro.** (1) Firma manuscrita en pantalla + identidad; (2) co-firma/cuatro-ojos;
  (3) sello de tiempo certificado.

---

## 2.4 Referencia

> Apuntan a una **entidad real** de la plataforma y guardan su **id**. La lista de opciones y la
> validación "existe + está activo + está **en tu alcance**" se resuelven **en el servidor** con
> **ABAC** (*permisos según atributos*: por ejemplo, solo equipos del nodo de la entrada). El
> cliente solo ofrece; el servidor manda.

### Equipo  *(paleta: «Equipo» — REFERENCE equipment)*
- **• Qué es.** Selector de un equipo/activo instalado.
- **• Para qué sirve.** *Planta:* a qué bomba/molino corresponde la lectura.
- **• Cómo se ve / se usa.** Combo buscable (o ventana de búsqueda) con los equipos del nodo.
- **• Cómo se configura.** `entity=equipment`, presentación `dropdown` o `modal`.
- **• Qué valida.** Guarda un id. ✅ un equipo del alcance del nodo de la entrada · ❌ equipo de
  otro nodo o inexistente ("referencia fuera de alcance o inexistente").
- **• Ejemplo.** "Equipo inspeccionado" → `Bomba P-101` (del nodo LIJADO).
- **• A futuro.** (1) Filtrar por tipo/criticidad; (2) leer la jerarquía del activo (ISO 14224).

### Usuario  *(paleta: «Usuario» — REFERENCE user)*
- **• Qué es.** Selector de una persona de la plataforma.
- **• Para qué sirve.** *Planta:* a quién se asigna una tarea o quién reportó.
- **• Cómo se configura.** `entity=user`.
- **• Qué valida.** id de un usuario activo válido; fuera de eso → rechazado.
- **• Ejemplo.** "Responsable" → usuario `J. Pérez`.
- **• A futuro.** (1) Filtrar por rol/nodo; (2) solo gente del turno vigente.

### Nodo  *(paleta: «Nodo» — REFERENCE orgNode)*
- **• Qué es.** Selector de un nodo de la estructura (planta/área/línea).
- **• Para qué sirve.** *Planta:* indicar el área afectada distinta a la de la entrada.
- **• Cómo se configura.** `entity=orgNode`.
- **• Qué valida.** id de un nodo **accesible** para el usuario.
- **• Ejemplo.** "Área afectada" → `Molienda`.
- **• A futuro.** (1) Multinodo; (2) acotar por tipo de nodo.

### Turno  *(paleta: «Turno» — REFERENCE shift)*
- **• Qué es.** Selector de un turno definido.
- **• Para qué sirve.** *Planta:* a qué turno corresponde el evento.
- **• Cómo se configura.** `entity=shift`.
- **• Qué valida.** id de un turno válido del nodo.
- **• Ejemplo.** "Turno" → `Turno A (Día)`.
- **• A futuro.** (1) Resolver el turno vigente automáticamente; (2) crew/cuadrilla como entidad.

---

## 2.5 Evidencia / Terreno

> Guardan **archivos** en el almacenamiento on-prem (MinIO). El valor del campo es un
> **descriptor** del objeto (nombre, tamaño, tipo, checksum) — **nunca una URL**. La descarga es
> un enlace **firmado de corta vida** que respeta los mismos permisos que ver la entrada. La
> subida pasa **por la API** (que valida tamaño/tipo y audita).

### Foto  *(paleta: «Foto» — ATTACHMENT photo)*
- **• Qué es.** Una o varias fotos (galería o cámara).
- **• Para qué sirve.** *Planta:* foto de una fuga o de la condición de un equipo.
- **• Cómo se ve / se usa.** Botón de cámara/galería; miniatura con botón "Ver" (lightbox).
- **• Cómo se configura.** `kind=photo`, `multiple`, `maxCount`, `maxSizeMb`, `accept`
  (por defecto `image/*`), `capture` (sugiere cámara trasera en móvil).
- **• Qué valida.** Tipo (debe calzar `accept`), tamaño (≤ máx), cantidad (≤ máx). Archivo de
  tipo/tamaño no permitido → rechazado. La pertenencia del archivo a esta entrada se verifica en servidor.
- **• Ejemplo.** "Evidencia de fuga", hasta 5 fotos de ≤10 MB → el operador toma 2 fotos.
- **• A futuro.** (1) Marca de agua con fecha/GPS; (2) anotación sobre la foto; (3) antivirus (ClamAV).

### Archivo  *(paleta: «Archivo» — ATTACHMENT file)*
- **• Qué es.** Un archivo cualquiera (PDF, planilla…).
- **• Para qué sirve.** *Planta:* adjuntar un certificado o un informe.
- **• Cómo se ve / se usa.** Botón de subir; lista con "Ver"/descargar.
- **• Cómo se configura.** `kind=file`, `accept` (puedes restringir a `application/pdf`, etc.), tamaño/cantidad.
- **• Qué valida.** Tipo/tamaño/cantidad según config.
- **• Ejemplo.** "Certificado de calibración" → un PDF de 2 MB.
- **• A futuro.** (1) Versionado de adjuntos; (2) WORM/retención; (3) firma del archivo.

### Nota de voz  *(paleta: «Nota de voz» — ATTACHMENT audio)*
- **• Qué es.** Una grabación de audio hecha en el momento.
- **• Para qué sirve.** *Planta:* dejar una observación hablada cuando es incómodo escribir con guantes.
- **• Cómo se ve / se usa.** Botón de grabar (micrófono); reproducible al revisar.
- **• Cómo se configura.** `kind=audio`, `accept` por defecto `audio/*`, tamaño/cantidad.
- **• Qué valida.** Tipo/tamaño/cantidad.
- **• Ejemplo.** "Observación de voz" → clip de 20 s.
- **• A futuro.** (1) Transcripción a texto (IA on-prem); (2) límite de duración.

### Croquis  *(paleta: «Croquis» — ATTACHMENT sketch)*
- **• Qué es.** Un dibujo a mano en pantalla, exportado a imagen (PNG).
- **• Para qué sirve.** *Planta:* marcar dónde está la fuga sobre un esquema rápido.
- **• Cómo se ve / se usa.** Lienzo para dibujar con el dedo; se guarda como PNG.
- **• Cómo se configura.** `kind=sketch` (acepta `image/png`).
- **• Qué valida.** Igual que una imagen (tipo/tamaño).
- **• Ejemplo.** "Croquis de la falla" → dibujo del operador.
- **• A futuro.** (1) Dibujar **sobre** una imagen de referencia; (2) formas/medidas; (3) capas.

### Escáner QR / código  *(paleta: «Escáner QR» — Texto con scan)*
- **• Qué es.** Un campo de **texto** que se puede rellenar **escaneando** un QR/código con la
  cámara. **No es un archivo** (no usa storage): el código queda como el texto del campo.
- **• Para qué sirve.** *Planta:* escanear la etiqueta del equipo en vez de teclear su código.
- **• Cómo se ve / se usa.** Casilla de texto + botón "escanear"; al leer el código, lo rellena.
- **• Cómo se configura.** Texto con `scan=true`.
- **• Qué valida.** La del Texto (largo/patrón/formato si los tiene).
- **• Ejemplo.** "TAG equipo" → escanea `EQ-P101` → queda como texto.
- **• A futuro.** (1) Escanear y **resolver** a una referencia de equipo; (2) varios formatos de código.

---

## 2.6 Estructurados

> Capturan una **colección de celdas** en un solo campo. Cada celda se valida con **el mismo
> motor** del tipo escalar que le toca (un NÚMERO de columna trae su unidad/umbral; una LISTA de
> columna su catálogo inline). Las columnas/ejes se congelan en la versión publicada.
> **Umbral por celda → excepción:** si una celda numérica cae en crítico/advertencia, **toda la
> entrada** se marca como excepción (toma la **peor** banda de sus celdas).

### Tabla repetible  *(paleta: «Tabla repetible» — TABLE layout=table)*
- **• Qué es.** Una grilla de **filas que el operador agrega/quita/reordena**, con columnas fijas.
- **• Para qué sirve.** *Planta:* registrar varias lecturas de vibración por punto de medición.
- **• Cómo se ve / se usa.** Tabla con scroll horizontal (cabecera y 1.ª columna fijas); botón
  "Agregar fila"; quitar/reordenar.
- **• Cómo se configura.** `columns` (cada una = sub-campo escalar: Texto/Número/Lista/Sí-No/
  Fecha/Hora/Duración/Conformidad/Valoración), `minRows` (filas completas si es obligatorio),
  `maxRows`, rótulo del botón. Las listas de celda solo admiten **opciones inline**.
- **• Qué valida.** Cada celda según su tipo. ✅ filas con sus celdas válidas · ❌ celda numérica
  fuera de rango/tipo · ❌ columna **obligatoria vacía** en una fila no vacía · ❌ pasar `maxRows`.
  Las filas totalmente vacías se ignoran (no cuentan ni para `maxRows` ni para obligatoriedad).
- **• Ejemplo.** "Vibraciones" con columnas `Punto (texto)`, `mm/s (número, warnHigh 7)`,
  `Estado (lista)` → 3 filas; una con `8,1 mm/s` deja la entrada en **excepción**.
- **• A futuro.** (1) Condiciones por fila ("si alguna fila…"); (2) export CSV; (3) celda de
  referencia/adjunto; (4) totales por columna como fila visible.

### Grupo repetible  *(paleta: «Grupo repetible» — TABLE layout=cards)*
- **• Qué es.** Lo mismo que la Tabla repetible, pero presentado como **tarjetas apiladas**
  ("agregar otro…") en vez de grilla — mejor para celular/tablet.
- **• Para qué sirve.** *Planta:* "agregar otro hallazgo", cada uno con sus campos.
- **• Cómo se ve / se usa.** Bloques verticales repetibles; "Agregar".
- **• Cómo se configura.** Igual que Tabla repetible con `layout=cards`.
- **• Qué valida.** Idéntico a Tabla repetible.
- **• Ejemplo.** "Hallazgos" con `Descripción (área de texto)`, `Severidad`, `Foto` *(nota: foto
  en celda es deuda futura; hoy las celdas son escalares)* → 2 tarjetas.
- **• A futuro.** Igual que Tabla repetible (referencia/adjunto en celda incluidos).

### Matriz parámetro×turno  *(paleta: «Matriz» — MATRIX)*
- **• Qué es.** Una cuadrícula de **filas y columnas FIJAS** (parámetros × turnos/intervalos)
  donde cada celda es del **mismo** tipo.
- **• Para qué sirve.** *Planta:* registrar el mismo set de parámetros en Turno A y Turno B.
- **• Cómo se ve / se usa.** Tabla con cabeceras de solo lectura; el operador llena las celdas editables.
- **• Cómo se configura.** `rows` (parámetros), `columns` (turnos/intervalos) y `cell` (el tipo
  escalar uniforme de toda la matriz). Filas y columnas se congelan en la versión.
- **• Qué valida.** Cada celda según el tipo `cell`. ✅ celdas válidas · ❌ celda fuera de rango/
  tipo. Obligatorio = al menos **1 celda** con valor. Umbral = peor banda de las celdas numéricas.
- **• Ejemplo.** Filas `Presión / Temperatura / Caudal`, columnas `Turno A / Turno B`, celda =
  Número → 6 celdas; `Temperatura/Turno B = 95` (warnHigh 90) marca excepción.
- **• A futuro.** (1) Columnas desde el **calendario** de turnos en vivo; (2) celda no uniforme
  por fila; (3) obligatoriedad por fila/columna.

---

## 2.7 Presentación

> **No son dato.** El llenado los **ignora por completo**: no se guardan, no se validan, no
> entran a reglas, resumen ni obligatorios. Solo sirven para **guiar y ordenar** el formulario.

### Encabezado  *(HEADING)*
- **• Qué es.** Un título de bloque (niveles 1–3). • **Sirve para** separar secciones visualmente
  ("Inspección visual"). • **Configura** el nivel; el texto va en el rótulo. • **No valida nada.**
  • **A futuro:** numeración automática; ancla/índice.

### Texto fijo  *(STATIC_TEXT)*
- **• Qué es.** Un párrafo de instrucciones. • **Sirve para** explicar cómo llenar una sección.
  • **Configura** el cuerpo del texto (hasta 4.000 caracteres). • **No valida.** • **A futuro:**
  formato enriquecido; variables (mostrar el nombre del equipo).

### Separador  *(DIVIDER)*
- **• Qué es.** Una línea divisoria. • **Sirve para** dar aire entre bloques. • **Configura** el
  espaciado (sm/md/lg). • **No valida.** • **A futuro:** separador con etiqueta.

### Aviso  *(NOTICE)*
- **• Qué es.** Un recuadro de aviso con intención (info/advertencia/éxito/peligro). • **Sirve
  para** destacar una precaución de seguridad. • **Configura** la variante y el texto. • **No
  valida.** • **A futuro:** aviso que aparece solo si se cumple una condición.

### Enlace a procedimiento  *(PROCEDURE_LINK)*
- **• Qué es.** Un enlace a un documento/procedimiento. • **Sirve para** llevar al instructivo
  correcto. • **Configura** la URL (se valida que sea URL al guardar el diseño) y el texto del
  enlace. • **No valida en llenado.** • **A futuro:** enlazar a documentos internos versionados.

### Imagen de referencia  *(REFERENCE_IMAGE)*
- **• Qué es.** Una imagen guía por URL. • **Sirve para** mostrar un esquema o ejemplo ("así se
  ve la lectura correcta"). • **Configura** URL (validada), texto alternativo, pie de foto. • **No
  valida en llenado.** • **A futuro:** subir la imagen (en vez de URL); zoom.

---

## 3. Capacidades transversales

### 3.1 Layout en grilla responsiva (lienzo de posición libre)
- **Qué es.** Los campos se ubican en una **grilla de 12 columnas** (estándar tipo Bootstrap/
  Fiori). Cada campo tiene **posición y tamaño explícitos** (`gridX`, `gridY`, alto `gridH`,
  ancho `colSpan` 1–12).
- **Cómo se usa.** El diseñador **arrastra y redimensiona** cualquier campo en un lienzo, lo pone
  al lado de otro, etc. Hay vista previa de **escritorio/tablet/móvil**.
- **Importante (terreno).** En **celular la grilla colapsa a 1 columna** (legibilidad con
  guantes). Lo viejo sin geometría se deriva del orden y se conserva.
- **Ayuda al diseñar.** Al **pasar el cursor** por encima de un campo del lienzo (sin
  seleccionarlo) aparece un panel con **qué objeto es** (ícono + nombre del preset, p. ej.
  "RUT", "Lista desplegable") y **chips con los datos configurados** más útiles (obligatorio,
  calculado, condicional, unidad, rango mín/máx, umbrales, formato, límite de caracteres,
  n.º de opciones/columnas, etc.) — así se reconoce un campo sin tener que pincharlo.
- **A futuro.** Edición por breakpoint, alinear/distribuir, copiar/pegar, deshacer/rehacer.

### 3.2 Obligatoriedad — qué cuenta como "vacío"
- Un campo obligatorio vacío → "obligatorio". Pero **"vacío" depende del tipo**:
  - Normal: sin valor.
  - **Tabla**: necesita al menos `minRows` (mín. 1) **filas completas**.
  - **Matriz**: necesita al menos **1 celda** con valor.
- Los objetos de **presentación** nunca son obligatorios (no son dato).

### 3.3 Lógica condicional (mostrar según otro campo)
- **Qué es.** Un campo se muestra **solo si** otro campo es igual a cierto valor (`visibleWhen`:
  "muéstrame si `estado = degradado`").
- **Ejemplo.** "Detalle del problema" aparece solo si "Estado mecánico" = `No conforme`.
- **A futuro.** Más de una condición (y/o), operadores (>, contiene), ocultar secciones enteras.

### 3.4 Motor de reglas — campos CALCULADOS
- **Qué es.** Un campo cuyo valor lo **calcula el sistema** a partir de otros (no lo escribe el
  operador). Usa un **AST seguro** (*una fórmula evaluada sin ejecutar código peligroso, sin
  `eval`*).
- **Cómo se usa.** El operador lo ve **de solo lectura** con un badge "Calculado"; cambia solo
  al cambiar sus insumos. **El servidor recalcula y manda** (no se confía en el navegador).
- **Ejemplo.** "Recuperación %" = `concentrado / alimentado * ley`. Si se divide por 0 → queda
  vacío (degradación elegante). Sobre el resultado **calculado** se pueden aplicar umbrales.
- **Con tablas.** Puede usar **agregados de columna**: `suma`, `promedio`, `mín`, `máx`, `conteo`
  de una columna de una tabla (ej. "Total tonelaje = suma de la columna tonelaje").
- **A futuro.** Límites dinámicos; funciones de fecha avanzadas; lookups a listas.

### 3.5 Motor de reglas — reglas CRUZADAS
- **Qué es.** Reglas que **comparan varios campos** y, si se cumple una condición, **bloquean** o
  **avisan**.
- **Cómo se usa.** Cada regla tiene severidad: **ERROR bloquea** completar/enviar/avanzar; **WARN
  informa** sin bloquear. Se pueden **activar/desactivar** y editar con ayuda y ejemplo.
- **Ejemplo.** "El concentrado no puede superar al alimentado" → si pasa, ERROR que **impide
  completar**. O "si suma(tonelaje) > 1000 ⇒ error".
- **Importante.** El selector de valores evita errores típicos (comparar contra el `code`
  correcto de una lista, no un texto inventado).
- **A futuro.** Condiciones por fila de tabla ("si alguna fila…"); acciones (abrir incidencia →
  Fase 4, notificar); tablas de decisión (DMN).

### 3.6 Umbrales y "excepciones" (review-by-exception)
- **Qué es.** Cuando un número (o una celda de tabla/matriz) cruza un umbral, su lectura se
  **estampa** con la banda (`WARN`/`CRIT`). La entrada con alguna banda crítica/advertencia (o
  con firma pendiente) se marca como **excepción**.
- **Para qué.** En la grilla de Bitácoras puedes filtrar **"Solo excepciones"** y revisar solo lo
  que se salió de lo normal (revisar por excepción, no leer todo).
- **A futuro.** Histéresis; severidad propia para riesgo; incidencia automática (Fase 4).

### 3.7 Formato regional
- Fechas, números, moneda y RUT **siempre** se muestran según el **locale** activo (vía
  `apps/watchlog-web/src/lib/format.ts`). Nada se "hardcodea" a un formato fijo. El dato se guarda
  canónico (ej. duración en minutos, fecha `YYYY-MM-DD`); el formato es solo presentación.

---

## 4. Gobernanza del formulario

### 4.1 Inmutable (versión) vs. "vivo" (config de la plantilla)
- **Se congela al publicar** (versión inmutable, trazable GxP): los campos, su configuración,
  posición/tamaño, las reglas, los campos calculados y el flujo de trabajo. Editar = crear un
  **nuevo borrador** que, al publicar, deja una **versión nueva**.
- **Se cambia en vivo sin republicar** (config de la plantilla, "gobernanza viva"):
  - Qué campos salen como **columnas de resumen** en la grilla (`gridFieldKeys`).
  - **Modo de equipo** (ninguno/opcional/sugerido/requerido).
  - **Ventana de edición** (plazo para corregir).
  - **Alcance** por nodo y por plantilla; asignación a nodos.

### 4.2 Alcance (quién ve/usa qué) — resumen
- Dos ejes que se combinan en **AND** ("gana el más estricto"): **por nodo** (en qué parte de la
  estructura) y **por plantilla** (qué tipos de bitácora). Sin restricción = ve todo (permisivo).
- Detalle completo en `ARCHITECTURE.md` / `SECURITY.md` (este doc es del *formulario*).

### 4.3 Cuándo se puede corregir
- **Ventana de edición**: plazo configurable por plantilla (o global) para corregir un registro;
  vencido, solo con permiso explícito **y motivo auditado** (opcional MFA).
- **Períodos contables**: si el período está CERRADO/BLOQUEADO, no se escribe.
- Detalle en `USER_GUIDE.md` / `DECISIONS.md`.

---

## 5. Apéndices

### Apéndice A — Tabla resumen (objeto → tipo interno → cómo se guarda)

| Objeto (paleta) | `type` | `dataType` (cómo se guarda) | Categoría |
|---|---|---|---|
| Texto | TEXT | STRING | Básicos |
| Área de texto | TEXTAREA | STRING | Básicos |
| Número | NUMBER | NUMBER | Básicos |
| Porcentaje | NUMBER (format=percent) | NUMBER | Básicos |
| Moneda | NUMBER (format=currency) | NUMBER | Básicos |
| RUT | TEXT (format=rut) | STRING | Básicos |
| Correo | TEXT (format=email) | STRING | Básicos |
| Teléfono | TEXT (format=phone) | STRING | Básicos |
| URL | TEXT (format=url) | STRING | Básicos |
| Sí/No | BOOLEAN | BOOLEAN | Básicos |
| Fecha | DATE | DATE | Básicos |
| Fecha y hora | DATETIME | DATETIME | Básicos |
| Hora | TIME | TIME | Básicos |
| Duración | DURATION | NUMBER (minutos) | Básicos |
| Rango | RANGE | RANGE `{from,to}` | Básicos |
| Lectura con tolerancia | NUMBER (expected/tolerance) | NUMBER | Básicos |
| Contador | NUMBER (counter) | NUMBER | Básicos |
| Lista / Opción única / Segmentos | SELECT | CODE | Selección |
| Casillas / Multiselección / Modal | MULTISELECT | CODE_ARRAY | Selección |
| Conformidad | CONFORMITY | CODE | Evaluación |
| Severidad | SEVERITY | CODE (1–5) | Evaluación |
| Valoración | RATING | NUMBER (1..max) | Evaluación |
| Matriz de riesgo | RISK_MATRIX | RISK `{probability,consequence}` | Evaluación |
| Firma | SIGNATURE | REFERENCE | Evaluación |
| Equipo/Usuario/Nodo/Turno | REFERENCE (entity) | REFERENCE (id) | Referencia |
| Foto/Archivo/Voz/Croquis | ATTACHMENT (kind) | FILE_ARRAY (descriptor[]) | Evidencia |
| Escáner QR | TEXT (scan=true) | STRING | Evidencia |
| Tabla / Grupo repetible | TABLE (layout) | TABLE `Array<Record>` | Estructurados |
| Matriz parámetro×turno | MATRIX | MATRIX `Record<row,Record<col>>` | Estructurados |
| Encabezado/Texto/Separador/Aviso/Enlace/Imagen | HEADING/STATIC_TEXT/DIVIDER/NOTICE/PROCEDURE_LINK/REFERENCE_IMAGE | LAYOUT (ignorado) | Presentación |

### Apéndice B — Plantilla DEMO de referencia (mirar en vivo)
- Plantilla **«Bitácora de Ronda Operacional — Planta Concentradora (DEMO OBJETOS)»**, en el nodo
  **LIJADO**, con ~25 tipos de objeto, un campo **calculado** (recuperación) y una **regla cruzada**
  (concentrado ≤ alimentado). La regenera `python scripts/seed-showcase-objetos.py`.
- **Usar para sacar ejemplos reales; NO modificarla.**
- Rol único de prueba: admin demo `demo@watchlog.local` / `Demo!Pass2026` (todos los permisos,
  alcance nulo). API en `http://localhost:3000/api`, Web en `http://localhost:5173`.

### Apéndice C — Glosario llano
- **ABAC** — permisos según *atributos* (nodo, plantilla…), no solo el rol. Decide qué ves/usas.
- **ISA-18.2** — norma de gestión de **alarmas** de planta; de ahí salen las bandas alto/bajo y
  crítico/advertencia de los umbrales.
- **ISO 31000** — estándar de **gestión de riesgo**; base de la matriz probabilidad×consecuencia.
- **Part 11 (FDA 21 CFR Part 11)** — reglas de **firmas y registros electrónicos** confiables.
- **ALCOA+** — principios de integridad de datos (Atribuible, Legible, Contemporáneo, Original,
  Exacto… + completo/consistente). Por eso se guardan checksums, auditoría, versiones inmutables.
- **AST seguro** — una **fórmula** representada como datos y evaluada por el sistema **sin ejecutar
  código arbitrario** (sin `eval`). Es como dar la fórmula y que la calculadora la resuelva sola.
- **jsonb** — formato en que PostgreSQL guarda datos flexibles (las configuraciones y valores
  estructurados viven así).
- **`code` vs `label`** — se guarda un **código estable** y se muestra un **texto**; el reporte no
  se rompe si cambia el texto visible.
- **Descriptor (de archivo)** — la "ficha" de un archivo guardado (nombre, tamaño, tipo, checksum),
  no la URL. La descarga se firma al momento, respetando permisos.
- **review-by-exception** — revisar **solo lo que se salió de lo normal**, no todo.

---

*Última actualización: 2026-06-15. Mantener vivo según §0.3 al cambiar/agregar objetos.*
