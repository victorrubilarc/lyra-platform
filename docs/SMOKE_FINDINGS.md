# Registro de hallazgos — Smoke Visual Global

> **Log de trabajo de la ronda de QA visual** que hace el dueño con `docs/SMOKE_VISUAL_GLOBAL.pdf`.
> Aquí se CAPTURAN los hallazgos que el dueño va dictando, de forma estructurada y reproducible.
> **No se corrige nada aquí:** los arreglos se deciden y ejecutan en el PROCESAMIENTO (por lote, a
> pedido del dueño), módulo por módulo y con verificación (verde + smoke). Este archivo persiste entre
> sesiones: cada "sentada" de QA solo ANEXA hallazgos nuevos.

## Cómo se usa
- **Capturar:** por cada cosa que el dueño mencione, se agrega un bloque `### F-NNN` con la plantilla de
  abajo, id correlativo, y una clasificación LIGERA (severidad + módulo). Sin investigar ni arreglar.
- **Procesar (a pedido):** cuando el dueño diga "procesa", se triangulan todos los `NUEVO`, se agrupan por
  módulo, se contrastan con el código, y se decide: **arreglo ahora** (fix chico verificado) o **al BACKLOG**
  (si es mayor — enlazando al Catálogo maestro, SIN duplicar). Se actualiza el `Estado` de cada hallazgo.
- **Publicar:** el archivo se commitea/pushea periódicamente (regla "nada se queda atrás").

## Escala de severidad (igual que el smoke)
- **S1 Bloqueante** · **S2 Grave** · **S3 Media** · **S4 Menor** · **S5 Observación/mejora.**
  (Es severidad del DEFECTO; distinta de la severidad operacional 1–5 del negocio.)

## Estados de un hallazgo
`NUEVO` → `TRIAGED` → `EN-FIX` → `RESUELTO` → `VERIFICADO` · o `DESCARTADO` (no-bug) · o `DIFERIDO→BACKLOG` (enlaza al ítem del Catálogo maestro).

## Tipos
`bug` · `UX` · `texto/label` · `validación` · `permiso/ABAC` · `rendimiento` · `datos/demo` · `mejora` · `duda` · `no-bug (esperado)`

---

## Plantilla de un hallazgo (copiar por cada uno)
```
### F-NNN · <título corto>
- Fecha:
- Fase/Paso: (del SMOKE_VISUAL_GLOBAL, ej. Fase 6 · Paso 6.4)
- Módulo/Pantalla:
- Tipo:
- Severidad: S?
- Qué hice (repro):
- Esperado:
- Real:
- Evidencia: (captura/archivo)
- Estado: NUEVO
- Notas:
```

---

## Hallazgos

<!-- Los bloques F-NNN se van agregando aquí, en orden de captura. -->

### F-001 · Paso 0.3 no muestra cantidad de nodos ni de usuarios (solo módulos)
- Fecha: 2026-07-09
- Fase/Paso: Paso 0.3
- Módulo/Pantalla: Licenciamiento / vista de estado de licencia (paso 0.3 del smoke)
- Tipo: bug
- Severidad: S3
- Qué hice (repro): En el paso 0.3 revisé la información de la licencia.
- Esperado: Ver la cantidad de nodos y de usuarios (límites/consumo), además de los módulos.
- Real: Solo aparecen los módulos; no se muestran nodos ni usuarios.
- Evidencia:
- Estado: NUEVO
- Notas:

### F-002 · Duda: ¿quitar un módulo (ej. Órdenes de Trabajo) de la licencia lo deja realmente inoperativo?
- Fecha: 2026-07-09
- Fase/Paso: Paso 0.3
- Módulo/Pantalla: Licenciamiento / entitlements de módulos
- Tipo: duda
- Severidad: S3
- Qué hice (repro): La licencia por defecto trae TODOS los módulos activos.
- Esperado: (a verificar en procesamiento) Si se quita el módulo de OT (u otro) del `modules[]`/`edition`, ese módulo debe quedar oculto/desactivado (entitlement-aware).
- Real: Duda del dueño: no está confirmado si al quitarlo queda inoperativo, porque se emitió con todos los módulos.
- Evidencia:
- Estado: NUEVO
- Notas: Verificar en procesamiento que el gate de entitlement esté cableado por módulo (no "siempre activo"). Cruzar con L2b/entitlement-aware.

### F-003 · Duda: ¿se puede renovar la licencia en cualquier momento? ¿cuáles son los pasos?
- Fecha: 2026-07-09
- Fase/Paso: Paso 0.3
- Módulo/Pantalla: Licenciamiento / renovación de licencia
- Tipo: duda
- Severidad: S4
- Qué hice (repro): —
- Esperado: (a documentar) Poder renovar en cualquier momento y tener los pasos claros del flujo de renovación (challenge-response por archivo, air-gapped).
- Real: Duda del dueño sobre el momento y el procedimiento de renovación.
- Evidencia:
- Estado: NUEVO
- Notas: En procesamiento, documentar los pasos de renovación (posible enlace a USER_GUIDE/LICENSING). No se responde en modo captura.

### F-004 · Paso 0.4 · Falta menú de Preferencias / perfil de usuario (avatar, foto, datos propios)
- Fecha: 2026-07-09
- Fase/Paso: Paso 0.4
- Módulo/Pantalla: Preferencias / Perfil de usuario (barra superior)
- Tipo: mejora
- Severidad: S3
- Qué hice (repro): En el paso 0.4 busqué un menú de Preferencias.
- Esperado: Un menú de Preferencias/Perfil donde el usuario pueda cambiar su avatar, subir una foto de perfil y editar datos propios del perfil; algunos de esos datos deberían ser visibles para otros usuarios (perfil público interno).
- Real: No hay menú de Preferencias como tal; solo el tema y la densidad aparecen en la barra superior. No existe gestión de avatar/foto ni datos de perfil.
- Evidencia:
- Estado: NUEVO
- Notas: Distinguir dos partes en procesamiento: (1) datos privados de preferencia y (2) datos de perfil visibles a otros usuarios. Posible ítem del Catálogo maestro (mayor).

### F-005 · Paso 1.1 · No aparece el pie de auditoría
- Fecha: 2026-07-09
- Fase/Paso: Paso 1.1
- Módulo/Pantalla: (según paso 1.1 del smoke)
- Tipo: bug
- Severidad: S3
- Qué hice (repro): En el paso 1.1 revisé la pantalla buscando el pie de auditoría.
- Esperado: Ver el pie de auditoría (quién/qué/cuándo, creado/actualizado por).
- Real: No aparece el pie de auditoría.
- Evidencia:
- Estado: NUEVO
- Notas:

### F-006 · Paso 1.4 · Duda: ¿cómo se auditan las modificaciones?
- Fecha: 2026-07-09
- Fase/Paso: Paso 1.4
- Módulo/Pantalla: Auditoría / registro de cambios (según paso 1.4 del smoke)
- Tipo: duda
- Severidad: S4
- Qué hice (repro): En el paso 1.4 quise ver cómo quedan auditadas las modificaciones.
- Esperado: (a documentar) Ver cómo se registran las modificaciones (quién, qué, cuándo, antes/después) y dónde consultarlas.
- Real: Duda del dueño sobre el mecanismo/visualización de auditoría de modificaciones.
- Evidencia:
- Estado: NUEVO
- Notas: En procesamiento, documentar el flujo de auditoría de cambios. Relacionado con F-005 (pie de auditoría). No se responde en modo captura.

### F-007 · Paso 1.8 · Falta ayuda que explique el default de aviso por transición
- Fecha: 2026-07-09
- Fase/Paso: Paso 1.8
- Módulo/Pantalla: (según paso 1.8 del smoke) — configuración de aviso/notificación por transición de flujo
- Tipo: texto/label
- Severidad: S4
- Qué hice (repro): En el paso 1.8 revisé el texto de ayuda.
- Esperado: La ayuda debe explicar que esto solo aplica cuando una transición de flujo NO configura su propio aviso (es un default, no pisa configuraciones explícitas). Además: cambios auditados y en vivo.
- Real: No aparece esa explicación en la ayuda.
- Evidencia:
- Estado: NUEVO
- Notas:

### F-008 · Paso 1.9 · No aparece nada de auditoría
- Fecha: 2026-07-09
- Fase/Paso: Paso 1.9
- Módulo/Pantalla: (según paso 1.9 del smoke)
- Tipo: bug
- Severidad: S3
- Qué hice (repro): En el paso 1.9 busqué la información de auditoría.
- Esperado: Ver la auditoría (quién/qué/cuándo, antes/después) correspondiente a este paso.
- Real: No aparece nada de auditoría.
- Evidencia:
- Estado: NUEVO
- Notas: Relacionado con F-005 y F-006 (auditoría faltante en varias pantallas).

### F-009 · Paso 2.10 · No aparece el texto "MFA Requerido · pendiente (heredado del rol)"
- Fecha: 2026-07-09
- Fase/Paso: Paso 2.10
- Módulo/Pantalla: Seguridad / Usuarios — estado MFA (según paso 2.10 del smoke)
- Tipo: bug
- Severidad: S3
- Qué hice (repro): En el paso 2.10 revisé ambos usuarios buscando el indicador de MFA.
- Esperado: Ambos usuarios deben mostrar el texto "MFA Requerido · pendiente (heredado del rol)".
- Real: Ese texto no aparece en ninguna parte.
- Evidencia:
- Estado: NUEVO
- Notas: Aclaración del dueño (2026-07-09): el "MFA Requerido" SÍ aparece como leyenda en color amarillo (o similar) en los usuarios, pero solo cuando se modifican las políticas y se selecciona "MFA requerido por rol". Revisar si el texto esperado del smoke ("· pendiente (heredado del rol)") coincide con lo que se muestra y en qué condición aparece.

### F-010 · Paso 2.12 · No aparece "Camila muestra MFA Requerido · pendiente"
- Fecha: 2026-07-09
- Fase/Paso: Paso 2.12
- Módulo/Pantalla: Seguridad / Usuarios — estado MFA (según paso 2.12 del smoke)
- Tipo: bug
- Severidad: S3
- Qué hice (repro): En el paso 2.12 revisé el usuario Camila buscando el indicador de MFA.
- Esperado: Camila debe mostrar "MFA Requerido · pendiente".
- Real: No aparece ese texto/estado.
- Evidencia:
- Estado: NUEVO
- Notas: Relacionado con F-009 (indicador de estado MFA no visible en pantalla de usuarios). Aclaración del dueño (2026-07-09): el indicador "MFA Requerido" SÍ aparece como leyenda amarilla en los usuarios cuando se modifican las políticas y se selecciona "MFA requerido por rol". Verificar coincidencia exacta del texto esperado y la condición de aparición.

### F-011 · Paso 2.16 · Pantalla/grilla poco clara, podría mostrar mejor información
- Fecha: 2026-07-09
- Fase/Paso: Paso 2.16
- Módulo/Pantalla: Seguridad / Auditoría (grilla del paso 2.16)
- Tipo: UX
- Severidad: S3
- Qué hice (repro): En el paso 2.16 revisé la pantalla y la grilla.
- Esperado: Una pantalla/grilla clara y con información más útil y legible.
- Real: La pantalla no es clara y la grilla tampoco; podría presentar mejor información.
- Evidencia:
- Estado: NUEVO
- Notas:

### F-012 · Paso 2.16 · La IP registrada es la del servidor, no la del cliente que hizo la acción
- Fecha: 2026-07-09
- Fase/Paso: Paso 2.16
- Módulo/Pantalla: Seguridad / Auditoría — columna IP (paso 2.16)
- Tipo: bug
- Severidad: S2
- Qué hice (repro): En el paso 2.16 revisé la IP mostrada en la grilla de auditoría.
- Esperado: Debe registrarse/mostrarse la IP del CLIENTE que ejecutó la acción.
- Real: Muestra la IP del servidor, no la del cliente.
- Evidencia:
- Estado: NUEVO
- Notas: Relevante para auditoría/seguridad (trazabilidad real del actor). En procesamiento revisar manejo de proxy inverso (X-Forwarded-For / trust proxy) sin confiar ciegamente en el header.

### F-013 · Paso 3.6 · Al crear una estructura nueva queda activa la "por defecto", no la recién creada
- Fecha: 2026-07-09
- Fase/Paso: Paso 3.6
- Módulo/Pantalla: Estructura organizacional / crear estructura (wizard "crear área")
- Tipo: bug
- Severidad: S3
- Qué hice (repro): En el paso 3.6 creé una estructura nueva y finalicé el asistente.
- Esperado: Al finalizar, quedar posicionado con la estructura recién generada como activa.
- Real: Queda activada la estructura "por defecto", no la recién creada.
- Evidencia:
- Estado: NUEVO
- Notas: Revisar si el provision atómico debería fijar la estructura nueva como activa del usuario al terminar.

### F-014 · Paso 3.8 · PENDIENTE DE PROBAR — no verificable con la licencia actual (50 nodos)
- Fecha: 2026-07-09
- Fase/Paso: Paso 3.8
- Módulo/Pantalla: (según paso 3.8 del smoke) — relacionado con límite de nodos de la licencia
- Tipo: duda
- Severidad: S4
- Qué hice (repro): No se pudo ejecutar el paso 3.8 en esta sentada.
- Esperado: (a probar) Lo que valida el paso 3.8.
- Real: No probado. La licencia actual es de 50 nodos y no permite reproducir el escenario ahora.
- Evidencia:
- Estado: NUEVO
- Notas: ⏳ RECORDATORIO SOLICITADO POR EL DUEÑO — retomar el paso 3.8 cuando se pueda (otra licencia / más nodos). Pendiente de probar, no es un defecto confirmado.

