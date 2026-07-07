# CLAUDE.md — Reglas del proyecto LogBook Pro

Este archivo define cómo debes trabajar en este repositorio. Léelo al inicio de CADA sesión antes de hacer nada más, junto con los archivos de `docs/` indicados abajo.

## Qué es este proyecto
Plataforma de bitácoras operacionales para industria (minería, manufactura, energía, etc.). On-premise, dockerizada, PostgreSQL, multi-módulo: estructura organizacional, plantillas/form builder, entradas por turno, cambio de turno, incidencias con workflow, orígenes de datos externos y base de conocimiento.

## Rutina obligatoria de cada sesión
1. Al EMPEZAR: lee `docs/PROGRESS.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/SECURITY.md`, `docs/DECISIONS.md`, `docs/AUTH_FLOW.md`, **`docs/LICENSING_STRATEGY.md`** (+ `docs/LICENSING.md`: reglas de licenciamiento/anti-pirateo, LECTURA OBLIGADA — ver §"Licenciamiento" abajo) y **`docs/BACKLOG.md`** (el registro de todo lo abierto: por hacer, por probar y por publicar). Si el backlog muestra trabajo de la sesión anterior **sin publicar** (commits/ramas que no están en `origin`), resuélvelo ANTES de empezar lo nuevo.
2. Confirma en dos líneas dónde estamos y qué vamos a hacer en esta sesión antes de escribir cualquier código.
3. Durante el trabajo: si tomas una decisión de diseño, regístrala en `docs/DECISIONS.md` con fecha y motivo. Si detectas deuda o algo que queda fuera de alcance, anótalo en `docs/BACKLOG.md` (no lo dejes solo "en la cabeza").
4. Al TERMINAR: actualiza `docs/PROGRESS.md` (qué quedó hecho) y **`docs/BACKLOG.md`** (qué queda por hacer/probar/publicar), más cualquier doc afectado. Si la sesión **completó una funcionalidad de cara al usuario**, actualiza también **`docs/USER_GUIDE.md`** (manual de uso VIVO): agrega/actualiza su sección con las 4 partes (para qué sirve · cómo se usa · quién puede · importante) y marca la entrada del índice como redactada (✅). Si quedan funcionalidades antiguas sin redactar (✍️), aprovecha de rellenar 1–2 por sesión (backfill incremental). Si la sesión **agregó, cambió o eliminó un objeto del FORMULARIO** (tipo de campo, opción de configuración, validación) o una capacidad transversal del formulario (layout, lógica condicional, motor de reglas, gobernanza), actualiza también **`docs/FORM_GUIDE.md`** (mapa de capacidades VIVO, para ENTENDER el sistema a fondo): su ficha de 7 partes del objeto afectado, el índice y el Apéndice A (tabla resumen). Ver la regla de doc vivo en `FORM_GUIDE.md` §0.3.
5. **Publica siempre antes de cerrar** (regla "nada se queda atrás"): haz push de la rama y/o merge a `main` + push de `main`. Un commit que solo vive en el disco local es trabajo en riesgo. Si por instrucción explícita no se publica, queda registrado en `docs/BACKLOG.md` §1 como pendiente.
6. No asumas contexto que no esté en los docs o en el código. Si falta información, pregúntame.

## Licenciamiento y anti-pirateo (LECTURA OBLIGADA — regla permanente)
**Antes de escribir CUALQUIER código** —módulo nuevo, mejora, refactor o corrección de bug— debes tener presentes
`docs/LICENSING_STRATEGY.md` (el porqué de la estrategia) y `docs/LICENSING.md` (el cómo técnico). El software se
distribuye por un **canal con marca blanca** y corre en **infraestructura ajena, air-gapped**: la protección de la
licencia es transversal, no un módulo aislado. Reglas que TODO cambio debe respetar:
- **Estrategia decidida = Opción C (solo software, defensa en 6 capas):** firma Ed25519 + node-lock por huella +
  anti-tamper + detección de sobre-despliegue (linaje) + candado de negocio + legal. NO propongas dongle salvo que se
  reabra la decisión (ver DECISIONS 2026-07-04).
