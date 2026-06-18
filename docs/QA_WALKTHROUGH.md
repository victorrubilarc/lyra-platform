# QA Walkthrough — Lyra WatchLog (validación end-to-end)

> Recorrido **guiado** de la app simulando una planta real (concentradora de cobre
> **«Faena Demo QA»**), antes de la Fase 5. NO es una fase de construcción: es PROBAR
> todo de punta a punta. Los hallazgos se registran en §HALLAZGOS (y en `docs/BACKLOG.md`).
>
> Escenario sembrado por `scripts/seed-demo-planta.py` (idempotente; `--clean` lo borra).
> Última siembra: **2026-06-18**.

---

## 0. El escenario (qué se sembró)

| Bloque | Contenido |
|---|---|
| Estructura | `Faena Demo QA` → 4 áreas (Chancado y Molienda · Flotación · Espesamiento · Servicios) → 11 procesos → 2 líneas (SAG 1/2). Códigos ERP/CMMS en `externalCode` (`DEMOQA-*`). 4º nivel «Línea» creado. |
| Equipos | 13 activos (chancador, molinos SAG/Bolas, celdas, columnas, espesadores, bombas, compresor) con criticidad. Tags `DQ-*`. |
| Datos de referencia | 3 listas: motivos de detención, tipos de falla, EPP (`demoqa-*`). |
| Calendarios | Operacional `demoqa-faena` (turnos **A** 08:00 / **B** 20:00, 12 h) asignado a toda la faena + fiscal mensual `demoqa-fiscal`. |
| Plantilla | `[DEMO QA] Bitácora de Turno — Molienda`: 2 secciones multi-actor (operador llena / supervisor revisa, `editableInStateKey=enviado`), tipos NUMBER (umbral→excepción), BOOLEAN, SELECT/MULTISELECT (listas), REFERENCE (equipo), MATRIX, TABLE, ATTACHMENT (foto), CONFORMITY, TEXTAREA; lógica condicional (motivo visible si hubo detención); **regla que abre incidencia** si temp molino > 100 °C. |
| Flujo bitácora | `demoqa-bitacora-turno`: borrador→enviado→revisado→cerrado; transiciones role-gated; **firma Part 11** (revisar/aprobar), **MFA** (aprobar), **SLA de permanencia** 12 h en «enviado». |
| Catálogo incidencias | SLA + escalamiento (al **Jefe de Planta**) en tipos mantenimiento/seguridad/operacional. Obligación de reporte mandatory sev≥4 (del seed base). |
| Rondas | 2 programaciones SHIFT (Molienda SAG / Flotación Rougher) con responsable por rol; ocurrencias generadas (3 forzadas **vencidas**). |
| Histórico (8 sem.) | **64 incidencias** envejecidas por SQL: 50 cerradas (MTTR/% SLA), 8 con plazo vencido, varias con permanencia excedida, pares de **reincidencia** (mismo tipo+equipo); **14 CAPA** (estados variados) y **12 reportes** (pendientes/vencidos/enviados). |
| En vivo | 3 incidencias recientes `[DQA]` para el recorrido manual. |
| Notificaciones | 30 avisos materializados en outbox (correo→Mailpit + in-app). |

**Re-sembrar / limpiar:**
```
python scripts/seed-demo-planta.py            # crea/actualiza (idempotente)
python scripts/seed-demo-planta.py --clean    # borra SOLO el escenario demo
python scripts/seed-demo-planta.py --no-history  # sin el histórico envejecido
```
Servicios: API :3000 · web :5173 · Mailpit http://localhost:8025 · Postgres `lyra-watchlog-dev-postgres-1`.

---

## 1. Credenciales (todas: `Demo!Pass2026`, ACTIVE, sin cambio forzado)

