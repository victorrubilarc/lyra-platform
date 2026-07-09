# Cómo usar esta guía

Este documento es el **Smoke Visual Global** de Lyra WatchLog: una prueba visual
**de principio a fin** de toda la plataforma construida hasta hoy. No es un manual de
uso ni un folleto de venta: es una **guía de caza de defectos**. Su objetivo es que una
persona —tú— recorra el producto **pantalla por pantalla y opción por opción**, con un
caso de uso real y continuo, para descubrir bugs, faltantes, comportamientos raros,
textos equivocados, validaciones que no disparan, permisos que no ocultan lo que
deberían y cualquier cosa que no cuadre.

El recorrido está ambientado en una faena minera ficticia pero creíble —**Minera Cerro
Áspero**— y te hace **actuar como cada persona** de la operación en su momento: el
administrador que configura, el planificador que diseña, la supervisora que opera, el
operador de terreno, el mantenedor, la prevencionista de riesgos y la gerencia. Cuando
corresponde, **cambias de sesión** e ingresas como otra persona; el documento te lo
indica en cada paso.

## El sistema parte en blanco

La prueba comienza en el **punto cero**: la instalación recién configurada por el
asistente `/setup`, donde **solo existe el usuario administrador**. No hay estructura, ni
plantillas, ni usuarios, ni datos. A lo largo de las 15 fases irás **creándolo todo en el
orden lógico correcto**, de modo que al final tengas una operación completa funcionando y,
de paso, hayas tocado cada rincón del producto.

## Cómo está armado cada paso

Cada paso combina cinco elementos, siempre en el mismo orden, para que trabajes
minucioso y no en piloto automático:

> **Contexto.** Por qué se hace esto ahora, qué rol lo ejecuta y qué se busca.

1. **Acción exacta:** la secuencia pantalla › menú › botón › campo por campo, con los
   **valores concretos** que debes ingresar.

> **Qué observar.** Los detalles finos: validaciones, mensajes, estados, permisos que
> ocultan o deshabilitan, formato regional (fechas/números/moneda), responsividad.

> **Resultado esperado.** Qué debe verse si todo está bien.

*Registro — [ ] OK  [ ] Falla · Severidad: \_\_\_\_ · Notas: \_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_*

Marca la casilla, anota la severidad si algo falla y describe brevemente. Al final de
cada fase hay una tabla-resumen de hallazgos; al final del documento, un **Log Maestro de
Defectos** y una **Matriz de Cobertura** para asegurar que no quedó nada sin tocar.

## Cómo reportar un hallazgo

Un buen reporte de defecto es reproducible. Registra siempre: **(1)** qué hacías (fase y
paso), **(2)** qué esperabas ver, **(3)** qué viste en realidad, **(4)** una captura de
pantalla, y **(5)** la severidad. Vuelca cada hallazgo confirmado al Log Maestro del final.

## Escala de severidad de hallazgos (S1–S5)

| Sev. | Nombre | Qué significa |
|------|--------|----------------|
| **S1** | Bloqueante | Caída, pérdida o corrupción de datos, o impide continuar la prueba. Detén y reporta de inmediato. |
| **S2** | Grave | Funcionalidad principal rota o resultado incorrecto; workaround difícil o inexistente. |
| **S3** | Media | Función secundaria con problema; existe workaround; no bloquea el flujo principal. |
| **S4** | Menor | Defecto cosmético, de texto, formato o etiqueta; no afecta el resultado. |
| **S5** | Observación | Duda, inconsistencia menor o propuesta de mejora. |

> **Importante.** Esta escala S1–S5 mide la **severidad del defecto de software**. Es
> distinta de la **severidad operacional 1–5** que usa el negocio para incidencias y
> criticidad de equipos (donde 5 es lo más grave). No las confundas al llenar los registros.

## Entorno de la prueba

- **Web:** http://localhost:5173 · **API:** http://localhost:3000
- Idioma **es-CL**, moneda **CLP**, zona horaria **America/Santiago**.
- Navegador de escritorio y, cuando el paso lo indique, una tablet (uso en terreno, con guantes).

---

# La planta: Minera Cerro Áspero

Toda la prueba ocurre en una faena de cobre ficticia en la Región de Atacama, operada por
**Minera Cerro Áspero SpA**. Su estructura, que construirás en la Fase 3, es:

```
FIGURA 0.1 — Estructura organizacional de Minera Cerro Áspero
Faena Cerro Aspero (FAE-01)
  Planta Concentradora (PL-CONC)
    Molienda (AR-MOL) .......... Molino SAG 01, Molino de Bolas 02
    Flotacion (AR-FLOT) ........ Celda de Flotacion 03
    Espesamiento (AR-ESP)
  Chancado (PL-CHAN)
    Chancado Primario (AR-CHP) . Chancador Primario CH-01
```

Además existe una segunda estructura menor, **Mantención Central**, con un nodo raíz
**Taller Central**, que usarás para probar la operación multi-estructura, el Panorama
ejecutivo y la administración delegada.

# Las personas de la prueba

Estas son las ocho personas que intervienen. Sus roles y permisos se **crean como parte
de la prueba** (Fase 2). Guarda estas credenciales: las usarás al cambiar de sesión en
cada fase. Las contraseñas son temporales; el sistema exige cambiarlas en el primer ingreso.

| # | Persona | Usuario | Rol | Papel en la operación | Contraseña temporal | MFA |
|---|---------|---------|-----|------------------------|---------------------|-----|
| 1 | Víctor Rubilar | admin@cerroaspero.cl | Administrador (sistema) | Configura todo. Superadmin. Ya creado en `/setup`. | *(definida en /setup)* | Sí |
| 2 | Patricia Núñez | pnunez@cerroaspero.cl | `gerente-operaciones` | Gerencia: Panorama cross-estructura y dashboards; lectura amplia, sin edición operativa. | `CerroAspero2026!` | Sí |
| 3 | Rodrigo Salas | rsalas@cerroaspero.cl | `planificador` | Diseña plantillas, flujos, datos de referencia, calendarios y programa rondas. | `Planifica2026!` | No |
| 4 | María Fuentes | mfuentes@cerroaspero.cl | `supervisor-turno` | Supervisora del turno A (saliente): bitácoras, incidencias, OT y cambio de turno. | `Turno2026Sup!` | Sí |
| 5 | Óscar Díaz | odiaz@cerroaspero.cl | `supervisor-turno` | Supervisor del turno B (entrante): recibe y acusa la entrega de turno. | `Turno2026Ent!` | Sí |
| 6 | Jorge Ramírez | jramirez@cerroaspero.cl | `operador` | Terreno: ejecuta rondas, llena secciones de bitácora, reporta incidencias. Alcance acotado a Planta Concentradora. | `Operador2026!` | No |
| 7 | Luis Tapia | ltapia@cerroaspero.cl | `mantenedor` | Ejecuta órdenes de trabajo: actividades, checklists de ejecución y avances. | `Mantiene2026!` | No |
| 8 | Camila Vega | cvega@cerroaspero.cl | `prevencion-riesgos` | HSE: triage de excepciones (incl. críticas), CAPA y su verificación, reportabilidad, revisión de PTW. | `Prevenir2026!` | Sí |

---

# Recorrido de la prueba (Fases 0 a 15)


## Fase 0 · Ingreso del administrador y reconocimiento del terreno

Toda auditoría comienza por la puerta. En Minera Cerro Áspero SpA la plataforma acaba de instalarse y aún no existe nada más que la cuenta del administrador que creó el asistente `/setup`: no hay estructura, ni plantillas, ni usuarios, ni datos operacionales. Este es el "punto cero", y es exactamente el estado que un cliente ve el primer día. Antes de construir nada, **Víctor Rubilar (Admin)** entra al sistema, verifica que la licencia esté sana y recorre el cockpit de Inicio y la barra de navegación con ojos de auditor. La consigna de esta fase es doble: comprobar que el ingreso, el segundo factor y la licencia funcionan de punta a punta, y confirmar que un sistema recién instalado se ve **vacío pero correcto** (los contadores en cero no son un defecto, son la verdad). Tómate tu tiempo: cada pantalla que observes aquí es la línea base contra la que compararás todo lo que crees después.

### 0.1 · Ingreso, cambio de contraseña forzado y enrolamiento MFA

#### Paso 0.1 — Ingresar por primera vez como administrador

> **Contexto.** Lo ejecuta **Víctor Rubilar (Admin)**, la única cuenta existente (creada en `/setup`). Buscamos validar el flujo completo de autenticación de una cuenta de sistema que exige segundo factor: login, cambio de contraseña obligatorio en el primer ingreso y enrolamiento MFA. Es el flujo que vivirá cada persona de la faena, así que hay que verlo funcionar limpio desde el primer usuario.

1. Abre el navegador en `http://localhost:5173`. El sistema redirige a `/login`.
2. Observa que la pantalla de acceso es **oscura** (identidad de marca) y muestra el nombre/monograma de la instalación.
3. En **"Correo electrónico"** ingresa `admin@cerroaspero.cl`.
4. En **"Contraseña"** ingresa la contraseña definida durante `/setup`.
5. Marca la casilla **"Recordar mi correo"** (deja el correo precargado en futuros ingresos; no guarda la contraseña).
6. Presiona el botón **"Entrar"**.
7. Si el rol de administrador exige MFA y es el primer ingreso, el sistema fuerza el **cambio de contraseña** en `/cambiar-contrasena`: completa **"Contraseña actual"**, **"Nueva contraseña"** y **"Confirmar nueva contraseña"** (la nueva debe cumplir la política: mínimo 12 caracteres, una mayúscula y un número) y presiona **"Guardar y continuar"**.
8. A continuación el sistema abre el **enrolamiento MFA** en `/activar-mfa`: escanea el código QR con tu app autenticadora (Google Authenticator, Microsoft Authenticator, Authy, etc.), ingresa el **código de 6 dígitos** que genera la app y presiona **"Verificar y activar"**.
9. Guarda los **Códigos de recuperación** que muestra la pantalla (cópialos a un lugar seguro) y confirma con **"Ya los guardé, finalizar"**.
10. El sistema te deja en la pantalla de Inicio ("/").

> **Qué observar.** Con "Recordar mi correo" marcado, al volver a `/login` el correo debe aparecer precargado y la contraseña vacía. Si escribes mal la contraseña, el mensaje de error no debe revelar si el correo existe o no (no filtrar cuentas). La política de contraseña debe rechazar en vivo una clave débil (corta, sin mayúscula o sin número). El QR y el ingreso del código de 6 dígitos deben validarse contra el reloj del servidor; un código vencido debe rechazarse con mensaje claro. Los códigos de recuperación deben mostrarse **una sola vez**. Todo el flujo, en es-CL, con áreas táctiles amplias (uso con guantes en terreno).

> **Resultado esperado.** El administrador queda autenticado con contraseña propia y segundo factor activo, y aterriza en Inicio ("/"). El ingreso, el cambio forzado y el enrolamiento MFA se completan sin errores ni pantallas en inglés.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 0.2 · Tour del cockpit de Inicio en punto cero

#### Paso 0.2 — Recorrer la pantalla de Inicio con el sistema vacío

> **Contexto.** Lo ejecuta **Víctor Rubilar (Admin)**. Inicio es el "centro de operación del turno": prioriza lo pendiente y da acceso de un clic a la acción. En un sistema recién instalado casi todo estará vacío, y esa es justamente la observación clave de este paso: distinguir "vacío correcto" de "roto". Un tile vacío con su texto calmo es lo esperado; una pantalla que revienta o queda en blanco, no.

1. Estando en Inicio ("/"), lee el encabezado: **"Hola, Víctor"** (saludo con tu nombre) y el subtítulo **"Tu centro de operación del turno: lo pendiente primero, y a un clic de la acción."**.
2. Ubica la sección **"Mi trabajo hoy"** (worklist). Recorre los tiles disponibles según módulo licenciado y permiso:
   - **"Mis rondas"** — en cero muestra **"Sin rondas pendientes"**.
   - **"Incidencias abiertas"** — en cero muestra **"Sin incidencias abiertas"**.
   - **"Órdenes abiertas"** — en cero muestra **"Sin órdenes abiertas"**.
   - **"Excepciones por triar"** — en cero muestra **"Sin excepciones por triar"**.
   - **"Notificaciones sin leer"** — en cero muestra **"Todo al día"**.
3. Ubica la sección **"Operación"** con los accesos directos a los módulos.
4. Prueba un acceso directo (por ejemplo el botón **"Abrir"** de un tile o de un acceso de la sección Operación) y confirma que navega al módulo correspondiente; vuelve a Inicio.

> **Qué observar.** Cada tile del worklist requiere **módulo licenciado ∧ permiso**: si falta cualquiera de los dos, el tile no aparece (no debe mostrarse deshabilitado a medias ni con error). Con datos en cero, las sub-métricas de color (críticas, vencidas, sin responsable) NO deben pintarse: el tile queda "calmo". El punto cero es el escenario correcto: casi todos los tiles saldrán vacíos y eso **no es un bug**. Verifica que el saludo use tu nombre real y que los textos vacíos sean exactamente los del catálogo es-CL. Comprueba responsividad reduciendo el ancho de la ventana (los tiles deben reacomodarse, no romperse).

> **Resultado esperado.** Inicio se ve ordenado y vacío: encabezado con tu nombre, worklist con sus textos de "sin pendientes", y accesos de Operación funcionales. Ningún tile en error; ninguna métrica de color encendida sin datos.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 0.3 · Verificación del estado de la licencia

#### Paso 0.3 — Confirmar que la licencia está Válida y ver sus módulos y límites

> **Contexto.** Lo ejecuta **Víctor Rubilar (Admin)**. La licencia gobierna qué módulos están disponibles (eje distinto del RBAC, que gobierna al usuario). Antes de construir, hay que confirmar que la instalación tiene una licencia **Válida**, con la edición correcta, los módulos incluidos y los límites contratados (nodos/usuarios). Esto es control de sanidad: si la licencia no estuviera sana, la plataforma operaría degradada (solo lectura) y el resto de la prueba no reflejaría el comportamiento normal.

1. Observa la parte superior de la aplicación: **NO debe aparecer** el banner global de licencia (`LicenseBanner`). Ese banner solo se muestra cuando el estado NO es "Válida"; su ausencia es buena señal.
2. Abre **Configuración › Licencia** navegando a `/configuracion?tab=license` (o entra a Configuración y elige la pestaña **"Licencia"**).
3. Lee el panel de estado y verifica campo por campo:
   - **"Estado"** debe decir **"Válida"**.
   - **"Edición"**: registra la edición mostrada.
   - **"Vencimiento"**: registra la fecha (en formato es-CL).
   - **"Días restantes"**: registra el número.
4. Revisa el bloque **"Módulos incluidos"** y confirma que aparecen los chips esperados: **Núcleo, Estructura, Plantillas, Bitácoras, Rondas, Incidencias, Excepciones, Órdenes de trabajo, Cambio de turno, Notificaciones, Temas, Inteligencia Artificial, Dashboards**.
5. Verifica los **límites contratados** de nodos y usuarios que muestre el panel (tope de nodos de estructura y de usuarios activos): anótalos, porque marcarán el techo al crear la estructura (Fase 3) y los usuarios (Fase 2).
6. Lee la sección **"Cómo renovar"** y confirma que describe la renovación **por archivos, sin internet en la planta** (solicitud `renovacion.lreq` junto al archivo de licencia en `./license`; el proveedor devuelve `license.lic`; se toma en el próximo arranque o re-verificación).

> **Qué observar.** El panel es **solo lectura**: la licencia se administra por archivos con el proveedor, no desde la UI. Si algún chip de módulo faltara respecto a la lista esperada, o si el estado no fuera "Válida", es un hallazgo (afectaría a las fases siguientes). La fecha de vencimiento debe respetar el formato regional es-CL. Los textos de "Cómo renovar" deben insistir en que **no requiere internet** (coherente con el requisito air-gapped). Confirma que en ningún momento la UI ofrezca "cargar la licencia por internet" o similar.

> **Resultado esperado.** La licencia está **Válida**, con edición, vencimiento y días restantes visibles, todos los módulos incluidos presentes como chips, los límites de nodos/usuarios legibles, y la guía de renovación por archivos. Sin banner global de advertencia en la parte superior.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 0.4 — Recorrer la navegación con permisos de administrador

> **Contexto.** Lo ejecuta **Víctor Rubilar (Admin)**. Como superadministrador, Víctor ve TODO el menú: es la ocasión perfecta para inventariar qué módulos existen y cómo se agrupan, y para probar los controles de la barra superior. Más adelante, cuando ingresen roles acotados (operador, mantenedor, gerente), compararás su menú recortado contra este menú completo para validar que el RBAC oculta lo que corresponde.

1. Recorre el **menú lateral (sidebar)** y confirma que los módulos aparecen agrupados en tres grupos:
   - **"Operación"**: Inicio, Panorama, Bitácoras, Mis rondas, Incidencias, Excepciones, Cambio de turno, Órdenes de trabajo, Notificaciones (según licencia y permiso).
   - **"Diseño y datos"**: Plantillas, Flujos, Datos de referencia, Calendario operacional, Calendario fiscal, Programación de rondas.
   - **"Administración"**: Estructura, Seguridad, Configuración (y catálogos de incidencias/órdenes según corresponda).
2. En la **barra superior** ubica y prueba:
   - El **selector de estructura** con la etiqueta **"Estás en"** (en punto cero mostrará la estructura por defecto sembrada; aún no existe "Operación Mina Cerro Áspero", que se crea en Fase 3).
   - La **campanita** de notificaciones: ábrela; en punto cero debe mostrar **"Sin notificaciones nuevas."**.
   - El **menú de perfil** (avatar): ábrelo y confirma las opciones **"Mi seguridad"**, **"Mis notificaciones"**, **"Preferencias"**, **"Acerca de"** y **"Cerrar sesión"**.
3. En **"Preferencias"** localiza el conmutador de **Tema** (Oscuro / Claro / Automático) y el de **Densidad** (Cómoda / Compacta). Prueba alternar Claro/Oscuro/Automático y observa que el workspace cambia en vivo; déjalo en Oscuro.

> **Qué observar.** Con permisos de administrador debes ver todos los grupos y módulos. Toma nota de la lista completa: será tu referencia para validar el ocultamiento por permiso en fases posteriores. El conmutador de tema del workspace vive en el menú/topbar (Preferencias), NO en Configuración: no lo confundas con la administración de paletas de la Fase 1. El cambio de tema debe aplicarse sin recargar. La campanita y el menú de perfil deben abrir y cerrar sin errores. Verifica que la barra superior sea usable en pantalla angosta (tablet).

> **Resultado esperado.** El sidebar muestra los tres grupos (Operación / Diseño y datos / Administración) con todos los módulos visibles para el admin; la barra superior expone selector "Estás en", campanita ("Sin notificaciones nuevas.") y menú de perfil con sus cinco opciones; el conmutador claro/oscuro/auto funciona en vivo desde Preferencias.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### Registro de hallazgos de la Fase 0

| N.º | Paso | Módulo/Pantalla | Severidad | Descripción | Estado |
|-----|------|-----------------|-----------|-------------|--------|
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |

---

## Fase 1 · Configuración inicial de la plataforma

Con el administrador dentro y la licencia sana, el siguiente paso natural es **vestir la instalación con la identidad de Cerro Áspero** y fijar sus reglas globales antes de que entre nadie más. Esta fase se hace toda en **Configuración** (`/configuracion`, requiere el permiso `module:settings:view`) y la ejecuta **Víctor Rubilar (Admin)**. Vas a recorrer las pestañas EN ORDEN — **Seguridad, Bitácoras, Notificaciones, Correo saliente, Inteligencia Artificial, Identidad, Apariencia, Licencia** — dejando cada una configurada con los valores del canon: nombre y logo de la empresa, tema/zona/idioma por defecto, la paleta de marca, la política de MFA para gobernar períodos, la ventana de edición de bitácoras y el comportamiento por defecto de las notificaciones. Es trabajo minucioso y de una sola vez: bien hecho aquí, todo lo que construyas después nace con la cara y las reglas correctas. Observa en cada panel dos cosas transversales: que los cambios se apliquen **en vivo, sin reiniciar**, y que queden **auditados** ("Última modificación por {nombre}").

### 1.1 · Identidad de la empresa

#### Paso 1.1 — Fijar nombre visible, logo y valores por defecto de la instalación

> **Contexto.** Lo ejecuta **Víctor Rubilar (Admin)** (requiere `settings:manage`). La pestaña **Identidad** es la marca blanca en acción: define cómo se ve la instalación de Cerro Áspero en el acceso, la barra superior y el título de la pestaña, y fija los valores por defecto (tema, zona horaria, idioma) que reciben los usuarios que aún no han elegido los suyos. Es lo primero que vestimos porque tiñe toda la experiencia siguiente.

1. Abre **Configuración › Identidad** (`/configuracion` y elige la pestaña **"Identidad"**).
2. En **"Nombre visible de la empresa"** escribe `Minera Cerro Áspero SpA` y presiona **"Guardar"**.
3. En **"Logo de la empresa"** presiona **"Subir logo"** y sube un archivo **PNG, JPEG o WebP** de **hasta 512 KB** (fondo transparente recomendado, ~512 px de ancho). Intenta a propósito subir un **SVG** para verificar que se rechace.
4. En **"Valores por defecto de la instalación"** configura:
   - **"Tema por defecto"** = **"Oscuro (marca, por defecto)"**.
   - **"Zona horaria"** = `America/Santiago`.
   - **"Idioma"** = `Español (Chile)`.
5. Guarda los cambios.

> **Qué observar.** Al guardar el nombre y el logo, la aplicación debe reflejarlo **en vivo, sin reiniciar**: la barra superior, el título de la pestaña del navegador y la próxima pantalla de acceso deben mostrar "Minera Cerro Áspero SpA" y el logo. El **SVG debe ser rechazado por seguridad** (mensaje explícito); un archivo sobre 512 KB debe dar el aviso de tamaño ("El archivo supera el máximo de 512 KB."). Sin logo, la app usa un **monograma con las iniciales**. Los valores por defecto **no pisan** las preferencias personales ya elegidas por un usuario. Confirma el pie de auditoría **"Última modificación por Víctor Rubilar"**. Si te faltara el permiso, el panel diría **"Solo lectura: no tienes permiso para editar los ajustes."** (no es tu caso como admin).

> **Resultado esperado.** La instalación queda identificada como "Minera Cerro Áspero SpA" con su logo aplicado en vivo en login, topbar y título; el SVG rechazado; y los valores por defecto en Oscuro / America/Santiago / Español (Chile). Cambios auditados.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 1.2 · Apariencia (paleta de marca)

#### Paso 1.2 — Crear y publicar la paleta "Marca Cerro Áspero"

> **Contexto.** Lo ejecuta **Víctor Rubilar (Admin)** (requiere `theme:manage`). La pestaña **Apariencia** permite construir paletas de color de marca (variante clara y oscura), verificar su contraste WCAG AA, publicarlas y elegir cuál reciben los usuarios por defecto. Para Cerro Áspero crearemos una paleta propia partiendo de una plantilla curada, la ajustaremos y la publicaremos. Es lo que da coherencia visual a toda la operación.

1. Abre **Configuración › Apariencia**.
2. Presiona **"Desde plantilla"** para partir de una plantilla curada (elige una cercana a la identidad índigo de Cerro Áspero) y usa **"Usar plantilla"**; alternativamente, presiona **"Nueva paleta"** para partir en blanco.
3. En el editor completa **"Nombre"** = `Marca Cerro Áspero`. (Opcional: agrega una **"Descripción"**.)
4. Con el selector de **"Variante"** revisa y ajusta tanto **"Tema oscuro"** como **"Tema claro"**. Edita los tokens agrupados en:
   - **"Superficies"**, **"Texto"**, **"Bordes"**, **"Acentos de marca"** y **"Colores de estado"**.
   - Usa **"Volver al valor de la marca"** en cualquier token que quieras devolver al default Lyra.
5. Revisa el panel **"Contraste (WCAG AA)"**: debe indicar que los pares clave cumplen (texto requiere 4.5:1, UI requiere 3:1).
6. Presiona **"Crear paleta"** (o **"Guardar cambios"** si ya existía).
7. Activa el toggle **"Publicada"** y luego **"Marcar por defecto"** para que sea la que reciben los usuarios.

> **Qué observar.** La **vista previa en vivo** debe aplicar los colores al workspace al instante mientras editas. El panel de contraste debe advertir si algún par no cumple AA (texto 4.5:1 / UI 3:1) y no dejar pasar una paleta ilegible como si estuviera bien. **"Marcar por defecto" exige publicar primero** (si intentas marcarla sin publicar, debe avisar "Publica la paleta antes de marcarla por defecto"). Prueba también **"Duplicar"** (crea "Marca Cerro Áspero (copia)") y **"Eliminar"** sobre una copia de prueba. Recuerda que el conmutador claro/oscuro/auto del workspace vive en el menú/topbar (Preferencias), no aquí: aquí se **construye** la paleta, allá el usuario **elige** el modo. Si te faltara `theme:manage`, el panel diría "Solo lectura: no tienes permiso para administrar temas.".

> **Resultado esperado.** Queda creada, publicada y marcada por defecto la paleta "Marca Cerro Áspero", con variantes oscura y clara que cumplen WCAG AA, y la vista previa refleja los colores en vivo. Duplicar/eliminar funcionan sobre copias de prueba.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 1.3 · Configuración regional (verificación transversal)

#### Paso 1.3 — Confirmar que el formato regional se aplica en toda la app

> **Contexto.** Lo ejecuta **Víctor Rubilar (Admin)**. El idioma y la zona horaria se definieron en **Identidad** (Paso 1.1); no hay una pestaña "regional" separada. Este paso verifica que esa configuración se refleje de forma **transversal**: fechas, números y moneda deben mostrarse según el locale activo (es-CL, CLP, America/Santiago) en todas las pantallas, no solo en Configuración.

1. Con Idioma = `Español (Chile)` y Zona = `America/Santiago` ya guardados en Identidad, navega a un par de pantallas con datos de fecha/hora (por ejemplo Configuración › Licencia, que muestra el vencimiento, y más adelante cualquier grilla con fechas).
2. Observa el formato de las fechas y horas.
3. Observa cualquier valor numérico o monetario (la moneda del negocio es **CLP**).
4. Comprueba que el conmutador de **Tema** claro/oscuro/auto sigue viviendo en el menú/topbar (Preferencias), no en esta configuración.

> **Qué observar.** Las fechas deben aparecer en formato chileno (día/mes/año) y las horas en zona America/Santiago; los números y montos, con separadores es-CL y moneda CLP donde corresponda. Nada debe verse "hardcodeado" en otro formato (por ejemplo, fechas en formato anglosajón mes/día). El idioma de TODA la UI debe estar en es-CL.

> **Resultado esperado.** La app entera respeta el locale es-CL / CLP / America/Santiago fijado en Identidad, con fechas, números y moneda formateados por región de forma consistente.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 1.4 · Inteligencia Artificial

#### Paso 1.4 — Configurar y probar el proveedor de IA

> **Contexto.** Lo ejecuta **Víctor Rubilar (Admin)** (requiere `ai:config`). La pestaña **Inteligencia Artificial** define el proveedor que usará la plataforma para los resúmenes de turno y futuras capacidades. En una faena air-gapped, lo importante es que la IA sea opcional y que, con un modelo local, los datos no salgan de la planta. Para la prueba dejaremos IA en "Ninguno" (resumen determinista, siempre disponible) o configuraremos "Local" si hay un endpoint OpenAI-compatible a mano, y ejercitaremos el botón "Probar".

1. Abre **Configuración › Inteligencia Artificial**.
2. Revisa el toggle **"Activar IA"**. Si vas a dejar el resumen determinista, puedes dejar la IA sin activar; si vas a probar un proveedor, actívalo.
3. En **"Proveedor"** elige una opción:
   - **"Ninguno (sin IA, resumen determinista)"** — modo por defecto, offline, siempre disponible.
   - **"Anthropic (nube)"** — envía el contenido del resumen a la nube de Anthropic (NO recomendado en air-gapped).
   - **"Local / OpenAI-compatible (Ollama, vLLM…)"** — apunta a un endpoint local; los datos NO salen de la red.
4. Si eliges Local: completa **"Modelo"** (nombre del modelo del endpoint), **"URL del endpoint"** (por ejemplo `http://localhost:11434/v1` para Ollama) y, si el endpoint lo requiere, **"API key"** (se guarda cifrada y write-only).
5. Presiona **"Probar"** para hacer una generación real corta.
6. Presiona **"Guardar configuración"**.

> **Qué observar.** El botón **"Probar"** hace una generación real (sin guardar) y muestra un banner **verde** de éxito ("La IA respondió correctamente") o **rojo** de error ("No se pudo generar con el proveedor de IA") con el motivo. La **"API key" es write-only**: se guarda cifrada y **nunca se muestra de vuelta**; dejarla vacía conserva la guardada. Con proveedor "Ninguno", el resumen de turno cae al modo **determinista** (offline). El texto de ayuda del proveedor local debe recordar que, con un modelo LOCAL, los datos NO salen de tu red (coherente con air-gap). Cambios auditados; sin permiso, panel en solo lectura.

> **Resultado esperado.** El proveedor de IA queda configurado según lo elegido (Ninguno o Local), el botón "Probar" devuelve un banner verde/rojo coherente con el estado real del endpoint, y la configuración se guarda cifrada y auditada.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 1.5 · Correo saliente (SMTP)

#### Paso 1.5 — Configurar el servidor de correo saliente y probar el envío

> **Contexto.** Lo ejecuta **Víctor Rubilar (Admin)** (requiere `notification:config`). La pestaña **Correo saliente** define el servidor SMTP que usará la plataforma para las notificaciones por correo y la recuperación de contraseña. En el entorno de prueba usaremos **Mailpit** (captura los correos sin enviarlos), ideal para verificar el flujo sin depender de un servidor real ni de internet saliente.

1. Abre **Configuración › Correo saliente**.
2. Activa el toggle **"Correo activado"**.
3. En **"Proveedor"** elige la opción adecuada. Para la prueba local, selecciona **Mailpit** (o "Personalizado"); las demás opciones disponibles son Gmail, Microsoft 365, Amazon SES y SendGrid.
4. Completa el **"Servidor SMTP"**: **"Host"** y **"Puerto"** de Mailpit (por defecto captura en `http://localhost:8025` la bandeja; el SMTP suele ser host local, puerto 1025), deja **"Conexión TLS implícita (puerto 465)"** **desmarcado** (Mailpit usa STARTTLS/sin TLS). Usuario y contraseña: Mailpit no los requiere.
5. En **"Remitente"** completa **"Nombre visible"** (por ejemplo `Lyra WatchLog · Cerro Áspero`) y **"Correo del remitente"** (por ejemplo `no-reply@cerroaspero.cl`).
6. Presiona **"Probar conexión"** para verificar que el servidor responde.
7. Presiona **"Enviar prueba"**, indica un correo de destino y confirma.
8. Presiona **"Guardar configuración"**.

> **Qué observar.** **"Probar conexión"** debe devolver "Conexión correcta: el servidor respondió." o el motivo del fallo. **"Enviar prueba"** exige un correo de destino ("Indica un correo de destino para la prueba.") y, con Mailpit, el correo debe aparecer en su bandeja (`http://localhost:8025`) sin salir a internet. La **contraseña SMTP se guarda cifrada** y nunca se muestra; dejarla vacía no la cambia. Si el correo está apagado, las notificaciones quedan en la bandeja como **"suprimidas"**. Las pruebas usan los valores del formulario aunque no los hayas guardado. Cambios auditados.

> **Resultado esperado.** El correo saliente queda activo y apuntando a Mailpit; "Probar conexión" y "Enviar prueba" tienen éxito y el mensaje aparece en la bandeja de Mailpit; la configuración se guarda cifrada y auditada.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 1.6 · Reglas globales: Seguridad, Bitácoras y Notificaciones

#### Paso 1.6 — Exigir MFA para gobernar períodos (pestaña Seguridad)

> **Contexto.** Lo ejecuta **Víctor Rubilar (Admin)**. La pestaña **Seguridad** de Configuración concentra controles de seguridad transversales. El más relevante para la operación de Cerro Áspero es exigir re-autenticación con segundo factor para las acciones de gobernanza de período (cerrar, reabrir, bloquear, desbloquear), práctica GxP. Lo dejamos exigido para que esas acciones queden blindadas.

1. Abre **Configuración › Seguridad**.
2. Ubica **"Exigir MFA para gobernar períodos"** y activa los cuatro toggles según su descripción:
   - **"Al cerrar un período (OPEN → CLOSED)"**.
   - **"Al reabrir un período (CLOSED → OPEN)"**.
   - **"Al bloquear un período (CLOSED → LOCKED)"**.
   - **"Al desbloquear un período (LOCKED → CLOSED)"**.
3. Guarda.

> **Qué observar.** Cada toggle es independiente. La ayuda debe advertir que el actor debe tener MFA enrolado para poder ejecutar la acción exigida. Los cambios quedan auditados ("Última modificación por Víctor Rubilar") y se aplican de inmediato. Sin permiso, el panel muestra "Solo lectura: no tienes permiso para editar los ajustes.".

> **Resultado esperado.** Los cuatro toggles de MFA para gobernar períodos quedan activados y auditados; las acciones de período exigirán segundo factor cuando se ejerciten (se verifica en la fase de calendarios/períodos).

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 1.7 — Definir la ventana de edición global de bitácoras (pestaña Bitácoras)

> **Contexto.** Lo ejecuta **Víctor Rubilar (Admin)**. La pestaña **Bitácoras** fija el plazo por defecto para editar una entrada de bitácora (las plantillas pueden definir el suyo). Vencido el plazo, solo se corrige con permiso de excepción y motivo auditado (práctica GxP). Establecer una ventana razonable desde el inicio protege la integridad de los registros operacionales.

1. Abre **Configuración › Bitácoras**.
2. En **"Ventana de edición global"** define **"Duración"** (por ejemplo, 12) y **"Unidad"** (elige **"Horas"**). Dejar la duración vacía significa **"Sin límite"**.
3. En **"Ancla del plazo"** elige **"Desde la captura del registro (recomendado)"** (la alternativa estricta es "Desde la fecha del evento (estricta)").
4. Activa **"Exigir MFA al editar fuera de ventana"** para reforzar la corrección excepcional.
5. Guarda.

> **Qué observar.** El texto de ayuda aclara que la ventana aplica de inmediato (no requiere publicar) y que vencida solo se corrige con el permiso de excepción y motivo auditado. Con duración vacía debe interpretarse como **sin límite**. El ancla "Desde la captura" es la recomendada; "Desde la fecha del evento" es la estricta. Cambios auditados y en vivo.

> **Resultado esperado.** La ventana de edición global queda configurada (p. ej. 12 horas, ancla "Desde la captura", MFA fuera de ventana activo) y auditada; regirá para las bitácoras que no definan su propia ventana.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 1.8 — Fijar el comportamiento por defecto de las notificaciones (pestaña Notificaciones)

> **Contexto.** Lo ejecuta **Víctor Rubilar (Admin)**. La pestaña **Notificaciones** de Configuración define el comportamiento por defecto de los avisos cuando un flujo no configura el suyo. Es una red de seguridad: garantiza que las transiciones sin aviso explícito igualmente notifiquen a alguien sensato (los roles del estado destino).

1. Abre **Configuración › Notificaciones**.
2. En **"Avisos de transición"** activa **"Las transiciones sin configuración avisan a los roles del estado destino"**.
3. Guarda.

> **Qué observar.** La ayuda debe explicar que esto solo aplica cuando una transición de flujo NO configura su propio aviso (es un default, no pisa configuraciones explícitas). Cambios auditados y en vivo.

> **Resultado esperado.** El comportamiento por defecto de avisos de transición queda activado y auditado; las transiciones sin aviso propio notificarán a los roles del estado destino.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 1.9 — Verificar el gobierno por permiso y la auditoría transversal de Configuración

> **Contexto.** Lo ejecuta **Víctor Rubilar (Admin)**. Antes de cerrar la fase, comprueba dos garantías transversales que la plataforma promete en toda Configuración: que cada panel respeta el permiso del usuario (solo lectura si falta) y que todo cambio queda auditado y se aplica en vivo. Como admin ves todo; la restricción real por permiso se validará a fondo cuando entren los roles acotados (Fase 2 en adelante).

1. Recorre nuevamente las pestañas configuradas (Identidad, Apariencia, IA, Correo saliente, Seguridad, Bitácoras, Notificaciones) y en cada una localiza el pie de auditoría **"Última modificación por Víctor Rubilar"**.
2. Confirma que ningún cambio pidió reiniciar el servidor ni la aplicación.
3. Recuerda que, para un usuario SIN el permiso correspondiente, cada panel se muestra en modo **"Solo lectura: no tienes permiso para editar los ajustes."** (o el equivalente de temas: "Solo lectura: no tienes permiso para administrar temas.").

> **Qué observar.** La auditoría debe reflejar al actor real (Víctor Rubilar) y la fecha en formato es-CL. Los mensajes de "solo lectura" son la evidencia de que la autorización se decide en el backend (el frontend solo oculta o deshabilita). Nada debe requerir reinicio: la marca blanca, la paleta, la IA, el correo y las reglas se aplican en caliente.

> **Resultado esperado.** Todas las pestañas de Configuración muestran su pie de auditoría con el administrador como último editor; los cambios se aplicaron en vivo; y queda claro el patrón de "solo lectura" para usuarios sin permiso, que se probará con roles acotados más adelante.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### Registro de hallazgos de la Fase 1

| N.º | Paso | Módulo/Pantalla | Severidad | Descripción | Estado |
|-----|------|-----------------|-----------|-------------|--------|
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |


## Fase 2 · Seguridad: roles y usuarios

Con la instalación recién activada, el único que puede entrar es el **Administrador** (Víctor Rubilar, `admin@cerroaspero.cl`), creado por el asistente `/setup`. Nadie más existe: ni la supervisora del turno, ni los operadores de terreno, ni la prevencionista. Antes de dibujar un solo nodo de la faena o cargar una plantilla, hay que decidir **quién puede hacer qué**. Ese es el corazón de esta fase, y también la parte que más se audita en una minera: el modelo de autorización de Lyra WatchLog no se hardcodea, se **configura** y queda **registrado**.

