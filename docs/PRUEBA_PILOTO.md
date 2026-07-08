# Lyra WatchLog — Guía de PRUEBA PILOTO en una VM Linux desnuda

Objetivo: instalar Lyra WatchLog **v0.1.20** en el servidor de un *cliente de prueba*
(una VM Linux sin nada instalado) y **verlo funcionando** de punta a punta, para
comprobar la eficacia de todo lo construido (paquete offline firmado, endurecimiento
CIS, ceremonia de licencia air-gapped, primer arranque `/setup`).

> **Alcance.** Esto es una **prueba/piloto controlado**, no un go-live productivo en
> una planta real (eso exige el pentest de tercero + paquete de evidencia, pendiente
> del programa "a prueba de balas"). Para una demo/piloto interno es exactamente el
> camino previsto por el paquete air-gapped (E2/E3).

Referencias: `docs/INSTALL_OFFLINE.md` (guía canónica), `docs/DEPLOYMENT.md`
(runbook), `docs/LICENSING.md` / `docs/LICENSING_PROCEDURE.md` (ceremonia de licencia),
`deploy/standalone/README.md` (modos de borde y matriz de puertos).

---

## 0. Mapa del piloto (quién hace qué)

Participan **dos máquinas**:

| Máquina | Rol | Necesita internet |
|---|---|---|
| **Tu estación** (esta, con el repo) | Descargas el paquete, verificas la firma y **emites la licencia de prueba** con tu clave PROD | Sí (solo para descargar el paquete) |
| **VM del cliente de prueba** (Linux desnuda) | Corre la plataforma. Instalas Docker + el paquete | **No** (air-gapped; solo recibe archivos por `scp`/USB) |

Flujo de una línea:
`descargar paquete → copiar a la VM → instalar → la VM genera solicitud.lreq → tú
emites license.lic → copiar a la VM → /setup crea el admin → entras y usas`.

> **⚠️ ¿Dónde corre cada comando?** Importa por la sintaxis del shell:
> - **En TU ESTACIÓN (Windows / PowerShell):** Fase 1 (descargar/verificar) y Fase 4
>   (emitir la licencia con `pnpm`). PowerShell **no** acepta `&&` ni `\` de
>   continuación de línea — usa los bloques marcados `powershell` de esta guía.
> - **En la VM del cliente (Linux / bash):** Fases 0, 2, 3, 5 y 6. Ahí la sintaxis bash
>   (`&&`, `\`) funciona tal cual.

---

## 1. Requisitos

**VM del cliente (mínimos):**
- Linux de servidor: Ubuntu 22.04+/Debian 12+/RHEL 8+ (cualquiera con `bash`).
- **4 GB RAM** (8 GB recomendado), **~10 GB de disco libre**, 2 vCPU.
- Acceso `ssh` con un usuario con `sudo`.
- Reloj en hora (para TLS y auditoría).

**Tu estación:**
- Este repositorio (`g:\Development\BitacorasInteligentes`) con `pnpm` instalado.
- Tu custodia de emisión en `~/.lyra-license/` (`prod-private.enc.pem` + passphrase en
  tu gestor). **Ya la tienes** (es la misma con la que se emitió el demo del EC2).
- `cosign` (opcional, para verificar la firma del paquete) — vía Docker sirve.

---

## 2. Fase 0 — Preparar la VM (instalar Docker)

Conéctate por SSH a la VM y instala Docker Engine + el plugin `compose` v2. En
Ubuntu/Debian, el instalador oficial es lo más simple:

```bash
# En la VM del cliente
curl -fsSL https://get.docker.com | sudo sh          # Docker Engine + compose plugin
sudo usermod -aG docker "$USER"                       # correr docker sin sudo
newgrp docker                                          # aplica el grupo en esta sesión
docker version && docker compose version               # verifica: Server + Compose v2
```

> Si la VM ya está air-gapped y no puede usar `get.docker.com`, instala Docker desde el
> repositorio interno/paquetes `.deb`/`.rpm` del cliente. `install.sh` exige
> `docker`, `docker compose` v2, `openssl` y `sha256sum` (estos tres suelen venir de
> base). No necesita nada más.

---

## 3. Fase 1 — Obtener y verificar el paquete (tu estación)

1. Descarga el bundle offline del Release **v0.1.20** (repo **privado** `victorrubilarc/lyra-platform`).
   Elige una vía:
   - **Navegador (la más simple, sin herramientas):** entra logueado a
     `https://github.com/victorrubilarc/lyra-platform/releases/tag/v0.1.20` y baja el asset
     **`lyra-watchlog-v0.1.20.tar.gz`** (~1.09 GB).
   - **Con `gh` (requiere estar autenticado):**
     ```bash
     gh auth login       # una vez, si no lo has hecho
     gh release download v0.1.20 --repo victorrubilarc/lyra-platform \
       --pattern "lyra-watchlog-v0.1.20.tar.gz"
     ```
     > Si `gh` "no se reconoce" en PowerShell tras instalarlo, **reabre la consola** (el
     > PATH se refresca al reiniciarla) o agrégalo a la sesión:
     > `$env:Path += ";C:\Program Files\GitHub CLI"`.
