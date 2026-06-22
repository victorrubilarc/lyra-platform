# QA — "Un día de operación" (escenario DEMO LITE) · documento VIVO

> **Para qué sirve:** una prueba manual end-to-end **liviana**, de MENOS a MÁS, para que
> el dueño recorra Lyra WatchLog como un día real de planta y **cace bugs y carencias**
> antes de seguir a Fase 3/6. Es el complemento simple del recorrido denso
> `QA_WALKTHROUGH.md` (escenario DEMOQA, 17 nodos / 64 incidencias): aquí son **4 nodos,
> 7 usuarios, 1 plantilla, 1 flujo, 1 ronda**.
>
> **Escenario:** «Planta Demo Andina» (concentradora chilena) → **Concentradora** →
> **Molienda** + **Flotación**. Marca `DEMOLITE` (aislada: NO toca DEMOQA ni tus datos).
> Última actualización: **2026-06-22**.

---

## 0. Antes de empezar (5 minutos)

1. **Infra arriba** (postgres/redis/minio/mailpit) + **API** `:3000` + **web** `:5173`.
2. **Sembrar el escenario** (idempotente; se puede re-ejecutar):
   ```bash
   python scripts/seed-demo-lite.py
   ```
   Para borrarlo todo al terminar (sin tocar nada más):
   ```bash
   python scripts/seed-demo-lite.py --clean
   ```
3. **Sin FLUSHALL:** el seed no agrega claves de permiso nuevas (reusa el catálogo
   existente), así que **no hace falta** vaciar Redis. Cada usuario demo entra con su
   set de permisos fresco al iniciar sesión.
4. **Mailpit** (bandeja de correo de pruebas): http://localhost:8025
5. **Los avisos automáticos corren solos:** el worker de notificaciones barre cada
   ~30–60 s y el de reglas cada ~30 s. Cuando un paso diga "espera y refresca",
   da ~1 minuto. (Si no quieres esperar, el admin puede forzar el barrido con
   `POST /api/notifications/run` y `POST /api/rule-actions/run`.)

### Usuarios (todos con contraseña `Demo!Pass2026`)

| Usuario | Rol | Alcance (ABAC) | Papel en el día |
|---|---|---|---|
| `admin.demo@demolite.local` | Administrador | Toda la planta | Configura y supervisa |
| `sup.saliente@demolite.local` | Supervisor de turno | Concentradora | Revisa/firma, **entrega** el turno |
| `sup.entrante@demolite.local` | Supervisor de turno | Concentradora | **Recibe** el turno |
| `op.molienda@demolite.local` | Operador | **Solo Molienda** | Llena la ronda |
| `op.flotacion@demolite.local` | Operador | **Solo Flotación** | (contraste de ABAC) |
| `hse@demolite.local` | Mantención / HSE | Concentradora | Gestiona la incidencia / CAPA |
| `auditor@demolite.local` | Auditor (solo lectura) | Toda la planta | Verifica trazabilidad |

> **Tip para probar varias cuentas:** usa ventanas de incógnito o perfiles distintos del
> navegador. Con el fix QA#1, al cerrar sesión y entrar con otra cuenta las **pestañas de
> trabajo entran limpias** (ya no se mezclan entre usuarios).
>
> **MFA:** en este escenario está **apagado** para que firmes sin enrolar TOTP. Para
> probar MFA, ver el **Apéndice A**.

---

## 1. El guion, de menos a más

Cada paso indica **con qué usuario**, **qué hacer** y **qué debería pasar**. Anota lo que
falle (o se sienta raro) en la **§2 Tabla de hallazgos**.

### Acto 1 — Panorama y permisos (admin)

