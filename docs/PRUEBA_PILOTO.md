# Guía para principiantes — Probar Lyra WatchLog en un servidor

Esta guía te lleva **de la mano**, paso por paso, para instalar Lyra WatchLog en un
servidor Linux de prueba y **verlo funcionando en el navegador**. No necesitas ser
experto: solo copiar y pegar los comandos **en el lugar correcto**.

> **¿Para qué sirve esta prueba?** Comprobar, en una máquina real de un cliente de
> prueba, que todo lo construido funciona: el instalador, la seguridad, la licencia y la
> aplicación. Es un **piloto de demostración**, no todavía una puesta en producción
> definitiva (eso viene después, con la auditoría de seguridad externa).

---

## 🧭 Lo mínimo que debes entender antes de empezar

Vas a trabajar con **dos computadores**:

1. **TU PC** — tu computador Windows de siempre. Desde aquí descargas el instalador,
   te conectas al servidor y (si eres el dueño) generas la licencia.
2. **EL SERVIDOR** — la máquina Linux del cliente de prueba, "en la nube" o en su red.
   No tiene pantalla ni mouse para ti: la controlas **escribiendo comandos** desde tu PC
   a través de una conexión llamada **SSH** (como un control remoto por texto).

Cada comando de esta guía tiene una **etiqueta de color** que te dice dónde escribirlo:

| Etiqueta | Dónde y cómo |
|---|---|
| 💻 **EN TU PC (PowerShell)** | En tu Windows. Abre el menú Inicio, escribe **PowerShell**, ábrelo. |
| 🐧 **EN EL SERVIDOR (bash)** | Dentro del servidor Linux, **después de conectarte por SSH** (Paso 1). |
| 🌐 **EN TU NAVEGADOR** | Chrome/Edge/Firefox en tu PC. |

> **Regla de oro:** PowerShell (tu PC) y bash (el servidor) son **idiomas distintos**. Un
> comando de bash pegado en PowerShell da error (y al revés). Fíjate SIEMPRE en la
> etiqueta antes de pegar.

---

## 📝 Antes de empezar: anota estos datos

Pídeselos al cliente (o a quien creó la VM) y tenlos a mano. Los usarás varias veces:

| Dato | Ejemplo | El tuyo |
|---|---|---|
| **IP del servidor** | `200.100.50.10` | `________________` |
| **Usuario del servidor** | `ubuntu` | `________________` |
| **Contraseña o llave SSH** | (te la da el cliente) | `________________` |

En los comandos verás cosas como `USUARIO` e `IP_DEL_SERVIDOR`. **Reemplázalas** por tus
datos reales (sin los signos `<` `>` si los hubiera). Ejemplo: si tu usuario es `ubuntu`
y la IP es `200.100.50.10`, entonces `USUARIO@IP_DEL_SERVIDOR` se escribe
`ubuntu@200.100.50.10`.

**Requisitos del servidor** (para que la prueba corra bien): Linux (Ubuntu/Debian
recomendado), **4 GB de RAM** (8 mejor), **10 GB de disco libre**.

---

## Paso 1 — Conéctate al servidor e instálale Docker

Docker es el motor que hace correr la aplicación. La VM "no tiene nada", así que primero
se lo instalamos.

### 1.1 Conéctate al servidor por SSH

💻 **EN TU PC (PowerShell):**
```powershell
ssh USUARIO@IP_DEL_SERVIDOR
```
- La **primera vez** te preguntará `Are you sure you want to continue connecting?` →
  escribe **`yes`** y Enter.
- Te pedirá la **contraseña** del servidor (al escribirla no se ve nada en pantalla, es
  normal) → Enter.
- ✅ **Sabrás que entraste** porque el texto al inicio de la línea cambia a algo como
  `usuario@servidor:~$`. **A partir de aquí estás DENTRO del servidor**: los comandos
  siguientes son 🐧 bash.

### 1.2 Instala Docker

🐧 **EN EL SERVIDOR (bash):**
```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```
Cierra la sesión y vuelve a entrar para que el permiso tome efecto:
```bash
exit
```
💻 **EN TU PC (PowerShell):** vuelve a conectarte:
```powershell
ssh USUARIO@IP_DEL_SERVIDOR
```
🐧 **EN EL SERVIDOR (bash):** comprueba que Docker quedó bien:
```bash
docker version
docker compose version
```
- ✅ **Deberías ver** un número de versión en cada uno (no un error "command not found").