- **Todo módulo nuevo nace *entitlement-aware*:** su visibilidad/activación se gobierna por el `modules[]`/`edition` de
  la licencia (eje **distinto** del RBAC/ABAC, que gobierna al USUARIO). Registra la clave de módulo al crearlo; no
  hardcodees "siempre activo". Mientras el módulo de licenciamiento §2(1) no exista, deja el *gate* de entitlement
  preparado (constante/flag) aunque de momento resuelva a `true`, para no tener que reabrir cada módulo después.
- **La licencia NUNCA secuestra datos:** el peor estado es **solo lectura + exportación**, jamás borrar/cifrar. Cualquier
  degradación por licencia respeta la máquina de estados de `LICENSING.md §5`.
- **La verificación es DISTRIBUIDA, no un solo `if`:** si tu cambio toca un punto sensible (arranque, generación de acta
  PDF, tareas programadas, activación de módulo), considera si debe participar del chequeo de licencia. No centralices el
  candado en un único punto desactivable.
- **Nada que rompa el air-gap:** ninguna feature puede *exigir* internet saliente desde la planta. El "llamar a casa"
  (heartbeat/telemetría) es siempre **opcional y aditivo**; el camino base es archivos por USB (challenge-response).
- **Clave privada de emisión JAMÁS en el repo/imagen/.env.** Solo la clave **pública** se embebe en la app.
- Si un cambio tuyo afecta el licenciamiento (nuevo módulo licenciable, nuevo punto de verificación, cambio en la máquina
  de estados o en la huella), **actualiza `LICENSING.md`/`LICENSING_STRATEGY.md`** como docs VIVOS, igual que USER_GUIDE.

## Stack (completar tras aprobación del plan)
- Backend: <pendiente — propuesto y justificado por el agente>
- ORM / migraciones: <pendiente>
- Frontend: React (heredado del prototipo) + <librería de estilos a definir>
- Auth: <pendiente>
- Gestión de monorepo: <pendiente — propuesta y justificada>
- Contenedores: Docker + docker-compose (dev y prod separados)
- Base de datos: PostgreSQL

## Reglas de arquitectura
- Separación estricta de capas: UI / lógica de negocio / acceso a datos / integraciones externas. No mezclar.
- La autorización SIEMPRE se decide en el backend. El frontend solo oculta u oculta-y-deshabilita; nunca es la fuente de verdad de permisos.
- Las llamadas a APIs externas (orígenes de datos) se ejecutan en el backend, nunca en el navegador. Credenciales cifradas en reposo.
- Nada de secretos en el repositorio. Toda configuración por variables de entorno. Mantén `.env.example` actualizado.
- Migraciones versionadas para todo cambio de esquema. Prohibido modificar la BD a mano sin migración.

## Estructura del repositorio (monorepo)
- El proyecto es un MONOREPO ordenado. Backend, frontend, paquetes compartidos y configuración de Docker viven en un solo repositorio con límites claros entre paquetes.
- Usa una herramienta de gestión de monorepo estándar (propón cuál y justifícala: workspaces del gestor de paquetes, o una herramienta tipo Turborepo/Nx). Espera mi visto bueno antes de adoptarla.
- Mantenlo SIMPLE desde el inicio: pocos paquetes bien definidos. No sobre-ingenierizar con capas de configuración ni paquetes diminutos; crece solo cuando se justifique.
- Organización esperada (ajústala y justifícala en ARCHITECTURE.md):
  - `apps/` → aplicaciones desplegables (ej. `apps/api`, `apps/web`)
  - `packages/` → código reutilizable y compartido entre apps
  - `docs/` → archivos de memoria y documentación
  - `docker/` → Dockerfiles y compose (dev y prod)
- Elementos REUTILIZABLES que deben vivir en `packages/` y NO duplicarse entre apps:
  - Tipos y contratos compartidos backend↔frontend (ej. esquemas/DTOs), derivados de una sola fuente de verdad.
  - Reglas de validación de negocio reutilizables en cliente y servidor (la validación se aplica en backend, pero el frontend puede reusar las mismas reglas para feedback inmediato).
  - Librería de componentes UI premium (el sistema de diseño del prototipo): componentes, tokens de estilo, tipografía, íconos.
  - Utilidades comunes, constantes, y el cliente de permisos (helpers para evaluar permisos en UI a partir de lo que decide el backend).
