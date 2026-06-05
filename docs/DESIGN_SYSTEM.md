# LYRA DESIGN SYSTEM
### Versión 1.0 · ITESICWS · Ecosistema Lyra

---

## 1. Fundamentos de marca

### 1.1 El ecosistema Lyra
Lyra es una suite de aplicaciones industriales desarrollada por ITESICWS.
Cada producto lleva el nombre de una estrella de la constelación Lyra.
El design system es compartido por todos los productos del ecosistema:
garantiza coherencia visual, reduce tiempo de desarrollo y refuerza
la identidad de marca en cada punto de contacto.

Productos actuales:
- **Lyra Vega** — Gestión de inventarios
- **Lyra Sheliak** — Bitácoras operacionales inteligentes

Productos planificados (reserva de nombre):
- **Lyra Sulafat** — Control de producción
- **Lyra Aladfar** — Mantenimiento / CMMS
- **Lyra Alathfar** — Gestión de personas / RRHH
- **Lyra Atlas** — Portal unificado del ecosistema

### 1.2 Dónde vive este design system
El design system vive en el monorepo del ecosistema Lyra:

```
lyra-ecosystem/
  packages/
    ui/                  ← design system (este documento)
      tokens/            ← variables CSS y tokens
      components/        ← componentes React reutilizables
      styles/            ← estilos base y reset
    types/               ← tipos TypeScript compartidos
  apps/
    vega/                ← Lyra Vega (inventarios)
    sheliak/             ← Lyra Sheliak (bitácoras)
  docs/
    DESIGN_SYSTEM.md     ← este archivo
```

Todos los productos Lyra consumen `packages/ui`.
Nunca copiar componentes entre apps: siempre extraer a packages/ui.

### 1.3 Principios de diseño

**Claridad operacional**
Los usuarios trabajan en entornos industriales complejos, bajo presión
y a veces en condiciones difíciles (turno noche, terreno, tablet con
guantes). Cada pantalla debe comunicar lo esencial de inmediato.
La información importante nunca se esconde.

**Densidad con orden**
Los usuarios de Lyra son operadores, ingenieros y supervisores.
No le temen a los datos. El objetivo no es simplificar en exceso
sino organizar bien. Alta densidad de información, jerarquía clara.

**Confianza a través de la consistencia**
Un sistema que siempre se comporta igual genera confianza.
Los mismos colores significan siempre lo mismo. Los mismos patrones
de interacción se repiten en todos los productos Lyra. Sin sorpresas.

**Profesionalismo sin frialdad**
Software de nivel empresarial que se siente moderno y cuidado,
no genérico ni intimidante. La tecnología al servicio de las personas
que trabajan en la industria chilena.

---

## 2. Tokens de diseño

Los tokens son la fuente de verdad del sistema.
Viven en `packages/ui/tokens/index.css` y se importan en todos los productos.
**NUNCA usar valores en duro en componentes: siempre el token.**

### 2.1 Color

#### Fondos (escala de profundidad)
```css
--color-bg-base:       #06061A;  /* Fondo principal de la app */
--color-bg-surface-1:  #0C1124;  /* Cards, paneles, sidebars */
--color-bg-surface-2:  #111827;  /* Fondos secundarios, inputs */
--color-bg-surface-3:  #1A2235;  /* Hover states, selecciones */
```

#### Bordes
```css
--color-border-subtle:  rgba(255, 255, 255, 0.08);  /* Bordes en reposo */
--color-border-default: rgba(255, 255, 255, 0.12);  /* Bordes visibles */
--color-border-strong:  rgba(255, 255, 255, 0.20);  /* Hover, focus */
--color-border-accent:  rgba(99, 102, 241, 0.40);   /* Elemento activo */
--color-border-brand:   rgba(99, 102, 241, 0.60);   /* Énfasis de marca */
```

#### Texto
```css
--color-text-primary:   #E7EAF3;  /* Texto principal */
--color-text-secondary: #9AA3B8;  /* Texto secundario, labels */
--color-text-muted:     #6B7280;  /* Texto deshabilitado, metadata */
--color-text-inverse:   #06061A;  /* Texto sobre fondos claros */
```