En Lyra WatchLog la autorización se decide SIEMPRE en el backend (el frontend solo oculta o deshabilita) y descansa sobre **cuatro dimensiones ortogonales** que conviene tener claras antes de crear el primer rol, porque a lo largo de toda la prueba vas a apoyarte en ellas:

1. **Módulos / pantallas** — qué secciones ve el usuario (permisos `module:*:view`, ej. `module:incidents:view`).
2. **Acciones / funcionalidades** — qué operaciones puede ejecutar dentro de un módulo (ej. `incident:create`, `workorder:edit`, `logentry:fill`).
3. **Transiciones de workflow** — quién puede empujar un flujo de un estado al siguiente. Esta dimensión es especial: además del permiso genérico (`incident:transition`, `workorder:transition`, `shifthandover:sign`/`acknowledge`), el flujo puede exigir un actor concreto **por transición** (es un DATO del flujo, no solo un permiso de catálogo). Se prueba a fondo en las fases de Incidencias, OT y Cambio de turno.
4. **Alcance de datos (ABAC)** — sobre QUÉ datos actúa el permiso. Se define por **nodo** de la estructura (con o sin descendientes) y por **plantilla/bitácora**. OJO: el alcance de datos **no es un permiso**; es un eje aparte que se combina con los tres anteriores (debes cumplir ambos).

Esta separación es la que permite, por ejemplo, que un operador **pueda** llenar una bitácora (dimensión 2) pero solo en su planta (dimensión 4), o que un supervisor **firme** un cambio de turno (dimensión 3) pero no configure la seguridad (dimensión 1). Vamos a materializarla creando primero los roles, luego las personas.

Trabajas todo esta fase como **Administrador**. La pantalla es **Seguridad** (`/seguridad`), con cuatro pestañas: **Usuarios** (permiso `user:read`), **Roles y permisos** (`role:read`), **Política** (`security:policy:manage`) y **Auditoría** (`audit:read`).

---

### 2.1 · Roles y permisos

Un **rol** es un conjunto de permisos con nombre, reutilizable, que se asigna a personas. Los permisos de un usuario son la **unión** de los permisos de todos sus roles. En Cerro Áspero definiremos seis roles operativos, tomados de la tabla de personas del caso.

#### Paso 2.1 — Crear el rol `gerente-operaciones`

> **Contexto.** Lo hace el **Administrador**. Empezamos por el rol de más alto nivel de lectura: la gerencia (Patricia Núñez). Este rol no edita la operación; observa el Panorama cross-estructura, los dashboards y la lectura amplia. Sirve para demostrar que "ver todo" y "operar" son cosas distintas, y que se puede exigir MFA a un rol sensible.

1. En el menú lateral entra a **Seguridad** (`/seguridad`).
2. Abre la pestaña **Roles y permisos**.
3. Pulsa **Nuevo rol** (arriba a la derecha). Se abre el drawer **Nuevo rol** (ancho 760px) con tres pestañas: **Datos**, **Permisos**, **Alcance**.
4. En la pestaña **Datos**:
   - **Clave**: escribe `gerente-operaciones` (mono, minúsculas, números y guiones; el hint dice "Identificador estable: minúsculas, números y guiones (ej. supervisor-turno)"). Esta clave será **inmutable** tras el alta.
   - **Nombre**: `Gerente de Operaciones`.
   - **Descripción**: `Gerencia: Panorama cross-estructura, dashboards y lectura amplia. Sin edición operativa.`
   - Activa el toggle **Exigir MFA** (hint: "Los usuarios con este rol deberán activar MFA (si el modo global lo honra)").
5. Cambia a la pestaña **Permisos**. Verás la **matriz de permisos** (PermissionMatrix) con un buscador ("Buscar permiso (clave, descripción o grupo)…") y los 77 permisos del catálogo agrupados por familia (Seguridad, Estructura, Usuarios, Roles, Plantillas, Flujos, Datos de referencia, Calendario operacional, Períodos contables, Configuración, Bitácoras, Programación de rondas, Notificaciones, Incidencias, Cambio de turno, Inteligencia Artificial, Apariencia, Órdenes de trabajo). Cada grupo tiene su propio checkbox de grupo y un contador `seleccionados/total`.
   - Marca, según el diseño de rol del canon: `module:dashboard:cross-view`; los permisos de **vista** de Incidencias (`module:incidents:view`), Órdenes de trabajo (`module:workorders:view`), Bitácoras (`module:logbook:view`) y Estructura (`module:structure:view`); y `audit:read`.
   - Usa el buscador para encontrar cada uno por clave (ej. teclea `cross-view`, luego `audit:read`).
6. NO abras la pestaña **Alcance**: al crear un rol nuevo aún no está disponible (dice "Guarda el rol primero; luego podrás asignarle el alcance por nodo y por plantilla"). Este rol, además, NO lleva alcance de nodo: la gerencia ve toda la estructura.
7. Pulsa **Guardar** (botón primario del pie del drawer).

> **Qué observar.** El campo **Clave** es `mono` y solo acepta minúsculas, números y guiones (prueba a teclear una mayúscula o un espacio: debe rechazarlo con "Usa solo minúsculas, números y guiones."). El **contador** de la pestaña **Permisos** debe reflejar cuántos marcaste. La pestaña **Alcance** en modo creación muestra solo el hint, no los pickers. El toast al guardar dice "Rol creado".

> **Resultado esperado.** El rol `gerente-operaciones` aparece en la grilla de **Roles y permisos** con su nombre, la columna **MFA** marcada como "Exige", el conteo de **Permisos** y **Usuarios** en 0.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 2.2 — Crear el rol `planificador`

> **Contexto.** Lo hace el **Administrador**. Rodrigo Salas es quien construye la operación "en frío": plantillas, flujos, datos de referencia, calendarios y la programación de rondas. Este rol concentra los permisos de configuración de contenido (no de seguridad). No exige MFA.

1. En **Seguridad › Roles y permisos**, pulsa **Nuevo rol**.
2. Pestaña **Datos**:
   - **Clave**: `planificador`.
   - **Nombre**: `Planificador`.
   - **Descripción**: `Diseña plantillas, flujos, datos de referencia, calendarios y programa rondas.`
   - Deja **Exigir MFA** apagado.
3. Pestaña **Permisos**. Marca los grupos/permisos de configuración de contenido del canon: **Plantillas** (`module:templates:*`, `template:*`), **Flujos** (`module:workflows:*`, `workflow:*`), **Datos de referencia** (`module:referencedata:*`, `referencelist:*`), **Calendario operacional** (`module:opscalendar:*`, `opscalendar:manage`) y **Programación de rondas** (`schedule:*`). Aprovecha el **checkbox de grupo** para marcar familias completas de un clic.
4. Pulsa **Guardar**.

> **Qué observar.** Al marcar el checkbox de un **grupo** completo, el contador `seleccionados/total` del grupo debe saltar a "todos". El buscador filtra por clave, descripción o grupo (teclea `plantilla` y confirma que aparece el grupo Plantillas).

> **Resultado esperado.** `planificador` en la grilla, sin MFA, con un conteo alto de permisos (varias familias completas). Toast "Rol creado".

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 2.3 — Crear el rol `supervisor-turno`

> **Contexto.** Lo hace el **Administrador**. Es el rol operativo más rico: María Fuentes (turno A saliente) y Óscar Díaz (turno B entrante) lo comparten. Toca bitácoras, incidencias (crea/edita/asigna/transiciona), órdenes de trabajo (aprueba puertas) y cambio de turno (compila, firma, acusa). Exige MFA.

1. En **Roles y permisos**, pulsa **Nuevo rol**.
2. Pestaña **Datos**:
   - **Clave**: `supervisor-turno`.
   - **Nombre**: `Supervisor de turno`.
   - **Descripción**: `Supervisa la operación durante el turno: bitácoras, incidencias, OT y cambio de turno.`
   - Activa **Exigir MFA**.
3. Pestaña **Permisos**. Marca, según el canon:
   - Bitácoras: `module:logbook:view`, `logentry:create`, `logentry:fill`, `logentry:transition`.
   - Incidencias: `module:incidents:view`, `incident:create`, `incident:edit`, `incident:assign`, `incident:comment`, `incident:transition`, `incident:cancel`, `exception:triage`.
   - Cambio de turno: `module:handover:view`, `shifthandover:compile`, `shifthandover:sign`, `shifthandover:acknowledge`.
   - Órdenes de trabajo: `module:workorders:view`, `workorder:create`, `workorder:edit`, `workorder:assign`, `workorder:comment`, `workorder:transition`, `workorder:activity:manage`, `workorder:checklist:manage`, `workorder:roster:manage`.
4. Pulsa **Guardar**.

> **Qué observar.** Verifica que aparecen las tres dimensiones que discutimos: acciones (`incident:create`), transiciones de workflow (`incident:transition`, `workorder:transition`, `shifthandover:sign`/`acknowledge`) y vistas de módulo. El contador de la pestaña Permisos debe ser considerable.

> **Resultado esperado.** `supervisor-turno` en la grilla con MFA "Exige" y muchos permisos. Toast "Rol creado".

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 2.4 — Crear el rol `operador`

> **Contexto.** Lo hace el **Administrador**. Jorge Ramírez es operador de terreno: ejecuta rondas, llena secciones de bitácora y reporta incidencias. Es un rol deliberadamente **acotado**: se le limitará después el alcance de datos a la Planta Concentradora (dimensión 4, ABAC). Aquí solo definimos sus permisos (dimensión 2); el alcance se pinta a nivel de USUARIO en el Paso 2.11.

1. **Nuevo rol** › pestaña **Datos**:
   - **Clave**: `operador`.
   - **Nombre**: `Operador`.
   - **Descripción**: `Operador de terreno: ejecuta rondas, llena bitácoras y reporta incidencias.`
   - **Exigir MFA** apagado.
2. Pestaña **Permisos**: marca `round:execute`, `module:logbook:view`, `logentry:fill`, `incident:create`.
3. Pulsa **Guardar**.

> **Qué observar.** El rol tiene MUY pocos permisos: es lo correcto. Fíjate que NO incluye `logentry:create` ni `logentry:transition` (solo `fill`): el operador rellena, pero no abre ni cierra la entrada. Esa es la granularidad que buscamos.

> **Resultado esperado.** `operador` en la grilla, sin MFA, con 4 permisos. Toast "Rol creado".

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 2.5 — Crear el rol `mantenedor`

> **Contexto.** Lo hace el **Administrador**. Luis Tapia ejecuta órdenes de trabajo: plan de actividades, checklists de ejecución y avances. Ve OT y gestiona actividades/checklists, pero no aprueba puertas ni crea OT. Sin MFA.

1. **Nuevo rol** › **Datos**:
   - **Clave**: `mantenedor`.
   - **Nombre**: `Mantenedor`.
   - **Descripción**: `Ejecuta OT: plan de actividades, checklists de ejecución y avances.`
   - **Exigir MFA** apagado.
2. **Permisos**: marca `module:workorders:view`, `workorder:view`, `workorder:activity:manage`, `workorder:checklist:manage`, `logentry:fill`.
3. Pulsa **Guardar**.

> **Qué observar.** Contrasta con `supervisor-turno`: el mantenedor NO tiene `workorder:transition` (no aprueba puertas) ni `workorder:create`. La segregación ejecutor/aprobador queda dibujada desde el rol.

> **Resultado esperado.** `mantenedor` en la grilla, sin MFA. Toast "Rol creado".

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 2.6 — Crear el rol `prevencion-riesgos`

> **Contexto.** Lo hace el **Administrador**. Camila Vega es HSE/Prevención: hace triage de excepciones (incluidas las críticas), CAPA y verificación de eficacia, reportabilidad, y revisa checklists/PTW manteniendo la segregación revisor≠ejecutor. Exige MFA.

1. **Nuevo rol** › **Datos**:
   - **Clave**: `prevencion-riesgos`.
   - **Nombre**: `Prevención de Riesgos`.
   - **Descripción**: `HSE: triage de excepciones (incl. críticas), CAPA y verificación, reportabilidad, revisa checklists/PTW.`
   - Activa **Exigir MFA**.
2. **Permisos**: marca `module:incidents:view`, `incident:*` (todo el grupo Incidencias vía checkbox de grupo), `exception:triage`, `exception:dismiss`, `exception:dismiss-critical`, `exception:correct`, `incident:action:manage`, `incident:action:verify`, `incidentcatalog:manage`, `module:workorders:view`, `workorder:checklist:manage` (para revisar checklists/PTW).
3. Pulsa **Guardar**.

> **Qué observar.** Este es el único rol operativo con `exception:dismiss-critical` (descartar excepciones críticas) y `incident:action:verify` (verificar eficacia de CAPA): son permisos sensibles que en una minera solo debe tener Prevención. Confírmalos en la matriz.

> **Resultado esperado.** `prevencion-riesgos` en la grilla con MFA "Exige". Toast "Rol creado". Ahora hay **6 roles** creados (más el rol de sistema Administrador que ya existía, marcado como "Sistema").

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 2.7 — Inspeccionar el rol de sistema (Administrador)

> **Contexto.** Lo hace el **Administrador**. Antes de seguir, verifica la red anti-bloqueo: el rol de sistema no se puede vaciar de permisos ni eliminar, para garantizar que siempre haya quién administre. Es una salvaguarda auditable.

1. En **Roles y permisos**, abre el rol marcado **Sistema** (el del Administrador).
2. Observa el aviso en el drawer: "Rol de sistema (administrador): por protección anti-bloqueo, sus permisos no se pueden modificar ni el rol eliminar. Garantiza que siempre haya quién administre todo."
3. Cierra sin cambios (**Cancelar**).

> **Qué observar.** La matriz de permisos del rol de sistema está bloqueada y no ofrece opción de eliminar. La **Clave** aparece deshabilitada (hint "La clave no se modifica tras el alta").

> **Resultado esperado.** No se puede degradar ni borrar el rol Administrador. Salvaguarda confirmada.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

---

### 2.2 · Usuarios

Con los roles listos, damos de alta a las personas. Un **usuario** es una cuenta de acceso; hereda permisos de sus roles. Todas las contraseñas son **temporales** (el usuario las cambia al primer ingreso) y las del canon cumplen la política (≥12, con mayúscula y número).

#### Paso 2.8 — Crear a Patricia Núñez (gerente-operaciones)

> **Contexto.** Lo hace el **Administrador**. Damos de alta a la gerenta, con su rol de lectura amplia y MFA exigido por el rol.

1. En **Seguridad**, abre la pestaña **Usuarios**.
2. Pulsa **Nuevo usuario**. Se abre el drawer **Nuevo usuario** (UserDrawer).
3. Completa:
   - **Correo electrónico**: `pnunez@cerroaspero.cl`.
   - **Nombre**: `Patricia Núñez`.
   - **Contraseña temporal**: escribe `CerroAspero2026!` (o pulsa el ícono **Generar contraseña** para una aleatoria; el hint dice "El usuario deberá cambiarla en su primer ingreso." Usa el ojo para **Mostrar/Ocultar contraseña**).
   - **Roles**: marca el checkbox `Gerente de Operaciones`.
4. Pulsa **Crear usuario**.

> **Qué observar.** El campo de correo valida formato (placeholder `operador@empresa.cl`). La contraseña es `mono` y se puede mostrar/ocultar. El botón **Generar contraseña** produce una que cumple la política. El toast dice "Usuario creado".

> **Resultado esperado.** Patricia aparece en la grilla de Usuarios (columnas **Usuario**, **Estado** = "Activo", **MFA**). Como su rol exige MFA, el MFA figura como **Requerido · pendiente** (se enrola al primer ingreso, self-service).

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 2.9 — Crear a Rodrigo Salas (planificador)

> **Contexto.** Lo hace el **Administrador**. Alta del planificador, sin MFA.

1. **Usuarios › Nuevo usuario**.
2. **Correo electrónico**: `rsalas@cerroaspero.cl` · **Nombre**: `Rodrigo Salas` · **Contraseña temporal**: `Planifica2026!` · **Roles**: `Planificador`.
3. Pulsa **Crear usuario**.

> **Qué observar.** En la grilla, la columna **MFA** de Rodrigo NO muestra "Requerido" (su rol no lo exige). Su **Estado** es "Activo".

> **Resultado esperado.** Rodrigo en la grilla. Toast "Usuario creado". Guarda la credencial `rsalas@cerroaspero.cl` / `Planifica2026!` para las fases de configuración.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 2.10 — Crear a María Fuentes y Óscar Díaz (supervisor-turno)

> **Contexto.** Lo hace el **Administrador**. Los dos supervisores comparten rol; María es la saliente del turno A (compila y firma la entrega) y Óscar el entrante del turno B (recibe y acusa). Ambos exigen MFA.

1. **Usuarios › Nuevo usuario** (María):
   - **Correo electrónico**: `mfuentes@cerroaspero.cl` · **Nombre**: `María Fuentes` · **Contraseña temporal**: `Turno2026Sup!` · **Roles**: `Supervisor de turno`. Pulsa **Crear usuario**.
2. **Usuarios › Nuevo usuario** (Óscar):
   - **Correo electrónico**: `odiaz@cerroaspero.cl` · **Nombre**: `Óscar Díaz` · **Contraseña temporal**: `Turno2026Ent!` · **Roles**: `Supervisor de turno`. Pulsa **Crear usuario**.

> **Qué observar.** Ambos usuarios muestran **MFA Requerido · pendiente** (heredado del rol). Comparten exactamente los mismos permisos: la diferencia entre "saliente" y "entrante" no es de rol, es de a QUIÉN asigna cada transición el flujo de cambio de turno (dimensión 3, se prueba en la Fase de Cambio de turno).

> **Resultado esperado.** María y Óscar en la grilla, ambos con MFA requerido. Dos toasts "Usuario creado".

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 2.11 — Crear a Jorge Ramírez (operador) y acotar su alcance a la Planta Concentradora

> **Contexto.** Lo hace el **Administrador**. Jorge es operador de terreno. Además de su rol acotado, le limitaremos el **alcance de datos** (dimensión 4, ABAC) a la Planta Concentradora, para que solo vea y opere lo de su planta. Este es el paso que demuestra que el alcance de datos NO es un permiso, sino un eje aparte que se pinta a nivel de usuario. Nota: la estructura y sus nodos se crean en la Fase 3; si haces la prueba estrictamente en orden, este acotamiento por nodo se completa DESPUÉS de crear el árbol. Puedes crear ahora al usuario y volver a fijar el alcance tras la Fase 3, o dejar este sub-paso para el final de la Fase 3.

1. **Usuarios › Nuevo usuario**: **Correo electrónico** `jramirez@cerroaspero.cl` · **Nombre** `Jorge Ramírez` · **Contraseña temporal** `Operador2026!` · **Roles**: `Operador`. Pulsa **Crear usuario**.
2. En la grilla de Usuarios, haz clic en la fila de Jorge para abrir **UserDetail** (cuatro pestañas: **Datos**, **Roles**, **Alcance**, **Seguridad**).
3. Abre la pestaña **Alcance**. Verás la sección **Alcance de datos** con el subtítulo "Limita los datos visibles a los nodos seleccionados de la estructura."
4. En **Estructura organizacional** busca ("Buscar nodo…") y marca el nodo **Planta Concentradora** (creado en la Fase 3). Activa el toggle **Incluye descendientes** para que abarque Molienda, Flotación y Espesamiento.
5. Guarda (el toast de alcance dice "Alcance de datos actualizado").

> **Qué observar.** Si aún no existen nodos (antes de la Fase 3), verás "No hay nodos en la estructura para asignar." — es correcto, vuelve tras crear el árbol. Con nodos disponibles, el contador muestra "1 seleccionado". El eje de **Plantillas** (templateScope) es independiente del de nodos: se combinan (debe cumplir ambos). Fíjate en el texto por defecto sin restricción: "Sin restricción: el usuario accede a toda la estructura." — al marcar un nodo, ese texto cambia.

> **Resultado esperado.** Jorge queda acotado a la Planta Concentradora con descendientes. En las fases operativas, Jorge NO verá datos de Chancado. Toast "Alcance de datos actualizado".

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 2.12 — Crear a Luis Tapia (mantenedor) y Camila Vega (prevencion-riesgos)

> **Contexto.** Lo hace el **Administrador**. Cerramos el elenco: el mantenedor que ejecuta OT (sin MFA) y la prevencionista HSE (con MFA). Luis Tapia también quedará registrado como PERSONA en el catálogo de dotación en la Fase 4 (usuario y persona son cosas distintas).

1. **Usuarios › Nuevo usuario** (Luis): **Correo** `ltapia@cerroaspero.cl` · **Nombre** `Luis Tapia` · **Contraseña temporal** `Mantiene2026!` · **Roles**: `Mantenedor`. Pulsa **Crear usuario**.
2. **Usuarios › Nuevo usuario** (Camila): **Correo** `cvega@cerroaspero.cl` · **Nombre** `Camila Vega` · **Contraseña temporal** `Prevenir2026!` · **Roles**: `Prevención de Riesgos`. Pulsa **Crear usuario**.

> **Qué observar.** Camila muestra **MFA Requerido · pendiente**; Luis no. Ahora hay **7 usuarios** en total (los 6 del elenco + el Administrador).

> **Resultado esperado.** Ambos en la grilla. Dos toasts "Usuario creado".

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 2.13 — Verificar las opciones de Seguridad de un usuario (restablecer contraseña / MFA)

> **Contexto.** Lo hace el **Administrador**. Sin cambiar nada real, verifica las herramientas de recuperación que el admin tiene por cada usuario, y entiende el límite: el **MFA es self-service**; el administrador **no enrola por otra persona**.

1. Abre **UserDetail** de cualquier usuario (por ejemplo Patricia) y ve a la pestaña **Seguridad**.
2. Observa la sección **Contraseña** con el botón **Restablecer contraseña** (al usarlo pediría una "Contraseña temporal" y cerraría todas las sesiones del usuario, sin afectar su MFA).
3. Observa la sección **Segundo factor (MFA)** con el botón **Restablecer MFA** y la nota explicativa: "El segundo factor es self-service: cada usuario lo activa desde su perfil («Mi seguridad») escaneando el QR con su app autenticadora. El administrador no enrola por otra persona; solo puede restablecerlo si pierde el dispositivo o exigirlo desde Roles/Política."
4. No confirmes ninguna de las dos acciones (solo inspección).

> **Qué observar.** Para un usuario con MFA requerido pero aún no enrolado, el estado se lee **Requerido · pendiente**; para uno con MFA activo, **Requerido · activo**. El texto deja claro que restablecer contraseña "no afecta su segundo factor (MFA)".

> **Resultado esperado.** Las dos herramientas están visibles y explicadas; ninguna permite al admin ENROLAR el MFA por el usuario (solo restablecer). Coherente con el estándar (el admin nunca posee el secreto TOTP del usuario).

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 2.14 — Delegar la administración de "Mantención Central" a Rodrigo Salas

> **Contexto.** Lo hace el **Administrador**. La **administración delegada por estructura** (L2b) permite que alguien administre una estructura concreta (su árbol, niveles y ciclo de vida) SIN ser administrador general. Es un eje **distinto** del alcance de datos: aquí se delega **configurar** la estructura, no ver sus datos. La delegamos sobre la segunda estructura, "Mantención Central" (creada en la Fase 3), a Rodrigo Salas (o a su rol `planificador`). Nota de orden: si vas estricto, este paso se completa después de crear "Mantención Central" en la Fase 3.

1. Puedes delegar a nivel de **rol** o de **usuario**. Para delegar al **usuario** Rodrigo: abre su **UserDetail** › pestaña **Alcance** › sección **Administración delegada de estructuras**; marca **Mantención Central**; guarda (toast "Administración delegada actualizada").
2. Alternativamente, para delegar al **rol** `planificador`: abre el rol en **Roles y permisos** › pestaña **Alcance** › **Administración delegada de estructuras** › marca **Mantención Central** › **Guardar**. (Esta opción solo la ve el administrador general con `module:structure:manage`.)
3. Menciona en tus notas la **red anti-lockout**: la plataforma impide dejar una estructura sin ningún administrador válido; hay salvaguardas (3 candados) que evitan el auto-bloqueo.

> **Qué observar.** El texto de la sección aclara: "Estructuras que este usuario puede ADMINISTRAR (árbol, niveles y ciclo de vida) sin ser administrador general. Es un eje distinto del alcance de datos." Si el operador no es super-admin, verá la delegación en **solo lectura** ("Solo el administrador general … puede cambiar la administración delegada."). Sin nodos/estructuras aún, la lista dirá "No hay estructuras para delegar."

> **Resultado esperado.** Rodrigo (o su rol) queda habilitado para administrar "Mantención Central" sin ser admin general. Toast "Administración delegada actualizada".

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

---

### 2.3 · Política de seguridad

#### Paso 2.15 — Configurar la política de contraseñas, bloqueo y MFA

> **Contexto.** Lo hace el **Administrador**. La pestaña **Política** define las reglas maestras de toda la plataforma. Las endurecemos a un estándar razonable de minera y dejamos el MFA "Requerido por rol", que es el modo que hace efectivos los toggles "Exigir MFA" de los roles sensibles (gerencia, supervisión, prevención).

1. En **Seguridad**, abre la pestaña **Política**.
2. Sección **Contraseñas** ("Requisitos de complejidad e historial de contraseñas."):
   - **Longitud mínima**: `12` (rango permitido 8–128; hint "Entre 8 y 128 caracteres.").
   - Activa **Exigir mayúscula**, **Exigir número** y **Exigir símbolo**.
   - **Historial**: `5` (rango 0–24; "Cuántas contraseñas anteriores no se pueden reutilizar").
   - **Expiración**: deja el valor por defecto o fija los **días** que corresponda a la política del cliente ("Forzar cambio de contraseña cada cierto tiempo.").
3. Sección **Bloqueo por intentos** ("Protección contra fuerza bruta en el inicio de sesión."):
   - **Intentos máximos**: `5` (rango 1–20).
   - **Minutos de bloqueo**: `15` (rango 1–1440).
4. Sección **Segundo factor (MFA)** ("Control maestro del requerimiento de MFA en toda la plataforma."):
   - **Modo de MFA**: elige **Requerido por rol** (las opciones son "Opcional", "Requerido por rol", "Requerido para todos"). Su hint: "Se exige MFA a quienes tengan un rol marcado como «Exigir MFA»."
5. Pulsa **Guardar** (a su lado está **Descartar** para revertir cambios no guardados).

> **Qué observar.** Los campos numéricos deben rechazar valores fuera de rango (prueba 200 en Longitud mínima o 0 en Intentos máximos). Al elegir "Requerido por rol", el hint confirma que se apoya en los toggles "Exigir MFA" que marcaste en `gerente-operaciones`, `supervisor-turno` y `prevencion-riesgos`. El toast dice "Política actualizada".

> **Resultado esperado.** La política queda guardada. A partir de ahora, gerencia, supervisores y prevención serán obligados a enrolar MFA en su primer ingreso; los demás no.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

---

### 2.4 · Auditoría

#### Paso 2.16 — Verificar que la creación de roles y usuarios quedó auditada

> **Contexto.** Lo hace el **Administrador**. La **Auditoría** es un registro inmutable (quién, qué, cuándo, antes/después). Todo lo que acabamos de hacer —crear 6 roles, 7 usuarios, cambiar la política, delegar administración— debe estar ahí. Es la prueba de que la configuración de seguridad es trazable, requisito de cualquier auditoría minera.

1. En **Seguridad**, abre la pestaña **Auditoría** ("Registro inmutable de eventos de seguridad y configuración").
2. Usa los presets de rango: pulsa **24 h** (también existen **7 días** y **30 días**).
3. Usa los filtros: **Desde**/**Hasta**, **Acción** (placeholder "ej. login, password, role"), **Actor** (placeholder "correo del actor") y **Entidad** ("Todas las entidades"). Filtra por **Acción** tecleando `role` para ver las creaciones de rol, luego `user` para las de usuario.
4. Observa la tabla con columnas **Fecha**, **Acción**, **Actor**, **Entidad**, **IP** (y **Navegador** en el detalle).
5. Haz clic en una fila (por ejemplo, la creación del rol `supervisor-turno`): se abre **Detalle del evento** con los bloques **Antes** y **Después** (JSON) y **Metadatos**.
6. Si necesitas evidencia, usa **Exportar CSV**. Para más filas, **Cargar más**. Para limpiar, **Limpiar filtros**.

> **Qué observar.** El **Actor** de todos estos eventos debe ser `admin@cerroaspero.cl`. En la creación de un rol, el bloque **Antes** estará vacío y el **Después** mostrará el rol con sus permisos; en un cambio de política, **Antes** y **Después** muestran la diferencia. La **Fecha** debe verse en formato regional es-CL (zona America/Santiago). El contador de resultados dice "{n} eventos".

> **Resultado esperado.** Cada rol y cada usuario creado en esta fase tiene su evento correspondiente, con Antes/Después coherentes. La configuración de seguridad es completamente trazable.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

---

### Registro de hallazgos de la Fase 2

| N.º | Paso | Módulo/Pantalla | Severidad | Descripción | Estado |
|-----|------|-----------------|-----------|-------------|--------|
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |

---

## Fase 3 · Estructura organizacional

Ya sabemos QUIÉN puede hacer qué. Ahora hay que decir SOBRE QUÉ. La faena de Cerro Áspero no es un bloque plano: es una jerarquía de faena, plantas, áreas y equipos, y casi todo en Lyra WatchLog —bitácoras, rondas, incidencias, OT, alcance de datos— cuelga de esa estructura. En esta fase construimos el árbol organizacional completo de la operación minera, creamos una segunda estructura para demostrar la capacidad multi-estructura, y comprobamos el candado de licencia por cupo de nodos.

La estructura es también el eje del **alcance de datos** (dimensión 4 de la Fase 2): cuando en el Paso 2.11 acotamos a Jorge Ramírez a la "Planta Concentradora", nos referíamos a un nodo de este árbol. Por eso conviene tener el árbol completo antes de cerrar los acotamientos ABAC.

Trabajas como **Administrador** (la creación de estructuras nuevas y el multi-estructura requieren super-admin; la administración del árbol dentro de una estructura puede delegarse, como vimos con Rodrigo Salas). La pantalla es **Estructura** (`/estructura`, permiso `module:structure:view`).

---

### 3.1 · Crear la estructura principal con el asistente

#### Paso 3.1 — Provisionar "Operación Mina Cerro Áspero" con el wizard "Crear una nueva área"

> **Contexto.** Lo hace el **Administrador**. El asistente crea, en una sola transacción atómica, una estructura nueva con su identidad, sus niveles y su primer nodo raíz, dejándola operativa de inmediato. Lo usamos para levantar la operación minera principal.

1. En el menú lateral entra a **Estructura** (`/estructura`).
2. Pulsa el botón **Estructuras** (arriba) y luego **Nueva área** (abre el StructureWizard, con un **Stepper** de 3 pasos: **Identidad**, **Niveles**, **Nodo raíz**). El título del asistente es "Crear una nueva área".
3. **Paso 1 · Identidad** ("Dale nombre e identidad a la nueva área…"):
   - **Nombre del área**: `Operación Mina Cerro Áspero`.
   - **Clave**: se autogenera del nombre (quedará algo como `operacion-mina-cerro-aspero`; el canon usa la clave corta `cerro-aspero` — puedes ajustarla si el campo lo permite antes de crear, recordando que es inmutable: "Identificador estable (se autogenera del nombre). No se podrá cambiar luego.").
   - **Descripción**: `Faena de cobre de Minera Cerro Áspero SpA, Región de Atacama.`
   - **Apariencia**: elige color **índigo** e ícono **Building/Network**; observa la vista previa del badge "Estás en".
   - Pulsa **Siguiente**.
4. **Paso 2 · Niveles** ("Define los niveles de mayor a menor…"):
   - En **Plantillas rápidas** elige **Minería**, que precarga los niveles `Faena`, `Planta`, `Área`, `Equipo` (exactamente los del canon). Si no usas la plantilla, agrégalos a mano con **Agregar nivel** y ordénalos con **Subir nivel**/**Bajar nivel**; puedes **Quitar nivel**.
   - Pulsa **Siguiente**.
5. **Paso 3 · Nodo raíz** ("Crea el primer nodo (en el nivel «Faena»)…") + **Resumen**:
   - **Nombre del nodo raíz**: `Faena Cerro Áspero`.
   - **Código**: `FAE-01` (hint "Identificador corto (opcional)").
   - Revisa el bloque **Resumen** (Niveles + Nodo raíz).
   - Pulsa **Crear área**.
6. Botones de navegación disponibles en todos los pasos: **Atrás**, **Siguiente**, **Cancelar**.

> **Qué observar.** El **Stepper** marca el avance por los 3 pasos. La **Clave** se autogenera al teclear el nombre. Si dejas un paso incompleto, el asistente lo avisa ("Indica un nombre y una clave válida (mín. 2 caracteres).", "Define al menos un nivel con nombre.", "Indica el nombre del primer nodo raíz."). El provisioning es **atómico**: una sola transacción crea estructura + niveles + nodo raíz. El toast dice "Área «Operación Mina Cerro Áspero» creada y activada".

> **Resultado esperado.** La estructura queda creada, **activa** y seleccionada. El badge "Estás en" muestra "Operación Mina Cerro Áspero" con su color índigo. En `/estructura` ves el árbol con el nodo raíz **Faena Cerro Áspero** (`FAE-01`) y los 4 niveles configurados.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

---

### 3.2 · Construir el árbol de la faena

Ahora colgamos plantas, áreas y equipos bajo la faena, usando la pantalla **Estructura**. Cada nodo se crea con **Agregar hijo** (desde el detalle del nodo padre) o **Nuevo nodo raíz** (para raíces). El drawer de nodo (NodeDrawer) pide: **Nombre**, **Código**, **Descripción**, **Orden**, **Cód. externo** y **Nivel**.

#### Paso 3.2 — Crear las dos plantas bajo la faena

> **Contexto.** Lo hace el **Administrador**. Bajo "Faena Cerro Áspero" cuelgan dos plantas: la Concentradora (donde ocurre casi toda la operación de la prueba) y Chancado.

1. En `/estructura`, selecciona el nodo **Faena Cerro Áspero** en el árbol para ver su detalle.
2. En **Acciones del nodo**, pulsa **Agregar hijo**. En el NodeDrawer:
   - **Nombre**: `Planta Concentradora` · **Código**: `PL-CONC` · **Nivel**: `Planta`.
   - **Orden**: `10` · deja **Descripción** y **Cód. externo** opcionales.
   - Guarda (toast "Nodo creado").
3. Vuelve a seleccionar **Faena Cerro Áspero** y **Agregar hijo** de nuevo:
   - **Nombre**: `Chancado` · **Código**: `PL-CHAN` · **Nivel**: `Planta` · **Orden**: `20`.
   - Guarda.

> **Qué observar.** El selector **Nivel** ("Selecciona un nivel…") ofrece solo los niveles definidos (Faena, Planta, Área, Equipo). El **Código** es `mono`. El campo **Cód. externo** aclara su uso ("Clave en sistema externo: ERP, CMMS, SCADA, etc."). El árbol se expande y muestra las dos plantas bajo la faena, ordenadas por **Orden** (menor primero).

> **Resultado esperado.** Bajo la faena aparecen **Planta Concentradora** (`PL-CONC`) y **Chancado** (`PL-CHAN`).

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 3.3 — Crear las áreas de la Planta Concentradora

> **Contexto.** Lo hace el **Administrador**. La Concentradora tiene tres áreas: Molienda, Flotación y Espesamiento.

1. Selecciona **Planta Concentradora** en el árbol › **Agregar hijo**:
   - **Nombre**: `Molienda` · **Código**: `AR-MOL` · **Nivel**: `Área` · **Orden**: `10`. Guarda.
2. Selecciona **Planta Concentradora** › **Agregar hijo**:
   - **Nombre**: `Flotación` · **Código**: `AR-FLOT` · **Nivel**: `Área` · **Orden**: `20`. Guarda.
3. Selecciona **Planta Concentradora** › **Agregar hijo**:
   - **Nombre**: `Espesamiento` · **Código**: `AR-ESP` · **Nivel**: `Área` · **Orden**: `30`. Guarda.

> **Qué observar.** Las tres áreas quedan como hijas de la Concentradora, en el nivel **Área**, ordenadas 10/20/30. Al seleccionar la Concentradora, su detalle muestra la lista de **Hijos**.

> **Resultado esperado.** Molienda (`AR-MOL`), Flotación (`AR-FLOT`) y Espesamiento (`AR-ESP`) bajo la Planta Concentradora.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 3.4 — Crear el área de Chancado

> **Contexto.** Lo hace el **Administrador**. Chancado tiene, para la prueba, un área: Chancado Primario.

1. Selecciona **Chancado** en el árbol › **Agregar hijo**:
   - **Nombre**: `Chancado Primario` · **Código**: `AR-CHP` · **Nivel**: `Área` · **Orden**: `10`. Guarda.

> **Qué observar.** El nodo queda bajo Chancado, en nivel **Área**. El árbol completo ya refleja la jerarquía Faena → Planta → Área.

> **Resultado esperado.** Chancado Primario (`AR-CHP`) bajo Chancado. El árbol de la faena está armado (falta solo la capa de Equipos, que se agrega en la Fase 4).

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 3.5 — Probar "Configurar niveles" y "Mover nodo"

> **Contexto.** Lo hace el **Administrador**. Comprobamos dos herramientas de mantenimiento del árbol sin alterar la estructura final: la edición de niveles y el movimiento de un nodo. Al final dejamos todo como estaba.

1. Pulsa **Configurar niveles** (abre LevelsDrawer, "Niveles de la estructura"). Verifica que están los cuatro niveles (Faena, Planta, Área, Equipo) con su **Nombre** y **Orden**. Cierra sin cambios.
2. Selecciona un nodo hoja, por ejemplo **Espesamiento**, y en **Acciones del nodo** pulsa **Mover** (abre MoveNodeModal, "Mover nodo"). Observa que puedes elegir un **Nuevo padre** o **Sin padre (hacer nodo raíz)**; nota que los descendientes del propio nodo aparecen deshabilitados ("Descendiente del nodo"). **Cancela** sin mover (para no alterar el árbol del canon).