### F-015 · Paso 4.1 · Categorías por defecto genéricas (no ad-hoc al rubro) — proponer seeding por rubro o vacío
- Fecha: 2026-07-10
- Fase/Paso: Paso 4.1
- Módulo/Pantalla: Categorías (lista de categorías por defecto)
- Tipo: mejora
- Severidad: S4
- Qué hice (repro): En el paso 4.1 revisé la lista de categorías por defecto.
- Esperado: Que no aparezcan categorías que no corresponden al contexto/rubro.
- Real: Aparece un listado por defecto genérico, no ad-hoc a la estructura.
- Evidencia:
- Estado: NUEVO
- Notas: Idea del dueño (a definir enfoque en procesamiento): opciones — (a) categorías pre-cargadas por RUBRO de la estructura, (b) preguntar al usuario si desea cargar un set según el rubro, o (c) dejarlas vacías para no mostrar cosas que no correspondan. Contrastar con cómo lo hacen sistemas grandes (plantillas/starter data por industria). Pregunta abierta del dueño: "¿cómo lo hacen los sistemas grandes?" (responder en procesamiento).

### F-016 · Paso 4.1 · El botón "Nueva Categoría" se pierde con muchas categorías (debería estar siempre visible)
- Fecha: 2026-07-10
- Fase/Paso: Paso 4.1
- Módulo/Pantalla: Categorías / mantenedor de categorías
- Tipo: UX
- Severidad: S3
- Qué hice (repro): En el paso 4.1, con muchas categorías cargadas, busqué el botón "Nueva Categoría".
- Esperado: El botón "Nueva Categoría" debe estar siempre a la vista (sticky/fijo), sin importar cuántas categorías haya.
- Real: El botón se pierde (queda fuera de vista) cuando hay muchas categorías.
- Evidencia:
- Estado: NUEVO
- Notas:

### F-017 · Paso 4.1 · El mantenedor de categorías se sale del esquema, sin buscador; rediseñar (más potente)
- Fecha: 2026-07-10
- Fase/Paso: Paso 4.1
- Módulo/Pantalla: Categorías / mantenedor de categorías
- Tipo: UX
- Severidad: S3
- Qué hice (repro): En el paso 4.1 usé el mantenedor de categorías.
- Esperado: Un mantenedor coherente con el sistema de diseño, con buscador y capacidades más completas (más interesante y potente).
- Real: No sigue el esquema del resto del sistema, ni siquiera tiene buscador; se siente pobre.
- Evidencia:
- Estado: NUEVO
- Notas: Posible ítem mayor (rediseño) — evaluar en procesamiento si va al Catálogo maestro. Cruzar con las convenciones de grilla UI (filtros/buscador, paginación) ya establecidas para no duplicar patrones.

### F-018 · Paso 4.2 · El selector de categorías no tiene búsqueda (no escala con muchas)
- Fecha: 2026-07-10
- Fase/Paso: Paso 4.2
- Módulo/Pantalla: Categorías / selector (picker) de categoría
- Tipo: UX
- Severidad: S3
- Qué hice (repro): En el paso 4.2 usé el selector de categorías.
- Esperado: Selector con búsqueda/filtro, ágil e intuitivo, que escale cuando hay muchas categorías.
- Real: El selector no tiene búsqueda; con muchas categorías se vuelve difícil seleccionar.
- Evidencia:
- Estado: NUEVO
- Notas: Relacionado con F-017 (falta de buscador en el mundo de categorías). Reusar el patrón de picker con búsqueda ya existente en el sistema; no duplicar.

### F-019 · Paso 4.2 · La grilla de equipos no tiene buscador
- Fecha: 2026-07-10
- Fase/Paso: Paso 4.2
- Módulo/Pantalla: Equipos / grilla de equipos
- Tipo: UX
- Severidad: S3
- Qué hice (repro): En el paso 4.2 revisé la grilla de equipos.
- Esperado: La grilla debe tener buscador/filtro (según convenciones de grilla del sistema).
- Real: A la grilla de equipos le falta un buscador.
- Evidencia:
- Estado: NUEVO
- Notas: Relacionado con F-017/F-018 (patrón de búsqueda faltante). Aplicar la convención de grilla UI (filtros en una línea + paginación arriba/abajo); reusar componentes compartidos, no duplicar.

### F-020 · Paso 4.8 · Al cerrar el modal de competencias/restricciones no se refresca la grilla de personas (columna Impedimentos)
- Fecha: 2026-07-10
- Fase/Paso: Paso 4.8
- Módulo/Pantalla: Personas / competencias y restricciones (modal) + grilla de personas
- Tipo: bug
- Severidad: S3
- Qué hice (repro): En el paso 4.8 edité competencias/restricciones de una persona y cerré el modal.
- Esperado: Al cerrar el modal, la grilla de personas se refresca y la columna "Impedimentos" refleja el cambio.
- Real: La grilla de personas no se actualiza; la columna "Impedimentos" queda desactualizada.
- Evidencia:
- Estado: NUEVO
- Notas: Invalidar/refetch de la grilla al cerrar el modal (posible tema de cache de datos del cliente).

### F-021 · Paso 4.8 · El buscador de la grilla de personas no busca por cargo (debería ser búsqueda amplia)
- Fecha: 2026-07-10
- Fase/Paso: Paso 4.8
- Módulo/Pantalla: Personas / grilla de personas — buscador
- Tipo: UX
- Severidad: S3
- Qué hice (repro): En el paso 4.8 busqué un trabajador por su cargo en la grilla de personas.
- Esperado: Búsqueda amplia que incluya el cargo (y otros campos relevantes) para encontrar fácilmente a un trabajador.
- Real: El buscador no busca por cargo.
- Evidencia:
- Estado: NUEVO
- Notas: Ampliar los campos que abarca el buscador (nombre, cargo, etc.). Relacionado con el patrón de búsqueda (F-017/F-018/F-019).

### F-022 · Paso 4.8 · Al quitar el filtro de empresa contratista no se restablece la grilla
- Fecha: 2026-07-10
- Fase/Paso: Paso 4.8
- Módulo/Pantalla: Personas / grilla de personas — filtro por empresa contratista
- Tipo: bug
- Severidad: S3
- Qué hice (repro): En el paso 4.8 filtré por empresa contratista (funciona) y luego quité el filtro.
- Esperado: Al quitar el filtro, la grilla debe volver a mostrar todas las personas (restablecer).
- Real: Al quitar el filtro no hace nada; la grilla no se actualiza.
- Evidencia:
- Estado: NUEVO
- Notas: Revisar el clear/reset del filtro de empresa contratista.

