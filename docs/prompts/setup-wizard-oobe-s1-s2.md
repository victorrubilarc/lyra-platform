# Prompt de sesión — Asistente de PRIMER ARRANQUE (OOBE) · S1 núcleo seguro + S2 wizard

> Copiar/pegar tal cual en una sesión nueva.

---

Continuamos Lyra WatchLog (g:\Development\BitacorasInteligentes). Ejecuta la rutina de arranque de CLAUDE.md ANTES de nada: lee CLAUDE.md y docs/ (PROGRESS, ARCHITECTURE, DATA_MODEL, SECURITY, DECISIONS, AUTH_FLOW, BACKLOG, USER_GUIDE). LECTURA OBLIGADA permanente: docs/LICENSING_STRATEGY.md + docs/LICENSING.md (§5 máquina de estados y whitelist del guard L1 — el setup debe operar en PENDIENTE_ACTIVACION) + docs/LICENSING_PROCEDURE.md §2 (la ceremonia de activación que el wizard va a ABRAZAR, no reemplazar). Lee COMPLETO el ítem **BACKLOG §2 épico distribución → (5) Asistente de PRIMER ARRANQUE (OOBE)** — es la spec registrada de esta sesión, con el diseño S1/S2/S3 y las decisiones abiertas a–d. Lee además: docs/DEPLOYMENT.md (bootstrap `RUN_SEED=true` — el flujo que esta sesión corrige), apps/watchlog-api/prisma/seed.ts COMPLETO (qué es catálogo vs qué es demo; el admin demo hardcodeado es EL problema), apps/watchlog-api/src/licensing/license-enforcement.guard.ts (whitelist L1 = el patrón a extender), apps/watchlog-api/src/authz/ (cómo se marca un endpoint PÚBLICO/sin JWT — el setup corre SIN usuarios existentes: debe saltarse JWT+permisos+MFA pero con su PROPIO candado de token), packages/ui (componente `Stepper` del wizard L3b, a reusar) y apps/watchlog-web/src/features/settings/ + theme (paletas THEME_PRESETS para el paso de apariencia). Revisa tu memoria persistente (MEMORY.md; en especial licensing-strategy [PLAN L0–L6 COMPLETO], theme-system, new-permission-dev-gotcha, challenge-dont-please, decide-well-align-to-leaders). No des nada por sentado: verifica en el código y en git.

Antes de empezar: confirma árbol limpio (`git rev-list --count origin/main..main` = 0; la sesión L2b quedó fusionada y publicada, tag v0.1.16 DIFERIDO a propósito). Estado real del que partes: **plan de licenciamiento L0–L6 COMPLETO**; dev local con licencia VALIDA holgada; en la BD dev existe un usuario `smoke-l2b@watchlog.local` DISABLED (residuo esperado del smoke L2b). El EC2 demo corre v0.1.15 y NO se toca.

Recordatorios permanentes (challenge-dont-please + gobernanza): licencia = Opción C, verificación DISTRIBUIDA, jamás secuestrar datos, nada que rompa el air-gap. Todo módulo nuevo nace entitlement-aware — el setup es **`core`** (JAMÁS se gatea por licencia: sin él no se puede ni configurar). Si ves motivo de peso para desviarte del diseño registrado, objétalo con fundamento ANTES de codificar.

== CONTEXTO / POR QUÉ (el problema que esta sesión mata) ==
Hoy una instalación productiva se bootstrapea con `RUN_SEED=true`, que crea como PRIMER administrador
`demo@watchlog.local / Demo!Pass2026` — credencial hardcodeada y PÚBLICA en el repo. Además, la primera pantalla que
ve un cliente recién entregado es un login pelado. Ambas cosas son inaceptables para una entrega comercial
(hallazgo registrado en BACKLOG §2(5), 2026-07-06). El estándar de industria es un **setup wizard de primer
arranque** con secreto de un solo uso: Jenkins (`initialAdminPassword` en el log), GitLab (pantalla de root),
Atlassian, Grafana, Proxmox. Eso construimos: sumamente enterprise, nada a medias.

== OBJETIVO DE ESTA SESIÓN (único, cerrable) — OOBE S1 (núcleo seguro) + S2 (wizard UI) ==
Que una instalación VIRGEN (0 usuarios) muestre al abrir la web un **asistente de primera configuración** en vez del
login, protegido por un **token de instalación de un solo uso**, y que al finalizar cree el administrador REAL,
aplique la configuración elegida y **no vuelva a aparecer jamás**. Alcance EXACTO:

- **S1 · Backend seguro:**
  1. **Separar el seed**: seed de CATÁLOGO (permisos, plantillas de notificación, workflows/base — corre SIEMPRE,
     idempotente, también en prod) vs seed DEMO (usuarios demo + datos de demo — SOLO dev/smokes). OJO CRÍTICO:
     TODOS los smokes y el dev dependen del admin demo ⇒ en dev/CI NADA cambia (el seed demo sigue corriendo ahí);
     solo el bootstrap PROD deja de crear usuarios. Actualiza DEPLOYMENT.md (RUN_SEED pasa a sembrar solo catálogo,
     o se reemplaza por un paso `seed:catalog` — decide y justifica).
  2. Estado **`setupCompleted`** persistente single-row (patrón `LicenseInstallation`; decide si columna en Settings
     o tabla propia `SystemSetup` — migración aditiva). Instalación virgen = `!setupCompleted` (y define la
     retro-migración: instalación EXISTENTE con usuarios ⇒ completado retroactivo, el EC2 demo jamás ve el wizard).
  3. **Token de instalación de UN SOLO USO**: generado al primer arranque si la instalación está virgen; se muestra
     por el canal que decidas en (a). Sin token válido, los endpoints de setup rechazan — es lo que impide que
     cualquiera en la red de planta se haga admin antes que el implementador.
  4. **Endpoints `/api/setup/*`** (status público mínimo + finalize): viven SOLO mientras `!setupCompleted`
     (después = 404, no 403 — no revelar); corren SIN JWT (no hay usuarios) pero CON el token; deben pasar la
     whitelist del guard L1 (nueva entrada explícita testeada, patrón `/api/auth/`) porque el setup ocurre
     típicamente en PENDIENTE_ACTIVACION. **Finalización ATÓMICA** (1 transacción): crea el admin real (política de
     contraseñas de la instalación aplicada — reusa PasswordPolicyService; rol Administrador del catálogo), guarda
     identidad/apariencia, marca `setupCompleted`, invalida el token, audita `system.setup.completed` (actor =
     el email del admin creado). Rate-limit/lockout de intentos de token (fuerza bruta).
  5. La web detecta la instalación virgen (endpoint de status SIN autenticación que devuelve SOLO
     `{ setupRequired: boolean }` — mínimo privilegio, nada más se filtra a anónimos) y redirige `/login` → `/setup`.
- **S2 · Wizard UI premium** (ruta `/setup`, fullscreen DARK — el arranque es identidad de marca; reusa `Stepper`):
  **1. Bienvenida** (qué es, pide el token de instalación) → **2. Cuenta de administrador** (email, nombre,
  contraseña con medidor contra la política real, confirmación; ofrecer enrolar MFA de inmediato — opcional) →
  **3. Identidad** (nombre visible de la empresa — PREFILL desde `customer` del payload si la licencia ya está
  activada; zona horaria; idioma es-CL/en) → **4. Apariencia** (claro/oscuro/auto + paleta de `THEME_PRESETS`;
  ver decisión (c)) → **5. Licencia** (condicional si PENDIENTE_ACTIVACION: muestra estado + installationId +
  huella + DESCARGA de `solicitud.lreq` + instrucciones del runbook §2; ver decisión (b)) → **6. Resumen →
  Finalizar** → redirect al login con la cuenta recién creada. Pasos 3–5 saltables ("configurar después"), 1–2 NO.
  Responsivo/tablet/44px, tokens del DS, claro+oscuro donde aplique (el shell del wizard es dark por identidad).