> **Qué observar.** El MoveNodeModal impide crear ciclos (no deja elegir un descendiente como nuevo padre). LevelsDrawer ordena los niveles por su **Orden** ascendente. Ninguna de estas dos pruebas debe cambiar el árbol final.

> **Resultado esperado.** Las herramientas funcionan; el árbol queda idéntico al del canon (Faena → 2 plantas → 4 áreas).

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

---

### 3.3 · Segunda estructura y multi-estructura

#### Paso 3.6 — Crear la estructura "Mantención Central"

> **Contexto.** Lo hace el **Administrador**. Creamos una segunda estructura, mínima, para demostrar la capacidad multi-estructura, el selector global "Estás en", la vista ejecutiva Panorama (Fase 14) y la administración delegada (que ya asignamos a Rodrigo en el Paso 2.14).

1. En `/estructura`, pulsa **Estructuras** › **Nueva área** (o **Nueva estructura** desde el StructuresDrawer).
2. Con el wizard:
   - **Paso 1 · Identidad**: **Nombre** `Mantención Central` · **Clave** autogenerada `mantencion-central` · **Apariencia**: color **cian**.
   - **Paso 2 · Niveles**: define un solo nivel base (por ejemplo, con la plantilla **Desde cero** agrega un nivel `Taller`, o usa un nivel único como `Base`).
   - **Paso 3 · Nodo raíz**: **Nombre** `Taller Central` · **Código** `TAL-01`. Pulsa **Crear área**.

> **Qué observar.** El toast dice "Área «Mantención Central» creada y activada". Al crearse, la estructura activa cambia a "Mantención Central" (color cian). El badge "Estás en" ahora muestra la nueva estructura.

> **Resultado esperado.** Existen dos estructuras: "Operación Mina Cerro Áspero" (índigo) y "Mantención Central" (cian), cada una con su propio árbol y niveles.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 3.7 — Probar el selector global "Estás en" y el ciclo de vida de estructuras

> **Contexto.** Lo hace el **Administrador**. Verificamos cómo se conmuta entre estructuras y cómo se archivan/reactivan/reordenan sin borrar datos. Importante: la estructura **por defecto** no se archiva ni elimina.

1. En la barra superior, abre el selector **Estructura activa** (badge "Estás en"). Busca ("Buscar estructura…") y **cambia** entre "Operación Mina Cerro Áspero" y "Mantención Central". Observa cómo cambian el color de identidad y el árbol de `/estructura`.
2. Abre **Estructuras** (StructuresDrawer, "Estructuras organizacionales"). Ahí puedes:
   - **Archivar** una estructura (queda "Inactiva" y no se ofrece para operar, pero sigue configurándose). Prueba archivar "Mantención Central" y verás el aviso "Estructura archivada".
   - **Reactivar** la estructura archivada (toast "Estructura reactivada"). Marca **Ver archivadas** para verlas.
   - **Reordenar** con **Subir**/**Bajar** (cambia el orden en los selectores).
   - Usa **Trabajar en esta estructura** para elegir cuál configurar ("Ahora configurando: {nombre}").
3. Intenta **archivar** o **eliminar** la estructura **por defecto**: debe estar impedido ("La estructura por defecto no se puede archivar" / "La estructura por defecto no se puede eliminar").

> **Qué observar.** Una estructura **archivada** no aparece como opción para operar ("Reactiva la estructura para poder operar en ella"). Solo se puede **eliminar** una estructura SIN nodos ("Solo se puede eliminar una estructura SIN nodos…"): "Operación Mina Cerro Áspero" ya tiene nodos, así que su borrado estará bloqueado. Si un usuario no tiene delegada la administración, verá "No tienes delegada la administración de esta estructura".

> **Resultado esperado.** El selector conmuta correctamente; archivar/reactivar/reordenar funcionan; la estructura por defecto está protegida. La vista ejecutiva **Panorama** (cross-estructura) se prueba a fondo en la Fase 14.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

---

### 3.4 · Candado de licencia por cupo de nodos

#### Paso 3.8 — Observar el límite de nodos de la licencia

> **Contexto.** Lo hace el **Administrador**. Lyra WatchLog protege el modelo de negocio de canal con límites contratados en la licencia (nodos, usuarios). Al llegar al tope de nodos, el botón de crear se deshabilita con un aviso y, si se forzara la llamada, el backend responde 403 `LICENSE_LIMIT_EXCEEDED`. Este paso solo se puede evidenciar plenamente si la licencia de la prueba está cerca del tope; de lo contrario, se documenta el comportamiento esperado.

1. En `/estructura`, observa el botón **Nuevo nodo raíz** (y **Agregar hijo**).
2. Si el cupo de nodos está **al límite**, el botón aparece **deshabilitado** con un tooltip: "Alcanzaste el máximo de {max} nodos de estructura contratado en la licencia ({inUse} en uso). Para crear más, regulariza con tu proveedor o elimina nodos que ya no uses."
3. El candado real está en el backend: cualquier intento de crear un nodo sobre el tope responde **403 LICENSE_LIMIT_EXCEEDED** (el mismo candado aplica en el provisioning de estructuras y en reactivaciones).

> **Qué observar.** El límite se cuenta **en vivo** sobre nodos ACTIVOS (no cuenta los eliminados/soft-deleted). El aviso NUNCA rompe ni borra lo existente: solo impide crecer por encima del contrato. Si la licencia de la prueba tiene holgura, este paso se marca como **observación**: el gate está presente pero no se dispara.

> **Resultado esperado.** Cuando corresponde, "Nuevo nodo raíz"/"Agregar hijo" se deshabilita con el tooltip del cupo; el 403 `LICENSE_LIMIT_EXCEEDED` protege el backend. La licencia limita el crecimiento sin secuestrar datos.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

---

### Registro de hallazgos de la Fase 3

| N.º | Paso | Módulo/Pantalla | Severidad | Descripción | Estado |
|-----|------|-----------------|-----------|-------------|--------|
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |

---

## Fase 4 · Activos/Equipos + Personas/Contratistas/Competencias

La estructura ya tiene faena, plantas y áreas, pero le falta la última capa —los **equipos**— y le falta la **gente**. En esta fase poblamos dos catálogos maestros que después alimentarán rondas, bitácoras, incidencias y órdenes de trabajo: los **activos/equipos** (el molino SAG, el chancador primario…) anclados a los nodos del árbol, y las **personas** (propias y de contratistas) con sus **competencias** y **restricciones**, más las **empresas contratistas** con su acreditación.

Un aviso conceptual importante: una **persona** del catálogo de dotación NO es lo mismo que un **usuario** del sistema. Los contratistas, por ejemplo, no tienen acceso a la plataforma pero sí figuran como personas que ejecutan trabajos. Y las **competencias** y sus reglas, y los **roles de dotación**, se DEFINEN en el catálogo del módulo de Órdenes de Trabajo (Fase 10); aquí solo REGISTRAMOS a las personas, sus certificaciones vigentes y sus vetos.

Trabajas como **Administrador**. Los equipos se gestionan desde **Estructura** (`/estructura`, permisos `equipment:create`/`equipment:edit`/`equipment:delete`, más `equipmentcategory:manage` para las categorías). Las personas y empresas se gestionan desde **Órdenes de trabajo › Personas** (`/ordenes-trabajo/personas`, permiso `worker:manage`).

---

### 4.1 · Equipos (activos)

Los equipos cuelgan de un nodo del árbol. Se crean desde el detalle del nodo, pestaña **Equipos**. Antes de crear equipos, definiremos algunas categorías, opcionalmente alineadas a la taxonomía ISO 14224.

#### Paso 4.1 — Definir categorías de equipo (opcional, alineadas a ISO 14224)

> **Contexto.** Lo hace el **Administrador**. Las categorías clasifican los equipos y pueden mapearse a una taxonomía externa (ej. clase ISO 14224), lo que ayuda al análisis de confiabilidad. Requiere `equipmentcategory:manage`.

1. En `/estructura`, selecciona cualquier nodo con equipos (por ejemplo **Molienda**) y abre la pestaña/sección **Equipos**.
2. Pulsa **Categorías** (abre CategoriesDrawer, "Categorías de equipo"). El texto explica: "Puedes alinearlas opcionalmente con una taxonomía externa (ej. clase ISO 14224)."
3. Pulsa **Nueva categoría** y crea, por ejemplo:
   - **Nombre**: `Molino` · **Código**: `MOLINO` · **Ref. ISO**: `CO` (o la clase ISO 14224 que corresponda).
   - Guarda (toast "Categoría creada").
4. Repite para: **Nombre** `Celda de flotación` · **Código** `FLOT` · **Ref. ISO** según taxonomía; y **Nombre** `Chancador` · **Código** `CHANC` · **Ref. ISO** según taxonomía.

> **Qué observar.** Los campos son **Nombre**, **Código** y **Ref. ISO** (placeholders "ej. Motor eléctrico", "ej. MOTOR", "ej. EM"). Las categorías son un catálogo compartido: sirven para clasificar equipos de cualquier nodo/estructura.

> **Resultado esperado.** Las categorías creadas aparecen en el catálogo y estarán disponibles en el selector **Categoría** del drawer de equipo.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 4.2 — Crear el Molino SAG 01 y el Molino de Bolas 02 en Molienda

> **Contexto.** Lo hace el **Administrador**. Los dos molinos de la Concentradora son equipos de alta criticidad. Se anclan al área **Molienda**.

1. En `/estructura`, selecciona el nodo **Molienda** y abre la pestaña **Equipos**.
2. Pulsa **Agregar equipo** (abre EquipmentDrawer, "Nuevo equipo", ancho 520px). Completa el **Molino SAG 01**:
   - **Nombre**: `Molino SAG 01`.
   - **Código**: `` (opcional; puedes dejarlo vacío) · **Orden**: `10`.
   - **Tag / placa**: `MOL-SAG-01` (mono; "Identificador estable y único del activo … Clave para informes e integración.").
   - **Categoría**: `Molino` (la del Paso 4.1).
   - **Fabricante**: `Metso Outotec` (ejemplo) · **Modelo**: `SAG 36x20` (ejemplo) · **N.º de serie**: `SN-SAG-0001` (ejemplo).
   - **Criticidad**: `5` (escala 1 baja – 5 crítica; hint "Nivel de criticidad 1 (baja) a 5 (crítica), opcional.").
   - **Descripción**: `Molino semiautógeno de la línea de molienda.` (opcional).
   - Deja activado el toggle **Equipo en servicio**.
   - Pulsa **Guardar** (toast "Equipo creado").
3. Pulsa **Agregar equipo** de nuevo para el **Molino de Bolas 02**:
   - **Nombre**: `Molino de Bolas 02` · **Tag / placa**: `MOL-BOL-02` · **Categoría**: `Molino` · **Criticidad**: `4` · **Orden**: `20` · **Equipo en servicio** activado.
   - Pulsa **Guardar**.

> **Qué observar.** El **Tag / placa** es `mono` y clave para integración. La **Criticidad** se muestra como un badge de color según la escala de severidad 1–5 del Design System (5 = rojo, 4 = naranja). El toggle **Equipo en servicio** distingue "En servicio" de "Fuera de servicio" en la columna **Estado** de la grilla. NOTA: la criticidad 1–5 del EQUIPO es semántica del negocio (importancia del activo), distinta de la severidad S1–S5 de los hallazgos QA de esta prueba.

> **Resultado esperado.** En la grilla de **Equipos** de Molienda aparecen **Molino SAG 01** (`MOL-SAG-01`, criticidad 5, En servicio) y **Molino de Bolas 02** (`MOL-BOL-02`, criticidad 4, En servicio).

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 4.3 — Crear la Celda de Flotación 03 en Flotación

> **Contexto.** Lo hace el **Administrador**. La Celda de Flotación es un equipo de criticidad media del área Flotación.

1. Selecciona el nodo **Flotación** › pestaña **Equipos** › **Agregar equipo**:
   - **Nombre**: `Celda de Flotación 03` · **Tag / placa**: `FLOT-CEL-03` · **Categoría**: `Celda de flotación` · **Criticidad**: `3` · **Orden**: `10` · **Equipo en servicio** activado.
   - Pulsa **Guardar**.

> **Qué observar.** El badge de criticidad 3 se muestra con el color de severidad 3 del Design System. La categoría **Celda de flotación** aparece disponible en el selector.

> **Resultado esperado.** **Celda de Flotación 03** (`FLOT-CEL-03`, criticidad 3, En servicio) en la grilla de Equipos de Flotación.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 4.4 — Crear el Chancador Primario CH-01 en Chancado Primario

> **Contexto.** Lo hace el **Administrador**. El chancador primario es un equipo crítico del área Chancado Primario (bajo la planta Chancado).

1. Cambia al árbol de la planta Chancado, selecciona el nodo **Chancado Primario** › pestaña **Equipos** › **Agregar equipo**:
   - **Nombre**: `Chancador Primario CH-01` · **Tag / placa**: `CHAN-CH-01` · **Categoría**: `Chancador` · **Criticidad**: `5` · **Orden**: `10` · **Equipo en servicio** activado.
   - Pulsa **Guardar**.

> **Qué observar.** El chancador queda anclado a Chancado Primario, no a la Concentradora: verifica que el equipo cuelga del nodo correcto. Prueba el buscador del árbol tecleando `Chancador` o `CHAN-CH-01`: el buscador de la estructura también surface nodos por su equipo.

> **Resultado esperado.** **Chancador Primario CH-01** (`CHAN-CH-01`, criticidad 5, En servicio) bajo Chancado Primario. La capa de Equipos del árbol queda completa (4 equipos en total).

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

---

### 4.2 · Personas y empresas contratistas

Cambiamos de pantalla a **Órdenes de trabajo › Personas** (`/ordenes-trabajo/personas`). Este catálogo maestro de **dotación** tiene dos pestañas: **Personas** y **Empresas contratistas**. Requiere `worker:manage`. Aunque vive en el módulo OT, se da de alta aquí como catálogo maestro para que después pueda usarse en cualquier permiso de trabajo.

#### Paso 4.5 — Crear la empresa contratista "Servicios Mineros del Norte SpA"

> **Contexto.** Lo hace el **Administrador**. Antes de dar de alta a una persona contratista, hay que crear su empresa, con su estado de acreditación (prequalification). Registramos una empresa acreditada vía ISNetworld.

1. En `/ordenes-trabajo/personas`, abre la pestaña **Empresas contratistas**.
2. Pulsa **Nueva empresa** (abre el modal "Nueva empresa contratista"). Completa:
   - **Nombre**: `Servicios Mineros del Norte SpA`.
   - **RUT de la empresa**: `76.111.222-3` (se formatea y valida el dígito verificador; si es inválido avisa "RUT inválido (dígito verificador)").
   - Sección **Acreditación (prequalification del contratista)**:
     - **Estado**: `Acreditada` (opciones del meta de acreditación: ACREDITADA / CONDICIONAL / SUSPENDIDA / VENCIDA / SIN ACREDITACIÓN).
     - **Grado / score**: `A (ISN RAVS)` (ejemplo).
     - **Vigente hasta**: elige una fecha futura (el campo solo aparece si el Estado es Acreditada o Condicional).
     - **Fuente / plataforma**: `ISNetworld` (placeholder "ISNetworld, Avetta…").
     - **Nota de acreditación**: `Acreditación vigente para trabajos de mantención mecánica.` (opcional).
   - **Estado del registro**: `Activa`.
   - Pulsa **Crear** (toast "Empresa creada").

> **Qué observar.** El campo **Vigente hasta** y **Fuente / plataforma** solo se muestran si el estado es ACREDITADA o CONDICIONAL. El badge de acreditación de la grilla usa color semántico: acreditada y vigente = verde; condicional o por vencer (≤90 días) = ámbar; sin acreditación/suspendida/vencida = rojo. La columna **Personas** contará cuántas personas cuelgan de la empresa (0 por ahora). El RUT se guarda validado.

> **Resultado esperado.** "Servicios Mineros del Norte SpA" aparece en la grilla de **Empresas contratistas** con su RUT, badge de acreditación (verde, "Acreditada · A (ISN RAVS)"), la vigencia ("Vence …"), "vía ISNetworld" y **Personas** = 0.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 4.6 — Crear a Luis Tapia como persona INTERNA

> **Contexto.** Lo hace el **Administrador**. Luis Tapia ya es usuario del sistema (rol `mantenedor`, Fase 2), pero para figurar en la dotación de un permiso de trabajo también debe existir como PERSONA. Lo damos de alta como persona propia (interna). Recuerda: usuario y persona son entidades distintas.

1. En `/ordenes-trabajo/personas`, pestaña **Personas**.
2. Pulsa **Nueva persona** (abre el modal "Nueva persona"). Completa:
   - Sección **Vínculo**: **Tipo de persona** = `Propio` (INTERNAL). (Al ser propio, NO se pide empresa.)
   - Sección **Identidad**: **Nombre** `Luis` · **Apellido** `Tapia`.
     - **Tipo de documento**: `RUT` (opciones RUT/PASSPORT/DNI/OTHER) · **RUT**: `15.678.901-2` (se formatea en vivo y valida el dígito verificador).
     - **Nacionalidad**: `Chilena`.
   - Sección **Datos personales**: **Fecha de nacimiento** (fija una fecha; muestra la edad calculada "N años") · **Género** (opcional) · **Ficha / código** `MEC-014` (placeholder "Interno o del contratista").
   - Sección **Contacto y cargo**: **Cargo** `Mantenedor mecánico` · **Teléfono** (opcional) · **Email** `ltapia@cerroaspero.cl` (opcional) · **Estado** `Activa`.
   - Pulsa **Crear** (toast "Persona creada").

> **Qué observar.** Al ser **Propio**, el campo **Empresa contratista** no aparece. El **RUT** se auto-formatea (`15.678.901-2`) y valida el dígito verificador. La **edad** se deriva de la fecha de nacimiento. En la grilla, la columna **Tipo** muestra un chip "Propio" (variante default).

> **Resultado esperado.** Luis Tapia aparece en la grilla de **Personas** con Tipo "Propio", su RUT formateado, cargo "Mantenedor mecánico" y Estado "Activa". La columna **Impedimentos** muestra "—" (sin competencias vencidas ni restricciones activas por ahora).

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 4.7 — Crear una persona CONTRATISTA ligada a la empresa

> **Contexto.** Lo hace el **Administrador**. Damos de alta a un trabajador de "Servicios Mineros del Norte SpA". Un contratista NO tiene acceso al sistema, pero sí figura en la dotación.

1. En **Personas**, pulsa **Nueva persona**. Completa:
   - Sección **Vínculo**: **Tipo de persona** = `Contratista` (CONTRACTOR). Ahora aparece **Empresa contratista** (obligatorio, marcado con `*`): selecciona `Servicios Mineros del Norte SpA` (usa el buscador "Buscar empresa…").
   - Sección **Identidad**: **Nombre** `Héctor` · **Apellido** `Morales` · **Tipo de documento** `RUT` · **RUT** `13.222.333-4` · **Nacionalidad** `Chilena`.
   - Sección **Datos personales**: **Fecha de nacimiento**, **Género** (opcional), **Ficha / código** `SMN-207`.
   - Sección **Contacto y cargo**: **Cargo** `Soldador certificado` · **Teléfono**/**Email** (opcionales) · **Estado** `Activa`.
   - Pulsa **Crear**.

> **Qué observar.** El campo **Empresa contratista** es obligatorio para contratistas: si lo dejas vacío, el botón **Crear** queda deshabilitado y el combo se marca inválido. Si no hubiera empresas, el combo diría "No hay empresas: crea una en la pestaña «Empresas contratistas»". En la grilla, el chip **Tipo** muestra "Contratista" (variante info) y la columna **Empresa** muestra "Servicios Mineros del Norte SpA".

> **Resultado esperado.** Héctor Morales aparece como Contratista, ligado a Servicios Mineros del Norte SpA. La columna **Personas** de la empresa (en la otra pestaña) sube a 1.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 4.8 — Registrar competencias y una restricción de una persona

> **Contexto.** Lo hace el **Administrador**. Cada persona puede tener **competencias** (certificaciones con vigencia y evidencia) y **restricciones** (vetos, por ejemplo médicos). El estado de vigencia de una competencia es derivado (badge Vigente/Por vencer/Vencida). Los TIPOS de competencia se definen en el catálogo de OT (Fase 10); aquí solo las REGISTRAMOS con sus fechas y evidencia.

1. En **Personas**, en la fila de Héctor Morales (o Luis Tapia), pulsa el ícono **Competencias y restricciones** (abre el modal "Competencias y restricciones — {nombre}", con pestañas **Competencias** y **Restricciones**).
2. Pestaña **Competencias**: en la tarjeta de alta:
   - **Competencia**: elige un tipo del catálogo (ej. "Trabajo en altura"; el combo dice "Buscar competencia…"). Si el catálogo está vacío verás "No hay tipos de competencia" — en ese caso, primero hay que crear los TIPOS en la Fase 10 (aquí solo se registra sobre tipos ya existentes).
   - **Emitida**: fija la fecha de adquisición.
   - **Vence**: fija la fecha de vencimiento (obligatoria si el tipo requiere expiración; si no, es "(opcional)").
   - **N.º de certificado**: `CERT-ALT-1123` (opcional).
   - **Emisor**: `ACHS` (placeholder "Organismo certificador o instructor (p. ej. ACHS, Mutual, OTEC…)").
   - Marca **Verifiqué la evidencia** (registra quién validó y cuándo — evidencia documentada de competencia, ISO 45001 §7.2).
   - Pulsa **Agregar / renovar** (toast "Competencia registrada").
3. Pestaña **Restricciones**: en la tarjeta de alta:
   - **Tipo**: elige, por ejemplo, `Médica` (opciones del meta de restricción).
   - **Motivo**: `Restricción médica temporal para trabajo en altura.`
   - **Desde**: fija la fecha de inicio · **Hasta (opcional)**: déjala vacía para veto indefinido.
   - Pulsa **Agregar restricción** (toast "Restricción registrada").

> **Qué observar.** En la tabla de competencias, el **Estado** se muestra con color según vigencia (Vigente verde, Por vencer ámbar, Vencida rojo) y la **Verificación** muestra quién validó. RENOVAR una competencia = agregar un registro NUEVO (el anterior queda de historial; marca "Mostrar archivadas" para ver el historial/auditoría). Una restricción vigente marca la persona: al cerrar el modal, la columna **Impedimentos** de la grilla mostrará un chip rojo (ej. "1 restricción"). Todo quita/archiva es soft-delete y queda en auditoría.

> **Resultado esperado.** La persona tiene al menos una competencia con su vigencia y evidencia verificada, y una restricción vigente. La grilla refleja el impedimento con un chip rojo. Los tipos de competencia y las reglas (qué competencia exige cada trabajo) se configuran en la Fase 10.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

---

### Registro de hallazgos de la Fase 4

| N.º | Paso | Módulo/Pantalla | Severidad | Descripción | Estado |
|-----|------|-----------------|-----------|-------------|--------|
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |


## Fase 5 · Calendarios y programación de rondas

Con la estructura organizacional en pie y las personas creadas, la operación de Cerro Áspero
necesita ahora su **reloj**. En minería el día no es el día civil: la producción se cuenta por
**turnos** y por **día operacional** (el turno A abre el día a las 08:00 y lo cierra la mañana
siguiente), y el cierre contable corre por **períodos fiscales** que gobiernan cuándo se puede
—y cuándo NO— seguir escribiendo en una bitácora. Esta fase construye ese reloj en tres piezas
que se apoyan una en otra: el **calendario operacional** (turnos y día de producción), el
**calendario fiscal** (períodos contables que se cierran y bloquean) y la **programación de
rondas** (los horarios que hacen aparecer solas las inspecciones de terreno). La arma
**Rodrigo Salas (planificador)**, el rol que en el canon concentra `opscalendar:manage` y
`schedule:*`. Es un cambio de manos respecto de la fase anterior.

> **Antes de empezar.** Cierra sesión del administrador (o de quien venías) e ingresa como
> **Rodrigo Salas** (`rsalas@cerroaspero.cl`, contraseña temporal `Planifica2026!`). Rodrigo NO
> exige MFA (así lo define el canon), de modo que tras cambiar su contraseña temporal en el
> primer ingreso entra directo al espacio de trabajo. Verifica en la barra superior que la
> estructura activa sea **«Operación Mina Cerro Áspero»**: los calendarios y las rondas se
> resuelven contra los nodos de esa estructura.

> **Nota honesta sobre el orden.** La **programación de rondas** (§5.3) depende de que exista una
> **plantilla publicada** (la construyes en la Fase 6). Por eso esta fase deja el horario de ronda
> como el ÚLTIMO paso y te avisa explícitamente que puedes: (a) leerlo ahora y volver a crearlo al
> terminar la Fase 6, o (b) crearlo directamente al cierre de la Fase 6. Los dos calendarios
> (operacional y fiscal) NO dependen de plantillas y se pueden completar de una vez, aquí y ahora.

### 5.1 · Calendario operacional — «Turnos Mina»

#### Paso 5.1 — Crear el calendario operacional y su clave

> **Contexto.** **Rodrigo Salas (planificador)** define el calendario operacional que regirá la
> faena: los turnos, la zona horaria y el momento en que arranca el día de producción. Sin esto,
> la plataforma no sabría a qué turno ni a qué día operacional pertenece cada lectura. Se busca
> materializar el calendario **«Turnos Mina»** del canon.

1. En el menú lateral abre **Calendario operacional** (ruta `/calendario-operacional`). El
   encabezado muestra el título **«Calendario operacional»** con el subtítulo que aclara que el
   período contable «vive ahora en el Calendario fiscal».
2. Pulsa el botón **«Nuevo calendario»** (arriba a la derecha). Se abre el panel lateral
   **«Nuevo calendario operacional»** (CalendarDrawer).
3. Rellena la sección **General**:
   - **Clave** (campo con ayuda «Identificador estable (slug). No se puede cambiar después.»):
     escribe `turnos-mina`.
   - **Nombre**: `Turnos Mina`.
   - **Zona horaria**: `America/Santiago` (la ayuda indica que todo se guarda en UTC y se resuelve
     en esta zona).
   - **Descripción** (opcional): puedes dejarla vacía o poner «Calendario de turnos de la faena».
   - Deja marcado **«Calendario activo»**.
4. Pulsa **«Guardar»**. El calendario aparece en la lista de la izquierda y queda seleccionado,
   con su panel de detalle abierto a la derecha.

> **Qué observar.** La **Clave** solo se puede fijar al crear: una vez guardado, el campo queda
> bloqueado (es un slug estable). Comprueba que sin nombre o con clave inválida el botón
> **«Guardar»** no permita avanzar. Si el calendario aún no tiene turnos válidos, más abajo verás
> el aviso rojo «Corrige los errores de configuración antes de guardar (p. ej. turnos solapados).».
> Fíjate también en que la moneda y las fechas de toda la interfaz se muestran en formato es-CL
> (regional, no hardcodeado).

> **Resultado esperado.** El calendario **«Turnos Mina»** existe, está activo y seleccionado. Su
> panel de detalle muestra las secciones **Turnos**, **Día operacional**, **Probador** y **Nodos
> asignados**, todas vacías o en su estado inicial, listas para configurarse.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 5.2 — Definir los turnos A · Día y B · Noche (uno cruza la medianoche)

> **Contexto.** **Rodrigo Salas** carga los dos turnos del canon: **A · Día** (08:00–20:00) y
> **B · Noche** (20:00–08:00). El turno de noche cruza la medianoche, y la plataforma debe
> reconocerlo automáticamente. Se busca ver la línea de tiempo de 24 h cubierta sin huecos ni
> solapes, y el banner de configuración válida.

1. En el panel de detalle, ubica la sección **«Turnos»**. Lee su ayuda: «Define los turnos del
   día (código, etiqueta, inicio y fin). Si el fin es menor o igual al inicio, el turno cruza la
   medianoche. No pueden solaparse; se permiten huecos (operación de turno único).»
2. Pulsa **«Agregar turno»**. En la fila nueva ingresa:
   - **Código**: `A`
   - **Etiqueta**: `Día`
   - **Inicio**: `08:00`
   - **Fin**: `20:00`
   - Observa que la columna **Duración** calcula sola «12 h».
3. Pulsa **«Agregar turno»** otra vez y agrega el turno de noche:
   - **Código**: `B`
   - **Etiqueta**: `Noche`
   - **Inicio**: `20:00`
   - **Fin**: `08:00`
   - Como el **Fin** (08:00) es menor que el **Inicio** (20:00), el turno **cruza la medianoche**;
     la **Duración** vuelve a marcar «12 h».
4. Observa la **línea de tiempo de 24 horas** (con etiqueta accesible «Cobertura de turnos en 24
   horas»): las dos bandas A y B deben cubrir el día completo sin dejar hueco ni solaparse.
5. Bajo los turnos debe aparecer el banner verde **«Configuración válida.»**.

> **Qué observar.** Prueba a propósito un **solape** (por ejemplo, poner el turno B empezando a
> las 19:00): la validación debe marcarlo y el banner «Configuración válida.» debe desaparecer,
> reemplazado por el aviso de corregir errores. Vuelve a 20:00 para dejarlo bien. Verifica que la
> distinción entre «cruza la medianoche» y «turno normal» sea automática (no hay una casilla
> manual: se deduce de Inicio/Fin). En tablet, los campos de hora deben ser cómodos de tocar
> (áreas táctiles amplias).

> **Resultado esperado.** Dos turnos válidos (A · Día y B · Noche), la línea de tiempo de 24 h
> completamente cubierta, y el banner **«Configuración válida.»** visible.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 5.3 — Anclar el día operacional al turno A

> **Contexto.** **Rodrigo Salas** define cuándo arranca el **día de producción**. En Cerro Áspero
> el día operacional empieza con el turno A, a las 08:00: una lectura tomada a las 02:00 de la
> madrugada pertenece —contablemente— al día operacional anterior. Se busca configurar ese anclaje.

1. En la sección **«Día operacional»**, ubica el campo **«Inicio del día operacional»** (ayuda:
   «El día de producción arranca cuando empieza este turno (p. ej. 07:00).»).
2. Selecciona el turno **A** como inicio del día operacional (08:00). La alternativa **«Día civil
   (00:00)»** queda descartada porque en faena el corte no es a medianoche.

> **Qué observar.** El desplegable solo debe ofrecer turnos ya definidos (A y B) más la opción
> «Día civil (00:00)». Comprueba que elegir A haga que, más abajo en el Probador, una hora de
> madrugada resuelva al día operacional del día anterior.

> **Resultado esperado.** El día operacional queda anclado al turno **A** (08:00). El calendario
> tiene turnos válidos y día operacional definido.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 5.4 — Verificar la resolución con el Probador

> **Contexto.** Antes de asignar el calendario a los nodos, **Rodrigo Salas** comprueba con el
> **Probador** que la plataforma resuelve correctamente turno y día operacional para una fecha-hora
> dada. Es la mejor forma de detectar un error de configuración sin esperar a la operación real.

1. En la sección **«Probador»** (ayuda: «Ingresa una fecha-hora (hora del sitio: America/Santiago)
   y verás a qué turno, día operacional y periodo cae.»), usa el campo de fecha-hora.
2. Ingresa una hora **de día**, por ejemplo hoy a las **10:00**. Verifica el resultado:
   - **Día operacional**: hoy.
   - **Turno**: **A · Día**.
3. Ahora ingresa una hora **de madrugada**, por ejemplo hoy a las **02:00**. Verifica:
   - **Turno**: **B · Noche**.
   - **Día operacional**: el **día anterior** (porque el día operacional arranca a las 08:00 del
     turno A).
4. Pulsa **«Ahora»** para probar con el instante actual y confirmar coherencia.

> **Qué observar.** Los rótulos de resultado son **«Día operacional»**, **«Turno»** y
> **«Periodo»**. Si ingresas una hora que caiga en un hueco sin turno (aquí no debería, porque A+B
> cubren las 24 h), aparecería «Sin turno (hueco)». Confirma que el Probador respeta la zona
> horaria del sitio (America/Santiago), no la del navegador.

> **Resultado esperado.** El Probador resuelve correctamente: 10:00 = turno A / día de hoy; 02:00
> = turno B / día operacional de ayer. La lógica de «día de producción ≠ día civil» funciona.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 5.5 — Asignar nodos y hacer predeterminado el calendario

> **Contexto.** **Rodrigo Salas** conecta el calendario **«Turnos Mina»** a la estructura y lo
> deja como predeterminado, de modo que todos los nodos que no tengan uno propio lo hereden. Se
> busca que la faena entera opere bajo estos turnos.

1. En la sección **«Nodos asignados»** (ayuda: «Nodos de la estructura que usan este calendario.
   Se hereda a los descendientes; si un nodo no tiene calendario, usa el predeterminado.»), pulsa
   **«Gestionar nodos»**.
2. En el selector, busca y marca el nodo raíz **«Faena Cerro Áspero»** (código `FAE-01`). Al
   marcar solo la raíz, los descendientes (Planta Concentradora, Molienda, Flotación, Chancado…)
   **heredan** el calendario automáticamente y se muestran como «heredado». Pulsa **«Aplicar
   selección»**.
3. De vuelta en el panel, pulsa **«Hacer predeterminado»** para que este sea el calendario base de
   la instalación.
4. Pulsa **«Guardar»** para persistir turnos, día operacional y nodos en una sola operación.

> **Qué observar.** Debe aparecer el badge **«Predeterminado»** sobre el calendario. En el árbol de
> nodos, la raíz queda marcada como asignada y los hijos como **«heredado»** (la ayuda
> `inheritedHint` recomienda marcar solo la raíz de cada rama). Verifica que el contador de nodos
> refleje la selección. Recuerda: Rodrigo tiene `opscalendar:manage`; un usuario sin ese permiso
> vería la pantalla en solo lectura (botones ocultos o deshabilitados).

> **Resultado esperado.** «Turnos Mina» está **predeterminado**, con la faena asignada y la
> herencia funcionando. El calendario operacional queda completo.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 5.2 · Calendario fiscal — «Fiscal Mensual»

El calendario fiscal es **transversal a la organización** y está **desacoplado de los turnos**:
gobierna el **período contable** (mensual, semanal o de ciclo) y —clave para GxP— es el que
permite **cerrar** o **bloquear** un período para impedir que se sigan registrando o modificando
bitácoras con fecha dentro de él (eso se ejercita a fondo en la Fase 7). Aquí Rodrigo lo crea y
genera los períodos del año.

#### Paso 5.6 — Crear el calendario fiscal mensual

> **Contexto.** **Rodrigo Salas (planificador)** crea el calendario contable **«Fiscal Mensual»**:
> períodos de tipo MENSUAL con día ancla 1 (el mes contable corre del 1 al fin de mes). Se busca
> tener la base sobre la cual generar y gobernar los períodos.

1. Abre **Calendario fiscal** (ruta `/calendario-fiscal`). El título es **«Calendario fiscal»** y
   el subtítulo aclara que define el período contable «transversal a la organización, desacoplado
   de los turnos».
2. Pulsa **«Nuevo calendario fiscal»**. En el drawer completa la pestaña **General**:
   - **Clave**: `fiscal-mensual`.
   - **Nombre**: `Fiscal Mensual`.
   - **Zona horaria**: `America/Santiago`.
   - Deja **«Calendario activo»** marcado.
3. Pasa a la pestaña **«Período»** (configuración del período contable):
   - **Tipo de período**: **Mensual** (`MONTH`). Junto al selector, el bloque de ayuda
     (PeriodKindHelp) explica «Período mensual»: cada período es un mes contable, del «día de
     inicio» de un mes al mismo día del siguiente, tomando el largo real del mes (28–31 días).
   - **Día de inicio del mes (1–28)**: `1`. La ayuda aclara que se limita a 28 para que el día de
     inicio exista en todos los meses (febrero incluido).
4. Pulsa **«Guardar»**.

> **Qué observar.** El bloque de ayuda del **Tipo de período** cambia según elijas Mensual /
> Semanal / Ciclo personalizado, mostrando un **«Ejemplo»** distinto en cada caso (Mensual: «Día
> de inicio 1 → febrero = 01-feb a 28-feb…»). Comprueba que **Día de inicio del mes** no acepte
> valores fuera de 1–28. La opción **«Exigir período generado (rigor estricto)»** existe pero
> déjala en su valor por defecto (permisivo): la ausencia de período no bloquea (estilo permisivo,
> no estilo Maximo estricto).

> **Resultado esperado.** El calendario **«Fiscal Mensual»** existe, activo, con período MENSUAL y
> día ancla 1. Su panel de detalle muestra las pestañas **General · Período · Nodos · Períodos**.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 5.7 — Generar los períodos del año (idempotente) y revisar la grilla

> **Contexto.** **Rodrigo Salas** materializa los 12 períodos mensuales del año en curso. La
> generación es **idempotente**: se puede repetir sin duplicar ni reabrir períodos ya cerrados. Se
> busca dejar el año con sus meses contables listos y ver el período actual marcado.

1. En el panel de detalle del calendario, abre la pestaña **«Períodos»**.
2. En **«Generar año»**, selecciona el **año en curso** (por ejemplo 2026).
3. Pulsa **«Generar períodos»**. Aparece el diálogo **«Generar períodos {año}»** con el mensaje:
   «Se materializarán **12 período(s)** del año {año} como filas abiertas (OPEN).» y la nota de
   idempotencia: «no recrea ni reabre los que ya existen; nunca degrada un período cerrado o
   bloqueado.» Confirma.
4. La grilla se llena con **12 filas**, una por mes contable. Cada fila muestra:
   - **Período** (ej. `2026-007` para julio, según el esquema año-secuencia).
   - **Rango (día operacional)** (ej. 01-jul a 31-jul).
   - **Estado**: **Abierto** (todas parten en OPEN).
   - El mes en curso lleva el badge **«Actual»**.
   - **Responsable** (si está configurado) y las acciones por fila.

> **Qué observar.** Vuelve a pulsar **«Generar períodos»**: NO debe crear duplicados ni cambiar
> estados (idempotencia). Los estados posibles son **Abierto · En cierre · Cerrado · Bloqueado**.
> Cada fila ofrece **«Cerrar»**, **«Reabrir»**, **«Bloquear»**, **«Desbloquear»** e **«Historial»**
> según su estado. No cierres ningún período todavía: esa gobernanza (y su efecto sobre las
> bitácoras) se ejercita en la Fase 7. Confirma que el badge **«Actual»** cae sobre el mes correcto
> según America/Santiago.