| Usuario | Persona / rol | Alcance (ABAC) | Para probar |
|---|---|---|---|
| `admin@planta.local` | Ana — Administrador global | Toda la faena | Todo, configuración, seguridad |
| `jefe.planta@planta.local` | Jorge — Jefe de Planta | Toda la faena | Aprobaciones; **rol de ESCALAMIENTO** SLA; `requireMfa=true` |
| `sup.molienda@planta.local` | Sofía — Supervisora Molienda | Solo Chancado/Molienda | Revisar/firmar; ABAC (NO ve Flotación) |
| `sup.flotacion@planta.local` | Felipe — Supervisor Flotación | Solo Flotación | ABAC contraste (NO ve Molienda) |
| `op.molienda@planta.local` | Olivia — Operadora Molienda | Solo Molienda SAG | Llenar bitácoras, Mis rondas, reportar |
| `mantenedor@planta.local` | Mauricio — Mantenedor | Chancado/Molienda + Servicios | Equipos, **ejecutar** CAPA |
| `hse@planta.local` | Helena — Prevención/HSE | Toda la faena | Investigación 5-Porqués, reportabilidad, **verificar** CAPA |
| `auditor@planta.local` | Augusto — Auditor (RO) | Toda la faena | Auditoría; NO puede editar |
| `configurador@planta.local` | Camila — Configurador | Toda la faena | Plantillas, flujos, datos ref., calendarios |

**Segregación de funciones:** operador/supervisor **gestionan** CAPA (`incident:action:manage`), HSE **verifica** eficacia (`incident:action:verify`); el escalamiento de SLA va al Jefe de Planta.

---

## 2. Recorrido guiado (13 bloques)

> En cada bloque: con qué usuario, qué ruta, qué hacer y el resultado esperado.
> Tras cada bloque, párate y reporta lo que viste antes de avanzar.

### Bloque 1 — Acceso y cuenta
- Login de cada persona (verificar que entran sin cambio forzado).
- Como `jefe.planta`: activar MFA (TOTP) en el perfil; reset de contraseña (admin); cambio forzado (admin resetea a otro y verificar pantalla de cambio).
- **Esperado:** todos entran; MFA enrolable; reset fuerza cambio.

### Bloque 2 — Configuración base (`configurador` / `admin`)
- Estructura: ver `Faena Demo QA` y subárbol; equipos por nodo; códigos ERP/CMMS.
- Datos de referencia: ver listas; export/import CSV (dry-run).
- Calendarios: ver turnos A/B; probador de turno (instante→turno); calendario fiscal.
- **Esperado:** todo visible y editable según permiso.

### Bloque 3 — Seguridad (`admin`)
- Matriz de permisos (4 dimensiones) de cada rol demo; scopes por nodo; `requireMfa` por rol.
- Cambiar un permiso/alcance y confirmar que se refleja en lo que el usuario ve.
- **Esperado:** RBAC + ABAC editable; el cambio impacta la UI del usuario.

### Bloque 4 — Plantillas / Form Builder (`configurador`)
- Abrir `[DEMO QA] Bitácora de Turno — Molienda`: secciones multi-actor, tipos de campo, umbral, lógica condicional (motivo visible si hubo detención), la **regla** que abre incidencia, diseñador visual.
- **Esperado:** versión publicada; campos y reglas visibles.

### Bloque 5 — Flujos (`configurador`)
- Abrir `demoqa-bitacora-turno`: estados/transiciones, firma Part 11/MFA, SLA de permanencia (12 h en «enviado»).
- **Esperado:** flujo publicado coherente.

### Bloque 6 — Rondas (`op.molienda`)
- `/rondas` (programación, read-only) y `/mis-rondas`: iniciar una ronda (crea entrada), omitir otra; ver las **vencidas**.
- **Esperado:** worklist filtra por rol+nodo; vencidas marcadas.

### Bloque 7 — Bitácoras (`op.molienda` → `sup.molienda`)
- Como operador: llenar una entrada por secciones, meter **temp ≥ 100** (excepción + abre incidencia por regla al sellar), adjuntar foto, enviar.
- Como supervisor: revisar la sección «Revisión», **firmar** (Part 11).
- **Esperado:** excepción generada; incidencia `originType=RULE` tras correr el worker.

