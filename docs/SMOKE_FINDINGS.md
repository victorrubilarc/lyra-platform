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

---

## Índice de triage (se completa al PROCESAR)
| ID | Fase | Módulo | Sev | Tipo | Resumen | Decisión | Estado |
|----|------|--------|-----|------|---------|----------|--------|
| — | — | — | — | — | (vacío hasta el primer procesamiento) | — | — |