> **Resultado esperado.** 12 períodos mensuales del año en curso, todos **Abierto**, con el mes
> vigente marcado **«Actual»**. La grilla muestra Período, Rango, Estado y acciones de gobernanza.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 5.8 — Reconocer la gobernanza de período (cerrar / bloquear · MFA opcional)

> **Contexto.** **Rodrigo Salas** revisa —sin ejecutar aún— el mecanismo de gobernanza que en la
> Fase 7 protegerá la integridad de las bitácoras. Se busca que el probador entienda la diferencia
> entre **Cerrar** (bloqueo blando, salvo excepción) y **Bloquear** (bloqueo duro, para todos), y
> el step-up MFA opcional.

1. En una fila de período, pulsa **«Cerrar»** para abrir el diálogo **«Cerrar período {clave}»**
   (NO confirmes; solo observa). El texto explica: «Mientras esté cerrado, solo los roles con
   permiso de excepción podrán escribir con fecha en este período. Queda auditado.» Exige un
   **Motivo** obligatorio.
2. Observa el diálogo **«Bloquear período {clave}»** (bloqueo duro): «nadie podrá escribir con
   fecha en este período, ni siquiera con permiso de excepción. Reabrir exigirá desbloquearlo.»
3. Si en **Configuración del sistema › Seguridad** está activado «Exigir MFA para gobernar
   períodos», el diálogo pedirá **Contraseña** y **Código MFA** (re-autenticación step-up). Rodrigo
   NO tiene MFA enrolado (canon), así que si esa exigencia estuviera activa, esta acción quedaría
   reservada a un rol con MFA (Admin o un supervisor). **Déjalo documentado y no ejecutes el
   cierre.**
4. Cierra el diálogo con **«Cancelar»**.

> **Qué observar.** Este es un buen punto para anotar una observación (S5) sobre la interacción
> entre el permiso de gobernanza de período y el enrolamiento de MFA del actor. La acción de
> **Reabrir** un período cuando hay posteriores cerrados muestra una advertencia extra («Reabrir
> este período rompe la secuencia… Quedará auditado») y un botón **«Reabrir de todos modos»**.
> Todo movimiento queda en **«Historial»** (con marca «con MFA» / «sin MFA»).

> **Resultado esperado.** Entiendes la máquina de estados del período (Abierto → Cerrado →
> Bloqueado y sus reversas) y el step-up MFA opcional, sin haber alterado ningún período. La
> ejecución real vive en la Fase 7.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 5.3 · Programación de rondas — «Ronda de inspección — Molienda»

Las **rondas** son inspecciones recurrentes que la plataforma **abre sola** (materializa) según un
horario, y que el operador ejecuta desde su worklist «Mis rondas». Un horario amarra **una
plantilla publicada** a **un nodo** con una **recurrencia** (por turno, por intervalo o por
calendario). Aquí está la **dependencia honesta**: la plantilla «Bitácora de turno — Molienda» se
crea y **publica** en la Fase 6. Por eso este bloque se puede leer ahora para entender el modelo,
pero el horario se **completa** una vez publicada la plantilla.

#### Paso 5.9 — (Puede requerir la Fase 6) Crear el horario de la ronda de Molienda

> **Contexto.** **Rodrigo Salas (planificador)** programa la ronda de inspección de la Molienda: se
> abrirá automáticamente en cada turno (A y B) para que el operador la ejecute. Se busca dejar el
> horario activo con su recurrencia y su plazo de cumplimiento.
>
> **DEPENDENCIA.** El campo **«Plantilla»** solo lista plantillas **publicadas**. Si aún no has
> hecho la Fase 6, este paso **NO se puede completar todavía**: léelo, entiende el modelo y
> **vuelve aquí** (o crea el horario al cerrar la Fase 6). No es un defecto: es el orden lógico
> —primero se diseña y publica el formulario, luego se programa su ronda—.

1. Abre **Programación de rondas** (ruta `/rondas`). El encabezado es **«Programación de rondas»**
   con el subtítulo «Define los horarios de rondas (turno / intervalo / calendario). Los operadores
   las ejecutan desde «Mis rondas».» Verás la fila de KPIs (**Horarios activos · Pausados · Rondas
   pendientes · Rondas vencidas**) y las pestañas **Horarios · Ocurrencias · Resumen**.
2. Pulsa **«Nuevo horario»**. Se abre el drawer **«Nuevo horario de ronda»** (ScheduleDrawer).
3. Completa:
   - **Nombre (opcional)**: `Ronda de inspección — Molienda`.
   - **Plantilla** (obligatorio): elige **«Bitácora de turno — Molienda»** (la plantilla publicada
     en la Fase 6). Si el desplegable está vacío, es porque aún no publicaste ninguna plantilla:
     ve a la Fase 6 y vuelve.
   - **Nodo de la estructura** (obligatorio): elige **«Molienda»** (`AR-MOL`). Nota: el selector
     solo ofrece los nodos donde la plantilla está asignada ∩ el alcance del usuario.
   - **Equipo (opcional)**: si Molienda tiene equipos con tag (Molino SAG 01 / Molino de Bolas 02),
     el campo aparece; puedes dejarlo **«Sin equipo»** o elegir **`MOL-SAG-01 · Molino SAG 01`**.
   - **Rol responsable (opcional)**: elige el rol **operador** (o déjalo vacío). La ayuda explica:
     «Quién ejecuta la ronda en su worklist «Mis rondas». Vacío = visible a todos los del nodo en
     el turno.»
   - **Recurrencia** (obligatorio): elige **«Por turno»**. Aparece el campo **«Turnos (opcional,
     separados por coma)»**: escribe `A, B` para que la ronda se abra en ambos turnos (vacío =
     todos los turnos del calendario del nodo).
   - **Plazo para cumplir (minutos)** (obligatorio): ingresa `120` (dos horas tras la hora
     programada, la ronda vence si no se completa). *(El valor por defecto del formulario es 720;
     cámbialo a 120 según el guion.)*
   - **Horizonte de generación (días)**: deja `2` (cuántos días hacia adelante se materializan las
     rondas).
   - Deja **«Activo»** encendido.
4. Pulsa **«Guardar»**. El toast confirma **«Horario creado»** y el horario aparece en la pestaña
   **Horarios**.

> **Qué observar.** Las tres recurrencias son **«Por turno»** (turnos A/B), **«Cada cierto tiempo»**
> (campo «Cada (minutos)» + «Hora de anclaje») y **«Días y horas fijas»** (campos «Horas» separadas
> por coma + botones de días de la semana Lun…Dom). El botón **«Guardar»** permanece deshabilitado
> hasta que haya plantilla, nodo y un plazo ≥ 5 min. Recuerda que Rodrigo tiene `schedule:manage`;
> sin ese permiso, «Nuevo horario» no aparece y la grilla es de solo lectura.

> **Resultado esperado.** El horario **«Ronda de inspección — Molienda»** queda activo, ligado a la
> plantilla de Molienda y al nodo Molienda, con recurrencia por turnos A/B y plazo de 120 min.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 5.10 — Materializar ocurrencias y revisar el resumen

> **Contexto.** **Rodrigo Salas** fuerza la generación de las próximas rondas y verifica que
> aparezcan como ocurrencias pendientes. Se busca confirmar que el horario efectivamente produce
> rondas que el operador podrá ejecutar en la Fase 8.

1. En **Programación de rondas**, abre la pestaña **«Ocurrencias»**.
2. Pulsa **«Generar rondas»** (tooltip: «Prepara (materializa) las próximas rondas ahora.
   Normalmente se generan solas al abrir la pantalla.»). El toast informa cuántas rondas nuevas se
   generaron.
3. Con los filtros **Pendientes · Hoy · Vencidas**, revisa la grilla de ocurrencias: columnas
   **Programada · Ronda · Plantilla · Equipo · Nodo · Turno · Estado · Entrada · Vence**. Las
   nuevas aparecen como **Pendiente**.
4. Abre la pestaña **«Resumen»** y observa los tres mini-gráficos: **Rondas pendientes por área**,
   **Horarios por recurrencia** y **Cumplimiento de rondas** (Al día / Vencidas).

> **Qué observar.** El **horizonte de 2 días** limita cuántas ocurrencias se materializan hacia
> adelante. La columna **Turno** debe mostrar A o B según el calendario operacional que asignaste
> en §5.1 (integración entre las tres piezas). Si en el demo se acumulan rondas vencidas de fechas
> pasadas, es **deriva de datos del entorno de prueba**, no un defecto del horario recién creado.

> **Resultado esperado.** La ronda de Molienda genera ocurrencias **Pendiente** para hoy/mañana,
> visibles en la grilla y contadas en los KPIs. El reloj de la faena (turnos + rondas) está
> operativo y listo para que el operador ejecute en la Fase 8.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### Registro de hallazgos de la Fase 5

| N.º | Paso | Módulo/Pantalla | Severidad | Descripción | Estado |
|-----|------|-----------------|-----------|-------------|--------|
|     |      | Calendario operacional |      |             |        |
|     |      | Calendario fiscal |      |             |        |
|     |      | Programación de rondas |      |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |

---

## Fase 6 · Plantillas / Form Builder

Esta es la fase más rica del recorrido y el corazón funcional de Lyra WatchLog: aquí **Rodrigo
Salas (planificador)** diseña la **bitácora de turno de la Molienda** como un formulario
profesional, con campos de todo tipo, umbrales estilo ISA-18.2, un campo formulado, lógica
condicional, firmas Part 11, un motor de reglas que dispara incidencias, y un flujo de revisión que
gobierna sus estados. Antes de tocar el Form Builder hay que sentar dos cimientos reutilizables:
un **dato de referencia** (una lista gobernada de «modos de falla») y un **flujo de trabajo**
(«Revisión de bitácora»). Luego se ensambla la plantilla, se le asigna el flujo, y se **publica**
—momento en que la versión se **congela** e inmutabiliza—. Todo lo hace Rodrigo, cuyo rol concentra
`template:*`, `workflow:*` y `referencelist:*`.

> **Antes de empezar.** Sigue en sesión como **Rodrigo Salas** (`rsalas@cerroaspero.cl`). Verifica
> la estructura activa **«Operación Mina Cerro Áspero»**. Los tres módulos de esta fase viven en el
> menú lateral: **Datos de referencia**, **Flujos** y **Plantillas**.

### 6.1 · Datos de referencia — lista «Modos de falla»

#### Paso 6.1 — Crear la lista de referencia y sus ítems

> **Contexto.** **Rodrigo Salas (planificador)** crea una **lista de referencia** gobernada de
> modos de falla, que luego reutilizará en un campo de selección de la plantilla. La ventaja: la
> plantilla guarda un **código estable** y los informes resuelven la etiqueta; si mañana cambia el
> texto visible, no se rompe el histórico. Se busca dejar la lista **«Modos de falla»** con tres
> ítems activos.

1. Abre **Datos de referencia** (ruta `/datos-referencia`). Título **«Datos de referencia»**,
   subtítulo sobre listas gobernadas y reutilizables (modos de falla, turnos, causas…).
2. Pulsa **«Nueva lista»**. En el drawer **«Nueva lista de referencia»** (ListDrawer):
   - **Clave**: `modos-falla` (ayuda: «Identificador estable (no editable luego). Lo referencian
     los campos de las plantillas.»).
   - **Nombre**: `Modos de falla`.
   - **Descripción** (opcional): «Modos de falla de equipos».
   - Deja **«Lista activa»** marcada. Guarda.
3. Con la lista seleccionada, en el panel de detalle (sección **«Ítems»**) pulsa **«Agregar ítem»**
   y crea, uno por uno (ItemDrawer, campos **Código** y **Etiqueta**):
   - **Código** `falla_mecanica` · **Etiqueta** `Falla mecánica`.
   - **Código** `falla_electrica` · **Etiqueta** `Falla eléctrica`.
   - **Código** `desgaste` · **Etiqueta** `Desgaste`.
   - En cada uno deja **«Ítem activo»** encendido y guarda.

> **Qué observar.** El **Código** es el valor que se guarda al llenar (no el texto visible); la
> ayuda `codeDesc` lo deja claro. La **Clave** de la lista no se puede editar tras crear. Existe
> importación **«Importar CSV»** (cabecera `code`, `label`, y opcionales `active`/`sortOrder`/
> `metadata.<clave>`) para cargas masivas; aquí basta la carga manual. Al **desactivar** un ítem,
> los registros históricos conservan su código (nunca se borra el valor usado). El resumen de la
> lista muestra «3 activos · 3 en total».

> **Resultado esperado.** La lista **«Modos de falla»** (`modos-falla`) existe, activa, con tres
> ítems activos (Falla mecánica, Falla eléctrica, Desgaste), lista para alimentar un campo de
> selección.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 6.2 · Flujos — «Revisión de bitácora»

#### Paso 6.2 — Crear el flujo y sus tres estados

> **Contexto.** **Rodrigo Salas** define la **máquina de estados** que gobernará el ciclo de vida
> de la bitácora: **borrador → en revisión → aprobada**. Es reutilizable (se asigna a la plantilla
> en §6.3). Se busca dejar el flujo con sus estados inicial y final bien marcados.

1. Abre **Flujos** (ruta `/flujos`). Título **«Flujos de trabajo»**, subtítulo «Máquinas de estado
   reutilizables…».
2. Pulsa **«Nuevo flujo»**. En el modal **«Nuevo flujo»**:
   - **Nombre**: `Revisión de bitácora`.
   - **Clave estable**: `revision-bitacora` (minúsculas, números y guiones; no editable luego).
   - Pulsa **«Crear y editar»**: se abre el **WorkflowBuilder**.
3. En la sección **«Estados»**, pulsa **«Agregar estado»** tres veces y configura:
   - Estado 1 — **Nombre del estado** `Borrador`, **Clave del estado** `borrador`, marca
     **«Inicial»**. Color a elección (ej. «Gris»).
   - Estado 2 — **Nombre** `En revisión`, **Clave** `en_revision`. Color «Ámbar».
   - Estado 3 — **Nombre** `Aprobada`, **Clave** `aprobada`, marca **«Final»**. Color «Verde».
   - (Opcional) en un estado puedes fijar **«Tiempo máximo de estadía»** (SLA de permanencia): si
     un registro pasa más que eso, se marca atrasado. Déjalo en «Sin SLA» salvo que quieras
     probarlo.

> **Qué observar.** Un flujo válido exige **exactamente un** estado **Inicial** y al menos uno
> **Final**. La **Clave del estado** sigue al nombre en estados nuevos, pero es editable; con ella
> las transiciones y el mapeo de secciones referencian el estado. Los colores usan la paleta de
> marca (Índigo / Verde / Ámbar / Rojo / Cian / Gris), semánticos, no decorativos.

> **Resultado esperado.** Tres estados: **Borrador** (inicial) · **En revisión** · **Aprobada**
> (final), con sus claves estables y colores.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 6.3 — Crear las transiciones (con firma en la aprobación), validar y publicar

> **Contexto.** **Rodrigo Salas** conecta los estados con transiciones y define quién las ejecuta,
> exigiendo **firma Part 11** en la aprobación. Se busca un flujo válido, sin estados huérfanos, y
> **publicado** (congelado) para poder asignarlo a la plantilla.

1. En la sección **«Transiciones»**, pulsa **«Agregar transición»** dos veces:
   - Transición 1 — **Etiqueta** `Enviar a revisión`, **Desde** `Borrador`, **Hacia** `En
     revisión`. En **«Roles autorizados»** elige el rol **supervisor-turno** (o déjalo «Cualquier
     rol»). Sin firma.
   - Transición 2 — **Etiqueta** `Aprobar`, **Desde** `En revisión`, **Hacia** `Aprobada`. Marca
     **«Exigir firma (Part 11)»** y en **«Significado de la firma»** escribe `Aprobado`. En
     **«Roles autorizados»** elige **supervisor-turno**. (Opcional: **«Exigir MFA (step-up)»**.)
2. Revisa el panel de validación:
   - Si hay errores, aparece **«La máquina de estados tiene errores que corregir:»** (en rojo).
   - Si algo quedó sin conectar, **«Pendiente de conectar (no podrás publicar hasta resolverlo):»**
     (en ámbar).
   - Cuando todo esté bien: banner **«Máquina de estados válida.»** y el **Resumen de transiciones**
     con columnas Transición · Desde → Hacia · Firma · MFA · Roles · Aviso, más el **Diagrama del
     flujo**.
3. Pulsa **«Guardar borrador»** y luego **«Publicar»**. Confirma en el modal **«Publicar flujo»**:
   «Al publicar se congela esta versión del flujo (inmutable). Las plantillas que lo usen
   referenciarán esta versión.»

> **Qué observar.** La transición **Aprobar** debe mostrar la etiqueta **«Firma»** en el resumen
> (chip). El validador NO deja publicar con estados inalcanzables o sin ruta al estado final.
> Opcionalmente puedes configurar **«Notificar en esta transición»** (avisar a roles/usuarios del
> estado destino) — la configuración se **congela** con la versión al publicar. Tras publicar, el
> flujo queda **inmutable**: para cambiarlo hay que editar (se crea un nuevo borrador).

> **Resultado esperado.** El flujo **«Revisión de bitácora»** está **publicado** (v1), válido, con
> firma Part 11 en la aprobación. Queda disponible para asignarlo a la plantilla.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 6.3 · Plantillas / Form Builder — «Bitácora de turno — Molienda»

Ahora el plato fuerte. El Form Builder organiza el diseño en tres vistas: **Configuración**
(identidad, alcance y gobernanza), **Diseño** (con dos sub-pestañas, **Editor** y **Reglas**) y
**Vista previa**. Antes de agregar campos, conviene conocer la **paleta de objetos**, agrupada en
siete categorías. La consigna del guion es **tocar al menos un objeto de cada grupo** para ejercer
todo el catálogo, y luego concretar la sección «Inspección» con campos reales.

**Paleta de objetos (tipos de campo por categoría — rótulos exactos de la paleta):**

| Categoría | Objetos disponibles (paleta) |
|-----------|------------------------------|
| **Básicos** | Texto corto · Párrafo · Número + umbral · Porcentaje · Moneda (CLP) · RUT · Correo electrónico · Teléfono · Enlace (URL) · Sí / No · Fecha · Fecha y hora · Hora · Duración (HH:MM) · Rango (mín–máx) · Lectura con tolerancia · Contador / acumulado |
| **Selección** | Lista desplegable · Opción única (visible) · Segmentos / chips · Casillas múltiples · Selección múltiple · Multiselección (modal) — con fuente **En línea** o **Lista de referencia** |
| **Evaluación** | Conforme / No conforme · Severidad 1–5 · Valoración (estrellas / numérica / Likert) · Matriz de riesgo (ISO 31000) · Firma electrónica (Part 11) |
| **Referencia** | Equipo / activo · Usuario / responsable · Nodo de estructura · Turno |
| **Evidencia / Terreno** | Foto / evidencia · Archivo adjunto · Nota de voz · Croquis / dibujo · Escáner QR / código |
| **Estructurados** | Tabla repetible · Grupo repetible · Matriz parámetro × turno |
| **Presentación** (no captura datos) | Encabezado · Texto / instrucción · Separador · Aviso · Enlace a procedimiento · Imagen de referencia |

#### Paso 6.4 — Crear la plantilla y abrir el builder

> **Contexto.** **Rodrigo Salas** crea la plantilla **«Bitácora de turno — Molienda»** apuntada al
> nodo Molienda y entra al Form Builder. Se busca tener el lienzo abierto para diseñar.

1. Abre **Plantillas** (ruta `/plantillas`). Título **«Plantillas & Form Builder»**.
2. Pulsa **«Crear plantilla»**. En el modal **«Nueva plantilla»**:
   - **Nombre**: `Bitácora de turno — Molienda`.
   - **Nodo de la estructura**: elige **«Molienda»** (`AR-MOL`) como nodo inicial (el alcance
     multi-nodo completo se edita luego en el builder).
   - Pulsa **«Crear y abrir el builder»**.

> **Qué observar.** El builder abre en la vista **Diseño › Editor** con un lienzo de **12 columnas**
> y la **paleta de objetos** («Objetos») a la izquierda, con buscador. Arriba, el conmutador de
> vistas **Configuración · Diseño · Vista previa**. La plantilla nace en estado **Borrador v1**.

> **Resultado esperado.** El Form Builder de «Bitácora de turno — Molienda» está abierto, en
> borrador, con el lienzo vacío y la paleta lista.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 6.5 — Configuración: identidad, alcance, ventana de edición, equipo, resumen y folio

> **Contexto.** **Rodrigo Salas** completa la vista **Configuración** —la «gobernanza viva» de la
> plantilla, que se aplica en vivo sin necesidad de republicar—. Se busca dejar identidad, alcance
> de nodos, modo de equipo, campos de resumen y folio propio.

1. En el conmutador de vistas, pulsa **«Configuración»** (descrita como «Identidad, alcance y
   gobernanza»). Recorre sus grupos:
   - **Identidad**: confirma **Nombre** `Bitácora de turno — Molienda` y agrega una **Descripción**
     (ej. «Inspección de turno de la Molienda»).
   - **Alcance y acceso** — **«Alcance de estructura (nodos)»**: confirma **Molienda** marcado.
     Puedes activar **«incluye descendientes»** si quieres cubrir los equipos de Molienda, o dejar
     solo el nodo. Sin nodos = plantilla **GLOBAL**.
   - **Gobernanza** — **«Ventana de edición»**: deja **«Heredar configuración global»** (o elige
     **«Ventana propia»** con su ancla «Desde la captura (recomendado)»).
   - **«Equipo en la entrada»**: elige **«Opcional»** (o «Sugerido»/«Obligatorio»). Aquí, dado que
     es una ronda de Molienda con equipos, **«Sugerido (recomienda elegir)»** es una buena opción.
   - **«Resumen en la grilla»**: más adelante (tras crear campos) marca 1–2 campos clave (ej.
     «Temperatura descanso» y «Modo de falla») para que se muestren como resumen del registro en
     Bitácoras.
   - **«Folio del documento»**: activa **«Folio propio para esta plantilla»** y en **«Prefijo»**
     escribe `BIT-MOL`. La ayuda aclara que sin folio propio las entradas usan el correlativo
     global (ej. `BIT-000123`).
2. Pulsa **«Guardar configuración»**. El toast confirma «Configuración guardada — se aplica a
   entradas nuevas».

> **Qué observar.** El aviso `configLiveHint` es clave: estos ajustes son **gobernanza viva**, se
> aplican de inmediato a entradas nuevas y **NO requieren publicar** (a diferencia de campos y
> reglas, que sí exigen publicar una nueva versión). El **Folio** se emite al **sellar** el
> registro (no al crearlo). El **modo Equipo** aplica a entradas nuevas sin republicar.

> **Resultado esperado.** La plantilla tiene identidad, alcance en Molienda, ventana heredada,
> equipo Sugerido y folio propio con prefijo **BIT-MOL**. La configuración quedó guardada.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 6.6 — Diseño › Editor: crear la sección «Inspección» con permisos y firma

> **Contexto.** **Rodrigo Salas** arma la primera sección del formulario, **«Inspección»**, y le
> fija los roles que pueden llenarla. Se busca la estructura base sobre la que colgarán los campos.

1. Vuelve a **«Diseño»** (sub-pestaña **«Editor»**). En el lienzo pulsa **«Agregar sección»**.
2. Selecciona la sección para editar sus **Opciones de la sección**:
   - **Título de la sección**: `Inspección`.
   - **Descripción de la sección** (opcional): «Lecturas y verificaciones de terreno».
   - **«Roles que pueden llenarla»**: elige **operador** y **supervisor-turno** (permiso por
     sección; vacío = sin restricción). La ayuda: «Permiso por sección. Vacío = sin restricción de
     rol.»
   - Si esta sección debe firmarse, más adelante puedes marcar **«Exigir firma electrónica (Part
     11)»** a nivel de plantilla (opt-in), o usar el campo Firma dedicado de §6.8.

> **Qué observar.** Cada sección puede tener sus propios roles (dimensión de permisos por sección),
> distinta del RBAC global. Al asignar un flujo (§6.9), cada sección podrá marcarse **«Editable en
> el estado»** X. El lienzo es de **12 columnas**: los campos se pueden redimensionar (Completo /
> Dos tercios / Mitad / Un tercio / Un cuarto) y en móvil se apilan en una columna.

> **Resultado esperado.** Existe la sección **«Inspección»** con sus roles de llenado (operador +
> supervisor-turno), lista para recibir campos.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 6.7 — Agregar los campos de la sección «Inspección» (variedad + umbrales ISA-18.2)

> **Contexto.** Este es el paso más minucioso: **Rodrigo Salas** agrega, uno a uno, campos de
> distintas categorías, incluyendo umbrales estilo ISA-18.2 que dispararán excepciones. Se busca
> ejercer el catálogo de objetos y modelar lecturas reales de la Molienda. Arrastra desde la paleta
> (o haz clic para agregar al final) y configura cada campo en el panel **«Propiedades»**.

1. **Número «Temperatura descanso (°C)»** — desde **Básicos**, arrastra **«Número + umbral»**:
   - **Etiqueta**: `Temperatura descanso (°C)`; **Obligatorio**: sí.
   - **Unidad**: `°C`; **Mín.**: `0`; **Máx.**: `120`; **Decimales**: `1`.
   - En **«Umbrales (opcional)»** (bandas estilo ISA-18.2): **Adv. alto** `80`; **Crít. alto** `90`
     (deja **Adv. bajo** / **Crít. bajo** vacíos).
   - Activa **«Una advertencia genera excepción»** (ayuda: un valor crítico SIEMPRE genera
     excepción; con esto, una advertencia también la genera).
2. **Número «Vibración (mm/s)»** — otro **«Número + umbral»**:
   - **Etiqueta**: `Vibración (mm/s)`; **Unidad**: `mm/s`.
   - Umbrales: **Adv. alto** `7`; **Crít. alto** `10`.
3. **Selección «Modo de falla»** — desde **Selección**, agrega **«Lista desplegable»**:
   - **Etiqueta**: `Modo de falla`.
   - En **«Fuente de opciones»** elige **«Lista de referencia»** y en **«Lista de referencia»**
     selecciona **`modos-falla`** («Modos de falla»). La ayuda: «La vista previa resuelve las
     opciones; se guarda el código, se muestra la etiqueta.»
4. **Conformidad «Guardas de seguridad»** — desde **Evaluación**, agrega **«Conforme / No
   conforme»**:
   - **Etiqueta**: `Guardas de seguridad`. Puedes permitir **«N.A.»** con el toggle de conformidad.
5. **Foto «Evidencia»** — desde **Evidencia / Terreno**, agrega **«Foto / evidencia»**:
   - **Etiqueta**: `Evidencia`.
   - Activa **«Permitir varios archivos»** y fija **«Máximo de archivos»** `5`. (Opcional: «Sugerir
     cámara trasera».)
6. **Tabla «Puntos de medición»** — desde **Estructurados**, agrega **«Tabla repetible»**:
   - **Etiqueta**: `Puntos de medición`.
   - En **«Columnas»** define tres: **Punto** (Texto), **Vibración** (Número), **Estado**
     (Lista/Conformidad). Usa **«Agregar columna»**, cada una con su **Rótulo**, **Clave** y
     **Tipo**. Fija un **Mínimo de filas** / **Máximo de filas** si quieres.
7. **(Toca un objeto de cada grupo restante, para ejercer el catálogo)**: agrega al menos uno de
   **Referencia** (p. ej. **«Equipo / activo»** rotulado `Equipo inspeccionado`), y uno de
   **Presentación** (p. ej. **«Aviso»** con variante «Advertencia» y un texto de seguridad, o
   **«Encabezado»** para titular la sección). Recuerda que los objetos de **Presentación** NO
   capturan datos («no se llena ni valida»).

> **Qué observar.** En «Número + umbral», comprueba que **Crít. alto** debe ser mayor que **Adv.
> alto** (coherencia de bandas). El campo **Modo de falla** con fuente «Lista de referencia»
> resuelve las etiquetas en la **Vista previa** pero guarda el **código** (`falla_mecanica`, etc.).
> En la **Foto**, el máximo de 5 se respeta al llenar. La **Tabla repetible** exige al menos una
> columna. Cada campo puede llevar **clave única**: dos campos no pueden compartir clave (el
> builder lo valida). Ajusta el **ancho en la grilla** de cada campo para un layout ordenado.

> **Resultado esperado.** La sección «Inspección» tiene: dos números con umbrales ISA-18.2 (uno con
> «advertencia genera excepción»), una lista desde `modos-falla`, una conformidad, una foto múltiple
> (máx 5), una tabla repetible de puntos, más un objeto de referencia y uno de presentación.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 6.8 — Campo formulado (calculado) y campo con lógica condicional

> **Contexto.** **Rodrigo Salas** agrega dos capacidades avanzadas del formulario: un **campo
> formulado** (su valor se DERIVA de una fórmula, solo lectura) y un **campo condicional** (solo se
> muestra si se cumple una condición). Se busca demostrar el motor de expresiones y la lógica
> condicional dentro de la misma sección.

1. **Campo formulado (computed)** — agrega un **Número** y, en sus propiedades, activa **«Campo
   formulado (valor calculado)»**. En el editor de expresión define, por ejemplo, un delta o un
   promedio a partir de otros campos (ej. una función de «Temperatura descanso» y «Vibración»). La
   ayuda: «El valor se DERIVA de esta fórmula (solo lectura). Se recalcula al editar y se estampa al
   guardar; se congela al sellar el registro.» El campo mostrará el chip **«Calculado»**.
2. **Campo condicional (visibleWhen)** — agrega, por ejemplo, un **Párrafo** rotulado `Detalle de la
   falla` y configúralo con **«Mostrar solo si»**: elige el campo **Modo de falla** (o un Sí/No
   asociado) y la condición para que el campo aparezca solo cuando corresponda (p. ej. cuando se
   registra una falla). El campo mostrará el tag **«condicional»**.

> **Qué observar.** El formulado es **solo lectura**: en la Vista previa no se puede escribir, y su
> valor se recalcula solo. La lógica condicional (`visibleWhen`) se evalúa en vivo: al cambiar el
> campo gobernante en la Vista previa, el condicional aparece/desaparece. Ambos comportamientos
> viajan en la versión inmutable al publicar (son parte del diseño, no de la gobernanza viva).

> **Resultado esperado.** Hay un campo **Calculado** (read-only) y un campo **condicional** que solo
> se muestra bajo su condición, ambos correctamente etiquetados en el lienzo.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 6.9 — Sección «Cierre y firma» con firma Part 11

> **Contexto.** **Rodrigo Salas** agrega la sección de cierre con una **firma electrónica Part 11**,
> el sello con que el operador/supervisor declara la veracidad del registro. Se busca cerrar el
> formulario con su firma.

1. Pulsa **«Agregar sección»** y titúlala **`Cierre y firma`**.
2. Dentro, desde **Evaluación**, agrega **«Firma electrónica (Part 11)»** (campo SIGNATURE),
   rotulada `Firma del responsable`.
3. Si quieres que la sección exija firma para completarse, marca a nivel de plantilla **«Exigir
   firma electrónica (Part 11)»** (opt-in; la firma se aplica al ejecutar la bitácora).

> **Qué observar.** La firma Part 11 se aplica **al ejecutar** la bitácora (Fase 8), no en el
> diseño. Coexiste con la firma de la **transición «Aprobar»** del flujo: son dos sellos distintos
> (uno del campo, otro de la transición de estado). Ambos quedan auditados (quién, qué, cuándo).

> **Resultado esperado.** La plantilla tiene una sección final **«Cierre y firma»** con un campo de
> firma Part 11.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 6.10 — Diseño › Reglas: una regla ERROR (bloquea) y una regla WARN que abre incidencia

> **Contexto.** **Rodrigo Salas** define el **motor de reglas cruzadas** de la plantilla: una regla
> de **Error** que bloquea completar cuando un valor es imposible, y una regla de **Advertencia**
> que, al sellar, **abre una incidencia** automáticamente. Se busca demostrar la diferencia entre
> reglas **formuladas** (computed, dentro del campo) y **cruzadas** (rules, entre campos) y la
> acción `openIncident`.

1. En **«Diseño»**, abre la sub-pestaña **«Reglas»** (título «Reglas de validación cruzada»). Lee
   el intro: «ERROR bloquea completar/enviar/avanzar; ADVERTENCIA solo informa. […] Las reglas
   viajan en la versión inmutable (cambiarlas exige publicar una nueva versión).»
2. Pulsa **«Agregar regla»** para la **regla ERROR**:
   - **Nombre (opcional)**: `Temperatura imposible`.
   - **Severidad**: **«Error — bloquea completar/enviar»**.
   - **Condición de disparo**: usando el armador (Campo / Valor / Operación), define algo imposible,
     p. ej. Operación «> mayor que», operando A = Campo «Temperatura descanso (°C)», operando B =
     Valor `120` (por encima del máximo físico). Cuando la condición sea verdadera, la regla dispara.
   - **Mensaje**: `La temperatura supera el máximo físico del descanso`.
   - **Acción al dispararse**: **«Ninguna (solo avisar)»** (las reglas Error no ejecutan acciones).
   - **«Guardar regla»**.
3. Pulsa **«Agregar regla»** para la **regla WARN con incidencia**:
   - **Nombre**: `Falla severa abre incidencia`.
   - **Severidad**: **«Advertencia — solo informa»** (obligatorio para llevar acción; si eliges
     Error con acción, el sistema la fija a Advertencia con el aviso `actionForcesWarn`).
   - **Condición**: p. ej. cuando **Modo de falla** = `Falla mecánica` (o cuando un campo de
     severidad ≥ 4). Al comparar contra un campo de lista, el «Valor» se elige de un desplegable.
   - **Acción al dispararse**: **«Abrir una incidencia»**. Aparecen **Tipo de incidencia**,
     **Categoría (opcional)** y **Severidad** de la incidencia a abrir (elige un tipo del catálogo
     de la Fase 4). La ayuda: «Las acciones se ejecutan al sellar la entrada (de forma diferida) y
     solo en reglas de tipo Advertencia.»
   - **«Guardar regla»**.

> **Qué observar.** Distingue bien los dos motores: las reglas **formuladas** son el `computed` del
> §6.8 (valor derivado con AST seguro, sin `eval`, dentro de un campo); las reglas **cruzadas** son
> estas (relaciones entre campos, evaluadas en el servidor). Si a una regla le falta un campo, se
> **omite** hasta que esté completo (no rompe). La acción `openIncident` queda **congelada** en la
> versión publicada. Recuerda **«Guardar borrador»** para que las reglas rijan.

> **Resultado esperado.** Hay una regla **Error** que bloquea al completar y una regla
> **Advertencia** que, al sellar, **abre una incidencia**. Ambas visibles en la grilla de reglas
> con su chip de acción.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 6.11 — Asignar el flujo «Revisión de bitácora» y mapear editabilidad por estado

> **Contexto.** **Rodrigo Salas** conecta la plantilla con el flujo publicado en §6.2–6.3 y define
> en qué estado se puede llenar cada sección. Se busca que la bitácora respete la máquina de
> estados: borrador editable, aprobada sellada.

1. En la vista **Configuración** (grupo Gobernanza) o en el editor, ubica **«Flujo de trabajo»** y
   elige **«Revisión de bitácora»** (la ayuda: «Sin flujo = formulario simple; todas las secciones
   siempre editables»).
2. Vuelve al **Editor**, selecciona la sección **«Inspección»** y fija **«Editable en el estado»** =
   `Borrador` (solo se puede llenar mientras el registro está en borrador). La sección **«Cierre y
   firma»** puedes dejarla editable en `Borrador` o `En revisión` según tu política.

> **Qué observar.** La opción **«Editable en el estado»** (ayuda: «La sección solo se podrá llenar
> cuando el registro esté en este estado») es la que conecta el flujo con la editabilidad. Con el
> flujo asignado, en la Fase 8 el operador solo podrá escribir en las secciones habilitadas para el
> estado actual de la entrada. Sin flujo, todas las secciones son siempre editables.

> **Resultado esperado.** La plantilla usa el flujo **«Revisión de bitácora»** y sus secciones
> tienen editabilidad mapeada por estado.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 6.12 — Vista previa, guardar borrador y PUBLICAR (versión congelada)

> **Contexto.** **Rodrigo Salas** revisa el formulario completo en **Vista previa**, guarda el
> borrador y **publica** la plantilla: la versión se **congela** (inmutable) y queda disponible para
> las bitácoras y para la programación de rondas de la Fase 5. Es el hito que cierra la fase.

1. Pulsa **«Vista previa»** en el conmutador de vistas. Recorre el formulario como lo verá el
   operador: prueba que el condicional aparezca/desaparezca, que el formulado se calcule solo, que
   la lista «Modo de falla» muestre las etiquetas de `modos-falla`, y que los umbrales pinten
   advertencia/crítico. (Puedes cambiar entre Escritorio / Tablet / Móvil para la vista responsiva.)
2. Pulsa **«Guardar borrador»** (toast «Borrador guardado»).
3. Pulsa **«Publicar»**. Confirma en el modal **«Publicar plantilla»**: «Al publicar se CONGELA
   esta versión (queda inmutable). Las bitácoras futuras usarán esta versión. Para cambios
   posteriores se creará un nuevo borrador.» Acepta.

> **Qué observar.** Al publicar, la plataforma **valida** la máquina de estados del flujo y las
> reglas (si algo no cierra, no deja publicar). Tras publicar, el builder queda en **«Versión
> publicada (solo lectura)»**; el botón **«Editar»** clona a un nuevo borrador (la versión publicada
> nunca se toca). El **folio** (`BIT-MOL-…`) se emite al **sellar** cada entrada, no al publicar la
> plantilla. Y —muy importante— identidad, alcance, ventana de edición y folio son **gobernanza
> viva**: se pueden cambiar **sin republicar**; solo campos, reglas y flujo exigen nueva versión.