#### Acentos de marca
```css
--color-accent-primary:         #6366F1;  /* Índigo — acción principal */
--color-accent-secondary:       #06B6D4;  /* Cian — información, highlights */
--color-accent-primary-hover:   #4F46E5;
--color-accent-secondary-hover: #0891B2;
```

#### Gradiente de marca
```css
--gradient-brand:        linear-gradient(135deg, #6366F1, #06B6D4);
--gradient-brand-subtle: linear-gradient(135deg,
                           rgba(99,102,241,0.15),
                           rgba(6,182,212,0.10));
```

Uso del gradiente de marca:
- ✅ Logo y wordmark
- ✅ Botón primario principal (uno por pantalla)
- ✅ Iconos de énfasis máximo
- ✅ Bordes de cards destacadas (glow)
- ❌ Fondos de pantalla completa
- ❌ Texto corrido
- ❌ Elementos decorativos sin función

#### Colores funcionales
```css
--color-success:     #22C55E;
--color-success-bg:  rgba(34, 197, 94, 0.12);
--color-warning:     #F59E0B;
--color-warning-bg:  rgba(245, 158, 11, 0.12);
--color-error:       #EF4444;
--color-error-bg:    rgba(239, 68, 68, 0.12);
--color-info:        #06B6D4;
--color-info-bg:     rgba(6, 182, 212, 0.12);
```

#### Escala de severidad operacional
Usada exclusivamente para indicar nivel de riesgo o gravedad.
**NUNCA para decoración.**
```css
--color-sev-1: #22C55E;  /* Bajo / Sin novedad */
--color-sev-2: #84CC16;  /* Leve */
--color-sev-3: #EAB308;  /* Moderado */
--color-sev-4: #F97316;  /* Alto */
--color-sev-5: #EF4444;  /* Crítico */
```

### 2.2 Tipografía

#### Familias
```css
--font-brand: 'Sora', system-ui, sans-serif;
--font-body:  'Inter', system-ui, sans-serif;
--font-mono:  ui-monospace, 'Menlo', 'Monaco', monospace;
```

Import obligatorio en el entry point de cada app:
```css
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Inter:wght@400;500;600&display=swap');
```

#### Escala tipográfica
```css
/* Display — títulos de pantalla principales */
--text-display-size:   28px;
--text-display-weight: 800;
--text-display-family: var(--font-brand);

/* Heading 1 — títulos de sección */
--text-h1-size:   22px;
--text-h1-weight: 700;
--text-h1-family: var(--font-brand);

/* Heading 2 — subtítulos, nombres de card */
--text-h2-size:   17px;
--text-h2-weight: 700;
--text-h2-family: var(--font-brand);

/* Heading 3 — labels de grupo, encabezados de tabla */
--text-h3-size:   14px;
--text-h3-weight: 600;
--text-h3-family: var(--font-brand);

/* Body large — texto principal de contenido */
--text-body-lg-size:   15px;
--text-body-lg-weight: 400;
--text-body-lg-family: var(--font-body);

/* Body — texto estándar de UI */
--text-body-size:   14px;
--text-body-weight: 400;
--text-body-family: var(--font-body);

/* Body small — metadata, timestamps, labels secundarios */
--text-body-sm-size:   13px;
--text-body-sm-weight: 400;
--text-body-sm-family: var(--font-body);

/* Caption — texto muy pequeño, usar con criterio */
--text-caption-size:   11.5px;
--text-caption-weight: 500;
--text-caption-family: var(--font-body);

/* Label — etiquetas de campo en formularios */
--text-label-size:   13px;
--text-label-weight: 600;
--text-label-family: var(--font-body);

/* Mono — IDs, código, paths de API, coordenadas GPS */
--text-mono-size:   13px;
--text-mono-family: var(--font-mono);
```

