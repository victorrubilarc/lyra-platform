# Lyra WatchLog — Matriz de plataformas soportadas

Este documento define **dónde** ITESICWS soporta la instalación del paquete offline de
Lyra WatchLog (E2), y con qué salvedades. Decidida por el dueño el 2026-07-08 tras la 1ª
prueba piloto real. Es un documento **VIVO**: se actualiza al cambiar el alcance.

> **Regla de oro:** el paquete offline (imágenes de `make-bundle`) es **amd64**. El
> instalador (`install.sh`) **verifica la arquitectura del daemon Docker en el preflight
> y aborta** si no es amd64, con un mensaje que apunta a este documento. No hay build
> multi-arch por ahora.

---

## ✅ Soportado

### Linux x86-64 (destino principal, producción)

| Aspecto | Detalle |
|---|---|
| **Arquitectura** | x86-64 / amd64 (el daemon Docker debe reportar `amd64`). |
| **Distribuciones probadas** | Ubuntu 22.04 / 24.04 LTS, Debian 12. |
| **Distribuciones esperadas** | RHEL / Rocky / AlmaLinux 8–9, SLES 15 (cualquiera con `bash`, Docker Engine ≥ 20.10 y `docker compose` v2). |
| **Contenedores** | Linux (nativos). |
| **Acceso** | Por **hostname** (con DNS/hosts interno, SNI) **o** por **IP** (el instalador pone `default_sni` automáticamente). |
| **Recursos mínimos** | 4 GB RAM (8 recomendado), ~10 GB disco libre. |
| **Utilidades del host** | `docker`, `docker compose` v2, `openssl`, `sha256sum`, `curl`. `ss`/`netstat` opcional (para el preflight de puertos). |
| **Estado del smoke** | ✅ CI automático (`.github/workflows/install-smoke.yml`): modo a + modo b (hostname con SNI e IP con `default_sni`) + `doctor`. |

**Modos de borde** (ver `docs/INSTALL_OFFLINE.md §5`):
- **`a`** — detrás del proxy/appliance del cliente (F5/NetScaler/NGINX/IIS). La app queda en loopback.
- **`b`** — borde propio con TLS. El instalador **genera** el `Caddyfile` y un cert self-signed
  (o usa el corporativo si lo colocas). Único puerto LISTEN: 443/tcp (+80 redirect).

### Windows (Docker Desktop / WSL2 con contenedores Linux) — pilotos/estaciones

| Aspecto | Detalle |
|---|---|
| **Arquitectura** | amd64. Los contenedores Linux del paquete corren sobre **WSL2** (Hyper-V) vía Docker Desktop en modo **"Linux containers"** (el preflight aborta si el daemon reporta `windows`). |
| **SO probado** | Windows 11 Pro (Docker Desktop + WSL2). Windows Server con Docker Desktop/WSL2 = posible, atípico (ver caveat). |
| **Instalador** | `install.ps1` — **espejo nativo** de `install.sh` (misma lógica; PowerShell 5.1+). `doctor.ps1` = `install.ps1 -Check`. Guía: `docs/INSTALL_OFFLINE.md §12`. |
| **Huella de licencia (L1)** | **Anclada al `MachineGuid`** del host Windows (`HKLM\…\Cryptography`), escrita en `license\machine-id` + `LICENSE_MACHINE_ID_FILE=/app/license/machine-id`. **NO** se usa `/etc/machine-id` (no fiable bajo Docker Desktop: se regenera al actualizar DD / resetear WSL). Ver `DECISIONS 2026-07-08`. |
| **Permisos** | El `chown uid 1000` no aplica al FS Windows; `install.ps1` corre un **probe** (`docker run -u 1000:1000`) que valida que el `api` non-root pueda escribir `./license` antes de arrancar. **Recomendado:** paquete en el **FS de WSL2** (ext4) por rendimiento y permisos; o habilitar la unidad en Docker Desktop → File Sharing. |
| **Utilidades del host** | Docker Desktop (compose v2) · **openssl** en el `PATH` (Git for Windows / portable, misma dependencia que Linux) · `curl.exe`/`tar.exe` (nativos de Windows 10+). |
| **Estado del smoke** | **Manual/self-hosted** (`scripts/smoke-install-windows.ps1`): CI en `windows-latest` no corre contenedores Linux de forma fiable. El *plumbing* de la huella-por-archivo (lo único compartido) se cubre además en el smoke Linux de CI. Modo a validado en vivo 2026-07-08. |

**Caveat honesto:** Windows Server como destino **productivo** es atípico en la industria
(el estándar es Linux x86-64). Windows se soporta principalmente para **pilotos y
estaciones**; para producción real usar el destino principal Linux.

---

## ❌ Fuera de alcance (por ahora)

- **ARM64 / aarch64** (Raspberry Pi, servidores ARM, Apple Silicon nativo): requeriría un
  build multi-arch de las imágenes y del binario `age` embarcado. No planificado.
- **macOS como servidor de producción.**
- **Kubernetes / orquestadores** (el paquete es `docker compose` standalone, air-gapped).
- **IPv6 literal** en `APP_PUBLIC_URL` (usa hostname o IPv4).

---

## Cómo lo hace cumplir el instalador

1. **Preflight de arquitectura:** `install.sh` lee `docker version -f '{{.Server.Arch}}'`.
   Si no es `amd64`, aborta con un mensaje claro que remite a este documento.
2. **Preflight de utilidades y puertos:** verifica `docker`/`compose`/`openssl`/`sha256sum`
   y que los puertos del modo (80/443 o el loopback de modo a) estén libres.
3. **`make-bundle` (`assert_arch`):** en el build, cada imagen del paquete se valida contra
   `EXPECTED_ARCH=amd64`; si alguna no calza, el bundle **no se produce** (atajó el bug de
   MinIO arm64 del piloto).
4. **Diagnóstico:** `install.sh --check` (o `doctor.sh`) reporta todo lo anterior en vivo.