> **Resultado esperado.** La plantilla **«Bitácora de turno — Molienda»** queda **Publicada (v1)**,
> congelada e inmutable, con toast «Plantilla publicada — versión congelada». Ya aparece en el
> desplegable «Plantilla» de la **programación de rondas** (Fase 5, §5.3): si dejaste ese horario
> pendiente, este es el momento de crearlo.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### Registro de hallazgos de la Fase 6

| N.º | Paso | Módulo/Pantalla | Severidad | Descripción | Estado |
|-----|------|-----------------|-----------|-------------|--------|
|     |      | Datos de referencia |      |             |        |
|     |      | Flujos          |           |             |        |
|     |      | Form Builder — campos |      |             |        |
|     |      | Form Builder — reglas |      |             |        |
|     |      | Form Builder — publicar |      |           |        |
|     |      |                 |           |             |        |


## Fase 7 · Bitácoras: registrar entradas por turno

Con la planta ya modelada (estructura, equipos, calendarios), las plantillas publicadas y los usuarios operativos, llega el corazón operacional del sistema: la **bitácora de turno**. Aquí es donde el dato nace en terreno. En esta fase **Jorge Ramírez (operador)** registra una entrada de la plantilla *Bitácora de turno — Molienda* asociada al **Molino SAG 01**, ingresando a propósito valores que caen fuera de umbral para verificar que el sistema los detecta, los eleva a *excepción* y — según la regla — abre incidencia. Luego **María Fuentes (supervisor-turno)** revisa el flujo, y **Camila Vega (prevención-riesgos)** hace *triage* de las excepciones en la bandeja global. Cierra la fase la grilla de Bitácoras (consulta, auditoría, anulación de borrador) y los bloqueos de período/ventana de edición.

La consigna es minuciosidad: cada valor que ingreses, cada chip de estado, cada banner y cada firma electrónica (21 CFR Part 11) importa. Este es el módulo que un auditor mirará primero.

### 7.1 · Crear una nueva entrada (el operador)

#### Paso 7.1 — Abrir "Nueva entrada" y (opcional) declarar registro diferido

> **Contexto.** **Jorge Ramírez (operador)** inicia su registro del turno. Entra a *Nueva entrada* para elegir la plantilla correcta. De paso, verificamos el gesto de **registro diferido**: una entrada tardía es legítima si queda identificada (cuándo ocurrió, cuándo se registró, quién y por qué). Requiere el permiso `logentry:create`.

1. Cierra sesión e ingresa como **Jorge Ramírez** (`jramirez@cerroaspero.cl`, contraseña temporal `Operador2026!`; cámbiala al primer ingreso). Sin MFA por rol.
2. En el menú lateral ve a **Nueva entrada** (ruta `/nueva-entrada`).
3. Verifica el encabezado: título **"Nueva entrada"** (con "entrada" en color de acento) y subtítulo **"Plantillas publicadas habilitadas según tu rol y tu alcance en la estructura."**
4. Observa la tarjeta superior con el toggle **"Registrar con otra fecha/hora"**. Déjalo APAGADO por ahora; debe verse la nota **"Por defecto la entrada se registra con la fecha/hora actual."**
5. Solo para probar el gesto: ENCIENDE el toggle. Aparecen los campos **"Fecha y hora real del evento"** (obligatorio, selector de fecha/hora) y **"Motivo del diferimiento"** (obligatorio, mínimo 5 caracteres, con la ayuda **"Obligatorio (mín. 5 caracteres): queda en el registro y su auditoría."**). Debajo, el texto explicativo del diferido.
6. Vuelve a APAGAR el toggle (registraremos en línea, con fecha/hora actual).

> **Qué observar.** Que sin el permiso `logentry:create` esta pantalla muestre el estado vacío **"Sin acceso a bitácoras"** (no la grilla de plantillas). Que el subtítulo y el toggle usen los textos EXACTOS. Que al encender el diferido, intentar continuar sin motivo (o con menos de 5 caracteres) muestre el aviso **"Para el registro diferido indica la fecha/hora real del evento y un motivo (mín. 5 caracteres)."** Que la fecha/hora se muestre en formato regional es-CL (America/Santiago).

> **Resultado esperado.** La pantalla de *Nueva entrada* carga con el toggle de diferido operativo y la grilla de plantillas visible (siguiente paso). El diferido queda apagado.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 7.2 — Elegir la plantilla y el nodo/equipo de la entrada

> **Contexto.** **Jorge Ramírez** elige la plantilla de Molienda. Como esa plantilla aplica al nodo *Molienda* y exige (o sugiere) equipo, el sistema abre el modal para fijar dónde se registra exactamente. Verificamos la gobernanza de nodo/equipo (2.8.0).

1. En la grilla de plantillas, localiza la tarjeta **"Bitácora de turno — Molienda"**. Cada tarjeta muestra: ícono, un tag de nodo (con ícono de red, ej. *Molienda* o "Global"), el **nombre**, la **descripción** y una línea de metadatos con **N.º de secciones** y **N.º de campos** (formato "X sección(es) · Y campo(s)").
2. Haz clic en la tarjeta. Elegir una plantilla NO crea todavía ningún registro (modo *compose*): la entrada se materializa recién al primer guardado.
3. Se abre el modal **"Elige el nodo de la entrada"**. Si la plantilla resuelve a un solo nodo, verás el nodo fijo; si resuelve a varios, el campo **"Nodo de la estructura"** (placeholder **"Seleccionar nodo…"**) es obligatorio. Elige **Molienda**.
4. Como el nodo Molienda tiene equipos, aparece el campo **"Equipo"** (o **"Equipo (opcional)"** según el modo). Elige **Molino SAG 01**. Si el modo es REQUIRED verás la ayuda **"Esta plantilla exige indicar el equipo de la entrada."** y no habrá opción "(sin equipo)"; si es SUGGESTED verás **"Se recomienda asociar la entrada a un equipo del nodo."** con la opción **"Sin equipo (a nivel de nodo)"** disponible.
5. Pulsa **"Continuar"**.

> **Qué observar.** Que solo aparezcan plantillas dentro del alcance de nodos de Jorge (ABAC: acotado a "Planta Concentradora") y de su alcance por plantilla. Que en modo REQUIRED el botón "Continuar" quede DESHABILITADO hasta elegir equipo. Que si el nodo REQUIRED no tuviera equipos activos, se muestre **"Esta plantilla exige equipo, pero el nodo elegido no tiene equipos activos. Da de alta uno en Estructura para registrar aquí."** Que el picker de nodo muestre la ruta completa de ancestros.

> **Resultado esperado.** Navegas a la pantalla de llenado (`/nueva-entrada/comenzar/{templateId}`) en modo compose, con la cabecera mostrando plantilla *Bitácora de turno — Molienda*, nodo *Molienda* y equipo *Molino SAG 01*.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 7.2 · Llenar la entrada y disparar excepciones

#### Paso 7.3 — Reconocer la cabecera, chips de estado y dimensiones

> **Contexto.** Antes de escribir datos, **Jorge Ramírez** revisa la cabecera de la entrada: es la "cédula de identidad" del registro. Confirmamos que las dimensiones operacionales (turno, día operacional, período) están correctas y que el estado y el progreso se muestran bien.

1. En la pantalla de llenado, observa la cabecera (eyebrow **"Nueva entrada"**): nombre de la plantilla, ruta del nodo y, con ícono de llave, el **equipo** *Molino SAG 01*.
2. A la derecha, verifica los chips: el de estado con el valor **"Borrador"** (los otros posibles son **"Registrada"** y **"Anulada"**), y el chip de progreso **"X de Y secciones completadas"**.
3. En la fila de dimensiones (chips), confirma: **"Fecha efectiva"** (fecha/hora regional), **"Turno"** (debe indicar A o B según la hora; ej. A · Día), **"Día operacional"** y **"Periodo"** (la clave del período fiscal actual).
4. Si declaraste diferido en el paso 7.1, verías además el chip **"Diferida"** y la nota "Registro diferido: el evento ocurrió el …". (En este caso está en línea, así que no debe aparecer.)

> **Qué observar.** Que el turno se derive correctamente del calendario "Turnos Mina" (A 08:00–20:00, B 20:00–08:00) según la hora actual. Que el día operacional respete el arranque en el turno A (08:00). Que las dimensiones aún NO estén "congeladas" (se sellan al registrar). Que exista el gesto **"Registrar con otra fecha/hora"** (link con ícono de historial) si la entrada admite declarar diferido.

> **Resultado esperado.** La cabecera muestra plantilla, nodo, equipo, estado *Borrador*, progreso 0 de N y las cuatro dimensiones con valores coherentes para el turno actual.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 7.4 — Ingresar valores fuera de umbral y completar/firmar la sección

> **Contexto.** **Jorge Ramírez** llena la primera sección con lecturas del molino. A propósito ingresa una temperatura de descanso por sobre el umbral crítico y una vibración en zona de advertencia, para verificar que el motor de umbrales/reglas los detecta. Al completar la sección, si exige firma, se re-autentica (Part 11).

1. Ubica la sección de lecturas del molino. Observa su cabecera: si tiene rol asignado, muestra el chip **"Asignada a: …"**; y un chip de estado de sección con valor **"Pendiente"** (los estados posibles: **"Pendiente"**, **"En progreso"**, **"Completada"**, **"Bloqueada"**).
2. En el campo **Temperatura de descanso** ingresa **95** (°C). Como el umbral crítico es > 90 °C, debe marcarse como fuera de rango (borde/indicador de error).
3. En el campo **Vibración** ingresa **8** (mm/s), valor en zona de **advertencia**.
4. Observa el panel **"Reglas de negocio"** (si la plantilla tiene reglas cruzadas): las de tipo ERROR se muestran en rojo con ícono de alerta y BLOQUEAN; las de tipo WARN (advertencia) informan pero no bloquean. Anota cuáles se dispararon.
5. Pulsa **"Guardar avance"** (guarda sin marcar la sección lista; ayuda: "Guarda lo ingresado sin marcar la sección como lista."). Debe aparecer el toast **"Sección guardada."**
6. Ahora pulsa **"Completar sección"** (o **"Completar y firmar"** si la sección exige firma). La ayuda dice "Marca la sección como lista (exige sus campos obligatorios)."
7. Si aparece el modal de firma (**"Firmar completitud de sección"**): confirma que muestra el significado **"Firmo la completitud de la sección «…»."**, la línea **"Firmando como {nombre}"**, el campo **"Contraseña"** y el botón **"Completar y firmar"**. Ingresa la contraseña de Jorge y confirma. Toast esperado: **"Sección completada."**

> **Qué observar.** Que al ingresar 95 en Temperatura de descanso el campo se marque inválido y, tras guardar, la entrada acumule una excepción CRÍTICA; que 8 en Vibración genere una excepción de ADVERTENCIA. Que un campo FORMULADO (computed) sea de solo lectura y su valor se recalcule en vivo. Que un campo reservado a otro rol muestre "Campo reservado al rol asignado: solo lectura para tu usuario." Que la firma de sección NO exija MFA (eso es a nivel de transición). Que los mensajes de reglas del backend se muestren detallados (no genéricos).

> **Resultado esperado.** La sección queda **"Completada"** (chip verde) y firmada (chip **"Firmada por {nombre}"** si aplica). El progreso de cabecera avanza. La entrada ahora contiene 1 valor crítico y 1 advertencia.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 7.5 — Banner de valores críticos y panel de revisión de excepciones

> **Contexto.** Tras completar una sección con valores críticos, **Jorge Ramírez** ve el aviso que lo empuja a revisar. El sistema no bloquea (el dato ya es válido), pero deja constancia y ofrece atajos: corregir el dato o registrar una incidencia. Requiere ver el módulo (`module:incidents:view`).

1. Observa el banner de alerta (rojo) con el texto **"Esta entrada contiene N valor crítico. Revísalos para corregir el dato o registrar una incidencia."** (usa "valores críticos" en plural si hay más de uno).
2. Tiene dos botones: **"Revisar excepciones"** (desplaza al panel de revisión) y **"Más tarde"**.
3. Pulsa **"Revisar excepciones"**. Se abre/expande el panel **"Revisión de excepciones"** con chips de resumen: **"N crítica(s)"**, **"N advertencia(s)"**, **"N posibles inválidos"** y **"N sin resolver"**.
4. Dentro del panel, cada excepción es una tarjeta accionable. Haz clic en la excepción de Temperatura para abrir su ficha (drawer de detalle) — la revisaremos en profundidad con Camila (paso 7.7).

> **Qué observar.** Que la regla WARN de vibración, si está configurada para abrir incidencia automática, haya generado ya una incidencia vinculada (verifícalo luego en /incidencias). Que el panel NO se muestre si la entrada no tiene excepciones (cero ruido). Que los conteos del resumen coincidan con lo ingresado (1 crítica, 1 advertencia).

> **Resultado esperado.** El banner aparece, el panel de revisión de excepciones lista la excepción crítica (Temperatura 95 °C) y la de advertencia (Vibración 8 mm/s) con su severidad y contexto.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 7.3 · Enviar/transicionar la entrada por el flujo

#### Paso 7.6 — Enviar a revisión (operador) y aprobar con firma (supervisora)

> **Contexto.** La plantilla de Molienda tiene el flujo **"Revisión de bitácora"**, así que no hay un simple "Enviar y registrar": hay transiciones. **Jorge Ramírez** envía a revisión; luego **María Fuentes (supervisor-turno)** aprueba con firma electrónica. Verificamos la máquina de estados y el historial trazable.

1. Como **Jorge**, con todas las secciones requeridas completadas, ubica la barra de transiciones al pie. Debe aparecer el botón de la transición inicial, p. ej. **"Enviar a revisión"**. Si faltan secciones, el sistema muestra "Para avanzar el flujo, primero completa: «…»" y el botón queda deshabilitado.
2. Pulsa la transición. Se abre el modal de transición (título = etiqueta de la transición): revisa el texto "Esta acción mueve la entrada al estado «…».", el campo **"Motivo (opcional)"** y, si la transición exige firma, el bloque de **"Contraseña"** (+ **"Código de verificación (MFA)"** si aplica).
3. Confirma. Toast esperado: **"Entrada movida a «…»."** El chip de estado del flujo cambia.
4. Cierra sesión e ingresa como **María Fuentes** (`mfuentes@cerroaspero.cl`, `Turno2026Sup!`; con MFA). Abre la misma entrada desde **Bitácoras** (ver 7.8) y pulsa **"Editar"**.
5. En la barra de transiciones, pulsa **"Aprobar"** (o la transición final disponible). Como exige firma, el modal pide **"Contraseña"** y **"Código de verificación (MFA)"** (nota: "Esta transición exige reconfirmar tu segundo factor."). Ingresa credenciales + MFA y confirma.
6. Revisa la sección **"Historial de transiciones"**: cada transición muestra su etiqueta, actor, fecha/hora, motivo entre comillas y, si fue firmada, el chip **"Firmado · {significado}"**.

> **Qué observar.** Que las transiciones disponibles dependan del ESTADO y del ROL (el backend decide; la UI solo muestra las posibles). Que la firma de transición sí exija MFA cuando la transición lo pide (María tiene MFA). Que al registrarse/sellarse la entrada, las dimensiones (fecha efectiva, turno, período) queden congeladas y aparezca el banner "Entrada registrada y sellada el …". Que Jorge (operador) NO vea la transición de aprobación (segregación por rol).

> **Resultado esperado.** La entrada recorre el flujo hasta su estado final (registrada/sellada). El historial muestra ambas transiciones con sus firmas Part 11. El chip de estado pasa a **"Registrada"**.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 7.4 · Triage de excepciones en la bandeja global (prevención)

#### Paso 7.7 — Camila Vega tría la excepción crítica: corregir, descartar o convertir

> **Contexto.** **Camila Vega (prevención-riesgos)** es responsable de HSE y del *triage* de excepciones, incluidas las CRÍTICAS. Trabaja desde la bandeja global `/excepciones`. Aquí decide, por cada desviación: reconocerla, corregir el dato (GxP), descartarla (normal o crítica) o convertirla/agruparla en incidencia. Permisos: `exception:triage`, `exception:correct`, `exception:dismiss` / `exception:dismiss-critical`.

1. Cierra sesión e ingresa como **Camila Vega** (`cvega@cerroaspero.cl`, `Prevenir2026!`; con MFA).
2. Ve a **Excepciones** (`/excepciones`). Verifica el encabezado: **"Excepciones operacionales"** y el subtítulo **"Desviaciones detectadas en las bitácoras (umbrales, reglas y registros manuales) pendientes de triage."**
3. Revisa los KPIs (tarjetas clicables): **"Sin resolver"**, **"Críticas"**, **"Advertencias"**, **"Posibles inválidos"** y **"Total (filtro)"**. Haz clic en **"Críticas"** para filtrar.
4. Confirma los filtros en una línea: buscador (**"Buscar por campo, sección o detalle…"**), estado (Sin resolver / Todos los estados / Abiertas / Reconocidas / Convertidas / Corregidas / Descartadas), severidad (Crítica / Advertencia / Posible inválido), origen (Umbral crítico / Umbral advertencia / Regla de negocio / Registro manual), alcance (Todas / **"Sin incidencia"**) y orden (Severidad / Recientes).
5. Abre la excepción de **Temperatura de descanso (95 °C)** de la entrada de Jorge. En el drawer verás el valor grande en rojo, el **"Rango esperado: …"**, el estado, el trigger y el bloque **"Origen del dato"** (bitácora enlazada, sección, nodo, equipo *Molino SAG 01*, turno, operador *Jorge Ramírez*, "Detectada … · entrada sellada").
6. Prueba las acciones disponibles (no resueltas):
   - **"Reconocer / revisar"** (abre modal "Reconocer excepción", nota opcional).
   - **"Corregir dato"** (si el campo es corregible): abre "Corregir dato", muestra el valor original preservado, pide el **"Nuevo valor"**, un **"Motivo de la corrección (mín. 5) *"** y, como la entrada está SELLADA, la **"Contraseña"** (Part 11).
   - **"Descartar"**: para una crítica exige el permiso `exception:dismiss-critical`; el modal advierte "Estás descartando una excepción CRÍTICA. Queda auditado." con motivo ≥5.
7. Para esta prueba, NO corrijas ni descartes: pulsa **"Crear / asociar incidencia"** (siguiente paso lo cubre en la Fase 9). Cierra el drawer.

> **Qué observar.** Que descartar una crítica esté DESHABILITADO para quien solo tiene `exception:dismiss` (tooltip "Descartar una excepción crítica requiere un permiso superior"); Camila sí puede por `exception:dismiss-critical`. Que la corrección PRESERVE el valor original (muestra "original → nuevo") y quede auditada. Que la selección múltiple (checkbox en tarjetas) habilite la barra **"Agrupar en una incidencia"** cuando eliges ≥2. Que el filtro **"Sin incidencia"** ayude a encontrar lo aún no elevado.

> **Resultado esperado.** Camila navega y tría las excepciones. La bandeja refleja el estado (una queda lista para convertir en incidencia en la Fase 9; las demás pueden reconocerse/corregirse según criterio HSE).

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 7.5 · Grilla de Bitácoras: consulta, auditoría y anulación

#### Paso 7.8 — Recorrer la grilla, KPIs, filtros, vistas y columnas

> **Contexto.** La grilla de **Bitácoras** es la superficie de consulta y auditoría de todas las entradas al alcance del usuario. **María Fuentes** la usa para supervisar el turno. Verificamos KPIs, filtros en una línea, vistas guardadas, columnas/densidad y la tabla con la banda ISA-18.2 en el resumen.

1. Ingresa como **María Fuentes** y ve a **Bitácoras** (`/bitacoras`). Encabezado: **"Registro de bitácoras"** con subtítulo **"Consulta y auditoría de todas las entradas a tu alcance: filtra, revisa por excepción, exporta y verifica firmas."**
2. Revisa los KPIs: **"Total"**, **"En curso"**, **"Registradas"**, **"Firmas pendientes"**, **"Excepciones"** y **"Retrasadas"**.
3. Confirma los filtros en una sola línea, con el buscador **"Folio, plantilla, nodo o contenido…"**. Prueba **"Más filtros"** (incluir descendientes, mis entradas, con firmas pendientes, solo excepciones, solo retrasadas, turno, periodo, día operacional, efectiva desde/hasta, umbral, origen) y **"Limpiar filtros"**.
4. Prueba las **vistas guardadas** (selector "Elegir vista"): vistas del sistema (**"Mi turno"**, **"Firmas pendientes"**, **"Excepciones"**, **"Últimas 24h"**, **"Retrasadas"**) y **"Guardar como"** una vista propia (marca "Marcar como vista por defecto" si quieres).
5. Pulsa el botón **"Columnas"**: verifica el panel "Columnas y orden" con **"Densidad"** (Cómoda / Compacta), criterios de orden y la lista de columnas visibles (mostrar/ocultar, reordenar, anclar).
6. Revisa la tabla: **Folio**, **Plantilla**, **Nodo**, **Equipo**, **Resumen** (línea de valores de negocio; los fuera de umbral se resaltan con banda ISA-18.2 WARN/CRIT), **Estado del flujo**, **Atraso** (SLA), **Turno**, **Fecha efectiva**, **Autor** e **Indicadores**. Confirma la **paginación arriba y abajo**.
7. Haz clic en una fila para abrir el **PeekDrawer** (ficha rápida): botones **"Abrir ficha completa"** y **"Ver flujo"**. Pulsa "Ver flujo" para abrir el **FlowModal** ("Recorrido del flujo") con el diagrama de estados (Actual / Sin alcanzar) y las transiciones.

> **Qué observar.** Que los KPIs sean coherentes con la data (la entrada de Jorge debe sumar a "Excepciones"). Que el resumen muestre los valores fuera de umbral en rojo (CRIT) o ámbar (WARN). Que la paginación aparezca tanto arriba como abajo (convención de grilla). Que las vistas del sistema filtren correctamente. Que el formato de fechas/números respete es-CL.

> **Resultado esperado.** La grilla lista la entrada recién registrada del Molino SAG 01, con su folio, estado del flujo, resumen con la temperatura en rojo y los indicadores de excepción. El PeekDrawer y el FlowModal abren sin error.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 7.9 — Anular un borrador y comprobar bloqueos (período / ventana de edición)

> **Contexto.** No todo borrador llega a registro. **Jorge Ramírez** (o quien tenga `logentry:void`) puede anular un borrador: no se borra, queda trazable. También comprobamos los bloqueos de escritura por período contable cerrado y por ventana de edición vencida (se prueban a fondo con la Fase 5/15; aquí solo verificamos los mensajes).

1. Como **Jorge**, crea un segundo borrador cualquiera (Nueva entrada, elige plantilla, guarda una sección) para tener algo que anular. En la pantalla de llenado del borrador, pulsa el botón rojo **"Anular borrador"** (arriba a la derecha).
2. En el modal **"Anular borrador"** revisa el texto explicativo ("Descarta este borrador. No se elimina: queda anulado y trazable…"), el campo **"Motivo de la anulación"** (ayuda: "Mínimo 5 caracteres. Quedará auditado (ALCOA+).", placeholder de ejemplo) y confirma con **"Anular borrador"**. Toast esperado: **"Borrador anulado."**
3. Vuelve a abrir la entrada anulada: debe mostrar el banner **"Borrador anulado por {quién} el {cuándo}"** y quedar en solo lectura (chip **"Anulada"**).
4. Bloqueos (verificación de mensajes, sin forzar el escenario completo):
   - Si el **período contable** de la fecha está cerrado, al intentar editar una sección debe verse **"Solo lectura: el período contable «…» está cerrado. Se requiere permiso de excepción para registrar con esta fecha."** (motivo interno PERIOD_CLOSED).
   - Si la **ventana de edición** venció y el usuario tiene override, toda escritura abre el modal **"Edición fuera de ventana"** (motivo obligatorio ≥5, auditado); sin override, se muestra "…la ventana de edición venció el … — el registro quedó en solo lectura."

> **Qué observar.** Que la anulación solo aplique a borradores NO sellados (no a una entrada ya registrada). Que la entrada anulada salga de las superficies normales pero quede trazable. Que los mensajes de bloqueo usen los textos exactos y que el override deje el motivo en la auditoría junto a cada cambio (GxP).

> **Resultado esperado.** El borrador queda **"Anulada"** con su banner de trazabilidad. Los mensajes de PERIOD_CLOSED y de ventana vencida aparecen tal cual cuando corresponde (su prueba a fondo se hace en la Fase 5/15).

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### Registro de hallazgos de la Fase 7

| N.º | Paso | Módulo/Pantalla | Severidad | Descripción | Estado |
|-----|------|-----------------|-----------|-------------|--------|
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |

---

## Fase 8 · Rondas: ejecución en "Mis rondas"

Las rondas son la disciplina operacional: recorridos programados en los que un operador registra el estado de los equipos a intervalos definidos. En la fase de planificación, **Rodrigo Salas** ya programó las rondas del turno. Ahora toca la EJECUCIÓN, que es responsabilidad de terreno. En esta fase **Jorge Ramírez (operador)** trabaja su *worklist* en **"Mis rondas"**: ve qué le toca ahora, inicia una ronda (que abre la bitácora asociada) y, si corresponde, omite una con motivo. Es el pan de cada turno, así que la pantalla debe ser encontrable, táctil y clara sobre la urgencia.

Requiere el permiso `round:execute` (rol operador). Si el demo no generó ocurrencias, esta fase también explica cómo generarlas desde el planificador.

#### Paso 8.1 — Abrir "Mis rondas" y leer la agenda por urgencia

> **Contexto.** **Jorge Ramírez** empieza su turno revisando su agenda de rondas. La pantalla agrupa por urgencia (Vencidas, Pendientes de hoy, Próximas) para que sepa de un vistazo qué hacer AHORA. Verificamos KPIs, filtros y el orden.

1. Ingresa como **Jorge Ramírez** (`jramirez@cerroaspero.cl`, `Operador2026!`). Ve a **Mis rondas** (`/mis-rondas`).
2. Verifica el encabezado: título **"Mis rondas"** y subtítulo **"Las rondas que te toca ejecutar en tu turno. Iníciala para abrir la bitácora."** A la derecha, botón **"Actualizar"**.
3. Revisa los KPIs: **"Pendientes"**, **"Vencidas"** (destacado) y **"De hoy"**.
4. Confirma la barra de filtros: buscador (**"Buscar ronda, equipo o área…"**), selector de **horizonte** (opciones: **"Próxima hora"**, **"Próximas 4 horas"**, **"Próximas 8 horas (turno)"**, **"Próximas 12 horas"**, **"Resto de hoy"**, **"Próximas 24 horas"**, **"Todas (próximos días)"**), el toggle **"Mi turno"**, el selector **"Todas las áreas"** (si hay más de un área) y, cuando hay varios equipos, una fila de chips táctiles por equipo (con **"Todos"** y el conteo).
5. Observa la agenda agrupada por encabezados: **"Vencidas"** (rojo), **"Pendientes de hoy"** (naranja) y **"Próximas"** (gris), cada grupo con su conteo. Confirma la **paginación arriba y abajo** (unidad "rondas").
6. En cada tarjeta de ronda observa: la **hora grande** (formato 24h), el texto relativo de urgencia — **"Vence en 45 min"** / **"Vencida hace 2 h"** / "Vence 14:00" —, el tag del equipo, el nombre de la ronda, el nodo/plantilla, el turno y los botones **"Iniciar"** (o **"Continuar"** si ya hay una entrada en curso, con chip **"En curso"**) y **"Omitir"**.

> **Qué observar.** Que la lista esté acotada por el backend a los roles ∩ nodos accesibles ∩ rol responsable de Jorge (worklist propio). Que las VENCIDAS siempre se muestren aunque el horizonte sea corto. Que el texto relativo cambie de color según urgencia (rojo vencida, naranja próxima hora). Que el filtro por área/equipo se calcule en cascada sin auto-anularse. Que las horas usen ciclo 24h (es-CL).

> **Resultado esperado.** "Mis rondas" carga con los KPIs poblados y la agenda agrupada por urgencia. Jorge ve claramente qué rondas están vencidas y cuáles vienen.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 8.2 — Iniciar una ronda (abre la bitácora) y volver

> **Contexto.** **Jorge Ramírez** inicia la ronda del Molino SAG 01. Iniciar CREA la entrada de bitácora de esa ronda y lo lleva a llenarla; al terminar puede volver a su agenda. Es el enlace directo entre rondas y bitácoras.

1. En una ronda pendiente (idealmente del **Molino SAG 01**), pulsa **"Iniciar"**.
2. El sistema crea la entrada y te navega a la pantalla de llenado (`/bitacoras/{id}/editar`). Verifica que arriba a la izquierda aparezca el botón **"Volver a Mis rondas"** (el "Volver" respeta el origen).
3. Llena al menos una sección (como en la Fase 7) y guarda; luego pulsa **"Volver a Mis rondas"**.
4. De vuelta en la agenda, la misma ronda debe mostrar ahora el botón **"Continuar"** y el chip **"En curso"** (ya no ofrece "Omitir" porque hay una entrada iniciada).

> **Qué observar.** Que "Iniciar" materialice la entrada de bitácora asociada a la ronda (no un borrador vacío desconectado). Que "Continuar" retome esa misma entrada (no cree otra). Que la navegación de "Volver" regrese exactamente a "Mis rondas".

> **Resultado esperado.** La ronda pasa a "en curso" y la entrada de bitácora queda creada y editable. Jorge puede alternar entre su agenda y el llenado sin perder el hilo.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 8.3 — Omitir una ronda con motivo

> **Contexto.** A veces una ronda no puede realizarse. **Jorge Ramírez** la omite dejando constancia auditada. Verificamos el modal y la exigencia de motivo.

1. En una ronda pendiente que aún no hayas iniciado, pulsa **"Omitir"**.
2. En el modal **"Omitir ronda"** revisa el texto "Indique el motivo (queda auditado). La ronda no se realizará." Ingresa un motivo (mínimo 5 caracteres) en el campo **"Motivo de la omisión…"**.
3. Confirma con **"Omitir"**. Toast esperado: **"Ronda omitida"**.

> **Qué observar.** Que el botón "Omitir" del modal quede DESHABILITADO con menos de 5 caracteres. Que solo se ofrezca "Omitir" en rondas que aún no tienen entrada iniciada. Que la omisión quede auditada (quién, cuándo, por qué).

> **Resultado esperado.** La ronda se marca como omitida y desaparece de las pendientes. La omisión queda registrada.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 8.4 — Generar ocurrencias si el demo no las creó (planificador)

> **Contexto.** Si "Mis rondas" aparece vacía porque el set de datos no generó ocurrencias, hay que generarlas. Esto lo hace **Rodrigo Salas (planificador)** desde el módulo de programación de rondas. Es una nota de continuidad para no bloquear la prueba.

1. Cierra sesión e ingresa como **Rodrigo Salas** (`rsalas@cerroaspero.cl`, `Planifica2026!`). Ve a **Rondas** (`/rondas`).
2. Entra a la pestaña/sección **"Ocurrencias"** y pulsa **"Generar rondas"** para materializar las ocurrencias del horizonte configurado.
3. Vuelve a ingresar como **Jorge Ramírez** y confirma que ahora "Mis rondas" muestra ocurrencias pendientes/vencidas.

> **Qué observar.** Que la generación respete el calendario y la programación definida. Que las ocurrencias generadas aparezcan en el worklist del operador correcto (por rol responsable ∩ nodo). Nota honesta: un demo con mucha antigüedad puede acumular cientos de rondas VENCIDAS — eso es deriva de datos, no un bug.

> **Resultado esperado.** Con ocurrencias generadas, la Fase 8 puede ejecutarse de punta a punta (iniciar/continuar/omitir).

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### Registro de hallazgos de la Fase 8

| N.º | Paso | Módulo/Pantalla | Severidad | Descripción | Estado |
|-----|------|-----------------|-----------|-------------|--------|
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |

---

## Fase 9 · Incidencias: catálogos, alta, workflow y cierre

Una desviación crítica en el Molino SAG 01 no termina en la bitácora: escala a **incidencia**, con investigación de causa raíz, acciones correctivas/preventivas (CAPA), reportabilidad a autoridades y un cierre controlado. Este es el módulo de gestión HSE/operacional más completo del sistema, alineado a estándares de industria (5 Porqués, CAPA, reportabilidad regulatoria).

En esta fase, **Camila Vega (prevención-riesgos)** prepara primero los catálogos (tipos, categorías, obligaciones de reporte) y luego gestiona la investigación/CAPA/verificación; **María Fuentes (supervisor-turno)** crea la incidencia y transiciona el flujo. Cierra con el dashboard de gestión.

> Nota de escala de severidad: en incidencias, la **severidad operacional 1–5** (Muy baja / Baja / Media / Alta / Crítica) y la **prioridad** (Baja / Media / Alta / Crítica) son semántica del NEGOCIO. No confundir con la escala S1–S5 de severidad de HALLAZGOS QA de este documento.

### 9.1 · Catálogos de incidencias (prevención)

#### Paso 9.1 — Crear un TIPO de incidencia ("Falla de equipo")

> **Contexto.** **Camila Vega** configura los catálogos antes de operar. Un tipo de incidencia define su comportamiento: flujo por defecto, si exige investigación, si exige CAPA, si es reportable y su SLA. Permiso `incidentcatalog:manage`.

1. Ingresa como **Camila Vega** (`cvega@cerroaspero.cl`, `Prevenir2026!`; con MFA). Ve a **Incidencias** (`/incidencias`) y pulsa **"Catálogos"** (o navega a `/incidencias/catalogos`).
2. Confirma el encabezado **"Catálogos de incidencias"** con subtítulo "Administra los tipos, categorías y obligaciones de reporte disponibles al reportar incidencias." y las tres pestañas: **"Tipos"**, **"Categorías"**, **"Obligaciones de reporte"**.
3. En la pestaña **"Tipos"**, revisa los filtros (buscador "Buscar por nombre o clave…", estado Todos/Activos/Inactivos, orden Orden/Nombre) y pulsa **"Nuevo tipo"**.
4. En el modal **"Nuevo tipo de incidencia"** completa campo por campo:
   - **"Nombre *"**: `Falla de equipo`.
   - **"Orden"**: `0`.
   - **"Clave (key) *"**: `falla-equipo` (minúsculas, números y guiones; no se puede cambiar luego).
   - **"Descripción"**: p. ej. "Fallas y detenciones no programadas de equipos de proceso."
   - **"Color del chip"**: elige **"Naranjo (sev. 4)"** de la paleta de swatches.
   - **"Flujo por defecto"**: elige un flujo publicado de incidencias, o deja "(usar flujo global de incidencias)".
   - Toggles de comportamiento: activa **"Requiere investigación"** (exige 5 Porqués para cerrar), **"Requiere CAPA"** (acciones obligatorias para cerrar) y deja **"Reportable por defecto"** según criterio (si lo activas, al crear la incidencia se materializan los reportes de las obligaciones aplicables).
   - **"Plazo de resolución (SLA)"**: define un plazo (p. ej. 24 h).
   - **"Escalar tras el plazo"**: tiempo adicional antes de avisar al rol superior; **"Rol de escalamiento"**: elige un rol.
5. Pulsa **"Crear tipo"**. Toast esperado: **"Tipo creado"**.

> **Qué observar.** Que la clave rechace mayúsculas/espacios ("Usa solo minúsculas, números y guiones.") y colisiones ("Ya existe un tipo con esa clave."). Que al editar, la clave quede deshabilitada ("La clave es la identidad del catálogo y no se puede cambiar."). Que el chip de color use solo la paleta de marca (sin hex libre). Que el toggle Activo/Inactivo de la fila funcione sin borrar el tipo.

> **Resultado esperado.** El tipo **"Falla de equipo"** aparece en la tabla con su clave, flujo por defecto, chips de comportamiento (Investigación / CAPA / Reportable) y estado Activo.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 9.2 — Crear una categoría y una obligación de reporte (SERNAGEOMIN)

> **Contexto.** **Camila Vega** completa el catálogo: una categoría bajo el tipo, y una obligación de reporte a una autoridad minera. La reportabilidad se modela como DATO (nunca en la lógica), para servir a cualquier marco regulatorio.

1. En la pestaña **"Categorías"**, pulsa **"Nueva categoría"** y crea una (Nombre, Clave, Descripción, Tipo — puedes asociarla a "Falla de equipo" o dejarla transversal, Orden, Activo). Guarda: toast **"Categoría creada"**.
2. En la pestaña **"Obligaciones de reporte"**, pulsa **"Nueva obligación"** y completa el modal **"Nueva obligación de reporte"**:
   - **"Nombre *"**: `Reporte a SERNAGEOMIN`.
   - **"Orden"**: `0`.
   - **"Clave (key) *"**: `reporte-sernageomin`.
   - **"Autoridad / obligado"**: `SERNAGEOMIN`.
   - **"Descripción"**: qué obliga este reporte.
   - **"Plazo por defecto (minutos)"**: `1440` (= 24 h).
   - **"Severidad mínima"**: elige **"≥ 4 (alta)"**.
   - **"Aplica a los tipos"**: marca **"Falla de equipo"** (sin selección = aplica a TODOS los tipos / transversal).
   - Toggle **"Obligatorio"**: actívalo (si el reporte sigue pendiente, BLOQUEA el cierre de la incidencia).
3. Pulsa **"Crear obligación"**. Toast esperado: **"Obligación creada"**.

> **Qué observar.** Que en la tabla de obligaciones se vea la autoridad (SERNAGEOMIN), el "Aplica a" (los tipos o "Todos los tipos"), la "Severidad ≥ 4", el plazo legible ("1 día(s)" o "24 h") y el chip **"Obligatorio"**. Que sin plazo se muestre "Sin plazo". Que la validación de clave sea idéntica a la de tipos.

> **Resultado esperado.** La obligación **"Reporte a SERNAGEOMIN"** queda registrada, obligatoria, aplicable a "Falla de equipo" con severidad mínima 4 y plazo 24 h.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 9.2 · Alta de la incidencia

#### Paso 9.3 — Reportar la incidencia del Molino SAG 01 (supervisora)

> **Contexto.** **María Fuentes (supervisor-turno)** eleva formalmente la desviación crítica a incidencia. Puede hacerlo desde `/incidencias`, o desde la bitácora/excepción de origen (como vimos con Camila en 7.7). Permiso `incident:create`.