### F-023 · Paso 4.8 · Falta botón de refrescar en la grilla de personas
- Fecha: 2026-07-10
- Fase/Paso: Paso 4.8
- Módulo/Pantalla: Personas / grilla de personas
- Tipo: UX
- Severidad: S4
- Qué hice (repro): En el paso 4.8 no encontré un botón para refrescar la grilla.
- Esperado: Un botón de refrescar (consistente con el resto de grillas).
- Real: La pantalla no tiene botón de refrescar.
- Evidencia:
- Estado: NUEVO
- Notas: Reusar el componente RefreshButton compartido (features/shared) — no duplicar. Cruzar con F-020 (refresco de grilla).

### F-024 · (paso sin identificar) · En cambio de contraseña, el "ojo" solo está en "contraseña anterior", no en nueva ni repetir
- Fecha: 2026-07-10
- Fase/Paso: (sin identificar — el dueño no ubicó el paso exacto)
- Módulo/Pantalla: Cambio de contraseña (modal/ventana)
- Tipo: UX
- Severidad: S4
- Qué hice (repro): Abrí la ventana de cambio de contraseña.
- Esperado: El botón "ojo" (mostrar/ocultar) debe estar en los tres campos: contraseña anterior, nueva y repetir.
- Real: El "ojo" aparece solo en "contraseña anterior"; no está en "nueva" ni en "repetir".
- Evidencia:
- Estado: NUEVO
- Notas:

### F-025 · Inicio · Mensaje "No tienes permiso para realizar esta acción" al entrar (aparece ~10 s después)
- Fecha: 2026-07-10
- Fase/Paso: (sin identificar) — primer ingreso
- Módulo/Pantalla: Inicio (launchpad/cockpit del turno)
- Tipo: bug
- Severidad: S3
- Qué hice (repro): Entré por primera vez con el usuario Rodrigo Salas.
- Esperado: En la ventana principal de Inicio no debería aparecer un error de permiso.
- Real: Aparece el mensaje "No tienes permiso para realizar esta acción" en la ventana principal de Inicio, aproximadamente 10 segundos después de entrar.
- Evidencia:
- Estado: NUEVO
- Notas: El retardo (~10 s) sugiere una llamada asíncrona (tile/worklist) que devuelve 403. En procesamiento, identificar qué consulta del Inicio gatilla el 403 para ese usuario/rol y si el tile debería ocultarse por permiso en vez de mostrar el error.

### F-026 · Paso 5.1 · "No tienes permiso para realizar esta acción" en Calendario operacional (~10 s después)
- Fecha: 2026-07-10
- Fase/Paso: Paso 5.1
- Módulo/Pantalla: Calendario operacional
- Tipo: bug
- Severidad: S3
- Qué hice (repro): Con el usuario Rodrigo Salas entré a la opción "Calendario operacional".
- Esperado: No debería aparecer un error de permiso al abrir el calendario.
- Real: Aproximadamente 10 s después aparece el mensaje "No tienes permiso para realizar esta acción".
- Evidencia:
- Estado: NUEVO
- Notas: Mismo síntoma que F-025 (403 diferido ~10 s con Rodrigo Salas). Muy probable causa común: alguna consulta/tile que se ejecuta sin que el rol tenga el permiso. Agrupar F-025 + F-026 en procesamiento.

### F-027 · Paso 5.1 · Falta una descripción al mantenedor
- Fecha: 2026-07-10
- Fase/Paso: Paso 5.1
- Módulo/Pantalla: Calendario operacional / mantenedor (paso 5.1)
- Tipo: mejora
- Severidad: S5
- Qué hice (repro): En el paso 5.1 revisé el encabezado del mantenedor.
- Esperado: A juicio del dueño, la descripción debería mostrarse también en esa primera ventana (paso 5.1), no solo en el paso siguiente.
- Real: La descripción existe pero recién aparece en el paso siguiente, no en la primera ventana.
- Evidencia:
- Estado: NUEVO
- Notas: Aclaración del dueño (2026-07-10): no es un defecto (la descripción existe), pero sería mejor que también apareciera en la primera ventana del paso 5.1. Mejora de UX/consistencia.

### F-028 · Paso 5.2 · Los inputs de hora son muy pequeños, difíciles de operar
- Fecha: 2026-07-10
- Fase/Paso: Paso 5.2
- Módulo/Pantalla: Calendario operacional / edición de horas (paso 5.2)
- Tipo: UX
- Severidad: S3
- Qué hice (repro): En el paso 5.2 intenté ingresar/editar las horas.
- Esperado: Inputs de hora con áreas táctiles amplias (uso en terreno/tablet, mín. 44px), fáciles de operar.
- Real: Los inputs de hora son muy pequeños y se hace difícil operarlos.
- Evidencia:
- Estado: NUEVO
- Notas: Alinear con la regla de áreas táctiles 44px del sistema de diseño.

### F-029 · Paso 5.2 · El input de hora no acepta formato 24h (no permite 20:00, solo am/pm)
- Fecha: 2026-07-10
- Fase/Paso: Paso 5.2
- Módulo/Pantalla: Calendario operacional / input de hora (paso 5.2)
- Tipo: bug
- Severidad: S3
- Qué hice (repro): En el paso 5.2 intenté ingresar la hora 20:00.
- Esperado: Poder ingresar horas en formato 24h (ej. 20:00); idealmente respetar el formato regional/locale.
- Real: No permite 20:00; solo acepta am/pm (formato 12h).
- Evidencia:
- Estado: NUEVO
- Notas: Cruzar con la regla de formato regional (fechas/horas por locale). Operación industrial suele usar 24h. Relacionado con F-028 (mismos inputs de hora).