### 2.3 Espaciado
Sistema de 4px base. Todos los espaciados son múltiplos de 4.
```css
--space-1:   4px;
--space-2:   8px;
--space-3:   12px;
--space-4:   16px;
--space-5:   20px;
--space-6:   24px;
--space-8:   32px;
--space-10:  40px;
--space-12:  48px;
--space-16:  64px;
```

### 2.4 Bordes y radios
```css
--radius-sm:   8px;     /* Chips, badges, elementos pequeños */
--radius-md:   12px;    /* Inputs, botones, elementos de UI */
--radius-lg:   16px;    /* Cards pequeñas */
--radius-xl:   18px;    /* Cards principales */
--radius-2xl:  24px;    /* Modales, paneles grandes */
--radius-full: 9999px;  /* Pills, avatares, toggles */
```

### 2.5 Sombras y glow
No usar sombras negras duras. El sistema usa glow con color.
```css
--shadow-card:   0 4px 24px -4px rgba(0, 0, 0, 0.4);
--shadow-modal:  0 16px 48px -8px rgba(0, 0, 0, 0.6);
--glow-brand:    0 0 0 1px rgba(99,102,241,0.25),
                 0 12px 40px -12px rgba(99,102,241,0.35);
--glow-success:  0 0 0 1px rgba(34,197,94,0.25),
                 0 8px 24px -8px rgba(34,197,94,0.25);
--glow-error:    0 0 0 1px rgba(239,68,68,0.25),
                 0 8px 24px -8px rgba(239,68,68,0.25);
```

### 2.6 Efectos de superficie (glassmorphism)
```css
--glass-blur:    blur(14px);
--glass-bg:      rgba(255, 255, 255, 0.045);
--glass-border:  1px solid rgba(255, 255, 255, 0.09);
```

---

## 3. Componentes

Todos los componentes viven en `packages/ui/components/`.
Cada componente tiene su propio archivo, estilos con tokens,
y documentación de variantes y props.

> **Implementados (Fase 1 · UI Login):** `Button`, `Input`, `FormField`, `Card`,
> `Spinner`, `Toast` (`ToastProvider`/`useToast`) — con **CSS Modules** sobre los
> tokens. Pendientes para Estructura/Seguridad: `Table`, `Drawer`, `Chip`/`NodeTag`,
> `Modal`, `Toggle`, `EmptyState`, `Stepper`, `Sidebar` (hoy inline en `apps/watchlog-web`).

### 3.1 Botones

**Primary** — Una sola acción principal por pantalla.
```css
background:    var(--gradient-brand);
color:         #ffffff;
border-radius: var(--radius-md);
padding:       10px 18px;
font-family:   var(--font-body);
font-size:     var(--text-body-size);
font-weight:   600;
min-height:    44px;   /* táctil obligatorio */
border:        none;
cursor:        pointer;
transition:    all 0.2s ease;
```
Hover: `transform: translateY(-1px)` + `box-shadow: var(--glow-brand)`
Disabled: `opacity: 0.5`, sin pointer events

**Secondary (Ghost)** — Acciones secundarias, múltiples por pantalla.
```css
background:    rgba(255, 255, 255, 0.07);
border:        1px solid var(--color-border-default);
color:         var(--color-text-primary);
border-radius: var(--radius-md);
padding:       10px 18px;
min-height:    44px;
```
Hover: `background: rgba(255,255,255,0.12)`

**Danger** — Acciones destructivas. Siempre pedir confirmación antes.
```css
background: var(--color-error-bg);
border:     1px solid rgba(239, 68, 68, 0.3);
color:      var(--color-error);
```

**Icon button** — Acción sin texto. Siempre con tooltip descriptivo.
```css
padding:       8px;
min-width:     36px;
min-height:    36px;
border-radius: var(--radius-md);
```

### 3.2 Cards

**Card base** — Contenedor estándar de información.
```css
background:       var(--glass-bg);
border:           var(--glass-border);
border-radius:    var(--radius-xl);
backdrop-filter:  var(--glass-blur);
padding:          var(--space-5);
transition:       border-color 0.25s ease;
```
Hover: `border-color: var(--color-border-strong)`