- Reglas de los paquetes: cada paquete con responsabilidad única y API pública clara; dependencias en una sola dirección (apps dependen de packages, nunca al revés; los packages no forman ciclos entre sí); versionado/typing consistente en todo el monorepo.
- Antes de duplicar cualquier pieza de lógica o UI, revisa si debe vivir en `packages/`. No copiar/pegar entre apps.

## Reglas de seguridad (el proyecto debe poder pasar auditorías)
- Sigue OWASP ASVS y guías vigentes; cuando dudes, investiga el estándar actual en lugar de improvisar.
- Contraseñas con Argon2id. Sesiones/refresh tokens seguros con rotación. Protección de fuerza bruta y bloqueo de cuenta. MFA contemplado.
- Permisos configurables (RBAC/ABAC), NUNCA hardcodeados. Cubren 4 dimensiones: pantallas/módulos, acciones/funcionalidades, transiciones de workflow, y alcance de datos (por nodo de la estructura y por plantilla/bitácora).
- Validación de entrada en el backend para todo. No confíes en el cliente.
- Auditoría inmutable (quién, qué, cuándo, antes/después) en entradas, incidencias y configuración de seguridad.
- Antes de implementar cualquier pieza de auth o permisos, explícame el enfoque y espera mi confirmación.

## Reglas de calidad de código
- Tipado estricto, linter y formateador configurados y respetados.
- Reutiliza componentes y lógica; no copiar/pegar entre apps. Lo compartido vive en `packages/`. Mantén la librería de componentes premium del prototipo como un paquete UI reutilizable.
- Manejo de errores explícito y mensajes útiles. Sin "tragarse" excepciones.
- Tests para lo crítico: autenticación, motor de permisos, workflow de incidencias, orígenes de datos.
- Commits pequeños y descriptivos, por fase/módulo. Trabaja sobre ramas cuando el cambio sea grande.

## Reglas de producto / UX
- Diseñado para terreno industrial: responsivo, alto contraste, áreas táctiles amplias (uso con guantes), usable en tablet.
- Mantén el sistema de diseño, tipografía y "look" del prototipo.
- Formularios con lógica de negocio real: obligatorios, rangos/umbrales, lógica condicional, validaciones de formato, reglas que disparan incidencias. Profesional pero sin sobre-ingeniería.
- Flujos (incidencias, turnos) basados en estándares de industria, no inventados. Investiga antes de proponer.
- Parametrizable donde se justifique; evita parametrizar por parametrizar.

## Identidad visual y sistema de diseño (Lyra Sheliak · Ecosistema ITESICWS)

Este producto es parte del ecosistema Lyra de ITESICWS. Cada decisión visual
debe ser coherente con esa identidad y verse extraordinariamente profesional.
No es una app genérica: es software industrial de alto estándar.

### Marca
- Nombre del producto: **Lyra Sheliak**
- Empresa: ITESICWS
- Ecosistema: Lyra (cada producto es una estrella de la constelación)
- Productos hermanos conocidos: Lyra Vega (inventarios)
- Tono de marca: preciso, confiable, moderno, pensado para industria chilena

