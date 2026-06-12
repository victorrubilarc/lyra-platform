# scripts/ — seeders de demo y smokes de API

Scripts de **dev/demo** que orquestan la API por HTTP (Python `urllib`, sin dependencias).
Se usa Python en vez de PowerShell porque PS 5.1 colapsa arrays de 1 elemento en
`ConvertTo-Json`. Requieren la API arriba en `:3000` (`pnpm dev`).

## Configuración (variables de entorno, con defaults de demo)

| Var | Default | Uso |
|---|---|---|
| `WL_BASE` | `http://localhost:3000/api` | Base de la API |
| `WL_ADMIN_EMAIL` | `demo@watchlog.local` | Admin de demo (todos los permisos) |
| `WL_DEMO_PASS` | `Demo!Pass2026` | Contraseña de demo/dev (NO producción) |

> Las credenciales por defecto son las del **entorno de demo/dev** documentado en
> `docs/`; no son secretos de producción. Sobrescríbelas por entorno si hace falta.

## Scripts

- **`demo-bitacora.py`** — *seeder idempotente* de la demo de capacidades: roles
  (op-molienda/sup-turno/mantenedor) + usuarios + flujo Borrador→En revisión→
  Aprobado/Observado con firma Part 11 + plantilla "Bitácora de Turno — Demo
  Completa" (multi-actor por rol, granularidad por campo, umbrales, fecha efectiva,
  condicional, ventana de edición). Re-ejecutar no duplica.
- **`smoke-template-scope.py`** — smoke del **alcance por plantilla** (2.º eje ABAC,
  Fase 2.8): filtra picker + grilla, gatea getDetail, options gateado, scope por
  rol. Limpia al terminar (restaura scopes vacíos).
- **`smoke-template-scope-fixes.py`** — smoke del **afinamiento 2.8**: filtro de
  Bitácoras con alcance (`/log-entries/filter-templates`) + acceso por rol desde la
  plantilla (`/templates/:id/role-scope`), incl. la garantía de que editar el acceso
  de UNA plantilla no toca el resto del alcance del rol.

## Regla de los smokes

Crean datos de prueba y **limpian SOLO por ID de lo que el propio script creó**
(nunca por filtro de nombre sobre un listado). El `AuditLog` es inmutable: conserva
el rastro aunque se borren los datos.