### F-030 · BLOQUEANTE · Rodrigo Salas sin acceso a ningún nodo de estructura (todas las pantallas dan "No tienes permiso")
- Fecha: 2026-07-10
- Fase/Paso: (transversal — desde Inicio y en adelante)
- Módulo/Pantalla: Transversal / ABAC alcance de datos por nodo de estructura
- Tipo: permiso/ABAC
- Severidad: S1
- Qué hice (repro): Operé como usuario Rodrigo Salas; intenté entrar a nodos de estructura y a varias pantallas.
- Esperado: Que Rodrigo Salas tenga el alcance/permisos necesarios para operar el smoke (o que el documento indique el setup previo requerido).
- Real: No tiene acceso a ningún nodo de estructura; todas las pantallas arrojan "No tienes permiso para realizar esta acción". El recorrido queda estancado.
- Evidencia:
- Estado: NUEVO
- Notas: Causa raíz probable común de F-025 y F-026 (403 diferido). Hipótesis del dueño: (a) falta de privilegios/alcance ABAC por nodo para Rodrigo Salas, o (b) al documento de smoke le faltó un paso de preparación (asignar alcance/rol/nodos). En procesamiento: verificar el rol/alcance de Rodrigo Salas y si el guion `docs/SMOKE_VISUAL_GLOBAL.md` debe incluir el setup de permisos. ⚠️ BLOQUEA la continuación del smoke con este usuario.
  · **CAUSA RAÍZ DIAGNOSTICADA (2026-07-10, a pedido del dueño):** NO es alcance ABAC — es un permiso de módulo que faltó. El rol **Planificador** (Paso 2.10 del smoke, línea 459) se crea con `module:templates:*`, `template:*`, `module:workflows:*`, `workflow:*`, `module:referencedata:*`, `referencelist:*`, `module:opscalendar:*`, `opscalendar:manage`, `schedule:*` — pero **NO** con `orgnode:read`. En el backend TODA lectura de estructura exige `orgnode:read` (`GET /structures`, `GET /nodes`, `GET /levels` → `@RequirePermission("orgnode:read")` en apps/watchlog-api/src/structure/structure.controller.ts:35/139/99). El selector global de estructura ("Estás en") se carga async en CADA pantalla y llama `GET /structures`/`/nodes` → sin `orgnode:read` da **403** en todas partes (de ahí el mensaje diferido ~10 s). **FIX (al procesar):** agregar `orgnode:read` al rol Planificador (o al usuario). **HUECO DEL SMOKE:** el Paso 2.10 debe incluir `orgnode:read` en los permisos del Planificador (prerequisito para colgar calendarios y programar rondas, ambos anclan a nodos). Explica F-025, F-026 y F-030 con una sola causa.

### F-031 · Paso 5.1 · Eliminar un calendario operacional no libera su código (al recrear con el mismo código dice "ya existe")
- Fecha: 2026-07-10
- Fase/Paso: Paso 5.1
- Módulo/Pantalla: Calendario operacional / mantenedor de calendarios
- Tipo: bug
- Severidad: S3
- Qué hice (repro): Creé un calendario operacional, lo eliminé (la eliminación se demoró), y luego intenté crear otro con el MISMO código.
- Esperado: Tras eliminar el calendario, su código debería quedar libre para reutilizarse.
- Real: Al recrear con el mismo código dice que "ya existe", aunque el calendario está eliminado.
- Evidencia:
- Estado: NUEVO
- Notas: Síntoma clásico de unicidad que NO excluye soft-deleted (índice único no filtra `deletedAt`), o de borrado lógico vs. físico. Anexo del dueño: "se demoró en eliminar" (posible latencia/UX del delete). En procesamiento: revisar la restricción de unicidad del código de calendario respecto de registros eliminados (decidir: unicidad solo sobre activos, o rehúso permitido, o hard-delete). No confirmar hasta contrastar con el código.

### F-032 · Paso 5.1 · Al cambiar de estructura, el panel derecho (calendario seleccionado) no se limpia
- Fecha: 2026-07-10
- Fase/Paso: Paso 5.1
- Módulo/Pantalla: Calendario operacional / mantenedor (layout maestro-detalle) + selector global de estructura
- Tipo: bug
- Severidad: S3
- Qué hice (repro): Con un calendario seleccionado (visible en el panel derecho), cambié la estructura activa desde el selector de la barra superior.
- Esperado: Al cambiar de estructura, tanto la lista izquierda como el panel derecho deben refrescarse/limpiarse (el detalle no debe seguir mostrando un calendario de la estructura anterior).
- Real: La lista izquierda se actualiza, pero el panel derecho no se limpia y sigue mostrando el calendario de la estructura anterior.
- Evidencia:
- Estado: NUEVO
- Notas: Falta resetear la selección/detalle al cambiar la estructura activa. Riesgo de operar sobre un registro de otra estructura (cross-estructura). Revisar en procesamiento si otros mantenedores maestro-detalle tienen el mismo patrón.

### F-033 · (transversal) · Duda de diseño: el planificador puede seleccionar AMBAS estructuras en el selector global — ¿correcto?
- Fecha: 2026-07-10
- Fase/Paso: (transversal — selector global de estructura, barra superior)
- Módulo/Pantalla: Selector global de estructura / visibilidad por estructura (ABAC)
- Tipo: permiso/ABAC
- Severidad: S3
- Qué hice (repro): Con el usuario Planificador (Rodrigo Salas) abrí el selector global de estructura de la barra superior.
- Esperado: (a definir) Que el usuario solo vea/seleccione las estructuras que le corresponden.
- Real: El planificador puede seleccionar AMBAS estructuras, no solo las suyas.
- Evidencia:
- Estado: NUEVO
- Notas: Duda de diseño del dueño. Decidir en procesamiento cuál es el comportamiento correcto: ¿el selector debe filtrar por las estructuras a las que el usuario tiene alcance/administración delegada, o ver todas es lo esperado (y el candado real está en los datos)? Cruzar con: alcance de datos por nodo (ABAC), administración delegada por estructura (StructureAdmin, ver Paso 2.14), y el permiso `orgnode:read` (F-030). Consistencia con la frontera L1 (aislamiento por estructura) vs. excepción Panorama. No confirmar si es bug hasta contrastar el diseño; puede ser comportamiento intencional.
  · **DECISIÓN/PREFERENCIA DEL DUEÑO (2026-07-10):** el selector debería **acotarse por privilegios** — el usuario solo debería poder seleccionar/conmutar a las estructuras que le correspondan (por alcance de datos y/o administración delegada), no a todas. En procesamiento: definir la regla exacta (¿unión de estructuras con alcance ABAC + delegadas?, ¿super-admin ve todas?) y aplicar el filtro al selector global manteniendo el candado de datos en backend. Elevar de "duda" a cambio de diseño acordado al procesar.

### F-034 · Paso 5.6 · No aparece el calendario activo en la ventana inicial
- Fecha: 2026-07-10
- Fase/Paso: Paso 5.6
- Módulo/Pantalla: Calendario operacional / ventana inicial (paso 5.7)
- Tipo: bug
- Severidad: S3
- Qué hice (repro): En el paso 5.7 abrí la ventana inicial del calendario.
- Esperado: Que se muestre cuál es el calendario ACTIVO en la ventana inicial.
- Real: No aparece el calendario activo.
- Evidencia:
- Estado: NUEVO
- Notas: Verificar en procesamiento si es que no hay indicador del calendario activo, o si no está resolviendo/mostrando el activo asignado a la estructura. Posible relación con F-031/F-032 (estado del calendario tras eliminar/cambiar estructura).

