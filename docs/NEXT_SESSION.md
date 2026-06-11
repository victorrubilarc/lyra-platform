# Prompt para la próxima sesión — Aprobar plan post-2.6.0 + Fase 2.7.0 Registro diferido (#1)

> Documento de traspaso. Pega el bloque de abajo al iniciar la sesión siguiente.
> Generado al cierre del Afinamiento #4 (2026-06-11). El texto íntegro de las 10 mejoras
> del dueño del producto quedó en el historial de git de este archivo (commit db17981)
> y su triage en `docs/BACKLOG.md` §2 + `docs/DECISIONS.md` 2026-06-11.

---

```
Continuamos Lyra WatchLog (g:\Development\BitacorasInteligentes). Ejecuta la rutina de arranque de CLAUDE.md ANTES de nada: lee CLAUDE.md y docs/ (PROGRESS, ARCHITECTURE, DATA_MODEL, SECURITY, DECISIONS, AUTH_FLOW y BACKLOG). Revisa tu memoria persistente (MEMORY.md), en especial fase2-formbuilder-plan.md y prototype-location.md (mira prototipo.tsx antes de tocar UI). No des nada por sentado: verifica en el código y en git.

Verifica publicación: git rev-list --count origin/main..main = 0 y árbol limpio; el último commit en origin/main debe ser 5941764 (merge del Afinamiento #4) o posterior.

CONTEXTO (cerrado y publicado): Fase 1 completa; Fase 2.1/2.1.1/2.2/2.x/2.3.0/2.4/2.5/2.6.0 cerradas; Afinamiento #4 cerrado (guardado por sección autoexplicativo: DTO con blockedReason ENTRY_CLOSED|WRONG_STATE|MISSING_ROLE + assignedRoleNames + readOnlyFieldKeys; submit OBJETIVO que exige todas las secciones COMPLETED; override por campo solo bloquea el CAMBIO; UI con progreso/asignación/motivos y acciones "Guardar avance"/"Completar sección"). Las 10 mejoras post-2.6.0 están registradas en BACKLOG §2 y el PLAN DE FASES está PROPUESTO en DECISIONS 2026-06-11: 2.7 Gobernanza temporal (#1 diferido → #5 período gobernado → #6 ventana de edición → #7 matriz sección×tiempo) → 2.8 Alcance+acceso (#2 multi-nodo + #9 UX, fusiona 2.6.1 SavedView) → 2.9 Plantillas inteligentes (#3 layouts + #8 motor de reglas). #10 IA-ready transversal. Tests: contracts 115 · permissions 5 · API 161. Permisos catálogo en 50.

== OBJETIVO DE ESTA SESIÓN (en orden) ==

1. PRESÉNTAME el plan de fases de DECISIONS 2026-06-11 en resumen (fases, sub-slices, orden recomendado y por qué) y ESPERA mi visto bueno o ajustes. No codees nada de las fases grandes antes de eso.

2. Con el plan aprobado, ejecuta la Fase 2.7.0 — REGISTRO DIFERIDO (#1) como objetivo único, cerrable y publicable de esta sesión. Pedido original del dueño del producto: por defecto la entrada es "en línea" (fecha/hora automática), pero el operador puede declarar registro DIFERIDO indicando la fecha/hora real del evento con un gesto mínimo (toggle o link "Registrar con otra fecha/hora"), sin complejidad extra. Toda entrada diferida queda MARCADA en modelo y audit trail: fecha/hora del evento vs fecha/hora de registro, y quién la registró.

== LO QUE YA EXISTE (no lo rediseñes) ==
- El modelo temporal está resuelto: LogEntry.recordedAt (cuándo se registró, inmutable) vs LogEntry.effectiveAt (cuándo ocurrió; deriva del campo con semanticRole=EFFECTIVE_DATE vía resolveEffectiveAt, fallback recordedAt; recalcula en DRAFT y se CONGELA al sellar). ShiftResolver estampa shiftCode/operationalDate/periodKey desde effectiveAt. NO toques esa mecánica: constrúyele la UX y la marca encima.
- El record viewer (/bitacoras/:id) ya muestra ambas fechas; la grilla filtra por rangos de effectiveAt y recordedAt.

== LO QUE FALTA (alcance de 2.7.0) ==
- Marca EXPLÍCITA y declarada (no inferida): LogEntry.entryOrigin ONLINE|DEFERRED (migración aditiva) + motivo del diferimiento. GxP/ALCOA+: la entrada tardía es legítima si queda IDENTIFICADA como tal (qué ocurrió cuándo vs cuándo se registró y quién); lo fraudulento es ocultarlo.
- UX de gesto mínimo en la creación/llenado (mirar prototipo.tsx antes): declarar "registro con otra fecha/hora" + fecha/hora real del evento + motivo.
- Huella visible: chip/indicador "Diferida" en la pantalla de llenado, en la grilla /bitacoras (+ filtro entryOrigin en el query/contrato y en export CSV) y en el record viewer; evento o metadato en la timeline ALCOA+.
- Auditoría (AuditLog) del diferimiento.
- La validación contra período contable (#5) y ventana de edición (#6) llega en 2.7.1/2.7.2 — diseña entryOrigin para que esas guardas se le sumen sin migrar.

== FORKS A PROPONERME ANTES DE CODEAR (con recomendación fundada) ==
1. ¿Dónde se declara la fecha del evento? La plantilla puede o no tener campo EFFECTIVE_DATE. Opciones: (a) el gesto escribe ese campo si existe y, si no, una fecha declarada a NIVEL DE ENTRADA que alimente effectiveAt; (b) exigir el campo en la plantilla. Resuelve la interacción con resolveEffectiveAt sin duplicar fuentes de verdad.
2. ¿Motivo del diferido obligatorio u opcional (o configurable)? Contrasta con la práctica GxP de late entry.
3. ¿Umbral que distinga "en línea" de "diferido"? Mi línea: DECLARADO por el operador, no inferido por diferencia de relojes — confírmalo o rebátelo.

Respeta las reglas permanentes: una sesión = un objetivo cerrable y publicable; cambios aditivos; lo reutilizable a packages/; backend valida y autoriza SIEMPRE; nada hardcodeado que deba ser dato; publica antes de cerrar (rama feat/<modulo> → merge a main → push) y deja BACKLOG §1 sin pendientes. Registra en DECISIONS los forks resueltos y en BACKLOG lo diferido.

== ENTORNO (verifica que esté arriba) ==
API NestJS en watch en :3000 (NO lances nest build/pnpm build del API con el watch vivo — usa typecheck+test). Web Vite/HMR en :5173. Infra Docker arriba (postgres/redis/minio/mailpit). Usuario demo: demo@watchlog.local / Demo!Pass2026. Tras agregar permisos nuevos: pnpm --filter @lyra/watchlog-api db:seed y, si la caché de permisos da 403, invalida authz:perms:<userId> en Redis (docker exec lyra-watchlog-dev-redis-1 redis-cli). GOTCHAS Windows: prisma generate falla con EPERM al renombrar el DLL con el watch vivo (los .d.ts SÍ se regeneran → suficiente para typecheck); crea migraciones con prisma migrate dev --create-only o migrate diff y aplícalas con prisma migrate deploy. Tras cambiar contratos, reconstruye @lyra/contracts (pnpm --filter @lyra/contracts build) antes de los tests del API. PowerShell con native exes: pasa el SQL por archivo (Get-Content | docker exec -i ... psql) o usa --%. Para smoke crea datos de prueba y LIMPIA todo al terminar (verifica conteos en BD).

== PENDIENTE NO BLOQUEANTE (recuérdamelo) ==
El smoke VISUAL en navegador del Afinamiento #4 sigue pendiente (BACKLOG §4): conviene que YO lo haga al inicio con una plantilla con roles por sección (hoy el demo tiene un solo rol: crea datos de demo con 2 roles si me sirve para probar).

== CIERRE (CLAUDE.md) ==
typecheck+lint+test+build verdes, smoke en vivo (registra qué se probó y qué NO), actualiza PROGRESS/BACKLOG/DECISIONS/DATA_MODEL, commits pequeños por capa, publica (rama→merge a main→push) y dime explícitamente cuándo la sesión está completa y cuál es el siguiente módulo (2.7.1 Período gobernado, salvo que yo repriorice).
```
