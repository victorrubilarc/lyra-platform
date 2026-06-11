# Prompt para la próxima sesión — Fase 2.7.1 Período contable gobernado (#5)

> Documento de traspaso. Pega el bloque de abajo al iniciar la sesión siguiente.
> Generado al cierre de la Fase 2.7.0 — Registro diferido (2026-06-11). El texto íntegro de
> las 10 mejoras del dueño del producto quedó en el historial de git de este archivo
> (commit db17981); su triage en `docs/BACKLOG.md` §2 + `docs/DECISIONS.md` 2026-06-11.

---

```
Continuamos Lyra WatchLog (g:\Development\BitacorasInteligentes). Ejecuta la rutina de arranque de CLAUDE.md ANTES de nada: lee CLAUDE.md y docs/ (PROGRESS, ARCHITECTURE, DATA_MODEL, SECURITY, DECISIONS, AUTH_FLOW y BACKLOG). Revisa tu memoria persistente (MEMORY.md), en especial fase2-formbuilder-plan.md. No des nada por sentado: verifica en el código y en git.

== MODO DE TRABAJO (énfasis explícito del dueño del producto, aplica SIEMPRE) ==
- Sé PROACTIVO: no te limites a ejecutar lo pedido. Analiza los CASOS DE USO reales (operador en terreno, supervisor, auditor, admin) y anticipa los bordes antes de codear.
- Ante CUALQUIER duda, PREGÚNTAME. Prefiero una pregunta bien planteada a una suposición. No inventes contexto que no esté en docs/código.
- Dame PROPUESTAS CONCRETAS Y EFICIENTES (no abstractas): opción recomendada primero, con su fundamento, alternativas con pros/contras, y el costo/impacto. Nada de "se podría…": dime QUÉ harías y POR QUÉ.
- Toda decisión equilibra cuatro ejes, en este orden de prioridad declarado: (1) la MEJOR experiencia de usuario, y a la vez lo más (2) CONSISTENTE, (3) EFICIENTE, (4) POTENTE y (5) SEGURO. Si dos ejes chocan, explícame el trade-off y recomienda.
- Mantén la regla permanente de honestidad técnica: si crees que me equivoco o hay algo mejor, dímelo con fundamento y cita el estándar (NIST/OWASP/RFC/práctica líder).

Verifica publicación: git rev-list --count origin/main..main = 0 y árbol limpio; el último commit en origin/main debe ser el merge de feat/registro-diferido (Fase 2.7.0) o posterior.

CONTEXTO (cerrado y publicado): Fase 1 completa; 2.1/2.1.1/2.2/2.x/2.3.0/2.4/2.5/2.6.0 + Afinamiento #4 + 2.7.0 cerradas. El PLAN DE FASES post-2.6.0 está APROBADO (DECISIONS 2026-06-11): 2.7 Gobernanza temporal (2.7.0 ✅ → 2.7.1 período → 2.7.2 ventana de edición → 2.7.3 matriz sección×tiempo) → 2.8 Alcance+acceso (multi-nodo + UX, fusiona 2.6.1 SavedView) → 2.9 Plantillas inteligentes. 2.7.0 dejó: LogEntry.entryOrigin ONLINE|DEFERRED DECLARADO + declaredEffectiveAt/deferredReason(obligatorio)/declarante; cadena resolveEffectiveAt campo→declarada→recordedAt; PUT /log-entries/:id/deferral (solo DRAFT sin sellar); huella en llenado/grilla/visor/timeline (DEFERRED_DECLARED) + filtro entryOrigin + export. blockedReason quedó EXTENSIBLE (+PERIOD_CLOSED/+EDIT_WINDOW_EXPIRED sin migrar). Tests: contracts 120 · permissions 5 · API 169. Catálogo de permisos en 50.

== OBJETIVO DE ESTA SESIÓN (único, cerrable y publicable) ==
Fase 2.7.1 — PERÍODO CONTABLE GOBERNADO (#5). Pedido del dueño del producto: los períodos (periodKey que ya estampa el ShiftResolver) deben poder CERRARSE; toda escritura cuya effectiveAt caiga en período no abierto se bloquea salvo rol privilegiado configurable; cierre y REAPERTURA con motivo + permiso + auditoría. Referentes ya destilados en DECISIONS 2026-06-11: SAP OB52 (intervalos por grupo de autorización), NetSuite (reapertura justificada y re-cierre), Odoo (lock date soft con excepciones auditadas vs hard lock irreversible — adoptado como OPCIÓN de configuración), Maximo (rechazo si actualdate no cae en período activo).

== ALCANCE ESPERADO (proponme el detalle antes de codear) ==
- Entidad NUEVA OperationalPeriod (calendario × periodKey) con estado OPEN/CLOSING/CLOSED (migración aditiva).
- Guardas de ESCRITURA en el servidor: create / saveSection / setDeferral / executeTransition / submit validan la effectiveAt resultante contra el período; blockedReason gana PERIOD_CLOSED (el enum ya nació extensible).
- Cierre/reapertura con motivo obligatorio + permiso(s) nuevo(s) en el catálogo + AuditLog (después de agregar permisos: db:seed + invalidar caché authz en Redis).
- Roles privilegiados configurables como DATO (quién puede escribir en CLOSING/CLOSED), nada hardcodeado.
- UI: administración de períodos (probablemente junto al Calendario operacional) + huella del bloqueo en el llenado (motivo real, patrón del Afinamiento #4).

== FORKS A PROPONERME ANTES DE CODEAR (con recomendación fundada) ==
1. ¿Los OperationalPeriod se materializan LAZY (al primer uso del periodKey) o por generación anticipada (admin los abre/cierra de una lista)? Considera períodos sin calendario (periodKey null) y entradas históricas.
2. ¿Dónde vive el mantenedor: pestaña dentro de /calendario-operacional o pantalla propia?
3. ¿Hard lock irreversible como opción de configuración (Odoo) desde 2.7.1 o diferido?
4. ¿La guarda aplica también a transiciones de flujo y a la verificación de firmas, o solo a mutaciones de datos? (Maximo rechaza transacciones; las lecturas nunca se bloquean.)
5. Interacción con el registro diferido: declarar una fecha en período CERRADO debe rechazarse con PERIOD_CLOSED (misma guarda, mismo motivo visible).

Respeta las reglas permanentes: una sesión = un objetivo cerrable y publicable; cambios aditivos; lo reutilizable a packages/; backend valida y autoriza SIEMPRE; nada hardcodeado que deba ser dato; publica antes de cerrar (rama feat/<modulo> → merge a main → push) y deja BACKLOG §1 sin pendientes. Registra en DECISIONS los forks resueltos y en BACKLOG lo diferido.

== ENTORNO (verifica que esté arriba) ==
API NestJS en watch en :3000 (NO lances nest build/pnpm build del API con el watch vivo — usa typecheck+test). Web Vite/HMR en :5173. Infra Docker arriba (postgres/redis/minio/mailpit). Usuario demo: demo@watchlog.local / Demo!Pass2026. Tras agregar permisos nuevos: pnpm --filter @lyra/watchlog-api db:seed y, si la caché de permisos da 403, invalida authz:perms:<userId> en Redis (docker exec lyra-watchlog-dev-redis-1 redis-cli). GOTCHAS Windows: prisma generate falla con EPERM al renombrar el DLL con el watch vivo (los .d.ts SÍ se regeneran → suficiente para typecheck); crea migraciones con prisma migrate dev --create-only y aplícalas con prisma migrate deploy. Tras cambiar contratos, reconstruye @lyra/contracts (pnpm --filter @lyra/contracts build) antes de los tests del API. PowerShell con native exes: pasa el SQL por archivo (Get-Content | docker exec -i ... psql) o usa --%. Para smoke crea datos de prueba y LIMPIA todo al terminar (verifica conteos en BD).

== PENDIENTE NO BLOQUEANTE (recuérdamelo) ==
- Smokes VISUALES en navegador pendientes (BACKLOG §4): Afinamiento #4 (plantilla con roles por sección; el demo tiene un solo rol — crea datos con 2 roles si me sirve) y Registro diferido 2.7.0 (toggle en /nueva-entrada, chip/nota/modal en el llenado, filtro Origen + indicador en /bitacoras, nota + evento en el visor). Conviene que YO los haga al inicio.
- Deuda 2.8.2 anotada (BACKLOG §2, Fase 2.8): la creación de entrada persiste un DRAFT al elegir plantilla (genera borradores huérfanos) y no hay descarte/anulación de borrador. NO es de esta sesión (2.7.1); recuérdamela al planificar 2.8. Ojo a la INTERACCIÓN con 2.7.1: si en 2.8.2 se difiere la persistencia, las guardas de período deben seguir evaluándose contra la effectiveAt resultante igual.

== CIERRE (CLAUDE.md) ==
typecheck+lint+test+build verdes, smoke en vivo (registra qué se probó y qué NO), actualiza PROGRESS/BACKLOG/DECISIONS/DATA_MODEL (y SECURITY si hay permisos nuevos), commits pequeños por capa, publica (rama→merge a main→push) y dime explícitamente cuándo la sesión está completa y cuál es el siguiente módulo (2.7.2 Ventana de edición, salvo que yo repriorice).
```