2. (**Opcional**) **Verifica la firma** antes de moverlo — prueba que vino de ITESICWS y
   no fue alterado. Puedes saltarte este paso: la firma ya se verificó al construir
   v0.1.20 y `install.sh` revalida la integridad (SHA256SUMS) en la VM antes de cargar.
   En **PowerShell** (tu estación):
   ```powershell
   mkdir vf -Force | Out-Null
   tar -xf lyra-watchlog-v0.1.20.tar.gz -C vf "lyra-watchlog-v0.1.20/SHA256SUMS" "lyra-watchlog-v0.1.20/SHA256SUMS.cosign.bundle" "lyra-watchlog-v0.1.20/cosign.pub"
   cd vf\lyra-watchlog-v0.1.20
   docker run --rm -v "${PWD}:/w" -w /w gcr.io/projectsigstore/cosign:v2.4.3 verify-blob --key cosign.pub --bundle SHA256SUMS.cosign.bundle --insecure-ignore-tlog=true SHA256SUMS
   cd ..\..
   ```
   Debe imprimir **`Verified OK`**.

---

## 4. Fase 2 — Copiar el paquete a la VM

```bash
# Desde tu estación
scp lyra-watchlog-v0.1.20.tar.gz USUARIO@IP_DE_LA_VM:/home/USUARIO/
```

En la VM, desempaca:

```bash
# En la VM
tar -xzf lyra-watchlog-v0.1.20.tar.gz
cd lyra-watchlog-v0.1.20
```

---

## 5. Fase 3 — Instalar (dos ejecuciones + certificado de prueba)

El instalador es **idempotente**: la 1ª ejecución genera secretos y se detiene pidiendo
lo específico del sitio; editas `.env`; la 2ª ejecución levanta el stack.

### 5.1 Primera ejecución (genera `.env` con secretos)

```bash
./install.sh
```
Termina con "COMPLETA lo específico del sitio en .env y vuelve a ejecutar" (exit 2).
Ya cargó las imágenes (`docker load`) y creó `.env` (chmod 600, secretos openssl).

### 5.2 Elegir el modo de borde

Para una prueba donde quieres **abrir la plataforma en un navegador**, lo más simple es
**modo (b) — borde propio con certificado**, con un **certificado autofirmado de prueba**
(en producción real sería el cert de la CA del cliente). Elige un nombre de host para la
prueba, p. ej. `watchlog.piloto.local`.

```bash
# En la VM, dentro de lyra-watchlog-v0.1.20/
HOST=watchlog.piloto.local
VM_IP=<IP_DE_LA_VM>          # p.ej. 10.0.0.20
mkdir -p certs
# Certificado autofirmado con el hostname y la IP en el SAN (válido 1 año):
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -keyout certs/key.pem -out certs/cert.pem \
  -subj "/CN=${HOST}" \
  -addext "subjectAltName=DNS:${HOST},IP:${VM_IP}"
chmod 600 certs/key.pem
```

Ajusta el **dominio en el Caddyfile del borde** (viene con un dominio de ejemplo):

```bash
sed -i "s/watchlog\.planta\.cliente\.local/${HOST}/g" edge/Caddyfile.edge
```

Edita `.env` y completa las dos líneas del sitio:

```bash
nano .env      # o vi
#   EDGE_MODE=b
#   APP_PUBLIC_URL=https://watchlog.piloto.local
#   (COOKIE_SECURE=true ya viene por defecto — el borde da HTTPS)
```

> **Alternativa sin certificado (modo a):** si prefieres no lidiar con certs, deja
> `EDGE_MODE=a`; la app queda en `127.0.0.1:8080` de la VM y la ves por un túnel SSH:
> `ssh -L 8080:127.0.0.1:8080 USUARIO@IP_DE_LA_VM` y abres `http://localhost:8080`.
> **Ojo:** con HTTP las cookies `Secure` no se setean; para ese modo pon
> `COOKIE_SECURE=false` en `.env` **solo para la prueba**. El modo (b) es más fiel a
> producción; recomendado.

### 5.3 Segunda ejecución (levanta el stack)

```bash
./install.sh
```
Verifica firma + integridad, levanta el stack por el modo elegido y espera el
healthcheck. Al terminar imprime los "próximos pasos" (licencia + `/setup`).

En este punto, un escaneo de red de la VM solo ve el **puerto 443** (modo b); Postgres,
Redis, MinIO y la API **no existen** como socket del host (viven en la red Docker interna).

---

## 6. Fase 4 — Emitir la licencia de prueba (tu estación)

El arranque dejó en la VM `./license/solicitud.lreq` (la huella de ESA instalación).

1. **Trae la solicitud a tu estación:**
   ```bash
   # Desde tu estación
   scp USUARIO@IP_DE_LA_VM:/home/USUARIO/lyra-watchlog-v0.1.20/license/solicitud.lreq .
   ```