1. Ingresa como **María Fuentes** (`mfuentes@cerroaspero.cl`, `Turno2026Sup!`; con MFA). Ve a **Incidencias** (`/incidencias`). Encabezado: **"Incidencias"** con subtítulo "Gestión de incidencias operacionales y HSE."
2. Pulsa **"Reportar incidencia"**. En el modal **"Reportar incidencia"** completa:
   - **"Título *"**: `Sobrecalentamiento descanso Molino SAG 01`.
   - **"Descripción"**: p. ej. "Temperatura de descanso 95 °C detectada en ronda de turno; supera umbral crítico (>90 °C)."
   - **"Tipo *"**: `Falla de equipo`.
   - **"Categoría"**: la creada en 9.2 (opcional).
   - **"Severidad real *"**: **"4 · Alta"**.
   - **"Potencial de gravedad"**: p. ej. **"5 · Crítica"** (o "(no evaluado)").
   - **"Prioridad"**: **"Alta"**.
   - **"Nodo / ubicación *"**: `Molienda` (buscador con ruta de ancestros).
   - **"Equipo / activo"**: `Molino SAG 01` (se habilita al elegir nodo).
   - **"Fecha y hora del evento"**: opcional; cuándo OCURRIÓ (puede ser anterior al reporte).
3. Pulsa **"Crear incidencia"**. Toast esperado: **"Incidencia INC-#### creada"**; el detalle se abre.

> **Qué observar.** Que el botón "Crear incidencia" quede deshabilitado hasta tener título (≥3), tipo y nodo. Que el equipo se limpie al cambiar de nodo. Que la severidad real 1–5 muestre las etiquetas Muy baja/Baja/Media/Alta/Crítica y la prioridad Baja/Media/Alta/Crítica. Que si se creó desde una excepción, herede el nodo/equipo/turno del contexto y quede vinculada (origen "Excepción" o "Bitácora"). Que el SLA de resolución se fije automáticamente según el tipo (creación + plazo).

> **Resultado esperado.** Se crea la incidencia **"Sobrecalentamiento descanso Molino SAG 01"** con folio INC-####, severidad 4, tipo Falla de equipo, nodo Molienda, equipo Molino SAG 01, y su plazo de resolución calculado.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 9.4 — Recorrer la lista y el tablero Kanban

> **Contexto.** **María Fuentes** revisa el estado global de incidencias. Verificamos KPIs, filtros, y las dos vistas: Lista y Tablero por estado.

1. En `/incidencias`, revisa los KPIs (tarjetas clicables): **"Abiertas"**, **"Críticas"**, **"Plazo vencido"**, **"Permanencia excedida"**, **"Sin responsable"**, **"Desde bitácora"**, **"Reportables"** y **"Reporte vencido"**.
2. Confirma los filtros en una línea: buscador (**"Buscar por folio, título o descripción…"**), estado (Todos / Abiertas / Cerradas / Anuladas), tipo, severidad, prioridad, un selector de banderas (Mis incidencias / Sin responsable / Plazo vencido / Permanencia excedida / Reportables / Reporte vencido / Desde bitácora), orden (Recientes / Severidad / Prioridad / Vencimiento) y el rango de fechas. Los filtros activos se muestran como chips con "Limpiar filtros".
3. En vista **Lista**, revisa las columnas: **Folio**, **Título** (con etiquetas "Plazo vencido" / "Reportable" / "Reporte vencido"), **Tipo**, **Sev.**, **Prioridad**, **Estado**, **Nodo**, **Responsable**, **Origen**. Paginación arriba y abajo.
4. Cambia a la vista **Tablero** (ícono de cuadrícula). Verifica las columnas por estado, en orden: **reportada**, **en_triage**, **asignada**, **en_progreso**, **en_verificacion**, **cerrada** (los nombres reales vienen del flujo). Cada tarjeta muestra folio, prioridad, título, nodo, responsable y etiquetas de plazo/permanencia.
5. Haz clic en la incidencia del Molino SAG 01 para abrir su detalle (drawer).

> **Qué observar.** Que la incidencia recién creada aparezca en la columna del estado inicial del flujo (reportada) y sume a "Abiertas". Que "Desde bitácora" cuente las de origen bitácora/excepción. Que el drill-down por KPI aplique el filtro correspondiente. Que el folio tenga formato **INC-####**.

> **Resultado esperado.** La lista y el tablero muestran la incidencia del Molino SAG 01 en su estado inicial, con severidad 4 (Alta) y sin responsable.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 9.3 · Gestión: asignar, CAPA, investigación, reportes

#### Paso 9.5 — Detalle: asignar responsable, revisar origen y plazo

> **Contexto.** En el drawer de detalle, **María Fuentes** asigna responsable y revisa la trazabilidad (origen) y el SLA. Permiso `incident:assign`.

1. En el detalle (drawer), revisa el encabezado: folio, punto de severidad, chip de prioridad, chip de ciclo de vida (**"Abierta"**). Debajo, el título y la meta-línea (tipo · categoría · severidad Alta · potencial).
2. Confirma el **stepper de estados** del flujo (con el estado actual resaltado) y las pestañas: **"Resumen"**, **"Acciones"**, **"Investigación"**, **"Reportes"**, **"Órdenes de trabajo"** (si tiene permiso `workorder:view`) y **"Actividad"**.
3. En **"Resumen"**, revisa el bloque **"Origen"**: Fuente (Manual / Bitácora / Excepción / Regla), Nodo (Molienda), Equipo (Molino SAG 01), Turno, Ocurrió, Reportada por, enlace a la Bitácora de origen si aplica, **"Plazo de resolución"** (con "Editar" si `incident:edit`) y **"Permanencia"** si excede el SLA de estadía.
4. Si aparecen las **"Excepciones de origen"**, verifica el enlace campo → excepción → incidencia (trazabilidad).
5. En el selector **"Responsable"**, asigna a un usuario (p. ej. **Camila Vega** para la gestión HSE). El KPI "Sin responsable" debe decrementar.

> **Qué observar.** Que el "Plazo de resolución" muestre "· vencido" en rojo si ya pasó, y permita editarlo (mutación con toast "Plazo actualizado"). Que la trazabilidad enlace a la entrada de bitácora y a las excepciones que originaron la incidencia. Que solo se pueda asignar mientras la incidencia esté "Abierta".

> **Resultado esperado.** La incidencia queda con responsable asignado; el origen y el plazo se muestran correctamente enlazados.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 9.6 — Investigación de causa raíz (5 Porqués)

> **Contexto.** El tipo "Falla de equipo" exige investigación. **Camila Vega** documenta la causa raíz por el método 5 Porqués. Requiere `incident:edit` y la incidencia abierta.

1. En la pestaña **"Investigación"** (con el aviso, si el tipo lo exige: "Este tipo de incidencia exige una investigación de causa raíz completada (con al menos una causa raíz) para cerrar."), pulsa **"Iniciar investigación"**.
2. Completa **"Problema a investigar"**: "Sobrecalentamiento del descanso del Molino SAG 01."
3. Agrega la cadena de porqués con **"Agregar porqué"**. En cada paso escribe el enunciado (**"¿Por qué ocurrió el problema?"** en el primero) y la respuesta/causa (opcional). Marca al menos uno con **"Es una causa raíz"** (p. ej. "Sistema de lubricación con caudal insuficiente por filtro saturado").
4. Pulsa **"Guardar"** (toast "Investigación guardada") y luego **"Completar"** (exige ≥1 causa raíz; toast "Investigación completada").

> **Qué observar.** Que "Completar" quede bloqueado si no hay ninguna causa raíz marcada ("Marca al menos una causa raíz para poder completar la investigación."). Que el chip de estado pase de **"Borrador"** a **"Completada"**. Que una investigación completada con causa raíz sea la que libera el cierre cuando el tipo lo exige (el servidor es autoritativo).

> **Resultado esperado.** La investigación queda **"Completada"** con al menos una causa raíz identificada y visible en modo lectura.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 9.7 — Acciones CAPA: crear, completar y verificar (segregación)

> **Contexto.** El tipo exige CAPA. **Camila Vega** crea una acción correctiva obligatoria, la marca realizada y luego VERIFICA su eficacia. La verificación exige el permiso `incident:action:verify` (segregación revisor ≠ ejecutor).

1. En la pestaña **"Acciones"** (título "Acciones correctivas/preventivas (N)"), pulsa **"Nueva acción"**.
2. En el modal **"Nueva acción"** completa: **"Tipo"** (Correctiva / Preventiva / Inmediata → elige **Correctiva**), **"Título"** ("Reemplazar filtro de lubricación y verificar caudal"), **"Detalle"** (opcional), **"Responsable"** (opcional), **"Plazo"** (opcional), **"Causa raíz que atiende"** (si hay causas raíz, enlaza la del paso 9.6) y marca **"Obligatoria (bloquea el cierre de la incidencia hasta resolverse)"**.
3. Pulsa **"Crear"** (toast "Acción creada"). La acción nace en estado **"Abierta"**.
4. Pulsa **"Completar"** en la acción: en el modal "Completar {código}" agrega una **"Nota de cierre (opcional)"** y pulsa **"Marcar realizada"** (toast "Acción marcada como realizada"). El estado pasa a **"Realizada"**.
5. Pulsa **"Verificar"** (solo visible con `incident:action:verify`): en el modal **"Verificar eficacia · {código}"** elige **"Eficaz (se verifica y cierra)"** (o "No eficaz (se reabre para retrabajo)"), agrega nota de verificación y pulsa **"Registrar"** (toast "Verificación registrada"). El estado pasa a **"Verificada"**.

> **Qué observar.** Que el aviso "N acción(es) obligatoria(s) sin resolver: pueden bloquear el cierre." aparezca mientras haya obligatorias no verificadas. Que la acción obligatoria muestre la estrella. Que el botón "Verificar" NO aparezca para quien solo puede gestionar (`incident:action:manage`) sin `verify` — segregación de funciones. Que la secuencia de estados sea Abierta → En progreso → Realizada → Verificada.

> **Resultado esperado.** La acción CAPA correctiva obligatoria queda **"Verificada"** eficaz, desbloqueando ese requisito para el cierre.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 9.8 — Reportabilidad: materializar y marcar el reporte a SERNAGEOMIN

> **Contexto.** Como la incidencia es severidad 4 y el tipo aplica a la obligación creada, debe materializarse el reporte a SERNAGEOMIN. **Camila Vega** lo gestiona en la pestaña Reportes. Un reporte obligatorio pendiente bloquea el cierre. Permiso `incident:edit`.

1. En la pestaña **"Reportes"** (título "Reportabilidad (N)"), si no hay reportes, pulsa **"Re-derivar"** (re-deriva los aplicables según tipo y severidad; toast "N reporte(s) requerido(s) agregado(s)") o **"Agregar"** para elegir una obligación manualmente.
2. Verifica que aparezca el reporte **"Reporte a SERNAGEOMIN"** con la estrella de obligatorio, su estado **"Pendiente"**, la autoridad (SERNAGEOMIN) y el **"Plazo"** (rojo si vencido). Debe verse el aviso "N reporte(s) obligatorio(s) pendiente(s): bloquean el cierre hasta enviarlos o marcarlos «no aplica»."
3. Pulsa **"Marcar enviado"**: en el modal "Marcar enviado · {código}" ingresa el **"Folio/número externo (opcional)"** (el que entregue la autoridad), la fecha de envío (opcional) y notas; pulsa **"Registrar envío"** (toast "Reporte marcado como enviado"). El estado pasa a **"Enviado"**.
4. Alternativa: **"No aplica"** (justifica con motivo ≥5, queda auditado) o **"Anular"** (motivo ≥5).

> **Qué observar.** Que el reporte obligatorio pendiente bloquee el cierre (banner y comportamiento del servidor). Que "Enviado" muestre el folio externo, la fecha y quién lo envió. Que "Re-derivar" solo agregue lo aplicable (no duplique lo ya materializado).

> **Resultado esperado.** El reporte a SERNAGEOMIN queda **"Enviado"** con su folio externo, liberando el requisito de reportabilidad para el cierre.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 9.4 · Workflow, cierre, OT y actividad

#### Paso 9.9 — Transicionar el flujo con firma y cerrar la incidencia

> **Contexto.** Con la investigación completa, la CAPA obligatoria verificada y el reporte obligatorio resuelto, la incidencia puede recorrer su flujo hasta el cierre. **María Fuentes** ejecuta las transiciones (con firma cuando el estado lo exige). El cierre exige resumen y solo se desbloquea si se cumplieron los tres requisitos. Permiso `incident:transition`.

1. En la pestaña **"Resumen"**, ubica los botones de **transiciones disponibles** (dependen del estado y del rol; los que exigen firma muestran un ícono de escudo). Avanza la incidencia paso a paso (p. ej. asignada → en progreso → en verificación).
2. En cada transición se abre un modal (título = etiqueta): revisa "Avanzar a {estado}.", el campo **"Comentario (opcional)"** y, si la transición es final, el campo **"Resumen de cierre"**. Si exige firma, aparece el bloque **"Firma electrónica requerida"** con **"Contraseña"** (+ **"Código MFA"** si aplica).
3. Ejecuta la transición FINAL (cierre): ingresa el **"Resumen de cierre"** (qué se resolvió/verificó), la contraseña y el MFA de María, y pulsa **"Confirmar"** (toast "Estado actualizado"). La incidencia pasa a **"Cerrada"**.

> **Qué observar.** Que el cierre esté BLOQUEADO si quedara una CAPA obligatoria sin verificar, la investigación incompleta o un reporte obligatorio pendiente (el servidor rechaza y lo indica). Que la firma de transición exija MFA cuando corresponde (María tiene MFA). Que el chip de ciclo de vida pase a "Cerrada".

> **Resultado esperado.** La incidencia del Molino SAG 01 queda **"Cerrada"** con su resumen de cierre y las firmas Part 11 registradas. Los requisitos (investigación, CAPA, reporte) quedaron satisfechos.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 9.10 — Crear OT desde la incidencia, comentar y anular (traza)

> **Contexto.** Muchas incidencias derivan en una **Orden de Trabajo** (reparación). Desde el detalle se puede crear una OT sembrada con los datos de la incidencia. También verificamos comentarios/timeline y la anulación trazable. Permisos `workorder:view/create`, `incident:comment`, `incident:cancel`.

1. En la pestaña **"Órdenes de trabajo"** (visible con `workorder:view`), crea una OT desde la incidencia: la OT nace sembrada con título, descripción, nodo (Molienda) y criticidad = severidad de la incidencia. (El flujo completo de OT se prueba en su propia fase.)
2. En la pestaña **"Actividad"**, agrega un comentario en el campo **"Agregar comentario de gestión…"** y pulsa **"Enviar"**. Revisa el **timeline** (audit trail): cada evento con fecha/hora, resumen y actor.
3. Solo para verificar la anulación trazable (NO sobre la incidencia ya cerrada; usa una de prueba abierta): en "Resumen", pulsa **"Anular incidencia"**, confirma en el modal que "La anulación es trazable (no borra la incidencia)." e ingresa un motivo ≥5. La incidencia pasa a **"Anulada"** (chip gris) — no se borra.

> **Qué observar.** Que la OT herede correctamente el nodo y la criticidad. Que el timeline registre cada acción (creación, asignación, CAPA, reporte, transiciones, comentario). Que "Anular incidencia" no aparezca si ya está anulada, y que la anulación quede auditada (motivo ≥5).

> **Resultado esperado.** Se genera la OT enlazada a la incidencia; los comentarios y el timeline reflejan toda la gestión; la anulación (en la incidencia de prueba) deja huella sin destruir datos.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 9.11 — Dashboard de incidencias (gestión)

> **Contexto.** Para cerrar la fase, **María Fuentes** (o **Patricia Núñez**, gerencia) revisa el **Dashboard de incidencias**: indicadores de gestión, tendencias y drill-down. Es la vista ejecutiva del módulo.

1. En `/incidencias`, pulsa **"Dashboard"** (o navega a `/incidencias/dashboard`). Encabezado: **"Dashboard de incidencias"** con subtítulo "Tendencias e indicadores de gestión. Solo lo que puedes ver (alcance por nodo)."
2. Ajusta el rango con los botones rápidos (**"30 días"**, **"90 días"**, **"12 meses"**) o las fechas **"Desde" / "Hasta"**, y los selectores de Tipo / Severidad / Origen.
3. Revisa los KPIs en dos grupos:
   - **"Estado actual"** (en vivo): Abiertas, Críticas, Plazo vencido, Permanencia excedida, CAPA abiertas, CAPA vencidas, Reportes pendientes, Reportes vencidos.
   - **"En el periodo"**: **"Creadas"**, **"Cerradas"**, **"MTTR"** (h), **"Cumplimiento SLA"** (%), **"Eficacia CAPA"** (%).
4. Revisa los gráficos: **"Tendencia: creación vs. cierre"** (Creadas vs. Cerradas), **"Por tipo (Pareto)"**, **"Por severidad"** (dona), y los cortes por nodo/equipo/turno/origen y de **Reincidencia** (según disponibilidad). Haz clic en un segmento para el **drill-down** a la lista (con "← Volver al dashboard").
5. Pulsa **"Exportar CSV"** para descargar el corte del período.

> **Qué observar.** Que los KPIs "en vivo" reflejen el estado real (la incidencia cerrada suma a Cerradas del período). Que el dashboard respete el alcance por nodo del usuario (Patricia ve toda la estructura; un rol acotado ve menos). Que los porcentajes y horas usen formato regional. Que el drill-down aplique el rango + la dimensión clicada.

> **Resultado esperado.** El dashboard muestra la incidencia del Molino SAG 01 en las tendencias y KPIs del período, con drill-down y exportación CSV operativos.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### Registro de hallazgos de la Fase 9

| N.º | Paso | Módulo/Pantalla | Severidad | Descripción | Estado |
|-----|------|-----------------|-----------|-------------|--------|
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |


## Fase 10 · Órdenes de trabajo (OT / PTW)

Con las incidencias vivas, la operación de Cerro Áspero necesita el brazo ejecutor: cuando la excepción de la Fase 9 o una incidencia detecta que el Molino SAG 01 pierde un rodamiento, alguien tiene que **planificar, autorizar, permisar y ejecutar** ese trabajo con trazabilidad de grado auditoría. Ese es el módulo de Órdenes de trabajo (OT), que en la jerga minera abarca desde la solicitud simple hasta el Permiso de Trabajo (PTW) de alto riesgo: bloqueo de energías (LOTO), trabajo en altura, espacio confinado. En esta fase construyes el catálogo de OT, creas una solicitud, la haces avanzar por las **cuatro puertas** (Aprobación, Autorización, Congelación del plan, Ejecución), permisas checklists por momento del ciclo, confirmas la dotación con firma electrónica y cierras la orden. Tres personas entran en juego con segregación real de funciones: **María Fuentes** (supervisor-turno) crea y aprueba las puertas; **Luis Tapia** (mantenedor) ejecuta el plan y llena los checklists de ejecución; **Camila Vega** (prevención-riesgos) revisa los checklists/PTW (el revisor NUNCA puede ser quien los completó). Trabajarás minucioso: cada campo del catálogo tiene consecuencia aguas abajo, y una puerta mal configurada rompe el flujo entero.

> **Nota de honestidad.** Los rótulos de las transiciones ("Enviar para revisión", "Pasar a autorización", "Autorizar plan", "Comenzar ejecución", "Pasar a cierre", "Cerrar orden", "Aprobar", "Rechazar") son **data-driven**: los define el flujo publicado que asocies al tipo (el flujo global sembrado es «OT — 4 puertas PTW», clave `ot-4-puertas`). Los textos exactos que verás en los botones dependen de cómo esté rotulado ese flujo. En este documento usamos los nombres funcionales de cada puerta; si en pantalla el rótulo difiere, anótalo como observación (S4/S5), no como falla.

---

### 10.1 · Catálogos de OT (fundaciones)

Antes de crear una sola OT hay que sembrar el catálogo: tipos, especialidades, reglas de checklist, competencias, reglas de competencia y roles de dotación. Sin esto, el asistente de creación no ofrece opciones y las puertas no tienen de dónde exigir permisos.

#### Paso 10.1 — Entrar a Catálogos de órdenes de trabajo

> **Contexto.** **María Fuentes** (o el planificador **Rodrigo Salas**, según a quién delegues `workordercatalog:manage`) abre el mantenedor de catálogos. Es la pantalla de gobierno del módulo: seis pestañas que definen cómo se comportan todas las OT.

1. En el menú lateral entra a **Órdenes de trabajo** (ruta `/ordenes-trabajo`). Verás el subtítulo "Solicitudes de trabajo y permisos de trabajo (PTW)."
2. En la cabecera, pulsa el botón **Catálogos** (ícono de etiquetas). Te lleva a `/ordenes-trabajo/catalogos`.
3. Observa el encabezado "Catálogos de órdenes de trabajo" y el subtítulo "Administra los tipos de OT y las especialidades (disciplinas) disponibles al crear una solicitud. La ubicación la define la estructura organizacional (nodo)."
4. Confirma la barra de **seis pestañas**, en este orden: **Tipos**, **Especialidades**, **Reglas de checklist**, **Competencias**, **Reglas de competencia**, **Roles de dotación**.

> **Qué observar.** Si el usuario no tiene `workordercatalog:manage`, la página muestra el estado "Sin acceso" con el texto "No tienes permiso para administrar los catálogos de órdenes de trabajo." (el botón "Catálogos" ni siquiera aparece en la lista para quien no puede). La pestaña activa por defecto es **Tipos**.

> **Resultado esperado.** Estás en el mantenedor con las seis pestañas visibles y la pestaña Tipos seleccionada.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 10.2 — Crear el tipo "Correctiva mecánica" (con las 4 puertas, PTW, dotación, SLA y folio)

> **Contexto.** El tipo de OT es la pieza más densa del catálogo: amarra el flujo (las 4 puertas), la criticidad sugerida, si exige PTW, si gestiona dotación, el SLA de resolución con escalamiento y el esquema de folio gapless. **María** crea el tipo que usará para el cambio de rodamiento del molino.

1. En la pestaña **Tipos**, pulsa **Nuevo tipo**. Se abre el modal "Nuevo tipo de OT".
2. **Nombre \***: escribe `Correctiva mecánica`.
3. **Orden**: deja `0` (o el que corresponda al orden de despliegue).
4. **Clave (key) \***: escribe `correctiva-mecanica` (minúsculas, números y guiones; el sistema fuerza minúsculas al tipear). El texto de ayuda avisa "Minúsculas, números y guiones. No se podrá cambiar luego."
5. **Descripción**: `Reparaciones correctivas de equipos mecánicos rotativos y estáticos.`
6. **Color del chip**: elige "Índigo (acento)" de la paleta de marca (o "Sin color").
7. **Flujo por defecto**: selecciona el flujo de las 4 puertas. Si no eliges nada, el texto de ayuda dice "(usar flujo global de OT)" y el sistema aplica el flujo global de OT (clave `ot-4-puertas`).
8. **Criticidad sugerida**: elige `4 · Alta` (prellena la criticidad al crear una OT de este tipo).
9. En el bloque de flags:
   - Activa el toggle **Requiere permiso de trabajo (PTW) por defecto** ("Las OT de este tipo prellenan «Requiere PTW»…").
   - Activa el toggle **Gestiona dotación** ("Las OT de este tipo listan las personas… el aprobador confirma y firma la dotación antes de autorizar el permiso.").
   - Al activar dotación aparece el sub-toggle **Exige acreditación de la empresa contratista** (indentado). Actívalo para probar el semáforo de contratistas (traza Ley 16.744 art. 66 bis).
10. **Plazo de resolución (SLA)**: usa el selector de duración para fijar, por ejemplo, `8 horas`. El texto de ayuda dice "Al APROBAR la OT se fija su plazo automáticamente (aprobación + este tiempo). El responsable puede sobrescribirlo."
11. **Escalar tras el plazo**: fija, por ejemplo, `2 horas` (tiempo adicional ya vencido el plazo antes de avisar al rol superior).
12. **Rol de escalamiento**: elige `supervisor-turno` (o "(sin escalamiento)").
13. **Folio de la orden**: en el editor de esquema, personaliza si quieres el prefijo `OT`; sin personalizar usa la serie por defecto (la vista previa muestra un ejemplo como `OT-2026-0001`). El texto dice "Personalizar el folio de este tipo".
14. **¿Cuándo se emite el folio?**: deja la opción por defecto **Al aprobar la solicitud (por defecto)**, o elige "Al entrar a «…»" un estado del flujo. El texto de ayuda: "El folio se emite (una sola vez, sin huecos) al ENTRAR al estado elegido del flujo."
15. Pulsa **Crear tipo**.

> **Qué observar.** El botón **Crear tipo** permanece deshabilitado hasta que Nombre tenga ≥1 carácter y la clave ≥2 caracteres, con formato válido y sin colisión. Si repites una clave existente, aparece en rojo "Ya existe un tipo con esa clave." Si usas mayúsculas o símbolos: "Usa solo minúsculas, números y guiones." Al guardar, toast "Tipo creado". El sub-toggle de acreditación solo se persiste si "Gestiona dotación" está activo.

> **Resultado esperado.** El tipo "Correctiva mecánica" aparece en la grilla con su dot índigo, la clave `correctiva-mecanica` en monoespaciado, el flujo por defecto, "4 · Alta" en Criticidad, un chip "PTW" y el toggle de estado en "Activo".

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 10.3 — Crear las especialidades "Mecánica", "Eléctrica" y "Lubricación"

> **Contexto.** Las especialidades (disciplinas) permiten clasificar la OT y sus actividades, y son eje de las reglas de checklist y competencia. **María** siembra las tres básicas de la planta.

1. Ve a la pestaña **Especialidades**. Pulsa **Nueva especialidad**.
2. Crea la primera: **Nombre** `Mecánica`, **Clave** `mecanica`, color a gusto. Guarda.
3. Repite para **Nombre** `Eléctrica`, **Clave** `electrica`.
4. Repite para **Nombre** `Lubricación`, **Clave** `lubricacion`.

> **Qué observar.** Cada creación arroja toast "Activada" (o el mensaje de guardado). La grilla lista las tres con su dot de color, clave en monoespaciado, Orden y el toggle Activo/Inactivo. El filtro superior (Buscar / Todos-Activos-Inactivos / Orden-Nombre) opera sobre la grilla.

> **Resultado esperado.** Tres especialidades activas: Mecánica, Eléctrica, Lubricación.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 10.4 — Crear reglas de checklist por momento del ciclo

> **Contexto.** Las reglas de checklist son las que **sugieren y exigen** permisos automáticamente según el MOMENTO del ciclo (Solicitud, Planificación, Autorización, Ejecución, Cierre) y la aplicabilidad (tipo, criticidad, especialidad, si es PTW). Gobiernan las Puertas 2 y 4. **María** define al menos una regla de AUTORIZACIÓN obligatoria (p. ej. una "Toma 5" o un ART) y una de EJECUCIÓN (p. ej. LOTO por actividad).

1. Ve a la pestaña **Reglas de checklist**. Pulsa **Nueva regla**.
2. Asocia una **plantilla** de checklist ya publicada (creada en la Fase de plantillas), fija el **Momento** en `AUTORIZACIÓN`, define **aplica a** el tipo "Correctiva mecánica" (o déjalo a "Todos los tipos"), criticidad mínima, especialidad y/o "Solo PTV", y marca **Obligatorio**. Guarda.
3. Crea una segunda regla con **Momento** `EJECUCIÓN` (esta se aplicará por actividad del plan) y **Obligatorio**.

> **Qué observar.** La grilla muestra columnas Regla, Plantilla, Momento (rótulo del catálogo de momentos), "Aplica a" (nombres de tipos, o "Todos los tipos", con sub-líneas "Criticidad ≥ N", "Especialidad: …", "Solo PTW"/"Solo sin PTW"), Obligatorio (chip "Obligatorio" ámbar u "Opcional"), Orden y Estado. Al eliminar una regla, confirma con "¿Eliminar la regla «…»? Las OT ya materializadas conservan su checklist."

> **Resultado esperado.** Al menos una regla de AUTORIZACIÓN obligatoria y una de EJECUCIÓN obligatoria activas.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 10.5 — Crear competencias, reglas de competencia y roles de dotación

> **Contexto.** El semáforo de la dotación (verde/ámbar/rojo por persona) se deriva de estas tres tablas: qué competencias existen, qué se exige a quién, y con qué rol entra cada persona al permiso. **María** las siembra para que Luis y su cuadrilla se validen contra ellas.

1. Pestaña **Competencias** » **Nueva competencia**: crea, por ejemplo, `Bloqueo y consignación (LOTO)`, **Categoría** `CERTIFICATION` (Certificación), con **vigencia típica** (ej. 365 días) y **aviso previo** (ej. 30 días). Guarda. Repite si quieres una de categoría `MEDICAL` (examen ocupacional) y una `ACCREDITATION`.
2. Pestaña **Reglas de competencia** » **Nueva regla**: exige `Bloqueo y consignación (LOTO)` a las OT de tipo "Correctiva mecánica" con criticidad ≥ 4, aplicando a "Toda la dotación" o a un rol específico, marcando **Obligatorio**. Guarda.
3. Pestaña **Roles de dotación** » **Nuevo rol**: verifica/crea los tres estándar OSHA 1910.146:
   - **Ejecutante** (sin marcadores especiales),
   - **Vigía** (marca "Permanece afuera (vigía)"),
   - **Supervisor** (marca "Autoriza/firma" — `isSupervisorRole`).

> **Qué observar.** En Competencias, si la competencia "requiere vencimiento" verás "N días" en Vigencia típica y "N días" en Aviso previo; si no, "Sin vencimiento" / "—". En Roles de dotación, la columna "Marcadores" muestra los chips "Autoriza/firma" (info) y "Permanece afuera (vigía)". Al eliminar un rol: "¿Eliminar el rol «…»? Las OT que ya lo usan conservan su dotación."

> **Resultado esperado.** Al menos una competencia con su regla de exigencia, y los tres roles de dotación (Ejecutante, Vigía, Supervisor) presentes y activos.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

---

### 10.2 · Solicitud (Fase S1) y detalle

#### Paso 10.6 — Crear una nueva solicitud de trabajo

> **Contexto.** **María Fuentes** levanta la solicitud para el cambio de rodamiento del Molino SAG 01. La OT nace en borrador (DRAFT) y con folio provisional; el folio oficial gapless se emitirá recién al aprobar/congelar (según configuraste). El asistente tiene dos pasos: el trabajo y la ubicación.

1. Vuelve a **Órdenes de trabajo** (`/ordenes-trabajo`) y pulsa **Nueva solicitud**. Se abre el modal "Nueva solicitud de trabajo" con un stepper de dos pasos: **Trabajo** y **Ubicación**.
2. **Paso 1 — Trabajo:**
   - **Título \***: `Cambio de rodamiento — Molino SAG 01`.
   - **Descripción**: `Reemplazo del rodamiento del piñón de ataque; incluye desmontaje, inspección y alineación.`
   - **Tipo \***: elige `Correctiva mecánica`. Al elegir el tipo, la **Criticidad** se prellena a `4 · Alta` y el checkbox **Requiere Permiso de Trabajo (PTW)** se marca solo (porque el tipo lo trae por defecto).
   - **Criticidad \***: verifica `4 · Alta` (ajusta si hace falta).
   - **Prioridad**: elige `Alta`.
   - Verifica el checkbox **Requiere Permiso de Trabajo (PTW) — trabajo de alto riesgo** marcado.
   - Pulsa **Siguiente**.
3. **Paso 2 — Ubicación:**
   - **Nodo / ubicación \***: busca y elige `Molienda` (el combobox muestra la ruta de ancestros como pista).
   - **Equipo / activo**: al elegir el nodo se habilita; busca y elige `Molino SAG 01` (aparece como "Molino SAG 01 · MOL-SAG-01").
   - **Detalle de ubicación**: `Piñón de ataque, lado motriz`.
   - **Especialidades**: activa los chips `Mecánica` y `Lubricación`.
   - **Fecha límite (SLA)**: opcionalmente fija una fecha/hora.
4. Pulsa **Crear solicitud**.

> **Qué observar.** El botón **Siguiente** se deshabilita si el título tiene menos de 3 caracteres o falta el tipo. **Crear solicitud** exige además el nodo. Al crear, toast "Solicitud OT-XXXX creada" (o "Solicitud {código} creada" con el código provisional) y te lleva directo al detalle. El backend valida el nodo por ABAC (alcance de datos), que el tipo esté activo y que el equipo pertenezca al nodo. Nota: si iniciaras la OT **desde una incidencia** (ver Paso 10.14), el modal muestra el aviso "Se creará ligada a la incidencia …" y presiembra título/nodo/criticidad (el tipo NO se siembra: lo eliges tú).

> **Resultado esperado.** La OT se crea, se abre su página de detalle, y en la lista aparece con su semáforo de plazo, chip "PTW" y estado inicial del flujo (borrador).

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 10.7 — Recorrer la página de detalle de la OT

> **Contexto.** El detalle de la OT es una Object Page densa (estilo SAP Fiori / Maximo): cabecera con folio/estado/badges, stepper de las 4 puertas, cuerpo con pestañas y panel lateral de estado/responsable. **María** reconoce el terreno antes de operar las puertas.

1. Observa la **cabecera**: el código de la OT, el chip de estado (color del estado del flujo), el tag **PTW**, el semáforo de plazo (● con color y rótulo "En plazo"/"Por vencer"/"Vencida"/"Sin plazo") y, si corresponde, el tag "Estancada".
2. Observa el **stepper** de estados del flujo (dónde estás de un vistazo).
3. Recorre las **pestañas**: **Resumen**, **Plan de actividades**, **Verificaciones**, **Dotación** (aparece solo si el tipo gestiona dotación, con un badge de conteo), **Flujo**, **Historial**.
4. En **Resumen**, verifica los grupos: Descripción; Clasificación (Tipo, Criticidad con su dot, Prioridad, Origen, "Permiso de trabajo (PTW): Sí/No", Especialidades); Ubicación y alcance (Nodo, Equipo, Ubicación detalle, Turno); Personas (Solicitante, Responsable); Fechas (Detectada, Inicio/Fin planificado, Fecha límite, Creada, Última actualización); y "Origen ligado" si la OT vino de una incidencia/bitácora/excepción.
5. En el **panel lateral** (aside), observa el bloque "Estado" (Folio cuando exista, Aprobada, Plan congelado), el selector **Responsable** (si tienes `workorder:assign`), **Prioridad** y **Plazo de resolución** (si tienes `workorder:edit`), y el botón **Anular solicitud** (si tienes `workorder:cancel`).

> **Qué observar.** El **Responsable**, **Prioridad** y **Plazo** solo son editables mientras la OT está viva (no cerrada/anulada) y según permiso. El Folio del panel lateral está vacío hasta que se emita (según la configuración del tipo). "Plazo de resolución" trae la nota "Vacío = sin plazo. Se auto-fija al aprobar según el SLA del tipo."

> **Resultado esperado.** Reconoces la anatomía completa del detalle y confirmas que la pestaña Dotación aparece (porque el tipo gestiona dotación).

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

---

### 10.3 · Las cuatro puertas

#### Paso 10.8 — Puerta 1: Aprobación (enviar a revisión / aprobar)

> **Contexto.** La Puerta 1 saca la solicitud del borrador. **María** la envía para revisión y la aprueba (o la rechaza con motivo). El CTA primario de la etapa vive en la cabecera del detalle.

1. Asegúrate de estar en el detalle de la OT recién creada.
2. En la cabecera, pulsa el **CTA primario** de avance (la transición de la Puerta 1; funcionalmente "Enviar para revisión"). Se abre el modal de transición.
3. En el modal, verifica el texto "Avanzar a «…»". Añade un **Comentario (opcional)** si quieres y pulsa **Confirmar**.
4. Repite para la aprobación propiamente tal si el flujo la separa en dos pasos. Para **rechazar**, usa la acción secundaria (botón rojo): el modal exige **Motivo del rechazo \*** (obligatorio) y lleva la OT al estado "rechazada".

> **Qué observar.** El CTA primario solo aparece si la OT está viva, tienes `workorder:transition` y hay transiciones disponibles. Las transiciones de rechazo/devolución se muestran como acciones secundarias (rojas para rechazo). El botón **Confirmar** de un rechazo se deshabilita hasta escribir el motivo. Si el estado destino es final, el modal ofrece además "Resumen de cierre".

> **Resultado esperado.** La OT pasa de borrador a "en preparación". El stepper avanza y el historial registra el evento.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 10.9 — Verificaciones: checklists/PTW y el Gobierno 2 (Puerta 2)

> **Contexto.** La Puerta 2 exige que los checklists obligatorios del momento AUTORIZACIÓN estén **aprobados** antes de autorizar el permiso. **María** sugiere los aplicables, **Luis Tapia** los llena, y **Camila Vega** los revisa (segregación revisor ≠ ejecutor). Además, el "Gobierno 2" obliga a confirmar el set de verificaciones de EJECUCIÓN que se exigirá en terreno.

1. En el detalle, ve a la pestaña **Verificaciones** (título "Verificaciones (checklists / permisos de trabajo)").
2. Pulsa **Sugerir aplicables**: el sistema materializa los checklists que las reglas indican para esta OT (toast "Checklists sugeridos (N)"). También puedes **Agregar** uno manualmente eligiendo una plantilla.
3. Observa que los checklists se agrupan por **momento del ciclo** (Autorización, Ejecución, Cierre…). El grupo de **EJECUCIÓN** se sub-agrupa por **actividad** del plan.
4. Para un checklist de AUTORIZACIÓN: pulsa **Iniciar** (crea su registro), luego **Llenar** (abre el motor de llenado embebido, `EntryFillPage`, sin salir de la OT), completa y **sella** el registro, cierra, y pulsa **Enviar a revisión** (queda habilitado solo cuando el registro está sellado).
5. **Cambia de persona para la revisión.** Cierra sesión e ingresa como **Camila Vega**. Abre la misma OT, ve a Verificaciones, y en el checklist "En revisión" pulsa **Revisar**: en el modal, **Aprobar** o **Rechazar** (rechazo exige **Motivo**). El sistema impide que apruebe quien lo completó.
6. Vuelve como **María** (o quien tenga `workorder:checklist:manage`) y, en el grupo de EJECUCIÓN, pulsa **Confirmar set de ejecución** (banner "Revisa y confirma el set de verificaciones que se exigirá en terreno antes de autorizar el permiso").