**Card destacada (glow)** — Información crítica o elemento principal.
Extiende card base agregando: `box-shadow: var(--glow-brand)`
Usar con criterio: máximo 1–2 por pantalla.

**Card de métrica (KPI)** — Para dashboards e indicadores.
Estructura interna estándar:
```
[Label — text-body-sm — color-text-secondary]
[Valor — Sora 28px 800 — color de acento correspondiente]
[Ícono o tendencia — opcional — caption]
```
Debe ser clickeable si navega a un módulo relacionado.

### 3.3 Chips y badges

**Chip estándar** — Categorías, estados, industrias, etiquetas.
```css
display:       inline-flex;
align-items:   center;
gap:           6px;
padding:       4px 12px;
border-radius: var(--radius-full);
font-size:     var(--text-caption-size);
font-weight:   600;
```
Color: `background` del color semántico con opacidad 0.15–0.22,
`color` en el color semántico puro.

**Badge de conteo** — Notificaciones y contadores en navegación.
```css
background:    var(--color-error);
color:         #ffffff;
border-radius: var(--radius-full);
font-size:     11px;
font-weight:   700;
padding:       1px 8px;
```

**NodeTag** — Componente exclusivo del ecosistema Lyra.
Muestra la ruta jerárquica: Área › Proceso › Equipo.
```css
background: rgba(6, 182, 212, 0.15);
color:      var(--color-accent-secondary);
/* Incluye ícono Network (Lucide, 11px) + texto de ruta */
```

### 3.4 Formularios

**Input / Textarea**
```css
background:    rgba(255, 255, 255, 0.05);
border:        1px solid var(--color-border-default);
border-radius: var(--radius-md);
color:         var(--color-text-primary);
padding:       10px 14px;
font-size:     var(--text-body-size);
min-height:    44px;
width:         100%;
outline:       none;
transition:    border 0.2s ease;
```
Focus: `border-color: var(--color-accent-primary)` +
       `box-shadow: 0 0 0 3px rgba(99,102,241,0.18)`
Error: `border-color: var(--color-error)`

**Label de campo**
```css
font-size:     var(--text-label-size);
font-weight:   var(--text-label-weight);
color:         var(--color-text-secondary);
margin-bottom: var(--space-2);
display:       block;
```
Campo obligatorio: agregar `*` en `var(--color-error)` tras el label.

**Select / Dropdown**
Mismos estilos que input. Panel de opciones con background
`var(--color-bg-surface-1)` y border `var(--color-border-subtle)`.

**Toggle (Sí/No)**
```css
width:         52px;
height:        28px;
border-radius: var(--radius-full);
border:        none;
cursor:        pointer;
transition:    all 0.25s ease;
position:      relative;
```
Activo: `background: var(--gradient-brand)`
Inactivo: `background: rgba(255,255,255,0.12)`
Thumb: círculo blanco 22×22px con transición de posición 0.25s

**Checklist item**
```css
padding:       9px 12px;
border-radius: var(--radius-md);
border:        1px solid;
cursor:        pointer;
display:       flex;
align-items:   center;
gap:           10px;
margin-bottom: 6px;
```
Marcado: `background: var(--color-success-bg)`,
         `border-color: rgba(34,197,94,0.30)`
Sin marcar: `background: rgba(255,255,255,0.03)`,
            `border-color: var(--color-border-subtle)`

**Escala de severidad (1–5)**
Cinco botones cuadrados 38×38px con `border-radius: var(--radius-md)`.
Color de cada nivel según tokens `--color-sev-1` a `--color-sev-5`.
Activo: `background` del color de severidad, texto `color-bg-base`.
Acompañar siempre con texto o ícono, nunca solo el número.

**Barra de progreso (checklist)**
```css
height:        6px;
border-radius: var(--radius-full);
background:    rgba(255, 255, 255, 0.08);
transition:    width 0.3s ease;
```
Relleno: `var(--gradient-brand)` en progreso, `var(--color-success)` al 100%.