| # | Usuario | Qué hacer | Resultado esperado |
|---|---|---|---|
| 1.1 | admin | Inicia sesión. Recorre el **menú lateral** (grupos), abre/fija **pestañas**, prueba **⌘K**, cambia **tema** claro/oscuro. | Todo navega sin refrescos; el tema se aplica a todo; áreas táctiles cómodas. |
| 1.2 | admin | Ve a **Estructura** (`/estructura`). Navega Planta → Concentradora → Molienda/Flotación. | Árbol de 4 nodos; al seleccionar un nodo, panel derecho con detalle/hijos. |
| 1.3 | admin | Ve a **Seguridad → Roles** (`/seguridad`), abre un rol y mira la **matriz de permisos**. | **Los grupos salen en español** (Plantillas, Flujos, Incidencias, Bitácoras, Cambio de turno…). *(Fix QA#4 — antes salían en inglés.)* |
| 1.4 | admin | En **Seguridad → Usuarios**, abre `op.molienda` → pestaña **Alcance**. | Tiene alcance solo a **Molienda** (no a toda la planta). |

### Acto 2 — ABAC: cada quién ve lo suyo

| # | Usuario | Qué hacer | Resultado esperado |
|---|---|---|---|
| 2.1 | op.molienda | Inicia sesión. Abre **Bitácoras** y **Estructura**. | Solo ve **Molienda** (y lo que cuelga de ahí). NO ve Flotación. |
| 2.2 | op.flotacion | Inicia sesión (otra ventana). Mira Estructura/Bitácoras. | Solo ve **Flotación**. Contraste claro de ABAC entre operadores. |
| 2.3 | auditor | Inicia sesión. Intenta editar algo. | Ve **todo** pero en **solo lectura** (sin botones de acción). |
| 2.4 | op.molienda | Intenta entrar a una pantalla sin permiso (p. ej. teclea `/seguridad` en la URL). | Aparece un **aviso "Sin acceso"** (toast), no una pantalla muda. *(Fix QA#6.)* |

### Acto 3 — Configurar el correo saliente (admin)

| # | Usuario | Qué hacer | Resultado esperado |
|---|---|---|---|
| 3.1 | admin | **Configuración** (`/configuracion`) → **Correo saliente**. Elige el preset **Mailpit** (rellena host/puerto). Guarda. | Se guarda; la contraseña queda "configurada" (no se muestra). |
| 3.2 | admin | Botón **Probar conexión** y **Enviar prueba**. | Ambos OK; el correo de prueba aparece en **Mailpit** (`:8025`). |

### Acto 4 — El operador llena la ronda (op.molienda)

| # | Usuario | Qué hacer | Resultado esperado |
|---|---|---|---|
| 4.1 | op.molienda | **Mis rondas** (`/mis-rondas`). | Hay una ronda de Molienda; **una aparece vencida** (badge de atraso). |
| 4.2 | op.molienda | **Iniciar** la ronda → se abre el llenado de la **«Bitácora de Turno — Molienda»**. | Cabecera con estado **Borrador** + chips de turno/día operacional. Solo se ve/edita la sección **Operación** (la de **Revisión** es del supervisor). |
| 4.3 | op.molienda | En **Temperatura del molino** escribe **95**. | Marca **advertencia** (ámbar): pasó 90 °C. |
| 4.4 | op.molienda | Cámbiala a **105**. Marca **¿Hubo detención? = Sí**. | A 105 °C marca **crítico** (rojo). Al decir "Sí", **aparece el campo "Motivo de la detención"** (lógica condicional). Elige un motivo. |
| 4.5 | op.molienda | Marca EPP (multiselección), elige **Equipo inspeccionado** (Molino SAG), **adjunta una foto**, escribe una observación. | El selector de equipo y la lista de EPP resuelven opciones; la foto se sube y muestra miniatura. |
| 4.6 | op.molienda | **Guardar y completar** la sección → **Enviar a revisión**. | La entrada pasa a **Enviado**; la sección Operación queda **bloqueada** (read-only). Se generó una **excepción crítica** por los 105 °C. |

### Acto 5 — La excepción se vuelve incidencia (automático)

| # | Usuario | Qué hacer | Resultado esperado |
|---|---|---|---|
| 5.1 | op.molienda / hse | Ve a **Excepciones** (`/excepciones`). | Aparece la **excepción** "temp_molino crítica" ligada a la entrada. |
| 5.2 | hse | **Espera ~30–60 s** y abre **Incidencias** (`/incidencias`). | La **regla abrió una incidencia de mantenimiento** automáticamente (origen = Regla), ligada a la entrada y al nodo Molienda. |
| 5.3 | hse | Abre la incidencia. Mírala (pestañas: Resumen / Acciones / Investigación / Actividad). Agrega una **acción CAPA**. | Se puede comentar, asignar, agregar CAPA. La trazabilidad campo→excepción→incidencia es navegable. |

### Acto 6 — El supervisor revisa y firma (sup.saliente)

| # | Usuario | Qué hacer | Resultado esperado |
|---|---|---|---|
| 6.1 | sup.saliente | **Bitácoras** (`/bitacoras`) → abre la entrada **Enviada** de Molienda. | Ahora **sí** puede editar la sección **Revisión** (la de Operación está bloqueada). |
| 6.2 | sup.saliente | Completa **Revisión conforme** + comentario. Ejecuta **Revisar y firmar**. | Pide **firma Part 11** (contraseña + significado "Revisado"). Tras firmar: estado **Revisado**, chip "Firmado", evento en la línea de tiempo. |
| 6.3 | sup.saliente | Ejecuta **Aprobar y cerrar** → firma de nuevo. | Estado **Cerrado** (final). Panel de **firmas §11.50** con las dos firmas; **Verificar integridad** = VÁLIDO. |

### Acto 7 — Notificaciones (correo + campanita)

| # | Usuario | Qué hacer | Resultado esperado |
|---|---|---|---|
| 7.1 | (cualquiera) | Tras las transiciones/incidencia, **espera ~1 min**. Revisa **Mailpit** (`:8025`). | Llegan correos (transición de flujo / incidencia / ronda vencida) con plantilla premium. |
| 7.2 | hse / supervisor | Mira la **campanita** del topbar y **Mis notificaciones** (`/mis-notificaciones`). | Badge de no leídas + bandeja; al abrir un aviso navega al objeto. Marcar leído baja el contador (tiempo real). |

### Acto 8 — Cambio de turno firmado + acta PDF (los dos supervisores)

| # | Usuario | Qué hacer | Resultado esperado |
|---|---|---|---|
| 8.1 | sup.saliente | **Cambio de turno** (`/cambio-turno`). | Cockpit de 3 zonas, auto-compilado por **nodo + turno** (Concentradora). El "baton" lista lo abierto del turno (la incidencia, pendientes). |
| 8.2 | sup.saliente | Revisa el **resumen del turno** (modo determinista, sin IA). Edítalo si quieres. **Firma la entrega** (parte 1). | Resumen generado sin proveedor de IA; al firmar, el **snapshot queda congelado**; se notifica al turno entrante (`handover.ready`). |
| 8.3 | sup.entrante | Inicia sesión, abre la **campanita** → entra a la entrega. **Acusa recibo** (parte 2). | La entrega queda **firmada por las dos partes**. |
| 8.4 | sup.saliente / sup.entrante | Desde la entrega firmada, **Descargar acta PDF**. | Baja un **acta de grado auditoría** (identidad Lyra, snapshot, **dos firmas**, folio + **hash** verificable). |

### Acto 9 — La mirada del auditor (auditor)

| # | Usuario | Qué hacer | Resultado esperado |
|---|---|---|---|
| 9.1 | auditor | Recorre Bitácoras, Incidencias, y (si tiene acceso) Auditoría. | Ve todo el rastro en **solo lectura**: entrada sellada, firmas, incidencia, entrega de turno. Nada editable. |

---

## 2. Tabla de HALLAZGOS (anota aquí mientras pruebas)

> Clasifica: **bug** (algo falla) · **carencia** (falta algo que debería existir) ·
> **UX** (confuso/incómodo) · **duda**. Severidad: alta / media / baja.

| # | Paso | Tipo | Sev. | Qué pasó / qué falta | ¿Esperado? |
|---|---|---|---|---|---|
| H1 |  |  |  |  |  |
| H2 |  |  |  |  |  |
| H3 |  |  |  |  |  |
| H4 |  |  |  |  |  |
| H5 |  |  |  |  |  |
| H6 |  |  |  |  |  |
| H7 |  |  |  |  |  |
| H8 |  |  |  |  |  |

---

## 3. Mapeo a los SMOKES VISUALES pendientes (BACKLOG §4)

Este recorrido **ejercita** varios smokes visuales que estaban pendientes de "clic".
Marca ✅ los que verifiques OK durante la prueba:

| Smoke visual (§4) | Acto del guion que lo cubre | OK |
|---|---|---|
| App Shell (sidebar, pestañas, ⌘K, tema) | 1.1 | ☐ |
| Estructura | 1.2, 2.1–2.2 | ☐ |
| Seguridad (roles, matriz de permisos) | 1.3–1.4 | ☐ |
| Notificaciones — Correo saliente (hardening) | 3.1–3.2 | ☐ |
| Programación de rondas / Mis rondas | 4.1 | ☐ |
| Llenado 2.4 (secciones, umbral, condicional) | 4.2–4.6 | ☐ |
| Catálogo de objetos · Ola 1 (NÚMERO/umbral, BOOLEAN, TEXTAREA) | 4.3–4.6 | ☐ |
| Catálogo de objetos · Ola 2 (REFERENCE equipo, SELECT/MULTISELECT) | 4.4–4.5 | ☐ |
| Catálogo de objetos · Ola 3 (adjunto/foto) | 4.5 | ☐ |
| Excepciones operacionales | 5.1 | ☐ |
| Incidencias (núcleo + CAPA) | 5.2–5.3 | ☐ |
| Ejecución de flujo + firmas 2.5 (Part 11) | 6.1–6.3 | ☐ |
| Bitácoras 2.6 (visor, firmas, verificar integridad, timeline) | 6.3, 9.1 | ☐ |
| Notificaciones (Bloque N + campanita in-app) | 7.1–7.2 | ☐ |
| Cambio de turno (cockpit, entrega 2 partes, resumen) | 8.1–8.3 | ☐ |
| Acta PDF de la entrega | 8.4 | ☐ |

> **No cubierto por DEMO LITE (a propósito, para mantenerlo liviano):** Ola 4
> (tabla/grupo repetible + matriz parámetro×turno), SLA/atrasos de incidencias,
> diseñador visual del builder, datos de referencia/CSV, calendario fiscal,
> período contable, ventana de edición. Esos se ejercitan en el escenario **DEMOQA**
> (`QA_WALKTHROUGH.md`).

---

## Apéndice A — Cómo probar MFA (opcional)

El escenario viene **sin MFA** para no frenar la prueba. Si quieres ejercitarlo:

1. Como **admin**, en **Seguridad → Roles**, abre `Supervisor de Turno (DEMO LITE)` y
   activa **"Exigir MFA"** (o súbelo en la **política** global).
2. Vuelve a iniciar sesión con `sup.saliente`: el gate `/activar-mfa` pedirá **enrolar
   TOTP** (escanea el QR con tu app de autenticación, guarda los códigos de recuperación).
3. (Opcional) En el **builder de flujos** (`/flujos`), edita el flujo
   `Bitácora de turno (DEMO LITE)` y marca **"Exigir MFA"** en la transición *Aprobar y
   cerrar*: la firma de cierre pedirá además el código TOTP.