2. **Emite la licencia** contra esa solicitud (habilitando TODOS los módulos y con un
   vencimiento corto por ser prueba). Desde la raíz del repo, en **PowerShell** (una sola
   línea; PowerShell no usa `\` de continuación):
   ```powershell
   pnpm license issue --request solicitud.lreq --customer "Cliente Prueba" --channel-partner PILOTO --edition enterprise --modules core,structure,templates,logbook,schedules,incidents,exceptions,work-orders,shift-handover,notifications,themes,ai,dashboards --max-nodes 50 --max-named-users 25 --expires 2026-10-08T00:00:00Z --grace-days 14 --out license.lic
   ```
   (Si prefieres multilínea legible en PowerShell, usar backtick `` ` `` al final de cada
   línea en vez de `\`.)
   - La CLI **pide la passphrase** de tu privada PROD (prompt sin eco) y la descifra solo
     en memoria. Queda **registrada en tu ledger** (`~/.lyra-license/ledger.jsonl`).
   - ⚠️ **Emite SIEMPRE contra la `solicitud.lreq` que generó la app** (no inventes un
     `installationId` a mano: quedaría sin historial y el `renew` te sería denegado).
   - QA opcional: `pnpm license inspect license.lic --request solicitud.lreq`
     (debe VALIDAR contra esa huella).

3. **Devuelve la licencia a la VM:**
   ```bash
   scp license.lic USUARIO@IP_DE_LA_VM:/home/USUARIO/lyra-watchlog-v0.1.20/license/
   ```
   La app la toma automáticamente (o la importas desde `/setup` en el paso siguiente).

---

## 7. Fase 5 — Primer arranque `/setup` (crear el administrador)

1. Si usaste un hostname, **apunta tu navegador a la VM**. En tu laptop añade al archivo
   de hosts la línea (Windows: `C:\Windows\System32\drivers\etc\hosts`; Linux/Mac:
   `/etc/hosts`):
   ```
   <IP_DE_LA_VM>   watchlog.piloto.local
   ```
2. Abre **`https://watchlog.piloto.local/setup`** (acepta la advertencia del certificado
   autofirmado — es esperado en la prueba).
3. Ingresa el **token de un solo uso**. Lo obtienes de la VM:
   ```bash
   cat /home/USUARIO/lyra-watchlog-v0.1.20/license/setup-token
   ```
4. El asistente: crea el **administrador** (correo + contraseña), aplica identidad/tema y
   confirma la **licencia** (si no la copiaste por archivo, aquí la importas). Al terminar,
   el token y el archivo se invalidan.

---

## 8. Fase 6 — Verificar que funciona

Con el admin creado, entra por `https://watchlog.piloto.local` y recorre el camino feliz:

1. **Login** con el administrador.
2. **Estructura** → crea un nodo (área/planta) — comprueba estructura organizacional.
3. **Plantillas** → crea una plantilla de bitácora con un par de campos (número con
   rango, texto, selección) — comprueba el form builder.
4. **Bitácoras** → registra una entrada de turno en esa plantilla — comprueba captura.
5. **Incidencias** → abre una incidencia y muévela por su flujo — comprueba workflow.
6. **Configuración › Licencia** → verifica estado **VÁLIDA**, edición y módulos.

Salud interna (en la VM):
```bash
docker compose --project-directory . --env-file .env \
  -f compose/docker-compose.yml -f compose/mode-b.own-edge.yml ps
# la 'api' debe verse healthy; solo 443 LISTEN en el host
```

---

## 9. Anexos

### 9.1 Respaldo cifrado (opcional en la prueba)
El paquete trae `onprem/backup.sh`/`restore.sh` + `tools/age`. Para una prueba puedes
omitir el cifrado (deja `BACKUP_AGE_RECIPIENT=` vacío → respaldo en claro + aviso). En un
servidor de tercero con datos reales, cífralos (ver `INSTALL_OFFLINE.md §10`).

### 9.2 Actualizar a un paquete nuevo
Lleva el nuevo `.tar.gz`, desempácalo, **copia tu `.env`, `license/` y `certs/`** al
directorio nuevo y corre `./install.sh` (respalda la BD antes; la migración es
forward-only). Ver `INSTALL_OFFLINE.md §9`.

### 9.3 Desmontar la prueba
```bash
# En la VM, dentro de lyra-watchlog-v0.1.20/
docker compose --project-directory . --env-file .env \
  -f compose/docker-compose.yml -f compose/mode-b.own-edge.yml down -v   # -v borra los datos
```

### 9.4 Problemas frecuentes
- **`install.sh` aborta "FIRMA INVÁLIDA"**: el paquete se corrompió al copiar — re-copia el
  `.tar.gz` y re-verifica el SHA256 del Release.
- **La API no queda healthy**: `docker compose ... logs api` (revisa RAM libre ≥4 GB).
- **La API no puede escribir la licencia** (uid non-root): `sudo chown -R 1000:1000
  license certs` en el directorio del paquete y reintenta.
- **El navegador no llega**: confirma la línea en tu archivo de hosts y que 443 esté
  LISTEN (`sudo ss -ltnp | grep :443` en la VM); revisa el firewall del cliente.
- **Estado de licencia "solo lectura"**: falta importar `license.lic` o la huella no calza
  (¿emitiste contra la `solicitud.lreq` de ESTA instalación?).