> Si el servidor NO tiene internet (algunas plantas lo bloquean), pídele al cliente que
> instale Docker desde su repositorio interno. Es lo único que la app necesita de base.

---

## Paso 2 — Descarga el instalador (en tu PC)

El instalador es **un solo archivo** de ~1 GB llamado `lyra-watchlog-v0.1.20.tar.gz`.

🌐 **EN TU NAVEGADOR:** entra (con tu cuenta de GitHub) a esta dirección:
```
https://github.com/victorrubilarc/lyra-platform/releases/tag/v0.1.20
```
Busca la sección **Assets** y haz clic en **`lyra-watchlog-v0.1.20.tar.gz`** para
descargarlo. Normalmente cae en tu carpeta **Descargas**.

- ✅ **Deberías tener** el archivo `lyra-watchlog-v0.1.20.tar.gz` en `Descargas`.

---

## Paso 3 — Copia el instalador al servidor (desde tu PC)

💻 **EN TU PC (PowerShell):** primero ve a la carpeta donde quedó el archivo:
```powershell
cd ~\Downloads
```
Ahora cópialo al servidor (reemplaza USUARIO e IP por los tuyos):
```powershell
scp lyra-watchlog-v0.1.20.tar.gz USUARIO@IP_DEL_SERVIDOR:/home/USUARIO/
```
- Te pedirá la contraseña otra vez. La copia de 1 GB **tarda varios minutos** (verás una
  barra de progreso).
- ✅ **Deberías ver** que llega al 100 %.

---

## Paso 4 — Desempaqueta el instalador (en el servidor)

💻 **EN TU PC (PowerShell):** conéctate al servidor:
```powershell
ssh USUARIO@IP_DEL_SERVIDOR
```
🐧 **EN EL SERVIDOR (bash):** descomprime y entra a la carpeta:
```bash
tar -xzf lyra-watchlog-v0.1.20.tar.gz
cd lyra-watchlog-v0.1.20
ls
```
- ✅ **Deberías ver** archivos como `install.sh`, `images`, `compose`, `SHA256SUMS`.

---

## Paso 5 — Primera pasada del instalador (en el servidor)

Esta primera pasada carga la aplicación y prepara la configuración. **Se detiene a
propósito** para que completes dos datos del sitio.

🐧 **EN EL SERVIDOR (bash):**
```bash
./install.sh
```
- El instalador verifica el paquete, carga las imágenes y crea un archivo de
  configuración llamado `.env`.