### 3.5 Navegación lateral (Sidebar)
```css
width:           252px;
min-height:      100vh;
background:      rgba(7, 10, 20, 0.6);
backdrop-filter: blur(20px);
border-right:    1px solid rgba(255,255,255,0.07);
padding:         20px 14px;
position:        sticky;
top:             0;
display:         flex;
flex-direction:  column;
gap:             3px;
```

**Item de navegación**
```css
display:       flex;
align-items:   center;
gap:           12px;
padding:       10px 14px;
border-radius: var(--radius-md);
font-size:     13.5px;
font-weight:   500;
color:         var(--color-text-secondary);
border:        1px solid transparent;
min-height:    44px;
cursor:        pointer;
transition:    all 0.2s ease;
```
Hover: `color: var(--color-text-primary)`,
       `background: rgba(255,255,255,0.05)`

Activo:
```css
color:      var(--color-text-primary);
background: linear-gradient(135deg,
              rgba(99,102,241,0.22),
              rgba(6,182,212,0.12));
border-color: rgba(99,102,241,0.35);
```

**Header del sidebar — marca Lyra**
```css
display:         flex;
align-items:     center;
gap:             10px;
padding:         4px 10px 16px;
```
Logo: div 36×36px con `border-radius: 11px`,
      `background: var(--gradient-brand)`, ícono blanco centrado.
Wordmark: "Lyra" en Sora 800, "Sheliak" (o nombre del producto) en
           `var(--gradient-brand)` aplicado como texto gradiente.
Subtítulo: 10px, color-text-muted, letter-spacing: 1px, mayúsculas.

### 3.6 Tablas de datos
```css
width:            100%;
border-collapse:  collapse;
font-size:        var(--text-body-sm-size);
```

Header de columna:
```css
background:     rgba(255, 255, 255, 0.04);
padding:        11px 14px;
color:          var(--color-text-secondary);
font-weight:    600;
font-size:      11.5px;
letter-spacing: 0.4px;
text-align:     left;
```

Fila:
```css
border-top: 1px solid var(--color-border-subtle);
padding:    10px 14px;
```
Hover: `background: rgba(99,102,241,0.08)`
Cursor pointer si la fila es clickeable (navega a detalle).

Celdas especiales:
- IDs y códigos: `font-family: var(--font-mono)`, color accent-primary
- Estado/severidad: usar componente Chip, no texto plano
- Fechas y timestamps: color-text-secondary

### 3.7 Stepper de workflow
Usado en incidencias y procesos con estados secuenciales.

Círculo de paso:
```css
width:         26px;
height:        26px;
border-radius: 50%;
font-size:     11px;
font-weight:   800;
display:       flex;
align-items:   center;
justify-content: center;
```
Completado: `background: var(--gradient-brand)`, `color: #ffffff`
Actual: igual que completado + glow brand suave
Pendiente: `background: rgba(255,255,255,0.07)`,
           `color: var(--color-text-muted)`,
           `border: 1px solid var(--color-border-default)`

Línea conectora:
```css
height: 2px;
flex:   1;
```
Completada: `background: var(--color-accent-primary)`
Pendiente: `background: var(--color-border-subtle)`

### 3.8 Drawer lateral (panel de detalle)
```css
position:   fixed;
top:        0;
right:      0;
height:     100vh;
width:      480px;
max-width:  94vw;
background: var(--color-bg-surface-1);
border-left: 1px solid var(--color-border-accent);
z-index:    60;
overflow-y: auto;
box-shadow: -30px 0 80px rgba(0, 0, 0, 0.6);
animation:  slideIn 0.3s ease;
```
```css
@keyframes slideIn {
  from { transform: translateX(60px); opacity: 0; }
  to   { transform: none; opacity: 1; }
}
```
Overlay de fondo: `position: fixed; inset: 0;
background: rgba(0,0,0,0.5); z-index: 55`

