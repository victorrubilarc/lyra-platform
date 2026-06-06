# CLAUDE.md — Reglas del proyecto LogBook Pro

Este archivo define cómo debes trabajar en este repositorio. Léelo al inicio de CADA sesión antes de hacer nada más, junto con los archivos de `docs/` indicados abajo.

## Qué es este proyecto
Plataforma de bitácoras operacionales para industria (minería, manufactura, energía, etc.). On-premise, dockerizada, PostgreSQL, multi-módulo: estructura organizacional, plantillas/form builder, entradas por turno, cambio de turno, incidencias con workflow, orígenes de datos externos y base de conocimiento.

## Rutina obligatoria de cada sesión
1. Al EMPEZAR: lee `docs/PROGRESS.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/SECURITY.md` y `docs/DECISIONS.md`.
2. Confirma en dos líneas dónde estamos y qué vamos a hacer en esta sesión antes de escribir cualquier código.
3. Durante el trabajo: si tomas una decisión de diseño, regístrala en `docs/DECISIONS.md` con fecha y motivo.
4. Al TERMINAR: actualiza `docs/PROGRESS.md` (qué quedó hecho, qué falta, próximos pasos exactos) y cualquier doc afectado.
5. No asumas contexto que no esté en los docs o en el código. Si falta información, pregúntame.

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
- Importar siempre desde Google Fonts:
  @import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600&display=swap')

### Principios visuales (obligatorios)
- Dark mode como modo principal. No hay modo claro en v1.
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
- Los componentes deben funcionar en dark mode, ser responsivos,
  y tener áreas táctiles mínimas de 44px (uso en terreno / tablet).
- Documenta cada componente nuevo con sus variantes y props.

### Lo que NO hacer visualmente
- No usar fondos blancos o claros.
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
  1. Actualiza `docs/PROGRESS.md` con lo completado, el estado actual y los próximos pasos exactos.
  2. Actualiza cualquier otro doc afectado (`ARCHITECTURE.md`, `DATA_MODEL.md`, etc.).
  3. Haz un commit descriptivo con todo el trabajo de la sesión.
  4. Muéstrame un resumen de lo que se completó y lo que viene.
  5. Dime explícitamente: **"Esta sesión está completa. Por favor abre una sesión nueva para continuar con: [nombre del siguiente módulo]."**
- No empieces el siguiente módulo en la misma sesión aunque parezca pequeño. Cierra siempre.
- Si el contexto empieza a llenarse ANTES de terminar el módulo (respuestas más lentas, olvidos, incoherencias), avísame con: **"El contexto de esta sesión está llegando a su límite. Voy a consolidar el progreso para que puedas abrir una sesión nueva."** Luego actualiza los docs, commitea lo hecho y para.

## Qué NO hacer
- No programar antes de que yo apruebe el plan de arquitectura.
- No hardcodear roles, permisos, ni reglas de negocio que deban ser configurables.
- No introducir dependencias de servicios SaaS obligatorios (rompe el requisito on-premise).
- No avanzar varios módulos a la vez ni hacer refactors masivos sin acordarlo.
- No duplicar lógica o UI entre apps cuando deba estar en `packages/`.
- No dejar los docs de memoria desactualizados al cerrar sesión.
- No continuar en la misma sesión una vez que el módulo actual esté completo.