### Paleta de colores (usar variables CSS/tokens, nunca valores en duro)
- Base profunda:      #06061A  (fondo principal)
- Superficie 1:       #0C1124  (cards, paneles)
- Superficie 2:       #111827  (fondos secundarios)
- Borde sutil:        rgba(255,255,255,0.08)
- Borde activo:       rgba(99,102,241,0.4)
- Acento primario:    #6366F1  (índigo — acción principal)
- Acento secundario:  #06B6D4  (cian — información, highlights)
- Gradiente de marca: linear-gradient(135deg, #6366F1, #06B6D4)
- Texto principal:    #E7EAF3
- Texto secundario:   #9AA3B8
- Texto muted:        #6B7280
- Éxito operacional:  #22C55E
- Alerta / warning:   #F59E0B
- Error / crítico:    #EF4444
- Severidad 1:        #22C55E
- Severidad 2:        #84CC16
- Severidad 3:        #EAB308
- Severidad 4:        #F97316
- Severidad 5:        #EF4444

### Tipografía
- Títulos y marca:    Sora (weights: 600, 700, 800)
- UI y cuerpo:        Inter (weights: 400, 500, 600)
- Código y monospace: ui-monospace, Menlo, monospace
- Fuentes SELF-HOSTED vía @fontsource (H1 2026-07-07 — JAMÁS importar de Google Fonts:
  es egress del navegador que dispara el SOC del cliente y degrada en air-gap):
  @import "@fontsource/sora/{600,700,800}.css" + "@fontsource/inter/{400,500,600}.css"
  (el acta PDF embebe sus propios TTF por ruta; ver docs/SECURITY.md §5)

### Principios visuales (obligatorios)
- **Dark mode es el modo por defecto** y la identidad de marca (la entrada/login es SIEMPRE oscura).
  El **workspace soporta claro / oscuro / auto** (auto sigue al sistema), conmutado por `data-theme`
  sobre tokens (decisión 2026-06-06, reemplaza el "dark-only v1"). El modo claro debe verse igual de
  premium: usar tokens, nunca valores en duro, y cuidar el contraste.
- Glassmorphism sutil en cards: backdrop-filter blur(14px),
  background rgba(255,255,255,0.045). No abusivo.
- Gradiente de marca reservado para: logo, botón primario principal,
  elementos de énfasis máximo. No decorativo indiscriminado.
- Bordes sutiles, nunca gruesos. El peso visual lo dan el color y
  la tipografía, no los bordes.
- Espaciado generoso. Densidad alta pero ordenada: los usuarios son
  operadores e ingenieros, manejan datos, no simplificar en exceso.
- Animaciones funcionales únicamente (feedback de acción, transiciones
  de estado). Sin animaciones decorativas que ralenticen la percepción.
- Iconografía: Lucide React como librería estándar del ecosistema.
  Tamaño base 16–18px en UI, 20–24px en acciones destacadas.

### Componentes premium (viven en packages/ui)
- Mantén y evoluciona el sistema de componentes del prototipo.
- Cada componente nuevo debe respetar esta paleta y estos principios.
- Los componentes deben funcionar en **ambos temas (claro/oscuro)** vía tokens, ser responsivos,
  y tener áreas táctiles mínimas de 44px (uso en terreno / tablet).
- Documenta cada componente nuevo con sus variantes y props.

### Lo que NO hacer visualmente
- No usar fondos blancos o claros **en modo oscuro** (en modo claro las superficies claras son válidas;
  el modo oscuro sigue siendo el default y la base del diseño).
- No usar sombras negras duras (usar glow con color del acento).
- No mezclar familias tipográficas fuera de las definidas.
- No usar el gradiente de marca como fondo de pantalla completa.
- No crear componentes nuevos sin revisar si ya existe uno reutilizable.
- No usar colores de severidad para decoración, solo para su semántica.

## Criterio y honestidad técnica (REGLA PERMANENTE)
- **No me des el gusto a la primera.** Si crees que estoy equivocado, o que hay una opción
  mejor, **dímelo con fundamento** antes de implementar. Prefiero una objeción bien argumentada
  a que ejecutes algo subóptimo solo por complacerme.
- Cuando proponga un enfoque, **contrástalo con el estándar de la industria** (NIST, OWASP, RFCs,
  prácticas de productos líderes) y recomienda lo correcto aunque difiera de lo que pedí. Cita el
  estándar o la razón.
- Cuestiona con criterio: señala riesgos, deuda técnica, problemas de seguridad o de UX. No asumas
  que mi propuesta es definitiva; puede ser un punto de partida a mejorar.
- Esto NO es opcional ni depende de que lo repita en cada sesión: aplícalo siempre.

## Forma de trabajo
- Avanza módulo por módulo / pantalla por pantalla. Primero un MVP funcional, luego crecer.
- Antes de un módulo grande, propón enfoque y espera mi visto bueno.
- Si detectas algo necesario que no está pedido (respaldos, logs/observabilidad, exportación, adjuntos/evidencias, rate limiting, healthchecks, modo offline para terreno, i18n), proponlo y regístralo en DECISIONS.md.
- La integración de IA (resúmenes de turno, dashboard) debe quedar detrás de una interfaz abstracta para poder cambiar de proveedor o usar un modelo local on-premise.

## Gestión de sesiones y contexto
- Cada sesión tiene UN solo objetivo concreto (un módulo, una funcionalidad, un problema). No avances al siguiente sin cerrar el actual.
- Cuando un módulo o tarea quede completo, haz lo siguiente ANTES de terminar la sesión:
  1. Verifica en verde: `pnpm typecheck && pnpm lint && pnpm build && pnpm test` + smoke en vivo de lo construido (registrando qué se probó y qué NO).
  2. Actualiza `docs/PROGRESS.md` con lo completado, el estado actual y los próximos pasos exactos.
  3. Actualiza `docs/BACKLOG.md`: tacha lo cerrado y registra lo que quede por hacer/probar/publicar.
  4. Actualiza cualquier otro doc afectado (`ARCHITECTURE.md`, `DATA_MODEL.md`, etc.).
  4.1. Si se completó una funcionalidad de cara al usuario, actualiza **`docs/USER_GUIDE.md`** (manual de uso VIVO): redacta/actualiza su sección (para qué sirve · cómo se usa · quién puede · importante) y marca el índice (✅). Rellena de paso 1–2 secciones antiguas pendientes (✍️) cuando puedas (backfill incremental).
  5. Haz un commit descriptivo con todo el trabajo de la sesión.
  6. **Publica** (regla "nada se queda atrás"): push de la rama y/o merge a `main` + push de `main`. Verifica con `git status` / `git log origin/main..` que no quede nada solo en local. Si no se publica por instrucción mía, anótalo en `docs/BACKLOG.md` §1.
  7. **Deja el sitio OPERATIVO**: si levantaste el entorno de desarrollo para probar (smokes, etc.), déjalo CORRIENDO al cerrar (no mates el `pnpm dev`). Verifica que API (`:3000/api/health`) y web (`:5173`) respondan y avísame las URLs, porque suelo hacer el smoke visual justo después.
  8. Muéstrame un resumen de lo que se completó y lo que viene.
  9. Dime explícitamente: **"Esta sesión está completa. Por favor abre una sesión nueva para continuar con: [nombre del siguiente módulo]."**
- No empieces el siguiente módulo en la misma sesión aunque parezca pequeño. Cierra siempre.
- Si el contexto empieza a llenarse ANTES de terminar el módulo (respuestas más lentas, olvidos, incoherencias), avísame con: **"El contexto de esta sesión está llegando a su límite. Voy a consolidar el progreso para que puedas abrir una sesión nueva."** Luego actualiza los docs, commitea lo hecho y para.

## Qué NO hacer
- No programar antes de que yo apruebe el plan de arquitectura.
- No hardcodear roles, permisos, ni reglas de negocio que deban ser configurables.
- No escribir código de un módulo/feature sin considerar la §"Licenciamiento y anti-pirateo": todo módulo nuevo nace *entitlement-aware*, la licencia nunca secuestra datos, y ninguna feature exige internet saliente desde la planta.
- No centralizar el chequeo de licencia en un único `if` desactivable, ni meter la clave privada de emisión en repo/imagen/.env.
- No introducir dependencias de servicios SaaS obligatorios (rompe el requisito on-premise).
- No avanzar varios módulos a la vez ni hacer refactors masivos sin acordarlo.
- No duplicar lógica o UI entre apps cuando deba estar en `packages/`.
- No dejar los docs de memoria desactualizados al cerrar sesión.
- No cerrar una sesión dejando commits o ramas **sin publicar** (sin push) salvo que yo lo pida explícitamente; si así fuera, queda registrado en `docs/BACKLOG.md` §1.
- No continuar en la misma sesión una vez que el módulo actual esté completo.