### Bloque 8 — Excepciones
- Panel en la entrada + bandeja global `/excepciones`; triage: reconocer / corregir (reauth) / convertir a incidencia / descartar crítica (permiso superior) / dedup.
- **Esperado:** flujo de triage completo; trazabilidad campo→excepción→incidencia.

### Bloque 9 — Incidencias
- Reportar manual + desde bitácora + ver la nacida de la **regla**; kanban + detalle; asignar; transición con **firma**; CAPA (crear→ejecutar `mantenedor`→verificar `HSE`, probar **bloqueo de cierre**); investigación 5-Porqués; reportabilidad (obligación→plazo→enviar con folio); editar plazo (SLA).
- **Esperado:** cierre bloqueado por CAPA/investigación/reporte obligatorio.

### Bloque 10 — SLA + Escalamiento + Notificaciones
- Dejar una incidencia/acción/reporte vencidos; correr worker (`POST /api/notifications/run`); ver aviso en **Mailpit** (:8025) + **campanita** in-app (badge, bandeja, tiempo real con 2 pestañas); confirmar **escalamiento al Jefe de Planta**; preferencias por canal (opt-out correo NO silencia campanita).
- **Esperado:** correo + in-app + escalamiento.

### Bloque 11 — Dashboard de incidencias
- `/incidencias/dashboard` (rango 8 semanas): KPIs (vivo vs periodo), tendencia, Pareto, reincidencia, drill-down (clic→lista filtrada), export CSV.
- **ABAC:** como `sup.flotacion` confirmar que **NO ve Molienda**; admin sí ve todo. *(Verificado por seed: flotación=3 nodos flotación; molienda=5 nodos molienda; admin=12.)*
- **Esperado:** KPIs poblados; ABAC respetado.

### Bloque 12 — Auditoría (`auditor`)
- Lectura inmutable quién/qué/cuándo/antes-después; confirmar que el auditor **NO puede editar**.
- **Esperado:** solo lectura; export de auditoría.

### Bloque 13 — Workspace
- Pestañas, ⌘K, favoritos, sidebar por grupos, tema claro/oscuro, idioma; responsive/tablet.
- **Esperado:** shell premium coherente en ambos temas.

---

## 3. Checklist por módulo

- [ ] Acceso / MFA / reset / cambio forzado
- [ ] Estructura + equipos + códigos externos
- [ ] Datos de referencia + import/export CSV
- [ ] Calendarios (operacional + fiscal + probador)
- [ ] Seguridad (4 dimensiones + scopes + requireMfa)
- [ ] Form builder (tipos, umbral, condicional, regla, diseñador)
- [ ] Flujos (firma, MFA, SLA permanencia)
- [ ] Rondas (programación + Mis rondas + vencidas)
- [ ] Bitácoras (llenar por secciones, fuera de umbral, foto, firmar, sellar)
- [ ] Excepciones (panel + bandeja + triage completo)
- [ ] Incidencias (manual/bitácora/regla, kanban, CAPA, investigación, reportabilidad, SLA)
- [ ] SLA + escalamiento + notificaciones (correo + campanita + tiempo real)
- [ ] Dashboard (KPIs, Pareto, reincidencia, drill-down, CSV, ABAC)
- [ ] Auditoría (inmutable; auditor sin edición)
- [ ] Workspace (pestañas, ⌘K, favoritos, temas, idioma, responsive)

---

## 4. HALLAZGOS

> Formato: `[#N] (bug | mejora UX | duda) · módulo · severidad · descripción · estado`.
> Cada hallazgo se replica en `docs/BACKLOG.md`.

| # | Tipo | Módulo | Sev | Descripción | Estado |
|---|---|---|---|---|---|
| — | — | — | — | _(se llena durante el recorrido)_ | — |
