# Logo de la empresa licenciataria

Coloca aquí el logo del cliente para el co-branding del login (single-tenant).

## Cómo configurarlo

En el `.env` (raíz del monorepo) define:

```bash
VITE_LICENSEE_NAME=Eagon Lautaro Ltda.
VITE_LICENSEE_INDUSTRY=Industria de la madera   # opcional (subtítulo)
VITE_LICENSEE_LOGO_URL=/branding/eagon.svg       # archivo local de esta carpeta
# …o una URL absoluta: VITE_LICENSEE_LOGO_URL=https://cliente.cl/logo.svg
```

Todo lo que pongas en `public/` se sirve desde la raíz del sitio: un archivo
`public/branding/eagon.svg` queda accesible como `/branding/eagon.svg`.

Si no defines `VITE_LICENSEE_LOGO_URL` (o el archivo falla al cargar), la UI usa
automáticamente un **monograma** con las iniciales de `VITE_LICENSEE_NAME`.

## Tamaño y formato recomendados

El logo se muestra sobre una **placa blanca** (para que cualquier color sea
legible sobre el tema oscuro), con estas alturas de visualización:

- Panel de marca: alto ~40 px (placa de 58 px), ancho máx. ~210 px.
- Tarjeta de login: alto ~28 px (placa de 44 px), ancho máx. ~168 px.

Recomendado:

- **SVG con fondo transparente** (ideal: vectorial, nítido a cualquier escala).
- Si es PNG: **fondo transparente**, **horizontal**, entregado a ~2× →
  **alto 80–120 px**, ancho proporcional hasta ~320 px. (También sirve un logo
  cuadrado; la placa se adapta.)
- No necesitas una versión en blanco: la placa clara ya garantiza contraste.