> **Qué observar.** Si hay verificaciones obligatorias sin aprobar, aparece el aviso rojo "No se puede avanzar: N verificación(es) obligatoria(s) sin aprobar." El estado de cada checklist recorre Pendiente » En llenado » En revisión » Aprobado (o Rechazado). El modal de revisión avisa "El revisor debe ser distinto de quien completó el checklist (segregación de funciones)." Tras confirmar el set: banner verde "Set de verificaciones de ejecución confirmado por … Lo aplicado en terreno = lo autorizado."

> **Resultado esperado.** Los checklists de AUTORIZACIÓN obligatorios quedan Aprobados por Camila, y el set de EJECUCIÓN queda confirmado. La Puerta 2 se puede cruzar.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 10.10 — Puerta 2: pasar a autorización

> **Contexto.** Con los checklists de autorización aprobados, **María** cruza la Puerta 2.

1. En la cabecera del detalle, pulsa el CTA de avance (funcionalmente "Pasar a autorización").
2. Confirma en el modal de transición.

> **Qué observar.** Si aún queda una verificación obligatoria de autorización sin aprobar, el backend bloquea la transición y devuelve un error explicativo (la UI lo muestra como toast). El stepper avanza al estado de autorización/planificación.

> **Resultado esperado.** La OT queda en el estado que habilita la planificación.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 10.11 — Plan de actividades y Puerta 3: congelar la baseline (con firma)

> **Contexto.** La Puerta 3 exige al menos una actividad en el plan y lo **congela** (baseline inmutable) con firma electrónica Part 11; al congelar, la OT **emite el folio gapless** (ej. `OT-2026-0001`). **María** (o **Luis**, con `workorder:activity:manage`) arma el plan.

1. Ve a la pestaña **Plan de actividades**. Verás el banner de etapa; si no hay actividades: "Agrega al menos una actividad para poder autorizar el plan."
2. Agrega actividades por una de dos vías:
   - **Agregar actividad** (formulario "Nueva actividad"): **Tarea \*** `Desmontar acoplamiento y retirar rodamiento`, Descripción, Responsable `Luis Tapia`, Especialidad `Mecánica`, Inicio/Fin planificado, Prioridad, "Depende de", y el checkbox **Obligatoria (bloquea el cierre si queda abierta)** (marcado por defecto). Guarda (toast "Actividad agregada").
   - **Asistente guiado** (modal "Asistente de plan de actividades", 4 pasos: Tareas » Equipo » Fechas » Orden): enumera varias tareas, fija responsable/especialidad por defecto, ventana de fechas, revisa el orden y pulsa **Generar plan (N)** (toast "Plan generado: N actividad(es)").
3. Verifica la **grilla** de actividades con columnas: #, Actividad (con chip "Obligatoria" si aplica), Responsable, Especialidad, Prioridad, Plan (fechas), Estado, y las acciones (subir/bajar/editar/eliminar).
4. Vuelve al **Resumen** (o usa el CTA de cabecera) y pulsa la transición **Autorizar plan**. Como requiere firma, el modal muestra el bloque "Firma electrónica requerida": ingresa **Contraseña** y, si tu cuenta tiene MFA, el **Código MFA**. Confirma.

> **Qué observar.** El plan solo es editable mientras la OT está viva, tienes el permiso y NO está congelado. Tras congelar, el banner cambia a "Plan autorizado — baseline congelada el …" y la grilla pasa a solo lectura + seguimiento (aparece la columna "Avance"). Al confirmar la transición que emite folio, verás el toast **"Aprobada · folio OT-2026-0001"** (el primer folio de la serie). En el panel lateral se llenan "Aprobada" y "Plan congelado".

> **Resultado esperado.** El plan queda congelado, el folio oficial gapless se emite, y la columna Avance aparece en la grilla.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 10.12 — Dotación: confirmar y firmar (semáforo por persona)

> **Contexto.** La Puerta 4 no deja ejecutar sin dotación confirmada. **María** cura la lista de personas que ingresan al permiso, revisa su semáforo (verde Habilitada / ámbar Con avisos / rojo Con impedimentos) y firma la dotación (Part 11). Si alguien está en rojo, la confirmación exige un override firmado por persona.

1. Ve a la pestaña **Dotación** (título "Dotación que ingresa a ejecutar el permiso").
2. En "Agregar a la dotación", busca una **persona** (del catálogo de Personas) y elige su **Rol en la dotación** (Ejecutante / Vigía / Supervisor). Pulsa **Agregar** (toast "Persona agregada a la dotación"). Agrega a Luis Tapia como Ejecutante y a un Vigía.
3. Revisa el semáforo por persona: dot verde "Habilitada", ámbar "Con avisos" o rojo "Con impedimentos", con el detalle de qué falta (competencia faltante/vencida/por vencer, restricción activa, empresa no acreditada, etc.).
4. Pulsa **Confirmar dotación**. Se abre el modal "Confirmar y firmar la dotación".
5. Si hay personas en rojo, el modal muestra el bloque "N persona(s) con impedimentos: justifica cada excepción" con un campo por persona ("Motivo del riesgo aceptado / medida compensatoria…"). Complétalos.
6. En "Firma electrónica requerida: autorización de la dotación", ingresa **Contraseña** y **Código MFA (si está habilitado)**. Pulsa **Confirmar y firmar** (o **Autorizar con excepción y firmar** si había rojos).

> **Qué observar.** El botón "Confirmar dotación" se deshabilita si la dotación está vacía ("Agrega al menos una persona"). Con impedimentos sin justificar, la firma no se habilita. Tras confirmar: banner verde "Dotación confirmada y firmada por … Quien ingresa = quien fue autorizado." Los estados del semáforo son: verde=Habilitada, ámbar=Con avisos, rojo=Con impedimentos.

> **Resultado esperado.** La dotación queda confirmada y firmada. Quien ingresa = quien fue autorizado.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 10.13 — Puerta 4: ejecutar, registrar avance y cerrar la orden

> **Contexto.** Con plan congelado + dotación confirmada + set de ejecución confirmado, **María** comienza la ejecución; **Luis** registra el avance de cada actividad y llena/aprueba (con Camila) los checklists de EJECUCIÓN y CIERRE; luego se cierra la orden con resumen y firma.

1. En la cabecera, pulsa la transición **Comenzar ejecución** (requiere dotación confirmada y set de ejecución confirmado; si falta alguno, el backend bloquea con error explicativo).
2. En **Plan de actividades**, para cada actividad pulsa el ícono **Registrar avance** (modal "Registrar avance"): elige **Estado** (En curso / Bloqueada / Completada), mueve el **slider de %** (al Completar queda 100%), fija **Inicio real / Término real**, un **Motivo de atraso/bloqueo** si aplica, y una **Nota de avance**. Pulsa **Registrar** (toast "Avance registrado").
3. Marca como **Completada** las actividades **obligatorias**.
4. En **Verificaciones**, completa el flujo de los checklists de EJECUCIÓN (Luis llena; Camila revisa/aprueba) y, más adelante, los de CIERRE.
5. Pulsa la transición **Pasar a cierre** (requiere las actividades obligatorias en Completada).
6. Pulsa **Cerrar orden**: el modal pide el **Resumen de cierre** (qué se ejecutó/verificó) y, si el flujo lo exige, **firma** (contraseña + MFA). Confirma.

> **Qué observar.** No se puede "Pasar a cierre" con actividades obligatorias abiertas (indicador en la grilla y bloqueo del backend). Los checklists de CIERRE obligatorios deben estar aprobados para cerrar. Al cerrar, el estado final del flujo (p. ej. "cerrada") queda fijo, la OT deja de ser editable, y el "Resumen de cierre" aparece en la pestaña Resumen. En el Historial queda toda la traza.

> **Resultado esperado.** La OT llega a su estado final "cerrada", con resumen de cierre, avances registrados y checklists aprobados. El ciclo de las 4 puertas está completo.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

---

### 10.4 · Enlace Incidencia↔OT, SLA/semáforos y dashboard

#### Paso 10.14 — Crear una OT desde la incidencia de la Fase 9 (vínculo bidireccional)

> **Contexto.** El puente Incidencia↔OT es clave para la trazabilidad: la incidencia que abriste en la Fase 9 debe poder derivar en una orden de trabajo, y ambas quedan enlazadas en los dos sentidos. **María** lo prueba.

1. Ve al módulo de **Incidencias**, abre la incidencia de la Fase 9 y usa su acción para **crear una OT** desde ella.
2. En el modal "Nueva solicitud de trabajo", verifica el aviso "Se creará ligada a la incidencia {código}. Puedes ajustar título, tipo y datos antes de crearla." y que el título/nodo/criticidad vengan presembrados. Elige el **Tipo** (no se siembra) y crea la solicitud.
3. Abre el detalle de la nueva OT y, en la pestaña **Resumen**, verifica el grupo "Origen ligado" con el enlace a la **Incidencia** de origen (código + título).
4. Vuelve a la incidencia y verifica que muestre el vínculo a la OT creada.

> **Qué observar.** El enlace desde la OT lleva a `/incidencias?open={id}`. En el Resumen de la OT, el "Origen" figura como "Incidencia". El vínculo debe ser bidireccional.

> **Resultado esperado.** Existe una OT ligada a la incidencia de la Fase 9, navegable en ambos sentidos.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 10.15 — Lista de OT: KPIs, filtros, semáforos y drill-down

> **Contexto.** La lista `/ordenes-trabajo` es el cockpit de gestión: KPIs clicables, filtros en una línea, semáforo de plazo por fila y chips de filtros activos.

1. En `/ordenes-trabajo`, observa la fila de **KPIs**: Borradores, Abiertas, Críticas, Sin responsable, Con PTW, Vencidas, Por vencer, Estancadas. Pulsa uno (p. ej. "Vencidas") y verifica que acota la lista.
2. Prueba los **filtros** en una línea: búsqueda ("Buscar por folio, título o descripción…"), Estado (Todos / Borradores / Abiertas / Cerradas / Anuladas), Tipo, Criticidad, Prioridad, Especialidades, Plazo (Vencidas / Por vencer / Estancadas), Todas/Mías/Sin responsable/Requieren PTW, orden (Recientes / Criticidad / Prioridad / Fecha límite) y presets de rango de fechas.
3. Observa que los filtros activos aparecen como **chips removibles** con "Limpiar filtros".
4. En cada fila, verifica el **dot de semáforo** de plazo (con tooltip "En plazo/Por vencer/Vencida · vence …"), el Folio en monoespaciado, el tag "PTW", el tag "Estancada" si aplica, y el chip de estado del flujo.
5. Verifica que la **paginación** aparece arriba y abajo de la tabla.

> **Qué observar.** Al hacer clic en una fila entra al detalle y la última OT vista queda resaltada al volver. El KPI "Con PTW" quita el filtro de estado y activa "Requieren PTW". Sin resultados, el estado vacío dice "Sin órdenes de trabajo".

> **Resultado esperado.** La lista responde a KPIs y filtros, muestra semáforos y chips, y navega al detalle recordando la última fila.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 10.16 — Dashboard de OT: KPIs, gráficos, exportación y drill-down

> **Contexto.** El dashboard `/ordenes-trabajo/dashboard` consolida la gestión: KPIs de estado actual + del período, y una batería de gráficos con drill-down a la lista. **Patricia Núñez** (gerente) también lo usa en modo lectura.

1. Desde la lista, pulsa **Dashboard**. Verifica el encabezado "Dashboard de órdenes de trabajo" y el subtítulo "Tendencias e indicadores de gestión. Solo lo que puedes ver (alcance por nodo)."
2. Usa los **rangos rápidos** (30 días / 90 días / 12 meses) o el rango Desde/Hasta, y los filtros (Todos los tipos, Toda criticidad, Toda especialidad, Todo origen).
3. Observa los KPIs **Estado actual (en vivo)**: Borradores, Abiertas, Críticas, Sin responsable, Plazo vencido, Por vencer, Estancadas, Con PTW. Y **En el periodo**: Creadas, Cerradas, **MTTR** (en horas), **Cumplimiento SLA** (%). Todos los KPIs de estado son clicables (drill-down a la lista con el filtro).
4. Revisa los **gráficos**: Tendencia creación vs. cierre (área), Por tipo (Pareto), Por criticidad (dona), Por nodo, Por especialidad, Por estado, Por prioridad, Por origen. Haz clic en una barra/segmento y verifica que te lleva a la lista filtrada (con el back-nav "Volver al dashboard").
5. Pulsa **Exportar CSV** y verifica que descarga el archivo con KPIs y tablas agregadas.

> **Qué observar.** Los valores numéricos y porcentajes respetan el formato regional es-CL (MTTR "N,N h", SLA como porcentaje). Si no hay datos en el período, los gráficos muestran "Sin datos en el periodo." El dashboard respeta el alcance por nodo (ABAC): cada quien ve solo lo suyo.

> **Resultado esperado.** Dashboard con KPIs vivos y de período, gráficos con drill-down operativo y exportación CSV correcta.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

---

### Registro de hallazgos de la Fase 10

| N.º | Paso | Módulo/Pantalla | Severidad | Descripción | Estado |
|-----|------|-----------------|-----------|-------------|--------|
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |

---

## Fase 11 · Cambio de turno

Todo lo que se registró, alertó, incidió y ejecutó en el turno A de María tiene que llegar íntegro al turno B de Óscar. El cambio de turno es el momento de mayor riesgo operacional en cualquier faena minera: si algo se cae entre turnos (una válvula quedó cerrada, una OT quedó a medias, una incidencia crítica sin cerrar), el costo puede ser una parada de planta o un accidente. Por eso Lyra WatchLog trata la entrega como un **acto formal firmado**, no como un correo o una pizarra: el sistema **compila automáticamente** todo lo del turno (registros, excepciones, incidencias, acciones/reportes, rondas y pendientes), el saliente redacta un resumen (determinista o generado por IA) y **firma la entrega**, y el entrante **acusa recibo** con firma. Ambas firmas son Part 11 (re-autenticación con contraseña + MFA) y el resultado es un **acta PDF inmutable** de grado auditoría. En esta fase, **María Fuentes** (turno A saliente) compila, resume y firma; luego **Óscar Díaz** (turno B entrante) recibe, revisa y acusa. El cockpit tiene tres zonas: navegación de secciones a la izquierda, detalle al centro, y resumen + sign-off a la derecha.

---

### 11.1 · Parte 1 — Saliente (María compila, resume y firma)

#### Paso 11.1 — Compilar la entrega del turno

> **Contexto.** **María Fuentes** (supervisor-turno, con `shifthandover:compile`) abre el cockpit y compila la entrega del nodo que entrega. La compilación barre automáticamente todo lo ocurrido en el turno para ese nodo.

1. En el menú lateral, entra a **Cambio de turno** (ruta `/cambio-turno`). Verifica el título "Cambio de **turno**" y el subtítulo "La entrega formal asegura continuidad operacional: el cockpit compila automáticamente lo del turno, el saliente firma y el entrante reconoce. Nada se cae entre turnos."
2. Confirma el conmutador de vista arriba a la derecha: **Entrega del turno** (cockpit) e **Historial**.
3. En la barra de alcance, usa el selector "Elige tu área (nodo) para compilar el turno…" y elige `Molienda` (o el nodo del turno). Al elegirlo, el sistema **compila** (muestra un spinner).

> **Qué observar.** Antes de elegir nodo, el cockpit muestra el estado vacío "Elige un área para comenzar" con la descripción "Selecciona el nodo del que entregas el turno; el sistema compila registros, excepciones, incidencias, acciones y rondas." Si el usuario no tiene permiso de compilar, no verá el flujo de compilación. Si la compilación falla, aparece "No se pudo compilar la entrega del turno."

> **Resultado esperado.** Se crea/abre la entrega en estado "En preparación" (COMPILING) y se despliega el cockpit de tres zonas.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 11.2 — Revisar las secciones compiladas del cockpit

> **Contexto.** El centro del cockpit muestra, sección por sección, todo lo que el sistema recopiló del turno. **María** revisa cada una para saber qué está entregando.

1. En la **navegación izquierda**, recorre las secciones (cada una con su conteo): **Registros del turno**, **Excepciones**, **Incidencias**, **Acciones y reportes**, **Rondas**, **Pendientes**.
2. Haz clic en cada sección y revisa las filas en el centro. Por ejemplo, en **Incidencias** verás cada incidencia con su folio, título, tipo/estado y un badge ("crítica" / "vencida" / "sev N"); un punto rojo marca las críticas.
3. Haz clic en una fila para ver su detalle: si la fila es una **incidencia**, se abre el drawer real del módulo de Incidencias (en contexto); el resto abre un panel de detalle liviano con sus campos.

> **Qué observar.** Cada sección sin novedades muestra "Sin novedades en esta sección durante el turno." Los badges de estado (Registros: estado del registro; Excepciones: crítica/advertencia; Rondas: vencida/cumplida) usan colores semánticos. Los conteos de la nav coinciden con las filas mostradas.

> **Resultado esperado.** María ve el panorama completo del turno, sección por sección, con acceso al detalle de cada objeto.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 11.3 — Agregar pendientes (el "batón" que rueda al turno entrante)

> **Contexto.** Los **Pendientes** son el batón: notas y objetos abiertos que deben rodar al turno entrante hasta cerrarse. **María** agrega un pendiente manual y verifica que los heredados figuran como CARRIED (Heredado).

1. En la nav, entra a **Pendientes**. Lee el aviso "Pendientes que ruedan al turno entrante hasta cerrarse: notas del saliente + objetos abiertos del alcance."
2. En el campo "Pendiente para el turno entrante…", escribe algo como `Dejar bloqueado el Molino SAG 01 hasta que llegue el rodamiento de repuesto` y pulsa **Agregar**.
3. Observa que los pendientes **heredados** de turnos previos llevan el chip "Heredado" (CARRIED).
4. Para cerrar un pendiente ya resuelto, usa el botón de cerrar (X) "Cerrar pendiente".

> **Qué observar.** El botón **Agregar** se deshabilita si el texto tiene menos de 3 caracteres. Al cerrar pendientes, aparece la nota "N pendiente(s) cerrado(s) en este turno." Solo se pueden editar/agregar pendientes mientras la entrega está "En preparación" y tienes permiso de compilar.

> **Resultado esperado.** El pendiente manual queda en la lista de abiertos; los heredados se distinguen con "Heredado".

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 11.4 — Resumen de la entrega: estado general + determinista/IA

> **Contexto.** El panel derecho lleva el **Resumen de la entrega**. **María** fija el estado general, edita el resumen y prueba las dos vías de generación: determinista (siempre disponible) y con IA en vivo (streaming SSE, si la IA está configurada).

1. En el panel derecho, ubica el bloque "Resumen de la entrega".
2. En el selector **Estado general**, elige entre: **Operativo**, **Operativo con observaciones**, **Detenido por mantención**, **Detenido por falla**. Para este turno, elige `Operativo con observaciones`.
3. Edita el **texto del resumen** en el textarea (placeholder "Resumen del turno (se genera automáticamente; puedes editarlo antes de firmar).").
4. Pulsa **Regenerar determinista**: el sistema arma un resumen determinista a partir del cockpit.
5. Pulsa **Generar con IA**: si la IA está configurada, el texto se escribe **token a token** en el editor (etiqueta "Escribiendo con IA…", con botón **Cancelar**). Al terminar, la etiqueta del resumen pasa a "generado por IA · revisar".
6. Usa el botón **Ampliar** (Maximize) para ver el resumen en grande, con el crudo determinista al lado ("Ver resumen determinista (crudo)").

> **Qué observar.** El resumen solo es editable mientras la entrega está "En preparación" y tienes permiso de compilar. Si la IA no está configurada o falla, degrada al determinista y avisa: "La IA no estaba disponible; se usó el resumen determinista." Si el streaming se corta: "Se interrumpió el resumen en vivo; reintentando sin streaming…". El crudo determinista queda SIEMPRE disponible junto al resumen de IA (para auditar el grounding).

> **Resultado esperado.** El resumen refleja el turno con el estado general elegido; la generación por IA (si está activa) escribe en vivo y degrada con gracia si falla.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 11.5 — Firmar y entregar el turno (Part 11)

> **Contexto.** Con el resumen listo, **María** firma la entrega. Es una firma electrónica Part 11: re-autenticación con contraseña + MFA y un significado explícito.

1. En el panel derecho, pulsa **Firmar y entregar turno**. Verifica el texto de ayuda "Firma electrónica con tu identidad."
2. En el modal de re-autenticación, lee el **significado** de la firma: "Entrego el turno y certifico que la información de esta entrega es veraz y completa." y la línea "Firmando como María Fuentes".
3. Ingresa la **Contraseña** y, como el rol de María exige MFA, el **Código MFA** (la ayuda dice "Solo si tu cuenta tiene segundo factor activo.").
4. Pulsa **Firmar y entregar**.

> **Qué observar.** El botón de confirmar se deshabilita hasta escribir la contraseña. Al firmar, toast "Turno entregado y firmado." El estado del encabezado pasa a "Entregado · por recibir" (SIGNED_OUT), aparece la tarjeta "Entregado por María Fuentes" con fecha/hora y el significado, el contenido se congela ("Entrega firmada: contenido congelado e inmutable.") y aparece el botón **Descargar acta (PDF)**.

> **Resultado esperado.** La entrega queda firmada e inmutable (SIGNED_OUT), lista para que el entrante la reciba.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

---

### 11.2 · Parte 2 — Entrante (Óscar recibe y acusa)

#### Paso 11.6 — Óscar abre la entrega firmada (modo lectura)

> **Contexto.** **Cierra sesión e ingresa como Óscar Díaz** (supervisor-turno del turno B entrante, mismo rol que María, con `shifthandover:acknowledge` y MFA). Óscar abre la entrega que María firmó, en modo lectura congelado.

1. Ingresa como **Óscar Díaz** (`odiaz@cerroaspero.cl`).
2. Abre la entrega por una de dos vías: por el **deep link** (desde la campanita de notificaciones o el correo), o entrando a **Cambio de turno** y localizándola (por el nodo o el historial).
3. Verifica que el cockpit se muestra **congelado** (solo lectura): la nota "Entrega firmada: contenido congelado e inmutable." está presente y no puedes editar secciones ni resumen.
4. Revisa el resumen de María y recorre los pendientes heredados.

> **Qué observar.** Si Óscar no tuviera permiso sobre ese nodo, vería "No tienes permiso para ver esta entrega de turno (se requiere el permiso de cambio de turno en este nodo)." El encabezado del turno muestra el código, el chip "Entregado · por recibir", el flujo saliente › entrante (pills de turno) y el día operacional.

> **Resultado esperado.** Óscar ve la entrega firmada en modo lectura, con el bloque de acuse habilitado para él.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 11.7 — Acusar recibo del turno (Part 11)

> **Contexto.** **Óscar** confirma que leyó el resumen y revisó los pendientes, declara si tiene observaciones y firma el acuse (re-autenticación Part 11).

1. En el panel derecho, ubica el bloque "Recibir el turno".
2. Activa el toggle **Leí el resumen de la entrega**.
3. Activa el toggle **Revisé los pendientes heredados**.
4. Deja activo **Sin observaciones**, o apágalo para escribir en el textarea de observaciones ("Observaciones o consultas al turno saliente…").
5. Pulsa **Reconocer y recibir turno**.
6. En el modal de re-autenticación, lee el significado "Recibo el turno y acuso recibo del resumen y los pendientes traspasados." y "Firmando como Óscar Díaz". Ingresa **Contraseña** + **Código MFA** y pulsa **Confirmar recepción**.

> **Qué observar.** El botón **Reconocer y recibir turno** se mantiene deshabilitado hasta activar los DOS primeros toggles (leí el resumen / revisé los pendientes). Al confirmar, toast "Recepción del turno confirmada." El estado del encabezado pasa a "Recibido" (ACKNOWLEDGED) y aparece la tarjeta "Recibido por Óscar Díaz" con fecha/hora (y las observaciones entre comillas si las hubo).

> **Resultado esperado.** La entrega queda en estado "Recibido" (ACKNOWLEDGED): el ciclo saliente›entrante se cerró con dos firmas.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

---

### 11.3 · Acta PDF e Historial

#### Paso 11.8 — Descargar el acta oficial (PDF Part 11)

> **Contexto.** El acta es el documento oficial de grado auditoría, generado del snapshot firmado (con hash y firmas saliente/entrante), inmutable. Cualquiera de los dos (o un gerente con alcance) puede descargarla una vez firmada.

1. En el panel derecho de la entrega firmada/recibida, pulsa **Descargar acta (PDF)**. Verifica el texto de ayuda "Documento oficial de grado auditoría, generado del snapshot firmado."
2. Espera la generación (el botón muestra "Generando acta…") y abre el PDF descargado.
3. Verifica en el acta: el resumen, el estado general, los pendientes, y las **firmas** del saliente (María) y del entrante (Óscar), con el hash del snapshot.

> **Qué observar.** El acta solo está disponible cuando la entrega está firmada (SIGNED_OUT o ACKNOWLEDGED); antes de firmar, el backend responde 409. Si la generación falla, aparece "No se pudo generar el acta en PDF." El PDF debe embeber sus propias fuentes (sin egress a Google Fonts) y ser reproducible.

> **Resultado esperado.** Se descarga un acta PDF con el contenido congelado, las dos firmas y el hash: prueba documental de la entrega.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 11.9 — Historial de entregas y re-descarga del acta

> **Contexto.** El historial guarda todas las entregas firmadas acotadas al alcance, con búsqueda, filtro por estado y re-descarga del acta. **Óscar** (o **Patricia**, gerente) consulta entregas pasadas.

1. En el conmutador de vista, pulsa **Historial**.
2. Usa el buscador "Buscar por folio o persona…" y el filtro de estado ("Todos los estados" / En preparación / Entregado · por recibir / Recibido / Anulado).
3. Revisa la tabla: código, nodo, turno, día operacional, flujo (saliente › entrante), chip de "N pendiente(s)" si los hay, y el chip de estado.
4. Para una entrega firmada, pulsa el ícono de **descargar acta** de esa fila y verifica que re-genera/descarga el mismo acta.
5. Haz clic en una fila para abrirla en el cockpit (modo lectura).

> **Qué observar.** Sin entregas, el estado vacío dice "Sin entregas registradas" con "Las entregas de turno firmadas aparecerán aquí (acotadas a tu alcance)." El día operacional se muestra en formato regional es-CL. El botón de acta por fila solo aparece en entregas firmadas.

> **Resultado esperado.** El historial lista las entregas del alcance, filtra y busca correctamente, y permite re-descargar el acta y reabrir cada entrega en lectura.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

---

### Registro de hallazgos de la Fase 11

| N.º | Paso | Módulo/Pantalla | Severidad | Descripción | Estado |
|-----|------|-----------------|-----------|-------------|--------|
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |


## Fase 12 · Notificaciones

Cerro Áspero ya respira: hay rondas programadas, incidencias abiertas y órdenes de trabajo en curso. Pero un sistema industrial no puede depender de que la gente "se acuerde de mirar" la pantalla. Cuando una ronda se vence, cuando un SLA de incidencia se rompe, cuando una firma queda pendiente o cuando el turno saliente deja lista la entrega, alguien tiene que enterarse — por correo si está lejos del panel, y en la app si está adentro. En esta fase pruebas el **motor de notificaciones** de principio a fin: la configuración que **Rodrigo Salas** (planificador) o el **Administrador** dejan lista (plantillas de mensaje, quién recibe qué por qué canal) y la experiencia de cualquier usuario (su bandeja personal, la campanita del encabezado, sus preferencias). Al final harás disparar un aviso real y lo seguirás por los tres lugares donde debe aparecer.

Un concepto clave que verificarás con cariño: el **carve-out de licencia**. Casi todas las notificaciones se suprimen cuando la instalación entra en un estado restringido de licencia — no tiene sentido molestar con rondas vencidas si la plataforma está en solo lectura. Pero los avisos de la **propia licencia** (que vence, que cambió de estado, que quedó restringida) son la excepción: esos SIEMPRE fluyen, porque son justamente los que le dicen al dueño de la planta que debe actuar. Lo confirmarás al final de la fase.

### 12.1 · Configuración: correo saliente, plantillas y preferencias

La pantalla **Notificaciones** (`/notificaciones`, ruta de menú **Notificaciones**, grupo Administración) exige el módulo licenciado `notifications` y el permiso `module:notifications:view`. Dentro, las pestañas que ves dependen de tus permisos: **Correo saliente** (`notification:view-outbox`), **Plantillas** (`notiftemplate:manage`) y **Mis preferencias** (siempre disponible para tu propia cuenta).

#### Paso 12.1 — Revisar la bandeja de salida (Correo saliente)

> **Contexto.** Ingresa como **Administrador** (o **Rodrigo Salas**, si su rol tiene `notification:view-outbox`). La bandeja de salida es el registro auditable de todo correo que el motor intentó enviar: qué evento lo originó, a quién, con qué asunto y en qué estado terminó. Es el primer lugar donde miras cuando alguien dice "no me llegó el aviso".

1. En el menú lateral, grupo **Administración**, abre **Notificaciones**.
2. Confirma el título **Notificaciones** y el subtítulo "Plantillas de mensaje, correo saliente y preferencias de aviso por correo.".
3. Entra a la pestaña **Correo saliente**.
4. Observa la tabla: columnas **Estado**, **Evento**, **Destinatario**, **Asunto** y **Fecha**.
5. Usa el buscador "Buscar por destinatario o asunto…" y el filtro **Todos los estados** para acotar.
6. Si hay filas, pulsa **Ver** en una para abrir el HTML renderizado del correo (el mensaje tal como le llegaría al destinatario).

> **Qué observar.** Los estados se muestran traducidos: **Pendiente** (PENDING), **Enviado** (SENT), **Fallido** (FAILED), **Suprimido** (SUPPRESSED). La fecha debe venir en formato regional es-CL (día/mes/año, hora local America/Santiago). Un correo en **Fallido** debe ofrecer la acción **Reintentar**; los demás estados no. Si la tabla está vacía en punto cero, verás "No hay correos en la bandeja de salida." — eso es normal antes de disparar el primer evento (ver Paso 12.5).

> **Resultado esperado.** La bandeja lista los correos con estado, evento, destinatario, asunto y fecha bien formateados; "Ver" abre el HTML del mensaje; "Reintentar" aparece SOLO en los fallidos y, al pulsarlo, muestra "Reencolado para reenvío." y mueve la fila a Pendiente.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 12.2 — Editar una plantilla por defecto

> **Contexto.** Sigue como **Administrador** o **Rodrigo Salas** con `notiftemplate:manage`. Las plantillas definen el texto de cada aviso. Hay dos ámbitos: **Por defecto** (una por evento, aplica a todo) y **Por bitácora** (sobrescribe la genérica para una bitácora concreta y habilita los comodines de sus campos). Aquí ajustas una genérica y compruebas las variables clickeables y la vista previa.

1. En **Notificaciones**, entra a la pestaña **Plantillas**.
2. Revisa la lista: columnas **Plantilla**, **Ámbito**, **Evento**, **Canal**, **Idioma**. El ámbito muestra **Por defecto** o **Por bitácora**.
3. Filtra con "Buscar plantilla…", **Todos los grupos**, **Todos los ámbitos** y **Todos los estados** para encontrar, por ejemplo, la plantilla del evento **Ronda vencida**.
4. Abre esa plantilla. Verás el editor a dos columnas: a la izquierda los campos **Asunto**, **Cuerpo (texto plano)** y **Cuerpo (HTML)**; a la derecha el panel **Variables disponibles**.
5. Pon el cursor en el **Asunto** y haz clic en una variable del panel derecho para insertarla en la posición del cursor (respeta la ayuda "Haz clic en una variable para insertarla donde está el cursor (asunto o cuerpo).").
6. Pulsa **Vista previa** y alterna entre **Escritorio** y **Móvil** para ver el render "Vista previa (con datos de ejemplo)".
7. Verifica el toggle **Activar plantilla** (estado **Activa** / **Inactiva**) y guarda.

> **Qué observar.** Las variables se insertan exactamente donde estaba el cursor, no al final. Cada variable trae su etiqueta de ejemplo ("ej. …"). La vista previa desktop/mobile debe reflejar los cambios de texto y HTML. Al guardar aparece "Plantilla actualizada.". Si desactivas la plantilla (Inactiva), el motor deja de usarla y cae en el texto por defecto del sistema.

> **Resultado esperado.** Puedes editar asunto y cuerpos, insertar variables por clic, previsualizar en dos formatos y activar/desactivar la plantilla; el guardado confirma con "Plantilla actualizada.".

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 12.3 — Crear una plantilla por bitácora (scoped) con comodines de campo

> **Contexto.** **Rodrigo Salas** quiere que el aviso de firma pendiente de la bitácora de Molienda mencione el turno y el equipo directamente en el asunto. Para eso crea una plantilla **Por bitácora**, que sobrescribe la genérica solo para esa bitácora y desbloquea los comodines `{{campo.<key>}}` de sus campos.

1. En la pestaña **Plantillas**, pulsa **Nueva plantilla**.
2. En el diálogo "Nueva plantilla por bitácora", lee la ayuda: "Crea una plantilla específica para una bitácora y un evento. Sobrescribe la genérica para esa bitácora; podrás usar los comodines de sus campos.".
3. Selecciona **Evento** (por ejemplo, **Firma pendiente**).
4. Selecciona **Bitácora** en el desplegable "Elige una bitácora…" — elige la bitácora de Molienda del canon.
5. Deja **Idioma** en español (es-CL).
6. Pulsa crear. En el editor, verás además del panel **Variables disponibles** una sección **Campos de la bitácora**: los comodines `{{campo.<key>}}` propios de esa bitácora.
7. Inserta un comodín de campo en el asunto, guarda y usa **Vista previa** para comprobar el render con datos de ejemplo.

> **Qué observar.** El ámbito de la nueva plantilla aparece como **Por bitácora** en la lista. La sección **Campos de la bitácora** SOLO existe en plantillas scoped, no en las genéricas. Al crear confirma "Plantilla creada.". Si más adelante la eliminas ("Eliminar plantilla"), el diálogo advierte que los avisos volverán a usar la plantilla por defecto para esa bitácora, y confirma con "Plantilla eliminada.".

> **Resultado esperado.** La plantilla scoped se crea, aparece con ámbito **Por bitácora**, permite insertar comodines de campo de la bitácora y previsualizarlos; borrar la scoped devuelve el aviso a la plantilla por defecto sin romper nada.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 12.2 · Bandeja personal, campanita y preferencias

#### Paso 12.4 — Mis notificaciones: bandeja en vivo y preferencias por canal

> **Contexto.** Ahora actúas como usuario común: cierra sesión e ingresa como **Jorge Ramírez** (operador) o **María Fuentes** (supervisora de turno). Cada persona tiene su propia bandeja (`/mis-notificaciones`, "Mis notificaciones" en el menú de perfil) y decide qué avisos quiere recibir y por qué canal. La bandeja se actualiza en vivo por SSE, sin recargar.

1. Abre el menú de perfil (arriba a la derecha) y elige **Mis notificaciones**.
2. Confirma el título **Mis notificaciones** y el subtítulo "Tu bandeja de avisos y qué notificaciones quieres recibir, por correo y en la app.".
3. En la pestaña **Bandeja** (InboxPanel), usa el filtro **Todas** / **No leídas** y el buscador "Buscar en mis notificaciones…".
4. Pulsa "Marcar todas como leídas" (o "Marcar como leída" en un ítem individual).
5. Cambia a la pestaña **Mis preferencias**: es una matriz **Evento × Canal**, con toggles para **Correo** (EMAIL) y **En la app** (INAPP).
6. Apaga el toggle **Correo** para el evento **Ronda vencida** dejando **En la app** encendido.

> **Qué observar.** Al marcar leídas aparece "Todas marcadas como leídas."; si la bandeja está vacía, "No tienes notificaciones.". Cada toggle de preferencia confirma con "Preferencia guardada." y muestra **Activado** / **Desactivado**. La matriz debe ofrecer los eventos del catálogo con nombres traducidos (Ronda vencida, SLA incumplido, Firma pendiente, etc.). Con el módulo licenciado, la campanita del encabezado (Paso 12.5) debería reflejar en vivo lo que llega — no necesitas recargar (SSE).

> **Resultado esperado.** La bandeja lista tus avisos, filtra por Todas/No leídas y marca leídas con confirmación; la matriz de preferencias guarda por evento y por canal (Correo / En la app) de forma independiente, confirmando cada cambio.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 12.5 — Disparar un evento real y seguirlo por outbox, campanita y bandeja

> **Contexto.** El momento de la verdad: generas un evento genuino y compruebas que el aviso aparece donde debe, respetando las preferencias por canal que dejaste en el Paso 12.4. Esto valida el motor completo (evento a plantilla a canal a entrega). El disparo puede provenir de una **ronda vencida** real del demo o de la ejecución manual del ciclo de notificaciones (`POST /notifications/run`, si tu entorno lo expone; ver USER_GUIDE / notas de operación).

1. Provoca un evento: por ejemplo deja pasar una ronda de **Jorge Ramírez** hasta que quede **vencida**, o pide al operador de la instalación que ejecute el ciclo del motor.
2. Ingresa como **Administrador** y ve a **Notificaciones › Correo saliente**: localiza el nuevo registro con **Evento** = Ronda vencida y su **Estado**.
3. Mira la **campanita** (icono de campana en el encabezado): debe aparecer el badge de no leídas.
4. Abre el dropdown de la campanita: muestra las últimas 8 notificaciones, con "Marcar todas como leídas" y "Ver todas" (que lleva a `/mis-notificaciones`).
5. Ingresa como el destinatario (**Jorge Ramírez**) y confirma el mismo aviso en su **Bandeja**.
6. Verifica el efecto de la preferencia del Paso 12.4: como apagaste **Correo** para Ronda vencida pero dejaste **En la app**, el aviso debe aparecer **solo INAPP** (campanita/bandeja) y NO generar correo saliente para ese usuario.