### F-035 · Paso 5.7 · Dos pestañas casi iguales ("Periodo" y "Periodos") confunden
- Fecha: 2026-07-10
- Fase/Paso: Paso 5.7
- Módulo/Pantalla: Calendario operacional (paso 5.7) — pestañas
- Tipo: UX
- Severidad: S4
- Qué hice (repro): En el paso 5.7 vi las pestañas disponibles.
- Esperado: Nombres de pestañas claros y diferenciables, que no se confundan entre sí.
- Real: Hay dos pestañas: una dice "Periodo" y otra "Periodos"; los nombres tan parecidos inducen a confusión.
- Evidencia:
- Estado: NUEVO
- Notas: Renombrar para diferenciar la función de cada pestaña (no es solo un plural). Definir en procesamiento etiquetas que expresen qué hace cada una.

### F-036 · Paso 5.7 · La pestaña "Periodos" da "No tienes permiso" con Planificador (falta otro privilegio)
- Fecha: 2026-07-10
- Fase/Paso: Paso 5.7
- Módulo/Pantalla: Calendario operacional / pestaña "Periodos" (calendario contable/fiscal)
- Tipo: permiso/ABAC
- Severidad: S3
- Qué hice (repro): En el paso 5.7, con el usuario Planificador (Rodrigo Salas), pinché la pestaña "Periodos".
- Esperado: Ver el contenido de "Periodos" (calendario contable/fiscal y sus períodos).
- Real: No aparece nada y sale el mensaje "No tienes permiso para realizar esta acción" (bloqueo).
- Evidencia:
- Estado: NUEVO
- Notas: Mismo tipo de causa que F-030: al rol Planificador le falta el permiso que gobierna el calendario contable/períodos fiscales. En el smoke, el calendario fiscal ("Fiscal Mensual") y sus períodos son tarea del Planificador (Pasos 5.x), pero el Paso 2.10 no le habría marcado la familia de permisos correspondiente.
  · **CAUSA RAÍZ DIAGNOSTICADA (2026-07-10):** la pestaña "Periodos" consume `GET /operational-periods`, gateado por **`opsperiod:view`** (apps/watchlog-api/src/operational-periods/operational-periods.controller.ts:31). Es una FAMILIA nueva `opsperiod:*` (`view`, `close`, `reopen`, `lock`, `unlock`), DISTINTA de `opscalendar:*`. El rol Planificador tiene `module:opscalendar:*`, `opscalendar:manage`, `schedule:*` pero NO `opsperiod:*` → 403. **FIX (al procesar):** agregar al Planificador `opsperiod:view` (mínimo para ver) y, si debe operar la gobernanza de períodos, `opsperiod:close`, `opsperiod:reopen`, `opsperiod:lock`, `opsperiod:unlock` (el "generar" ya lo cubre `opscalendar:manage`, controller:45). **HUECO DEL SMOKE:** el Paso 2.10 debe incluir la familia `opsperiod:*` en los permisos del Planificador. Relacionado con F-030 (patrón de permisos incompletos para Planificador).

### F-037 · Paso 5.7 · No queda claro de dónde sale / cómo se alimenta la columna "Responsable"
- Fecha: 2026-07-10
- Fase/Paso: Paso 5.7
- Módulo/Pantalla: Calendario operacional / pestaña Periodos — columna "Responsable"
- Tipo: UX
- Severidad: S4
- Qué hice (repro): En el paso 5.7 revisé la grilla de períodos y vi la columna "Responsable".
- Esperado: Entender de dónde sale y cómo se alimenta el valor de la columna "Responsable" (origen del dato y cómo se asigna).
- Real: No es claro de dónde proviene ni cómo se llena esa columna.
- Evidencia:
- Estado: NUEVO
- Notas: Aclarar en la UI (tooltip/ayuda) y/o en el guion del smoke el origen del "Responsable" del período. En procesamiento: verificar en el código de dónde se deriva (¿usuario que cierra?, ¿responsable asignado al período/calendario?) y documentarlo.

### F-038 · Paso 5.9 · "No tienes permiso" al intentar crear una nueva ronda
- Fecha: 2026-07-10
- Fase/Paso: Paso 5.9
- Módulo/Pantalla: Programación de rondas / crear nueva ronda
- Tipo: permiso/ABAC
- Severidad: S3
- Qué hice (repro): En el paso 5.9, con el usuario Planificador, intenté crear una nueva ronda.
- Esperado: Poder abrir el formulario y crear la ronda sin errores de permiso.
- Real: Vuelve a aparecer el mensaje "No tienes permiso para realizar esta acción".
- Evidencia: Traza de red del dueño (2026-07-10): `GET https://192.168.195.129/api/log-entries/templates` → **403 Forbidden**. Confirma que el picker de plantillas de la ronda llama al endpoint de bitácoras gateado por `logentry:create` (log-entries.controller.ts:58-59).
- Estado: NUEVO
- Notas: El rol Planificador SÍ tiene `schedule:*` (incluye crear ronda). Descartado que sea `orgnode:read` (el dueño confirmó que ya se lo agregó).
  · **CAUSA RAÍZ DIAGNOSTICADA (2026-07-10 · ACOPLAMIENTO ENTRE MÓDULOS):** El formulario de nueva ronda (`ScheduleDrawer`, apps/watchlog-web/src/features/schedules/ScheduleDrawer.tsx:12,64) carga los nodos elegibles de la plantilla vía `fetchTemplateEligibleNodes` → `GET /log-entries/templates/:templateId/nodes`, endpoint que exige **`logentry:create`** (apps/watchlog-api/src/log-entries/log-entries.controller.ts:84-91), NO `schedule:*` ni `orgnode:read`. El Planificador no tiene `logentry:create` (es del módulo de bitácoras/entradas) → 403 al llenar el picker de nodos de la ronda.
  · **DOS OPCIONES (decidir al procesar):** (a) PARCHE — dar `logentry:create` al Planificador: desbloquea pero es semánticamente incorrecto (le das permiso de crear entradas de bitácora solo para programar rondas; mezcla ejes). (b) FIX DE DISEÑO (RECOMENDADO) — el formulario de rondas no debe depender de un endpoint gateado por `logentry:create`; el "nodos elegibles por plantilla" debería autorizarse por `schedule:manage` (o endpoint propio de rondas / gate `orgnode:read`). Alinea con los principios (reutilizar sin forzar, no cruzar ejes de permiso). Relacionado con F-030 y F-036 (patrón de permisos del Planificador), pero causa DISTINTA.

### F-039 · Paso 6.1 · Se puede editar el código de la plantilla
- Fecha: 2026-07-10
- Fase/Paso: Paso 6.1
- Módulo/Pantalla: Plantillas / Form Builder — campo Código de la plantilla
- Tipo: bug
- Severidad: S3
- Qué hice (repro): En el paso 6.1 abrí/edité la plantilla y noté que el campo Código se puede modificar.
- Esperado: (a confirmar) El código suele ser un identificador estable; normalmente no debería editarse tras crear la plantilla (o solo bajo condiciones, con la versión no congelada).
- Real: El código de la plantilla es editable.
- Evidencia:
- Estado: NUEVO
- Notas: Confirmar en procesamiento si la editabilidad del código es intencional. Riesgos: el código suele usarse como clave/enlace estable (referencias, comodines `{{campo.<key>}}`, integraciones); cambiarlo podría romper enlaces. Definir la regla (inmutable tras crear, o editable solo mientras la versión está en borrador/no congelada).