== INVESTIGA / DECIDE ANTES DE CODIFICAR (espera mi visto bueno) ==
(a) **Canal del token**: log del contenedor api (patrón Jenkins, efímero) vs archivo `setup-token` en la carpeta
`./license/` del despliegue (el implementador ya trabaja ahí; contra: persiste en disco — ¿se borra al completar?).
Recomienda UNA con fundamento. (b) **¿Subir `license.lic` DESDE el wizard?** — reabriría la decisión L6b ("la UI no
sube archivos de licencia") con fundamento (Atlassian/GitLab lo permiten; reduce fricción de la ceremonia): recomienda
sí/no y, si sí, con qué salvaguardas (el archivo se escribe en LICENSE_FILE y se re-evalúa; jamás se acepta sin firma
válida — el verificador ya existe). (c) **Apariencia**: ¿el paso escribe la paleta GLOBAL de la instalación (tema por
defecto) o solo la preferencia del admin? (d) **Nombre visible de la empresa**: ¿dónde persiste (Settings) y dónde se
MUESTRA ya en esta sesión (propongo: solo guardarlo + Topbar/título; el branding completo login/correos/acta = S3 con
marca blanca §2(2))? (e) **Forma del seed split** (flag env `SEED_SCOPE=catalog|demo` vs dos scripts) y su impacto en
ci.yml/Dockerfile.migrate. (f) Smoke nuevo en puerto **≥3407** (3401–3406 TOMADOS): escenarios mínimos = virgen
muestra setupRequired y bloquea sin token · token inválido/expirado rechaza y se bloquea por intentos · finalize
atómico crea admin real y el wizard MUERE (404 después; re-POST no duplica) · instalación con usuarios jamás expone
setup · whitelist L1 (setup opera en PENDIENTE_ACTIVACION) · el login demo dev sigue intacto. Si detectas una mejora
sobre este alcance, propónmela ahí.

== LO QUE ESTA SESIÓN NO HACE ==
NO S3/branding completo (logo aplicado a login/correos/acta PDF = épico marca blanca §2(2); si decides capturar el
logo ya, solo se ALMACENA). NO tocar el linaje/licencia del EC2 ni re-hacer nada de L0–L6. NO onboarding de datos
operacionales (estructuras/plantillas se configuran después con los asistentes existentes). NO portal de licencias
online. NO cambiar el flujo dev (pnpm dev + seed demo + smokes siguen EXACTO igual).

== VERIFICACIÓN Y CIERRE (CLAUDE.md §Gestión de sesiones) ==
En verde: typecheck/lint/build/test + smoke nuevo del setup (≥3407) + regresiones de licencia COMPLETAS (tocas la
whitelist L1): smoke-licencia 28 · -modulos 24 · -emision 20 · -renovacion 29 · -avisos 25 · -integridad 35 ·
-limites 30 + notificaciones (18/22/18) + 1–2 smokes de seguridad/estructura (el seed split no debe romper nada) —
registra qué se probó y qué NO (el smoke VISUAL del wizard es mío). Deja API :3000/api/health y web :5173 CORRIENDO
con licencia dev VALIDA y el dev SIN wizard (instalación con usuarios).
Actualiza docs/PROGRESS.md, docs/BACKLOG.md (§2(5): S1+S2 hechos, queda S3), docs/DEPLOYMENT.md (bootstrap sin
credencial demo — sección RUN_SEED reescrita), docs/SECURITY.md (setup token/one-shot si aplica), docs/AUTH_FLOW.md
(el flujo previo al primer login), docs/DECISIONS.md (decisiones a–f), docs/USER_GUIDE.md (sección NUEVA "Primer
arranque / asistente de configuración" con las 4 partes + índice ✅) + backfill 1–2 secciones ✍️ pendientes.
Commit descriptivo en rama feat/setup-wizard-oobe + merge a main + push. `git rev-list --count origin/main..main` = 0.
¿Tag? probablemente NO (S3 pendiente; recomiéndame). Actualiza la memoria (archivo nuevo para el OOBE + índice).
Resumen y frase de cierre proponiendo el siguiente foco (S3 branding/marca blanca, o QA del dueño / reversa GxP).

== ENTORNO Y GOTCHAS ==
Monorepo pnpm workspaces; si tocas @lyra/contracts (DTOs del setup) recuerda `pnpm --filter build` ANTES del
typecheck de la API. Si agregas permiso nuevo (probablemente NO: el setup corre pre-auth y lo demás reusa catálogo):
db:seed + Redis FLUSHALL o el admin demo da 403. Migración = SIEMPRE `prisma migrate dev` (aditiva), jamás a mano.
Puertos de smoke 3401–3406 TOMADOS ⇒ usa ≥3407. Python subprocess con encoding="utf-8", errors="replace".
PowerShell 5.1: NO `&&`, NO heredocs (mensaje de commit → Write a g:\tmp\ + `git commit -F`), commits SIN BOM.
El dev server :3000 corre `node dist/main` SIN watch: si recompilas la API, reinícialo (PID por
`Get-NetTCPConnection -LocalPort 3000`). BD dev COMPARTIDA entre dev server y smokes (el smoke del setup NO puede
usar la BD dev virgen — necesita su PROPIA BD o un esquema aparte para simular "0 usuarios": decide en (f) cómo;
una opción es `DATABASE_URL` a una BD efímera `watchlog_setup_smoke` creada/migrada por el arnés). Node ≥ 22.
El plan L0–L6 está COMPLETO — no lo re-hagas; el EC2 demo NO se toca.