### 3.9 Toast / Notificación
```css
position:      fixed;
bottom:        24px;
left:          50%;
transform:     translateX(-50%);
background:    var(--color-bg-surface-1);
border:        1px solid var(--color-border-accent);
border-radius: var(--radius-lg);
padding:       13px 22px;
font-size:     var(--text-body-size);
font-weight:   600;
z-index:       99;
max-width:     640px;
box-shadow:    var(--shadow-modal);
animation:     fadeIn 0.35s ease;
```
Duración visible: 4–5 segundos. No apilar más de 2 simultáneos.

---

## 4. Patrones de layout

### 4.1 Layout principal de app
```css
display: flex;
/* sidebar 252px fijo + main flexible */
```
```css
/* Área de contenido principal */
flex:       1;
padding:    26px 32px;
max-width:  1260px;
margin:     0 auto;
width:      100%;
```

### 4.2 Grillas estándar
```css
/* KPIs y métricas — dashboard */
grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
gap: var(--space-3);

/* Cards de contenido general */
grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
gap: var(--space-4);

/* Dashboard dos columnas (contenido + lateral) */
grid-template-columns: 1.6fr 1fr;
gap: var(--space-4);

/* Dashboard cuatro columnas (kanban, industrias) */
grid-template-columns: repeat(4, 1fr);
gap: var(--space-3);
```

### 4.3 Formularios
```
Ancho máximo del formulario:   720px
Ancho de campos de texto:      100% del contenedor
Ancho de campos numéricos:     max-width 180px + label de unidad inline
Grid 2 columnas:               para campos relacionados cortos
Separación entre secciones:    var(--space-6) con línea divisoria sutil
```

### 4.4 Responsive (breakpoints)
```css
/* Mobile */
@media (max-width: 639px) {
  /* Sidebar colapsado, navegación inferior o hamburger */
  /* Grillas a 1 columna */
  /* Drawer a ancho completo */
}

/* Tablet */
@media (min-width: 640px) and (max-width: 1023px) {
  /* Sidebar colapsado por defecto, toggle para expandir */
  /* Grillas a 2 columnas máximo */
}

/* Desktop */
@media (min-width: 1024px) {
  /* Layout completo con sidebar siempre visible */
}
```
En tablet y mobile: **mínimo 44×44px en todo elemento interactivo.**
Especialmente crítico para uso en terreno con guantes.

---

## 5. Animaciones

Solo animaciones funcionales. Cada una tiene un propósito claro.
No usar animaciones decorativas que ralenticen la percepción.

```css
/* Entrada de pantallas y componentes montados */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: none; }
}
.fade-in { animation: fadeIn 0.35s ease; }

/* Indicador de carga (spinner en botones y estados async) */
@keyframes spin {
  to { transform: rotate(360deg); }
}
.spinning { animation: spin 1s linear infinite; }

/* Pulso — alertas activas, incidencias críticas, badges */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.45; }
}
.pulsing { animation: pulse 2s infinite; }

/* Transiciones de estado en elementos interactivos */
--transition-fast:    all 0.15s ease;   /* Hover de botones icono */
--transition-default: all 0.20s ease;   /* Hover de botones y cards */
--transition-slow:    all 0.25s ease;   /* Toggles, cambios de estado */
--transition-border:  border 0.20s ease; /* Focus en inputs */
--transition-width:   width 0.30s ease;  /* Barras de progreso */
```

Duración máxima de animaciones de UI: **350ms**.
No animar tablas con muchas filas (impacto en performance).

---

## 6. Iconografía

**Librería estándar del ecosistema Lyra: Lucide React.**
No mezclar con otras librerías de íconos en ningún producto Lyra.

Tamaños estándar:
```
11–12px — íconos dentro de chips y badges
14px    — íconos inline en texto
16px    — UI estándar (botones, inputs, navegación secundaria)
18px    — navegación lateral principal
20px    — acciones destacadas, headers de sección
24px    — íconos de énfasis, estados vacíos (empty states)
```

Reglas de uso:
- Color: heredar del contexto (`currentColor`). No hardcodear.
- No usar íconos solos en acciones importantes sin texto o tooltip.
- En botones: ícono a la izquierda del texto, gap 8px.
- En navegación: ícono fijo 18px, alineado a la izquierda.