### F-040 · Paso 6.3 · No se muestran los roles para elegir; 3× 403 (roles, users, notif templates) con Planificador
- Fecha: 2026-07-10
- Fase/Paso: Paso 6.3
- Módulo/Pantalla: Plantillas / Form Builder — selección de actores/firmantes (roles/usuarios) y plantilla de notificación por transición
- Tipo: permiso/ABAC
- Severidad: S3
- Qué hice (repro): En el paso 6.3, con el usuario Planificador, intenté elegir los roles; no aparecen para seleccionar.
- Esperado: Poder ver y elegir roles (y usuarios) y la plantilla de notificación, sin errores de permiso.
- Real: No se muestran los roles. En el network del navegador, 3 llamadas dan 403 Forbidden.
- Evidencia: Traza de red del dueño (2026-07-10): `GET /api/security/roles` → 403 ("No tienes permiso para esta acción"); `GET /api/security/users` → 403; `GET /api/notifications/templates?eventKey=entry.transition` → 403.
- Estado: NUEVO
- Notas: **CAUSA RAÍZ (acoplamiento entre módulos, mismo patrón que F-038):** el Form Builder lee endpoints de Seguridad y Notificaciones que el Planificador no tiene. Claves exactas: `GET /security/roles`→`role:read` (roles.controller.ts:25-26); `GET /security/users`→`user:read` (users.controller.ts:29-30); `GET /notifications/templates`→`notiftemplate:manage` (notifications.controller.ts:72-73). **OLOR DE DISEÑO:** el GET de notif templates exige un permiso de `manage` para solo LEER (faltaría un `notiftemplate:view`). **OPCIONES (al procesar):** (a) dar al Planificador lecturas `role:read` + `user:read` (razonable: un planificador asigna actores) y resolver notif templates con un permiso de lectura nuevo `notiftemplate:view` (mejor que darle `notiftemplate:manage`); o (b) revisar que el builder no exija manage para leer. Relacionado con F-030/F-036/F-038 (permisos incompletos + acoplamiento del Planificador).

### F-041 · Paso 6.3 · Al guardar borrador aparecen 2 toasts "Guardado" + 1 error rojo de permisos
- Fecha: 2026-07-10
- Fase/Paso: Paso 6.3
- Módulo/Pantalla: Plantillas / Form Builder — guardar borrador
- Tipo: bug
- Severidad: S3
- Qué hice (repro): En el paso 6.3 pulsé "Guardar borrador".
- Esperado: Un único mensaje de resultado coherente (un "Guardado" si tuvo éxito, o un error claro si falló — no ambos).
- Real: Aparecen 2 mensajes "Guardado" y además uno en rojo con problema de privilegios.
- Evidencia:
- Estado: NUEVO
- Notas: Dos defectos aquí: (1) toast de éxito DUPLICADO ("Guardado" ×2); (2) mensajes CONTRADICTORIOS (éxito + error de permiso a la vez). El error rojo probablemente proviene de una de las llamadas 403 de F-040 disparada durante el guardado (roles/users/notif templates). En procesamiento: deduplicar el toast de éxito y no mostrar error de permiso si la operación principal (guardar borrador) tuvo éxito; separar el fallo de carga auxiliar del resultado del guardado. Relacionado con F-040.

### F-042 · Paso 6.3 · Al publicar aparecen 2 toasts "Borrador guardado" y luego uno "Publicado"
- Fecha: 2026-07-10
- Fase/Paso: Paso 6.3
- Módulo/Pantalla: Plantillas / Form Builder — publicar versión
- Tipo: UX
- Severidad: S4
- Qué hice (repro): En el paso 6.3 pulsé "Publicar".
- Esperado: Un único mensaje coherente al publicar (ej. solo "Publicado"), sin toasts intermedios repetidos.
- Real: Aparecen 2 mensajes "Borrador guardado" (o similar) y luego otro "Publicado".
- Evidencia:
- Estado: NUEVO
- Notas: Toasts redundantes/confusos: la publicación parece guardar borrador (×2) y luego publicar, emitiendo 3 mensajes. Deduplicar y mostrar solo el resultado final relevante. Mismo patrón de toasts duplicados que F-041.
  · **REGLA GLOBAL DEL DUEÑO (2026-07-10):** por cada acción SIEMPRE debe aparecer UN SOLO mensaje (un único toast de resultado). Aplica de forma transversal a toda la app, no solo a este paso. En procesamiento: tratar F-041 y F-042 bajo esta convención y revisar otros flujos con toasts duplicados. Candidata a convención UI en packages/ui / USER_GUIDE. (Guardada en memoria: single-toast-per-action.)

### F-043 · Paso 6.8 · "Visible when" no aparece — NO es bug: se oculta si no hay campo booleano (+ limitación de alcance)
- Fecha: 2026-07-10
- Fase/Paso: Paso 6.8
- Módulo/Pantalla: Plantillas / Form Builder — lógica condicional (visibilidad condicional del campo)
- Tipo: UX
- Severidad: S4
- Qué hice (repro): En el paso 6.8 busqué la opción "visible when".
- Esperado: Ver y poder configurar la condición "visible when".
- Real: No aparece el control "visible when".
- Evidencia:
- Estado: TRIAGED
- Notas: **VERIFICADO EN CÓDIGO (2026-07-10) — la feature EXISTE de punta a punta, NO falta implementar:** contratos `visibleWhen` (packages/contracts/src/templates/field-types.ts:1169; templates.ts:129), evaluación en runtime (packages/contracts/src/log-entries/log-entries.ts:971-977) y editor en el builder (apps/watchlog-web/src/features/templates/BuilderConfigPanel.tsx:1010). **POR QUÉ NO SE VE:** el selector se renderiza solo si `booleanFields.length > 0` (BuilderConfigPanel.tsx:1009): si el template aún no tiene un campo booleano (checkbox/toggle) que sirva de disparador, el control se OCULTA sin aviso. **DOS PUNTOS REALES (no-bug, pero mejorables):** (1) descubribilidad — cuando no hay campo booleano, mostrar un hint tipo "Agrega un campo Sí/No para poder condicionar la visibilidad" en vez de esconder el control; (2) ALCANCE del motor — hoy solo soporta "visible cuando <campo booleano> = true"; no condiciona por otros tipos ni operadores (igual-a-valor, rangos). Evaluar en procesamiento si (2) va al Catálogo maestro como mejora del Form Builder. Cruzar con plan Fase 2 Form Builder y FORM_GUIDE.
  · **CONFIRMADO (2026-07-10):** el "visible when" aplica a CUALQUIER elemento, incluidos presentacionales (STATIC_TEXT/párrafo, HEADING, NOTICE): el selector del builder no está restringido por tipo (BuilderConfigPanel.tsx render continuo, sin corte por tipo antes de la línea 1009) y el runtime filtra TODOS los fields de la sección con isFieldVisible (EntryFillPage.tsx:703, EntryViewerPage.tsx:510). O sea, SÍ se puede tener un párrafo visible según una condición ("cuando <campo booleano> = true"); solo requiere que exista un campo booleano en el template.