> **Qué observar.** El badge de la campanita y el contador se actualizan en vivo por SSE (no hace falta recargar). El dropdown lista como máximo 8 ítems recientes, cada uno navegable a su entidad relacionada. La supresión del canal Correo debe verse: para ese destinatario y ese evento no hay fila SENT/PENDING de correo, pero sí el ítem en la bandeja. Recuerda: la **campanita solo existe si el módulo `notifications` está licenciado** — si no lo estuviera, no se renderiza (lo verificarás en la Fase 15).

> **Resultado esperado.** El evento se refleja en los tres lugares que corresponden según preferencias: bandeja de salida (correo, si el canal está activo), campanita y bandeja personal (INAPP). Apagar EMAIL deja el aviso solo en la app; el conteo de no leídas sube en vivo.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 12.6 — Catálogo de eventos y carve-out de licencia

> **Contexto.** Como **Administrador**, repasa el catálogo completo de eventos que el motor sabe emitir y comprende la regla de excepción de la licencia. No necesitas disparar todos; basta con verlos listados en la matriz de preferencias y en las plantillas, y entender el carve-out para la Fase 15.

1. En **Mis preferencias** (o en la lista de **Plantillas**, columna **Evento**), confirma que el catálogo incluye: **Ronda vencida** (roundOverdue), **SLA incumplido** (slaBreached), **Transición de flujo** (transition), **Firma pendiente** (signaturePending), **Incidencia: permanencia excedida** (incidentSlaBreached), **Incidencia: plazo vencido** (incidentOverdue), **Incidencia: acción CAPA vencida** (incidentActionOverdue), **Incidencia: reporte por vencer** (incidentReportDue), **Entrega de turno lista para recibir** (handoverReady), **Licencia: cambio de estado** (licenseStateChanged), **Licencia: renovación pendiente** (licenseExpiring) y **Licencia: estado restringido** (licenseRestricted).
2. Toma nota mental del carve-out: los tres eventos de licencia (licenseStateChanged, licenseExpiring, licenseRestricted) **NO se suprimen** cuando la instalación entra en un estado restringido de licencia, a diferencia de todos los demás avisos operacionales, que sí se suprimen. Su payload congela el estado presentable para instalaciones multi-instancia.

> **Qué observar.** Los nombres deben verse traducidos exactamente como arriba (es-CL). Este paso es principalmente documental: te prepara para la Fase 15, donde comprobarás que, con la licencia en un estado restringido, los avisos operacionales callan pero los de licencia siguen llegando (justamente para avisarte que debes renovar).

> **Resultado esperado.** El catálogo de 12 eventos aparece completo y traducido; comprendes y anotas el carve-out de los eventos de licencia (fluyen aun con licencia restringida) para verificarlo en la Fase 15.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### Registro de hallazgos de la fase 12

| N.º | Paso | Módulo/Pantalla | Severidad | Descripción | Estado |
|-----|------|-----------------|-----------|-------------|--------|
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |

---

## Fase 13 · Orígenes de datos externos y Base de conocimiento

Toda plataforma industrial madura termina conectándose con el mundo de afuera: un historiador SCADA/PI que entrega lecturas de proceso, un OPC-UA, un ERP que provee órdenes de compra, o una base de conocimiento donde el equipo consolida procedimientos, lecciones aprendidas y fichas técnicas de equipos. En la visión de Lyra WatchLog, esos **orígenes de datos externos** se consultan SIEMPRE desde el backend, con credenciales cifradas en reposo, nunca desde el navegador — y la **base de conocimiento** viviría como un módulo de consulta interna asociada a la estructura.

Esta fase es corta y su objetivo es la **honestidad**: distinguir lo que existe hoy de lo que es visión. En el estado actual del producto, estos dos módulos **NO están construidos en la interfaz**. Existe una etiqueta reservada en el diccionario de idioma (`nav.dataSources` = "Orígenes de datos") pero **no hay pantalla, ni ruta en el router, ni módulo** detrás de ella; la base de conocimiento tampoco tiene UI. Por eso los pasos de esta fase son de **verificación de ausencia**: confirmas que efectivamente no aparecen, para que el registro quede como "N/A — no construido" y nadie los dé por probados.

> **Nota de honestidad (hoy vs. visión).** Lo que sigue describe lo que se espera a futuro; NO lo pruebes como si existiera. Si en tu build llegaras a ver una pantalla de "Orígenes de datos" o "Base de conocimiento", regístralo como hallazgo (inventario desactualizado) y detente a confirmar con el equipo.

### 13.1 · Verificar la ausencia en la interfaz

#### Paso 13.1 — Confirmar que no hay "Orígenes de datos" en el menú

> **Contexto.** Ingresa como **Administrador** (el rol con más visibilidad de menú, para descartar que sea un tema de permisos y no de ausencia). Recorres el menú lateral buscando cualquier entrada de orígenes de datos o base de conocimiento.

1. Con sesión de **Administrador**, abre el menú lateral y recorre los tres grupos: **Operación**, **Diseño y datos** y **Administración**.
2. Busca específicamente una entrada llamada **Orígenes de datos** (la etiqueta `nav.dataSources` existe en el diccionario) o cualquier "Base de conocimiento".
3. Usa también la paleta de comandos (⌘K / Ctrl-K, "Buscar o saltar a…") y teclea "orígenes" y luego "conocimiento".

> **Qué observar.** El menú NO debe ofrecer una entrada navegable de **Orígenes de datos** ni de **Base de conocimiento**: aunque la cadena de traducción exista, no hay ítem de navegación cableado ni ruta detrás. La paleta de comandos no debe saltar a ninguna pantalla de estos módulos. Esto es lo esperado en el estado actual: **PENDIENTE / NO DISPONIBLE**.

> **Resultado esperado.** No aparece ninguna pantalla de orígenes de datos ni de base de conocimiento en el menú ni en la paleta de comandos. El módulo no está construido; el resultado del registro es "N/A — no construido".

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 13.2 — Confirmar que no hay ruta accesible por URL

> **Contexto.** Sigue como **Administrador**. Para descartar una pantalla "huérfana" (sin ítem de menú pero alcanzable por URL), intentas navegar directo a rutas plausibles y confirmas que el router no las resuelve.

1. En la barra de direcciones, intenta `http://localhost:5173/origenes-datos`, luego `http://localhost:5173/data-sources` y `http://localhost:5173/base-conocimiento`.
2. Observa la respuesta del router en cada caso.

> **Qué observar.** El router NO tiene definidas estas rutas; debe caer en el manejo de "ruta no encontrada" (o redirigir al Inicio, según el comportamiento estándar de la app), nunca abrir una pantalla funcional de orígenes o conocimiento. La ausencia es intencional en esta versión.

> **Resultado esperado.** Ninguna URL de orígenes de datos o base de conocimiento resuelve a una pantalla real. Confirmado el estado **PENDIENTE / NO DISPONIBLE**; registrar "N/A — no construido".

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### Registro de hallazgos de la fase 13

| N.º | Paso | Módulo/Pantalla | Severidad | Descripción | Estado |
|-----|------|-----------------|-----------|-------------|--------|
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |

---

## Fase 14 · Dashboards / Panorama e Inicio

Hasta aquí has creado y operado la planta pieza por pieza. Ahora subes al piso ejecutivo: **Patricia Núñez** (gerente-operaciones) no llena bitácoras ni ejecuta rondas — mira. Necesita el panorama consolidado de toda la faena, decidir dónde poner atención y bajar al detalle con un clic. En esta fase pruebas las tres capas de "mirar" del producto: el **Panorama** cross-estructura (KPIs de incidencias de TODAS las estructuras a la vez), el **Inicio** como cockpit personal del turno (tiles con conteos vivos y deep-links, que respetan módulo licenciado y permiso) y una reconfirmación breve de los **dashboards por módulo** (Incidencias y OT) ya cubiertos en fases previas.

El módulo licenciable que gobierna esta capa es `dashboards`: rige tanto el **Panorama** como los dashboards por módulo. Lo tendrás presente al llegar a la Fase 15 (gating).

### 14.1 · Panorama cross-estructura

#### Paso 14.1 — El consolidado ejecutivo de las dos estructuras

> **Contexto.** Ingresa como **Patricia Núñez** (gerente-operaciones), el único rol del canon con `module:dashboard:cross-view`. El Panorama es una **excepción explícita** al aislamiento por estructura activa: consolida las incidencias de todas las estructuras a las que Patricia tiene alcance a la vez — pero respeta el ABAC por nodo (solo suma nodos accesibles). Con las dos estructuras del canon (**Operación Mina Cerro Áspero** y **Mantención Central**), el consolidado y el gráfico por estructura deben aparecer.

1. Cierra sesión e ingresa como **Patricia Núñez** (pnunez@cerroaspero.cl). Enrola/valida MFA si lo pide (su rol lo exige).
2. En el menú, grupo Operación, abre **Panorama** (`/panorama`).
3. Confirma el título **Panorama** y el subtítulo "Vista ejecutiva consolidada: KPIs de incidencias de todas las estructuras a las que tienes alcance, a la vez. El detalle por nodo sigue tu alcance de datos.".
4. Lee los 4 KPIs de la fila superior: **Abiertas**, **Críticas**, **Vencidas**, **SLA excedido**.
5. Localiza el gráfico **Incidencias abiertas por estructura** (aparece cuando hay más de una estructura).
6. Baja a las tarjetas **Por estructura**: cada una con su identidad (índigo para Operación Mina Cerro Áspero, cian para Mantención Central) y el conteo "N nodos accesibles".

> **Qué observar.** Los 4 KPIs deben **sumar** incidencias de ambas estructuras a la vez, no solo la activa — ese es el punto del Panorama. El gráfico "Incidencias abiertas por estructura" solo se dibuja si hay más de una estructura con datos; con las dos del canon debe aparecer. El pluralizado de nodos respeta es-CL ("1 nodo accesible" / "N nodos accesibles"). Si Patricia no tuviera nodos accesibles con incidencias, verías el estado vacío "Sin estructuras para mostrar" / "No tienes nodos accesibles con incidencias en ninguna estructura todavía." — con los datos del canon NO debería estar vacío.

> **Resultado esperado.** El Panorama muestra los 4 KPIs consolidados de las dos estructuras, el gráfico por estructura con ambas barras, y una tarjeta por estructura con su color de identidad y su conteo de nodos accesibles.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 14.2 — Drill-down: de la tarjeta a las incidencias de esa estructura

> **Contexto.** Sigue como **Patricia Núñez**. El valor del Panorama es poder saltar del número al caso. Al abrir las incidencias de una estructura desde su tarjeta, el sistema **fija esa estructura como activa** y te lleva al listado ya filtrado — sin salir del ABAC por nodo.

1. En una tarjeta **Por estructura** (por ejemplo, Operación Mina Cerro Áspero), pulsa la acción "Abrir incidencias de {nombre}" ("Abrir incidencias de Operación Mina Cerro Áspero").
2. Observa a qué pantalla te lleva y con qué estructura activa quedas.

> **Qué observar.** El drill-down debe navegar a **/incidencias** con la estructura de la tarjeta ya **fijada como activa** (el selector global de estructura del encabezado debe reflejarlo). El listado de incidencias debe corresponder a esa estructura y seguir respetando el alcance de datos de Patricia (ABAC por nodo). Volver al Panorama debe recomponer el consolidado.

> **Resultado esperado.** El clic en "Abrir incidencias de …" fija la estructura activa y abre las incidencias filtradas de esa estructura, respetando el ABAC por nodo.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 14.2 · Inicio: el cockpit del turno por rol

#### Paso 14.3 — Los tiles del worklist con conteos vivos (operador)

> **Contexto.** Cierra sesión e ingresa como **Jorge Ramírez** (operador). El **Inicio** (`/`) no es un directorio: es el centro de operación del turno, y deriva del registro de navegación. Sus tiles muestran conteos vivos y llevan directo al listado filtrado (deep-link). Cada tile respeta la doble condición **módulo licenciado ∧ permiso**: un operador ve lo suyo (Mis rondas), no ve lo que no le toca.

1. Con sesión de **Jorge Ramírez**, abre **Inicio** (`/`).
2. Confirma el saludo "Hola, {nombre}" y el subtítulo "Tu centro de operación del turno: lo pendiente primero, y a un clic de la acción.".
3. Bajo el encabezado **Mi trabajo hoy**, revisa los tiles del worklist: **Mis rondas**, **Incidencias abiertas**, **Órdenes abiertas**, **Excepciones por triar**, **Notificaciones sin leer**.
4. Fíjate en las sub-métricas por tono: en **Mis rondas**, "N vencida(s)"; en **Incidencias abiertas**, "N crítica(s)", "N con plazo vencido", "N sin responsable"; etc.
5. Pulsa **Abrir** / "Ver detalle" en **Mis rondas** y confirma que te lleva a Mis rondas ya filtrado.

> **Qué observar.** Los conteos deben ser VIVOS (coherentes con lo que hay en cada módulo). Un tile en cero queda **calmo**: muestra su texto neutro ("Sin rondas pendientes", "Sin incidencias abiertas", "Todo al día" para notificaciones) y NO colorea sub-métricas — las sub-métricas solo aparecen y colorean cuando son mayores que 0. Como **operador**, Jorge debe ver **Mis rondas** (tiene `round:execute`), pero los tiles cuyo módulo no está licenciado o cuyo permiso no posee deben **no renderizarse**, no aparecer en gris muerto. El deep-link debe abrir el listado ya filtrado, no la vista general.

> **Resultado esperado.** El Inicio de Jorge muestra sus tiles pertinentes con conteos vivos y sub-métricas por tono (crítica/vencida/sin responsable) solo cuando aplican; los tiles en cero quedan calmos; cada tile lleva por deep-link al listado filtrado.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 14.4 — El mismo Inicio, otro rol: la gerente

> **Contexto.** Cierra sesión e ingresa como **Patricia Núñez** (gerente-operaciones). Compruebas que el Inicio se adapta al rol: la gerente ve las capas de vista (incidencias, OT) que su rol permite, y NO ve tiles de acción operativa que no le corresponden (por ejemplo, no ejecuta rondas). Es la prueba de que el launchpad respeta módulo ∧ permiso persona a persona.

1. Con sesión de **Patricia Núñez**, abre **Inicio** (`/`).
2. Compara los tiles visibles con los que veía Jorge en el Paso 14.3.
3. Verifica que aparecen los tiles de lectura amplia (Incidencias abiertas, Órdenes abiertas) coherentes con su rol de gerencia, y que NO aparece un tile de ejecución que no le corresponde.

> **Qué observar.** El conjunto de tiles cambia con el rol: no es el mismo Inicio para todos. La gerente, con permisos de vista sobre incidencias/OT y sin edición operativa, ve esos tiles; el operador ve Mis rondas. Ningún tile debe mostrarse si el usuario no tiene su permiso o si su módulo no está licenciado. Los conteos siguen siendo vivos y con deep-link.

> **Resultado esperado.** El Inicio de Patricia difiere del de Jorge según sus permisos: aparecen los tiles de vista de su rol y se ausentan los de ejecución que no le corresponden; todo con conteos vivos y deep-links.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 14.3 · Dashboards por módulo (reconfirmación)

#### Paso 14.5 — Drill-down y "Exportar CSV" en los dashboards de Incidencias y OT

> **Contexto.** Sigue como **Patricia Núñez** (o el rol con vista de dashboard correspondiente). Los dashboards de Incidencias y de Órdenes de trabajo ya se cubrieron en sus fases; aquí solo reconfirmas que el drill-down y la exportación siguen operativos, y recuerdas que el módulo licenciable `dashboards` gobierna tanto el Panorama como estos dashboards.

1. Abre **/incidencias/dashboard**: revisa sus KPIs/gráficos, pulsa un elemento para hacer **drill-down** al listado filtrado y prueba **Exportar CSV**.
2. Abre **/ordenes-trabajo/dashboard**: repite el drill-down y **Exportar CSV**.

> **Qué observar.** El drill-down debe abrir el listado filtrado por el segmento clicado (mismo patrón que en el Panorama). La exportación CSV debe descargar un archivo con separador y formato regional es-CL. Si el módulo `dashboards` no estuviera licenciado, estas pantallas se ocultarían (lo verificarás en la Fase 15); aquí, con la licencia válida, deben responder.

> **Resultado esperado.** Ambos dashboards responden: drill-down navega al listado filtrado y "Exportar CSV" descarga el archivo. Confirmado que la capa de dashboards (Panorama + dashboards por módulo) opera bajo licencia válida.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### Registro de hallazgos de la fase 14

| N.º | Paso | Módulo/Pantalla | Severidad | Descripción | Estado |
|-----|------|-----------------|-----------|-------------|--------|
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |

---

## Fase 15 · Licenciamiento en operación

Lyra WatchLog se distribuye por un canal de marca blanca y corre en infraestructura ajena, muchas veces air-gapped, sin internet en planta. La licencia no es un módulo aislado: es una defensa transversal. Pero hay una regla de oro que esta fase entera valida: **la licencia NUNCA secuestra datos**. El peor estado posible es **solo lectura + exportación** — jamás borrar, jamás cifrar los datos del cliente. En esta fase, como **Administrador**, revisas el estado de la licencia en operación normal, compruebas los límites numéricos (nodos/usuarios) sin romper lo existente, verificas el gating de módulos y entiendes la máquina de estados de degradación y sus banners globales.

Un recordatorio importante de honestidad: **probar un vencimiento real requiere manipular el archivo de licencia** (adelantar fechas, sustituir el `.lic`), lo cual queda fuera del alcance de un smoke visual normal con una licencia válida. Por eso, para los estados de degradación, esta fase es en parte **verificación documental**: confirmas los textos de los banners y del panel, y el carve-out de notificaciones (Fase 12), dejando la simulación de vencimiento como prueba de laboratorio aparte.

### 15.1 · Estado normal y límites

#### Paso 15.1 — El panel de licencia en estado Válida

> **Contexto.** Como **Administrador**, abres el panel de licencia en Configuración. En operación normal debe decir **Válida** y mostrar qué incluye, cuándo vence y cómo renovar. Es solo lectura: la licencia se administra por archivos con el proveedor.

1. Abre **Configuración** y entra a la pestaña **Licencia** (categoría "Licencia").
2. Lee la descripción: "Estado de la licencia de esta instalación: qué incluye, cuándo vence y cómo renovarla. Solo lectura — la licencia se administra por archivos con tu proveedor.".
3. Revisa los campos: **Estado** (debe decir **Válida**), **Edición**, **Vencimiento**, **Días restantes** y, si aplica, **Días de gracia restantes**.
4. Baja a **Módulos incluidos**: la lista de módulos licenciados (Núcleo, Estructura, Plantillas, Bitácoras, Rondas, Incidencias, Excepciones, Órdenes de trabajo, Cambio de turno, Notificaciones, Temas, Inteligencia Artificial, Dashboards, según contrato).
5. Lee la sección **Cómo renovar**: los pasos por archivos (renovacion.lreq junto al license.lic en la carpeta ./license, hacerlo llegar al proveedor, recibir el .lic renovado, la plataforma lo toma al próximo arranque o re-verificación).

> **Qué observar.** El **Estado** debe ser **Válida** en operación normal. El **Vencimiento** en formato regional es-CL y los **Días restantes** coherentes. **Módulos incluidos** debe listar exactamente los módulos del contrato — con licencia válida no debe decir "Sin licencia verificada…". Toda la pantalla es de solo lectura (no hay botones de edición de licencia): correcto, porque la administración es por archivos.

> **Resultado esperado.** El panel muestra Estado = Válida, edición, vencimiento y días restantes bien formateados, la lista de módulos incluidos y el instructivo de renovación por archivos, sin controles de edición.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 15.2 — Límite numérico de nodos: crear sobre el tope da 403 y el botón se deshabilita

> **Contexto.** Como **Administrador**, compruebas el candado de negocio por límites contratados. Si la licencia contempla, por ejemplo, un máximo de nodos y ya estás en el tope, crear uno más debe fallar con un 403 claro en es-CL — pero **jamás** debe romper ni borrar los nodos existentes. Y el sistema debe avisarlo ANTES, deshabilitando el botón con un tooltip explicativo. (Si tu instalación tiene un tope holgado, este paso puede requerir el apoyo del proveedor para emitir una licencia de prueba con límite bajo; regístralo como verificación documental si no puedes provocar el tope.)

1. Ve a **Estructura** e intenta crear un nodo cuando ya alcanzaste el tope de nodos contratado.
2. Observa el estado del botón de crear nodo y su tooltip.
3. Si fuerzas la creación (o si el tope se alcanza durante la operación / provisión / reactivación), observa el mensaje de error.

> **Qué observar.** Al tope, el botón de crear debe estar **deshabilitado** con un tooltip que informa el límite y el uso — en la línea de "Alcanzaste el máximo de {max} nodos de estructura contratado en la licencia ({inUse} en uso). Para crear más, regulariza con tu proveedor o elimina nodos que ya no uses.". Si se fuerza la mutación, el backend responde **403 LICENSE_LIMIT_EXCEEDED** con mensaje en es-CL. Lo esencial: **los nodos existentes NO se tocan** — el conteo vivo cuenta solo activos (deletedAt:null / ACTIVE), así que **eliminar o deshabilitar un nodo LIBERA cupo** de inmediato y vuelve a permitir crear.

> **Resultado esperado.** Sobre el tope, crear nodo queda bloqueado con tooltip informativo y, si se fuerza, 403 LICENSE_LIMIT_EXCEEDED en es-CL; eliminar/deshabilitar un nodo libera cupo; nada de lo existente se rompe.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 15.3 — Límite numérico de usuarios: mismo comportamiento

> **Contexto.** Sigue como **Administrador**. El mismo candado aplica a usuarios activos. Verificas que crear un usuario sobre el tope se comporta igual que con nodos, y que deshabilitar un usuario libera cupo.

1. Ve a **Seguridad › Usuarios** e intenta crear un usuario cuando ya estás en el tope de usuarios activos contratado.
2. Observa el botón de crear y su tooltip, y el error si se fuerza.
3. Deshabilita un usuario existente y confirma que se libera un cupo.

> **Qué observar.** Al tope, el botón de crear usuario deshabilitado con el mensaje "Alcanzaste el máximo de {max} usuarios activos contratado en la licencia ({inUse} en uso). Para crear más, regulariza con tu proveedor o deshabilita usuarios que ya no uses.". Forzar la mutación: **403 LICENSE_LIMIT_EXCEEDED**. El conteo cuenta solo usuarios activos: **deshabilitar libera cupo**. Los usuarios existentes nunca se borran ni se bloquean por este límite.

> **Resultado esperado.** El tope de usuarios se comporta como el de nodos: botón deshabilitado con tooltip, 403 si se fuerza, y deshabilitar libera cupo sin afectar a los existentes.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### 15.2 · Gating de módulos y degradación

#### Paso 15.4 — Gating de un módulo no licenciado

> **Contexto.** Como **Administrador**, verificas el eje de entitlement (distinto del RBAC): un módulo **no incluido** en la licencia desaparece de la interfaz — sidebar, Inicio, paleta de comandos y campanita — y, si alguien intenta forzar una mutación de ese módulo, el backend la rechaza; pero las lecturas y exportaciones de datos ya existentes siguen vivas (no se secuestran datos). Para provocarlo de verdad se necesita una licencia sin ese módulo (apoyo del proveedor); si no puedes, deja este paso como verificación documental del comportamiento esperado.

1. Con una instalación cuya licencia NO incluya cierto módulo (por ejemplo, notificaciones o dashboards), abre el menú lateral, el Inicio, la paleta de comandos (⌘K) y el encabezado.
2. Confirma que ese módulo no aparece por ningún lado.
3. Si intentaras forzar una mutación de ese módulo (por API), observa la respuesta; luego intenta una lectura/exportación.

> **Qué observar.** El módulo no licenciado se **oculta** del sidebar, del Inicio (su tile no se renderiza), de la paleta de comandos y de la campanita (recuerda: la campanita entera se oculta si `notifications` no está licenciado — lo viste en la Fase 12). Una mutación forzada devuelve **403 MODULE_NOT_LICENSED**, pero los **GET y las exportaciones siguen funcionando**: los datos permanecen accesibles para consulta y descarga. En el panel de Licencia, si no hay licencia verificada, **Módulos incluidos** muestra "Sin licencia verificada: no hay módulos que listar. La disponibilidad la gobierna el estado global de arriba.".

> **Resultado esperado.** Un módulo no licenciado se oculta de toda la UI y su mutación forzada da 403 MODULE_NOT_LICENSED, mientras lectura/exportación de datos siguen vivas. Nada de secuestro de datos.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 15.5 — Máquina de estados de degradación y banners globales (verificación documental)

> **Contexto.** Como **Administrador**, repasas los estados de la licencia y sus banners globales (LicenseBanner). Provocar un vencimiento real exige manipular el archivo de licencia (fuera del smoke visual normal), así que este paso es principalmente de **verificación documental**: confirmas que los textos de los estados y banners existen y son correctos, y que el peor estado es solo lectura + exportación.

1. En el panel de **Licencia**, revisa el catálogo de estados posibles que la plataforma sabe representar: **Válida**, **Por vencer** (POR_VENCER), **En gracia (vencida)** (EN_GRACIA), **Solo lectura** (SOLO_LECTURA), **Bloqueada** (BLOQUEADA), **Pendiente de activación** (PENDIENTE_ACTIVACION), **Límite excedido** (LIMITE_EXCEDIDO), **Módulo no licenciado** (MODULO_NO_LICENCIADO), más los estados de **linaje** (la licencia no corresponde a esta instalación) e **integridad** (el software no superó la verificación).
2. Revisa (en el diccionario o simulando en laboratorio) los banners globales asociados y confirma que cada mensaje es correcto y tranquilizador respecto de los datos:
   - **Por vencer:** "La licencia de esta instalación vence en {days} días ({date}). Genera la renovación con tu proveedor para evitar interrupciones."
   - **En gracia:** "La licencia venció el {date}. La plataforma seguirá operando {days} días más mientras se renueva. Contacta a tu proveedor a la brevedad."
   - **Solo lectura (vencida):** "Licencia vencida — modo solo lectura. Tus datos siguen disponibles para consulta y exportación; el ingreso de información nueva está suspendido hasta renovar la licencia con tu proveedor."
   - **Bloqueada:** "La licencia de esta instalación no es válida — modo solo lectura. Tus datos siguen disponibles para consulta y exportación. Contacta a tu proveedor."
   - **Linaje:** "Esta licencia no corresponde a esta instalación — modo solo lectura. … Tus datos siguen disponibles para consulta y exportación."
   - **Integridad:** "El software de esta instalación no superó la verificación de integridad — modo solo lectura. … Tus datos siguen disponibles para consulta y exportación."
   - **Pendiente de activación:** "Instalación pendiente de activación. … Mientras tanto la plataforma opera en solo lectura."
   - **Límites:** "La instalación supera los límites contratados de la licencia (nodos o usuarios). Regulariza con tu proveedor."
3. Confirma que el banner ofrece **Ver detalle** (lleva al panel de Licencia) y **Descartar aviso**.

> **Qué observar.** Todos los mensajes de degradación insisten en que **los datos siguen disponibles para consulta y exportación** — nunca hablan de borrar ni cifrar. El **peor estado es solo lectura + exportación**: la máquina de estados jamás llega a destruir datos. En estado **Válida**, NO debe mostrarse ningún banner global (su ausencia es lo esperado). Con la licencia válida de esta prueba no verás la mayoría de estos banners; su verificación completa es documental o de laboratorio.

> **Resultado esperado.** La máquina de estados y sus banners existen y son coherentes: cada degradación preserva consulta + exportación, el peor caso es solo lectura, y con licencia válida no aparece banner alguno. Confirmado que la licencia no secuestra datos.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

#### Paso 15.6 — Carve-out de notificaciones de licencia y cierre (administración por archivos)

> **Contexto.** Como **Administrador**, cierras el aro con la Fase 12: aunque en un estado restringido los avisos operacionales se suprimen, los avisos de la **propia licencia** (que vence, que cambió de estado, que quedó restringida) SIEMPRE fluyen — porque son los que le dicen al dueño que debe renovar. Y recuerdas que toda la administración de licencia es por archivos, sin internet en planta.

1. Repasa en **Notificaciones › Mis preferencias** los tres eventos de licencia: **Licencia: cambio de estado**, **Licencia: renovación pendiente**, **Licencia: estado restringido**.
2. Comprende (o simula en laboratorio) que, con la instalación en un estado restringido, esos tres avisos NO se suprimen (carve-out), mientras el resto sí.
3. Relee en el panel de **Licencia** la sección **Cómo renovar** y confirma la nota de single-use: "La respuesta de renovación sirve una sola vez y solo en esta instalación. Si el estado indica que la licencia no corresponde, contacta a tu proveedor.".

> **Qué observar.** El carve-out es la razón de ser de que esos tres eventos existan aparte del resto: en degradación, todo calla menos la licencia. La renovación es por archivos (challenge-response), air-gapped, sin exigir internet saliente desde la planta — coherente con el requisito on-premise. La respuesta de renovación es de un solo uso y atada a esta instalación (defensa anti-sobre-despliegue / linaje).

> **Resultado esperado.** Los tres eventos de licencia están presentes y se entiende su carve-out (fluyen aun con licencia restringida); la renovación se administra por archivos, de un solo uso y por instalación, sin internet en planta.

*Registro — [ ] OK  [ ] Falla · Severidad: ____ · Notas: ______________________________*

### Registro de hallazgos de la fase 15

| N.º | Paso | Módulo/Pantalla | Severidad | Descripción | Estado |
|-----|------|-----------------|-----------|-------------|--------|
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |
|     |      |                 |           |             |        |

---

## Log maestro de defectos

Consolida aquí, a medida que avanzas por todas las fases, cada hallazgo con su severidad (S1–S5, escala de bug del canon: S1 bloqueante · S2 grave · S3 media · S4 menor · S5 observación). No confundas esta severidad con la operacional 1–5 de incidencias/equipos.

| ID | Fase/Paso | Módulo | Severidad (S1–S5) | Pasos para reproducir | Esperado vs. real | Estado |
|----|-----------|--------|-------------------|-----------------------|-------------------|--------|
|    |           |        |                   |                       |                   |        |
|    |           |        |                   |                       |                   |        |
|    |           |        |                   |                       |                   |        |
|    |           |        |                   |                       |                   |        |
|    |           |        |                   |                       |                   |        |
|    |           |        |                   |                       |                   |        |
|    |           |        |                   |                       |                   |        |
|    |           |        |                   |                       |                   |        |

---

## Matriz de cobertura

Marca el resultado de cada módulo: **OK ✓** (funciona), **Con reparos !** (funciona con defectos menores/S3–S5) o **Falla ✗** (roto/S1–S2). Deja la última columna en blanco para marcar a mano.

| Módulo | Pantalla(s) principales | Probado (OK ✓ / Con reparos ! / Falla ✗) |
|--------|-------------------------|-------------------------------------------|
| Setup / OOBE | /setup (asistente de primer arranque) |  |
| Autenticación / MFA | Login, enrolamiento y verificación MFA |  |
| Inicio | / (cockpit del turno, tiles worklist) |  |
| Configuración · Identidad | Configuración › Identidad |  |
| Configuración · Apariencia | Configuración › Apariencia (temas) |  |
| Configuración · IA | Configuración › Inteligencia Artificial |  |
| Configuración · Correo | Configuración › Correo saliente |  |
| Configuración · Seguridad | Configuración › Seguridad |  |
| Configuración · Bitácoras | Configuración › Bitácoras |  |
| Configuración · Notificaciones | Configuración › Notificaciones |  |
| Configuración · Licencia | Configuración › Licencia |  |
| Seguridad · Roles | /seguridad (Roles y permisos) |  |
| Seguridad · Usuarios | /seguridad (Usuarios) |  |
| Seguridad · Política | /seguridad (Política de seguridad) |  |
| Seguridad · Auditoría | /seguridad (Auditoría inmutable) |  |
| Estructura | /estructura (jerarquía y nodos) |  |
| Equipos | Equipos por nodo (activos) |  |
| Personas / Contratistas | Dotación, competencias, acreditación |  |
| Calendario operacional | /calendario-operacional (turnos) |  |
| Calendario fiscal | /calendario-fiscal (periodos contables) |  |
| Rondas · Programación | /rondas (programación y recurrencia) |  |
| Mis rondas | /mis-rondas (ejecución) |  |
| Datos de referencia | /datos-referencia (catálogos maestros) |  |
| Flujos | /flujos (workflows configurables) |  |
| Plantillas / Form Builder | /plantillas (diseñador de bitácoras) |  |
| Bitácoras | /bitacoras (entradas por turno) |  |
| Excepciones | /excepciones (triage de desviaciones) |  |
| Incidencias | /incidencias (workflow + dashboard) |  |
| Órdenes de trabajo | /ordenes-trabajo (OT/PTW + dashboard) |  |
| Cambio de turno | /cambio-turno (entrega firmada) |  |
| Notificaciones | /notificaciones · /mis-notificaciones · campanita |  |
| Panorama | /panorama (KPIs cross-estructura) |  |
| Orígenes de datos [N/A] | (no construido — verificar ausencia) | N/A |
| Licenciamiento | Configuración › Licencia + banners + límites |  |

---

## Glosario y notas de "qué es normal"

### Glosario de términos

- **Bitácora:** registro operacional estructurado de un ámbito (área/equipo/turno). En Lyra WatchLog se compone de secciones y campos definidos por una **plantilla**.
- **Plantilla:** el diseño (form builder) de una bitácora: sus secciones, campos, validaciones, reglas y firmas. Es inmutable por versión.
- **Sección:** bloque de una bitácora que puede asignarse a un actor/rol (multi-actor), con su propio flujo y firmas.
- **Folio:** identificador correlativo y **gapless** (sin saltos) que se asigna al sellar/aprobar (p. ej. al aprobar una OT). Garantiza trazabilidad continua.
- **Entrada:** una instancia registrada de una bitácora para un turno/día operacional concreto.
- **Excepción:** desviación detectada en una bitácora (fuera de rango, regla incumplida) que queda pendiente de **triage** por HSE/Prevención.
- **Incidencia:** evento operacional o de seguridad gestionado por un workflow (creación, asignación, transiciones, cierre) con severidad operacional 1–5.
- **CAPA:** Acción Correctiva y Preventiva asociada a una incidencia; tiene plazo y verificación de eficacia.
- **5 Porqués:** técnica de análisis de causa raíz aplicada en el módulo de incidencias.
- **OT / PTW:** Orden de Trabajo / Permiso de Trabajo (Permit To Work): solicitud a ejecución de mantenimiento con puertas de aprobación, checklists y PTW por momento.
- **Dotación:** el personal (roster) asignado a una OT, con sus competencias y acreditaciones (incl. contratistas).
- **Checklist por momento:** lista de verificación asociada a un MOMENTO del trabajo (antes/durante/después), con ejecución por actividad y segregación revisor ≠ ejecutor.
- **Período contable (OPEN / CLOSED / LOCKED):** estado del período del calendario fiscal. OPEN admite registros; CLOSED y LOCKED restringen edición progresivamente.
- **Ventana de edición:** lapso durante el cual una entrada/registro admite corrección antes de sellarse; fuera de ella se requiere el flujo de anulación/corrección (reversa GxP).
- **ABAC:** control de acceso por atributos — aquí, el **alcance de datos por nodo** de la estructura (p. ej. el operador acotado a "Planta Concentradora").
- **RBAC:** control de acceso por roles — qué acciones/pantallas puede un rol. Es un eje distinto del entitlement de licencia.
- **Entitlement / licencia:** eje que gobierna qué **módulos** están activos según el contrato (edition/modules[]), independiente del RBAC (que gobierna al usuario).
- **Part 11 / ALCOA+:** requisitos de registros electrónicos y firmas (FDA 21 CFR Part 11) y principios de integridad de datos (Atribuible, Legible, Contemporáneo, Original, Exacto, +Completo/Consistente/Perdurable/Disponible).
- **ISA-18.2:** estándar de gestión de alarmas de proceso industrial (referencia para umbrales/severidades).
- **SLA:** Acuerdo de Nivel de Servicio — plazos de atención/permanencia (incidencias, OT) cuyo incumplimiento dispara avisos.
- **MTTR:** Tiempo Medio de Reparación (métrica de confiabilidad de OT/mantenimiento).

### Avisos ESPERADOS que NO son bugs

- **Tiles vacíos en punto cero:** en una instalación recién creada, los tiles del Inicio muestran su texto neutro ("Sin rondas pendientes", "Todo al día", etc.) y no colorean sub-métricas. Es lo correcto: en cero, el tile queda calmo.
- **Banner de licencia AUSENTE con licencia válida:** cuando el estado es **Válida**, NO se muestra ningún banner global de licencia. Su ausencia es lo esperado, no un fallo.
- **"Solo lectura: sección asignada a…":** si abres una sección de bitácora que no te corresponde por rol, verás el aviso de solo lectura. Es la segregación por sección funcionando, no un error de permisos.
- **El demo puede acumular rondas vencidas:** el seed de demostración acumula rondas vencidas con el paso del tiempo; ver muchas "vencidas" en Mis rondas o en el Inicio es deriva de datos del demo, no un bug.
- **SVG de logo rechazado por seguridad:** al cargar la identidad de marca, el sistema rechaza logos en formato SVG a propósito (superficie de ataque). Usa PNG/JPG. Es una defensa, no un defecto.
- **Bytes del PDF no deterministas por CreationDate:** el acta PDF incrusta su fecha de creación, así que dos generaciones no producen bytes idénticos; sin embargo, el **hash de contenido** (el que sella la firma Part 11) es estable. No es corrupción.
- **Campanita ausente si `notifications` no está licenciado:** si el módulo de notificaciones no está en la licencia, la campanita entera desaparece del encabezado. Es el gating de entitlement, no un fallo de la topbar.
- **Módulos ausentes del menú por licencia:** un módulo no licenciado no aparece en sidebar, Inicio ni paleta de comandos. Distíntalo de un módulo oculto por permiso (RBAC): son dos ejes distintos.
- **403 al forzar una acción de módulo no licenciado, pero lectura/exportación viva:** ver LICENSE_LIMIT_EXCEEDED o MODULE_NOT_LICENSED en una mutación mientras los GET/exportaciones siguen funcionando es el diseño "la licencia no secuestra datos", no un error intermitente.