---

## 7. Accesibilidad y uso en terreno

Estos no son nice-to-have: son requisitos del sistema.

```
Contraste mínimo texto/fondo:       4.5:1 (WCAG AA)
Tamaño mínimo de área táctil:       44 × 44px
Texto mínimo en contenido funcional: 13px
Focus visible:                       glow de acento (no remover outline)
```

Los colores de severidad y estado **nunca son el único indicador**:
siempre acompañados de texto, ícono o etiqueta.
(Ejemplo correcto: chip con ● color + texto "Sev 4 — Alto")
(Ejemplo incorrecto: solo un cuadrado naranja sin texto)

Consideraciones para terreno industrial:
- Dark mode como modo principal: reduce fatiga visual en turnos largos.
- Alto contraste entre texto y fondo en todos los estados.
- Botones de acción crítica con área táctil amplia y confirmación explícita.
- Formularios con campos grandes y feedback de error claro e inmediato.
- Firma digital: área mínima 300×100px con borde punteado visible.

---

## 8. Estados especiales

### 8.1 Empty state (pantalla vacía)
```
Ícono Lucide 24px — color-text-muted
Título: Sora 15px — color-text-secondary
Descripción: Inter 13px — color-text-muted
Acción primaria (opcional): botón Secondary
Centrado vertical y horizontal en el área disponible
```

### 8.2 Error state
```
Ícono AlertTriangle (Lucide) — color-error
Mensaje claro en color-text-primary
Acción de recuperación siempre disponible
```

### 8.3 Loading state
Usar spinner inline en botones para operaciones < 3 segundos.
Usar skeleton loaders para contenido de pantalla que tarda en cargar.
Nunca bloquear la pantalla completa con un spinner.

### 8.4 Fuera de rango (campos numéricos con umbral)
```
Border del input: color-error
Chip de alerta con pulse: background color-error-bg,
                          color color-error,
                          ícono AlertTriangle 13px
Texto: "Fuera de rango — generará incidencia automática"
```

---

## 9. Lo que NO hacer

Visual:
- ❌ Fondos blancos o claros (el sistema es dark mode)
- ❌ Sombras negras duras (usar glow con color del acento)
- ❌ Mezclar tipografías fuera de Sora e Inter
- ❌ Gradiente de marca como fondo de pantalla completa
- ❌ Colores de severidad para decoración sin semántica
- ❌ Valores en duro en componentes (siempre tokens)
- ❌ Animaciones decorativas sin función

Código:
- ❌ Crear componentes nuevos sin revisar si ya existe uno en packages/ui
- ❌ Copiar componentes entre apps (extraer a packages/ui)
- ❌ Íconos de librerías distintas a Lucide React

UX:
- ❌ Acciones destructivas sin confirmación explícita
- ❌ Colores como único indicador de estado (sin texto ni ícono)
- ❌ Áreas táctiles menores a 44×44px
- ❌ Texto funcional menor a 13px

---

## 10. Checklist para nuevos componentes

Antes de dar por terminado un componente nuevo, verificar:

- [ ] Usa tokens CSS, no valores en duro
- [ ] Funciona en dark mode (es el único modo)
- [ ] Área táctil mínima 44×44px si es interactivo
- [ ] Estados cubiertos: default, hover, focus, active, disabled, error
- [ ] Usa Lucide React para íconos
- [ ] Fuentes: solo Sora (títulos) e Inter (UI)
- [ ] Animaciones solo si son funcionales
- [ ] Accesible: contraste 4.5:1, focus visible, no solo color
- [ ] Documentado con variantes y props en su archivo
- [ ] Vive en packages/ui (no acoplado a una app específica)

---

*LYRA DESIGN SYSTEM v1.0 · ITESICWS*
*Actualizar este documento cada vez que se agregue o modifique un componente.*
*Último responsable de actualización: registrar en docs/DECISIONS.md*
```