- ⚠️ **Verás un aviso amarillo sobre `cosign`** ("Paquete FIRMADO pero 'cosign' no está en
  este host… firma NO verificada aquí"). **Es NORMAL, no es un error.** La herramienta que
  verifica la firma no está instalada en el servidor, así que ese chequeo (opcional) se
  salta. El chequeo importante de **integridad (SHA256SUMS) sí se ejecuta**.
- ⏳ **El paso "Verificación de integridad (SHA256SUMS)" puede tardar 1–2 minutos** (está
  revisando ~1 GB). El cursor parpadeando ahí **no** significa que esté colgado: espera,
  no presiones nada.
- ✅ **Es NORMAL que termine con un aviso** parecido a *"COMPLETA lo específico del sitio
  en .env y vuelve a ejecutar"*. No es un error: significa "ahora ve al Paso 6".

---

## Paso 6 — Configura el acceso (certificado + datos del sitio)

Para poder abrir la app en el navegador **por HTTPS**, creamos un certificado de prueba y
le decimos a la app cuál es su dirección. Usaremos directamente la **IP del servidor**
(lo más simple; no hay que tocar DNS ni nada).

### 6.1 Crea el certificado de prueba

🐧 **EN EL SERVIDOR (bash):** (reemplaza `IP_DEL_SERVIDOR` por la IP real, en los DOS lugares)
```bash
mkdir -p certs
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout certs/key.pem -out certs/cert.pem \
  -subj "/CN=IP_DEL_SERVIDOR" \
  -addext "subjectAltName=IP:IP_DEL_SERVIDOR"
chmod 600 certs/key.pem
```
- ✅ **Deberías ver** que se crean `certs/cert.pem` y `certs/key.pem` (sin errores).

### 6.2 Dile a la app su dirección (edita el borde)

🐧 **EN EL SERVIDOR (bash):** primero asegura que exista el archivo del borde en la raíz
del paquete (en el paquete v0.1.20 viene bajo `compose/edge/`; este comando lo deja en su
sitio correcto — es inofensivo repetirlo):
```bash
mkdir -p edge
[ -f edge/Caddyfile.edge ] || cp compose/edge/Caddyfile.edge edge/Caddyfile.edge
```
Ahora escribe tu IP en la config del borde (reemplaza `IP_DEL_SERVIDOR`):
```bash
sed -i "s/watchlog\.planta\.cliente\.local/IP_DEL_SERVIDOR/g" edge/Caddyfile.edge
grep IP_DEL_SERVIDOR edge/Caddyfile.edge      # comprueba: deben salir 2 líneas con tu IP
```
- ✅ **Deberías ver** dos líneas con tu IP (una `http://` y una `https://`).

### 6.3 Completa el archivo de configuración `.env`

Hay que fijar **dos** valores en `.env`: el modo de borde (`b`) y la dirección pública.
Lo más seguro es hacerlo con estos dos comandos (dejan cada línea **limpia, sin
comentarios** — un comentario en la misma línea rompe el instalador):

🐧 **EN EL SERVIDOR (bash):** (reemplaza `IP_DEL_SERVIDOR` en el segundo comando)
```bash
sed -i 's/^EDGE_MODE=.*/EDGE_MODE=b/' .env
sed -i 's#^APP_PUBLIC_URL=.*#APP_PUBLIC_URL=https://IP_DEL_SERVIDOR#' .env
grep -E '^EDGE_MODE=|^APP_PUBLIC_URL=' .env
```
- ✅ El `grep` debe mostrar **exactamente** dos líneas, cada una con solo su valor:
  ```
  EDGE_MODE=b
  APP_PUBLIC_URL=https://IP_DEL_SERVIDOR
  ```
  (sin ningún `#` ni texto extra después). Si ves un `#` al final, vuelve a correr los
  dos `sed`.

> **¿Prefieres editar a mano?** Puedes usar `nano .env`, pero entonces **borra el
> comentario** de esas dos líneas (todo lo que va después del valor, incluido el `#`).
> Guardar en `nano`: **Ctrl+O**, **Enter**, **Ctrl+X**.

---

## Paso 7 — Segunda pasada del instalador (en el servidor)

Ahora sí, el instalador levanta todo.

🐧 **EN EL SERVIDOR (bash):**
```bash
./install.sh
```
- Verifica de nuevo el paquete, enciende la aplicación y espera a que esté "sana".
- ✅ **Deberías ver** al final `API saludable` y una lista de "próximos pasos"
  (licencia y `/setup`).
- ❌ Si dice que la API **no** quedó sana, mira el Paso *"Si algo sale mal"* más abajo.

En este momento la aplicación **ya está corriendo**, pero está en modo **solo lectura**
hasta que le pongas una licencia (Paso 8). Es a propósito: la licencia nunca borra ni
secuestra datos.

---

## Paso 8 — Crea la licencia de prueba

> **¿Quién hace este paso?** Lo hace **el dueño del producto** (tú, ITESICWS), en tu PC de
> desarrollo donde está el proyecto y tu **llave de emisión**. El servidor del cliente
> **nunca** necesita internet: solo viajan dos archivos pequeños (uno de ida y uno de
> vuelta).

Al encenderse, el servidor dejó un archivo de **solicitud** con la "huella" de esa
instalación. El flujo es: **traer la solicitud → generar la licencia → devolver la
licencia**.

### 8.1 Trae la solicitud a tu PC

💻 **EN TU PC (PowerShell):** (reemplaza USUARIO e IP)
```powershell
scp USUARIO@IP_DEL_SERVIDOR:/home/USUARIO/lyra-watchlog-v0.1.20/license/solicitud.lreq .
```
- ✅ Ahora tienes `solicitud.lreq` en tu carpeta actual.

### 8.2 Genera la licencia con tu llave

💻 **EN TU PC (PowerShell):** ve a la carpeta del proyecto y ejecuta (todo en **una sola
línea**):
```powershell
cd G:\Development\BitacorasInteligentes
pnpm license issue --request solicitud.lreq --customer "Cliente Prueba" --channel-partner PILOTO --edition enterprise --modules core,structure,templates,logbook,schedules,incidents,exceptions,work-orders,shift-handover,notifications,themes,ai,dashboards --max-nodes 50 --max-named-users 25 --expires 2026-10-08T00:00:00Z --grace-days 14 --out license.lic
```
- Te pedirá la **contraseña (passphrase)** de tu llave de emisión. Escríbela (no se ve al
  teclear) y Enter.
- ✅ **Deberías obtener** un archivo `license.lic` en la carpeta.

### 8.3 Devuelve la licencia al servidor

💻 **EN TU PC (PowerShell):** (reemplaza USUARIO e IP)
```powershell
scp license.lic USUARIO@IP_DEL_SERVIDOR:/home/USUARIO/lyra-watchlog-v0.1.20/license/
```
- ✅ La app tomará la licencia automáticamente en unos segundos.

---

## Paso 9 — Crea tu usuario administrador (en el navegador)

La primera vez, la app te deja crear al administrador con un **código de un solo uso**.

### 9.1 Consigue el código

💻 **EN TU PC (PowerShell):** conéctate al servidor y léelo:
```powershell
ssh USUARIO@IP_DEL_SERVIDOR
```
🐧 **EN EL SERVIDOR (bash):**
```bash
cat lyra-watchlog-v0.1.20/license/setup-token
```
- ✅ Copia el texto largo que aparece (ese es tu código).

### 9.2 Abre el asistente y crea el admin

🌐 **EN TU NAVEGADOR:** entra a (reemplaza la IP):
```
https://IP_DEL_SERVIDOR/setup
```
- El navegador mostrará una **advertencia de seguridad** ("la conexión no es privada").
  Es **normal** porque el certificado es de prueba (autofirmado). Haz clic en
  **"Avanzado" → "Continuar de todos modos"**.
- Pega el **código** del paso anterior.
- Sigue el asistente: crea tu **correo y contraseña** de administrador, elige la
  identidad/tema y confirma la licencia. Al terminar, el código se desactiva solo.

---

## Paso 10 — Entra y prueba la plataforma

🌐 **EN TU NAVEGADOR:** entra a:
```
https://IP_DEL_SERVIDOR
```
Inicia sesión con el correo y contraseña que creaste. Para comprobar que todo funciona,
recorre este camino:

1. **Estructura** → crea un área o planta.
2. **Plantillas** → crea una plantilla de bitácora con un par de campos.
3. **Bitácoras** → registra una entrada de turno.
4. **Incidencias** → abre una incidencia y muévela por su flujo.
5. **Configuración → Licencia** → verifica que diga **VÁLIDA**.

🎉 Si puedes hacer todo eso, **la prueba fue exitosa**: la plataforma está instalada,
licenciada y operativa en el servidor del cliente.

---

## 🆘 Si algo sale mal

- **"El término 'gh'/'pnpm'/'docker' no se reconoce"** (en PowerShell): esa herramienta no
  está en el PATH o la consola es vieja. **Cierra y abre PowerShell de nuevo**, o instala
  la herramienta que falte.
- **`&&` no es un separador válido** (en PowerShell): copiaste un comando de bash. Usa el
  recuadro marcado 💻 PowerShell, o ejecuta los comandos **uno por línea**.
- **`install.sh` dice que la API no quedó sana:** revisa los registros para ver el motivo.
  🐧 En el servidor: `docker compose --project-directory . --env-file .env -f compose/docker-compose.yml -f compose/mode-b.own-edge.yml logs api`.
  Causa típica: poca RAM (necesita ≥4 GB libres).
- **El navegador no abre la página:** confirma que escribiste `https://` (no `http://`) y
  la IP correcta; pídele al cliente que **abra el puerto 443** en su firewall.
- **La app queda en "solo lectura":** falta la licencia (Paso 8) o no calza con esa
  instalación. Asegúrate de haber generado la licencia contra la `solicitud.lreq` de ESTE
  servidor.
- **La API no puede guardar la licencia** (permisos): 🐧 en el servidor, dentro de la
  carpeta del paquete: `sudo chown -R 1000:1000 license certs` y repite el Paso 8.3.

---

## 🧹 Apagar o borrar la prueba (opcional)

🐧 **EN EL SERVIDOR (bash):** dentro de `lyra-watchlog-v0.1.20/`:
```bash
# Apagar (conserva los datos):
docker compose --project-directory . --env-file .env -f compose/docker-compose.yml -f compose/mode-b.own-edge.yml down

# Apagar Y BORRAR TODOS los datos de la prueba:
docker compose --project-directory . --env-file .env -f compose/docker-compose.yml -f compose/mode-b.own-edge.yml down -v
```

---

## 📚 Para profundizar

- `docs/INSTALL_OFFLINE.md` — la guía técnica completa (respaldos, actualizaciones, modos
  de borde avanzados).
- `docs/LICENSING_PROCEDURE.md` — la ceremonia de licencia en detalle.
- `docs/DEPLOYMENT.md` — endurecimiento del servidor y matriz de puertos para el equipo de
  redes del cliente.