### F-044 · Paso 6.8 · El ejemplo del smoke (condicionar por "Modo de falla") no es posible como está escrito
- Fecha: 2026-07-10
- Fase/Paso: Paso 6.8
- Módulo/Pantalla: Plantillas / Form Builder — campo condicional (visibleWhen) + guion del smoke
- Tipo: texto/label
- Severidad: S3
- Qué hice (repro): Seguí la instrucción del smoke: "agrega un Párrafo 'Detalle de la falla' y configúralo con «Mostrar solo si»: elige el campo Modo de falla (o un Sí/No asociado)…". No encontré cómo hacerlo.
- Esperado: Poder condicionar el párrafo como describe el guion.
- Real: El control "Mostrar solo si" no aparecía; y no se puede condicionar directamente sobre "Modo de falla" (desplegable).
- Evidencia:
- Estado: NUEVO
- Notas: DOS causas ya verificadas (ver F-043): (1) el control se oculta si no hay ningún campo Sí/No en el template (guarda `booleanFields.length > 0`); (2) el motor solo condiciona por campo BOOLEANO = true, no por un desplegable como "Modo de falla". El guion del smoke induce a error al sugerir condicionar por "Modo de falla": debería instruir explícitamente crear primero un campo Sí/No (p.ej. "¿Se registró una falla?") y condicionar el párrafo sobre ÉSE. **DOS ACCIONES (al procesar):** (a) corregir el texto del Paso 6.8 en docs/SMOKE_VISUAL_GLOBAL.md; (b) considerar ampliar el motor visibleWhen a operadores sobre listas/valores (mejora del Form Builder → Catálogo maestro). Relacionado con F-043.

### F-045 · (Form Builder) · "Obligar a justificar cuando un valor supera X": SE PUEDE hoy (reglas cruzadas); ocultar por umbral = mejora
- Fecha: 2026-07-10
- Fase/Paso: (relacionado con Paso 6.8 — lógica condicional)
- Módulo/Pantalla: Plantillas / Form Builder — motor de reglas cruzadas (Req-7) vs. visibleWhen
- Tipo: duda
- Severidad: S4
- Qué hice (repro): Pregunta del dueño: cómo obligar a poner un párrafo/explicación cuando un valor supera un umbral (o cualquier condición).
- Esperado: Poder forzar una justificación condicional y/o mostrar un elemento según una condición numérica.
- Real: (verificado en código) Ver desglose abajo.
- Evidencia:
- Estado: TRIAGED
- Notas: **VERIFICADO EN CÓDIGO (2026-07-10):** (A) **OBLIGAR A EXPLICAR cuando valor > X → SE PUEDE HOY** con el motor de reglas cruzadas (Req-7, packages/contracts/src/rules/rules.ts): una regla `{ when: and(gt(var:medicion,X), isEmpty(var:motivo)), severity: ERROR, message: "..." }` bloquea el sello mientras el motivo esté vacío y el valor exceda el umbral (operadores gt/gte/lt/lte/eq/and/or/not/isEmpty en expression.ts:34-66; ERROR bloquea, WARN avisa, rules.ts:42-43; opcional `action` abre incidencia/excepción). ⇒ campo "obligatorio condicional" ya soportado. NO es bug ni falta. (B) **MOSTRAR/OCULTAR un elemento según umbral numérico → NO hoy** (visibleWhen solo dispara por Sí/No=true) ⇒ MEJORA: unificar `visibleWhen` con los operadores del motor de expresiones (condicionar visibilidad por valor/rango). Candidata al Catálogo maestro como mejora del Form Builder. Relacionado con F-043/F-044 y [[rules-engine]]. En procesamiento: si el smoke no muestra el motor de reglas para este caso, agregar el ejemplo (regla ERROR de justificación fuera de umbral) al guion/USER_GUIDE/FORM_GUIDE.

### F-046 · MEJORA · "Visible when" general: cualquier objeto visible según una o varias condiciones sobre los campos del formulario
- Fecha: 2026-07-10
- Fase/Paso: (Form Builder — lógica condicional)
- Módulo/Pantalla: Plantillas / Form Builder — visibilidad condicional (visibleWhen)
- Tipo: mejora
- Severidad: S3
- Qué hice (repro): Solicitud de mejora del dueño.
- Esperado: Que CUALQUIER objeto del formulario (campo, párrafo, encabezado, aviso, sección, etc.) pueda tener un "visible when" que se cumpla cuando UNA o VARIAS condiciones sobre los objetos presentados en el formulario sean verdaderas.
- Real: Hoy `visibleWhen` solo soporta UNA condición simple y solo con disparador booleano (`<campo Sí/No> = true`); no permite múltiples condiciones ni otros tipos/operadores.
- Estado: NUEVO → candidato a DIFERIDO→BACKLOG (Catálogo maestro)
- Notas: **MEJORA de alcance del Form Builder.** Generalizar `visibleWhen` para: (1) condicionar por cualquier tipo de campo y operadores (gt/gte/lt/lte/eq/isEmpty, etc.), (2) combinar varias condiciones (and/or/not), (3) aplicar a cualquier objeto (incluidos presentacionales y, si aplica, secciones). **PRINCIPIO CLAVE (build-principles-lyra, CERO duplicidad):** REUSAR el motor de expresión seguro que YA existe (packages/contracts/src/rules/expression.ts, AST sin eval) en vez de crear un mini-lenguaje nuevo — unificar `visibleWhen` con el mismo motor del Req-7 (reglas cruzadas/formulados). El servidor sigue siendo autoritativo (evalúa visibilidad y required condicional). Consolida F-043 (descubribilidad + límite booleano), F-044 (ejemplo del smoke no factible) y F-045(B) (ocultar por umbral). En procesamiento: enlazar/crear ítem en el ⭐ Catálogo maestro de docs/BACKLOG.md SIN duplicar; considerar también "required when" condicional con el mismo motor (hoy se suple con reglas ERROR, F-045(A)). Relacionado con [[rules-engine]] y [[fase2-formbuilder-plan]].

---

## Índice de triage (se completa al PROCESAR)
| ID | Fase | Módulo | Sev | Tipo | Resumen | Decisión | Estado |
|----|------|--------|-----|------|---------|----------|--------|
| — | — | — | — | — | (vacío hasta el primer procesamiento) | — | — |
