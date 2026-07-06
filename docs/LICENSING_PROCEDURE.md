# Procedimiento de licenciamiento — Runbook operacional (cómo se entrega y se activa)

> **Qué es este documento.** El **paso a paso operacional** de cómo ITESICWS entrega el software a un
> socio de canal, cómo se activa cada instalación en el cliente final, cómo se manejan "N licencias",
> y cuándo/dónde se ofusca el código. Es el "manual de operación" del licenciamiento. El **porqué** de
> la estrategia está en [`LICENSING_STRATEGY.md`](./LICENSING_STRATEGY.md); el **cómo técnico interno**
> en [`LICENSING.md`](./LICENSING.md); el modelo comercial en [`estrategia-canal.md`](./estrategia-canal.md).
>
> Fecha: **2026-07-06**. Estado: **OPERATIVO para emisión Y renovación** — L0 (núcleo `@lyra/licensing`), **L1
> (runtime en la API)**, L2 (gating por entitlement), **L3 (emisión real)**, **L4 (renovación con linaje)** y **L6
> (UI de estado + avisos)** están construidos: la app arranca en PENDIENTE_DE_ACTIVACIÓN sin licencia, **genera
> `solicitud.lreq` sola** (§2 Fase B paso 2 = real), verifica firma/huella, hace cumplir la máquina de estados,
> **ITESICWS ya emite con `lyra-license`** (`pnpm license keygen|issue|renew|inspect|ledger` — §2 paso 4 y §5-bis =
> reales; primera emisión real: el EC2 demo), la **renovación por archivos con detección de clon es REAL** (§4: la
> app deja `renovacion.lreq` sola y `renew` acusa el linaje repetido) y **el admin de planta VE el estado y recibe
> los avisos** (banner + Configuración › Licencia + correos/campanita del Bloque N — `LICENSING.md §5.2`). La imagen
> de release **embebe la pública de PROD** desde el primer tag post-L3. Falta el anti-tamper (L5) y el enforcement
> de límites (L2b). Plan L0–L6 en `BACKLOG.md §2(1)`.

---

## 0. La idea que resuelve tu duda en una frase

> **El software es UNO solo para todos. La licencia es una por instalación. No entregas 10 paquetes:
> entregas 1 paquete (reutilizable infinitas veces) + emites 10 licencias, cada una amarrada a una
> máquina concreta.**

Piénsalo como **Microsoft Windows**: el DVD/ISO de instalación de Windows es **el mismo** para el
planeta entero. Lo que te hace único y legal es **tu clave de producto (product key)**, que activas
contra Microsoft y queda atada a **tu** PC. Nadie te manda "10 Windows distintos" si compras 10
licencias: te manda **1 instalador y 10 claves**. Aquí es idéntico.

| Concepto | Qué es | ¿Es único por cliente? | ¿Quién lo produce? |
|---|---|---|---|
| **El paquete** (imágenes Docker de Lyra WatchLog) | El programa en sí: API, web, worker, etc. | ❌ **NO** — es idéntico para todos | ITESICWS, **una vez por versión**, en su CI |
| **La licencia** (`license.lic`) | Un archivo firmado que "enciende" UNA instalación en UNA máquina | ✅ **SÍ** — una por servidor | ITESICWS, **una por activación**, con la CLI de emisión |

**Consecuencia directa (responde tu requisito estrella):** tú no controlas cuántas *copias del
software* andan dando vueltas (son idénticas y copiables, como el ISO de Windows). Tú controlas
cuántas **licencias emites**, y una instalación **sin licencia válida no opera**. Como solo tú tienes
la clave privada para emitir, **el socio no puede "encender" un servidor extra sin pedírtelo → y al
pedírtelo, tú te enteras y cuenta contra su banda.** Ese es el candado del canal.

---

## 1. Los tres actores

```
   ┌──────────────┐   1. entrega paquete + emite licencias    ┌──────────────┐
   │  ITESICWS    │ ─────────────────────────────────────────▶│ SOCIO DE     │
   │ (fabricante) │                                            │ CANAL        │
   │ • clave      │◀───── 2. pide activación (por cada         │ (mayorista,  │
   │   PRIVADA    │           instalación nueva) ──────────────│  marca       │
   │ • CLI emisión│                                            │  blanca)     │
   └──────────────┘                                            └──────┬───────┘
                                                                      │ 3. instala y
                                                                      │    revende con SU marca
                                                                      ▼
                                                               ┌──────────────┐
                                                               │ CLIENTE FINAL│
                                                               │ (minera, etc)│
                                                               │ • su servidor│
                                                               │ • su license │
                                                               └──────────────┘
```

- **ITESICWS (tú):** construyes el paquete, guardas la **clave privada** (la que firma licencias), y
  **emites** cada `license.lic`. Eres el único que puede "encender" instalaciones.
- **Socio de canal:** compra una **banda** de N licencias anuales, recibe el paquete **una vez**, y
  hace las implementaciones en sus clientes. Por cada servidor que levanta, **te pide una activación**.
- **Cliente final:** donde corre la instalación. No sabe de licencias; solo usa el producto (con la
  marca del socio).

---

## 2. Procedimiento de entrega — primera instalación (paso a paso)

### Fase A · Una sola vez: le das el paquete al socio
Esto se hace **una vez por socio** (o una vez por versión cuando hay update). NO se repite por licencia.

1. **Publicas la versión** en tu registro de contenedores privado (GHCR), ya firmada (cosign) — ver
   [`SECURITY.md §9`](./SECURITY.md). Las imágenes ya salen minificadas/ofuscadas del CI (ver §6).
2. **Le das al socio acceso de descarga:**
   - **Con internet:** un **token read-only del registro, exclusivo de ese socio**, para que haga
     `docker pull` de las imágenes por *digest* fijo.
   - **Air-gapped (sin internet):** le entregas un **bundle offline** = un archivo `.tar` con todas las
     imágenes (`docker save`) + el `docker-compose.prod.yml` + el `install.sh`, en un USB o descarga.
     En la planta se hace `docker load` desde el `.tar`. **Cero internet requerido.**
3. El socio ya tiene **el programa**. Pero todavía **no opera**: sin licencia, arranca en modo
   "PENDIENTE DE ACTIVACIÓN" (deja configurar lo mínimo, no deja operar).

> **Aquí está la respuesta a "¿10 licencias = 10 paquetes?": NO.** El socio usa **este mismo paquete**
> para las 10 (o las 50) instalaciones. Copiar el paquete es libre e inofensivo — sin licencia no sirve.

### Fase B · Por CADA instalación: la ceremonia de activación
Esto se repite **una vez por cada servidor** que el socio levanta (una por licencia). Es el baile
**solicitud → emisión → importación** (challenge-response), que funciona **con o sin internet**:

1. **Desplegar el stack** en el servidor del cliente final (las mismas imágenes de la Fase A).
   **Requisito del compose (ya incluido en los compose del repo):** el servicio `api` monta
   `/etc/machine-id` del **host** (ro) — es la señal dominante de la huella; sin ese mount la huella
   sería la del contenedor y cambiaría al recrearlo — y la carpeta `./license:/app/license` (rw),
   donde vive `license.lic` y donde la app deja la solicitud.
2. **Al primer arranque, la app genera un archivo de solicitud** — `solicitud.lreq` (✅ real desde L1:
   lo escribe `LicenseService` en la carpeta de licencia) — que contiene:
   - un `installationId` (identificador de esa instalación, persistido en la tabla `LicenseInstallation`),
   - la **huella de la máquina** (fingerprint: machine-id del host + CPU + plataforma),
   - la versión de esquema del producto.
   Es un archivo pequeño de texto. *No contiene datos del cliente ni secretos.*
3. **El socio te hace llegar ese `solicitud.lreq`:**
   - Con internet: lo sube a tu **portal de licencias** (o te lo manda).
   - Air-gapped: lo copia a un USB, lo lleva a un PC con internet, y lo sube. **El servidor de la
     planta nunca toca internet** — solo viaja un archivito.
4. **ITESICWS emite la licencia** (✅ real desde L3) con la CLI y tu **clave privada bajo custodia**.
   > ⚠️ **Emite SIEMPRE contra la `solicitud.lreq` que generó la APP** (contiene la identidad
   > persistida real de la instalación). Un `installationId` inventado a mano deja a esa instalación
   > **sin historial en el ledger** y el `renew` le será DENEGADO ("no tiene emisiones") — le pasó al
   > EC2 demo (emitido pre-L1 con un id manual) y hubo que re-emitir con `--license-id` para
   > regularizar (2026-07-06). El control deniega por diseño; la corrección es re-emitir contra la
   > identidad real, no saltarse el ledger.
   ```bash
   pnpm license ledger                      # ¿cuánto lleva el socio contra su banda? (§3)
   pnpm license issue --request solicitud.lreq \
     --customer "Minera Acme" --channel-partner SOCIO_XYZ \
     --edition professional --modules core,logbook,incidents,shift-handover,notifications \
     --max-nodes 200 --max-named-users 80 --expires 2027-07-01T00:00:00Z \
     --out license.lic
   pnpm license inspect license.lic --request solicitud.lreq   # QA: VALIDA contra esa huella
   ```
   - La CLI pide la **passphrase de la privada** (prompt sin eco; jamás por flag) y la descifra solo en memoria.
   - Genera `license.lic` **firmado y amarrado a la huella exacta de la solicitud** (node-lock), con vencimiento +
     gracia, `modules[]` según lo comprado (validados contra el catálogo), límites y `whiteLabel`.
   - Queda **registrado automáticamente en el ledger** (`~/.lyra-license/ledger.jsonl`, append-only con cadena de
     hashes): quién, cuándo, para qué instalación/huella, con qué límites y con qué par se firmó.
5. **El `license.lic` vuelve a la instalación** (USB o descarga) y se importa (se monta como archivo/
   secreto del stack).
6. **La app verifica** la firma (con la clave pública embebida) + que la huella calce + vencimiento →
   estado **VÁLIDA**. **Operando.** Con la marca del socio.

```
  [Servidor del cliente]              [PC con internet]            [ITESICWS]
        │  arranca sin licencia            (puente)                    │
        │  genera solicitud.lreq ─USB──▶  sube al portal ───────────▶ verifica cupo
        │                                                              emite license.lic
        │  importa license.lic  ◀──USB── descarga  ◀────────────────  (firma + huella)
        ▼
     VÁLIDA · operando
```

> **Si la planta SÍ tiene internet**, los pasos 3 y 5 son automáticos (la app llama a tu portal, recibe
> la licencia y se activa sola en segundos). El "puente por USB" es solo para el caso air-gapped.

---

## 3. El caso concreto: "el socio quiere 10 licencias"

Desglose de qué pasa realmente:

1. El socio **compra una banda de 10** (contrato comercial, ver `estrategia-canal.md`).
2. Le entregas **UN** paquete de software (Fase A). Él lo puede copiar/instalar **cuantas veces
   quiera** — da igual, cada copia nace muerta.
3. A medida que implementa clientes, **por cada servidor te pide una activación** (Fase B). Tú emites.
4. **Llevas la cuenta de licencias emitidas.** Cuando pide la número 11:
   - o **le refuses** (se pasó de su banda), o
   - le vendes ampliación de banda y emites la 11.
5. **No hay forma de que "se instale la 11 sin que sepas"**, porque la 11 **no arranca** hasta que tú
   emitas su licencia — y para emitirla, te la pide (y queda registrada). Ese es exactamente tu
   requisito (2) cumplido.

> **Analogía:** es como un cine con 10 entradas vendidas. La *película* (el paquete) es una sola y se
> proyecta igual. Las *entradas* (licencias) son 10, numeradas, y el portero (la verificación de firma
> + huella) no deja pasar a nadie sin una entrada válida y a su nombre (huella). Imprimir entradas
> falsas es imposible porque solo tú tienes el sello (clave privada).

**Detalle fino — `maxInstallations` dentro de una licencia:** el ejemplo de `LICENSING.md` muestra
`maxInstallations: 1`. En tu modelo single-tenant, **1 licencia = 1 instalación = 1 cliente final**.
Ese campo es un tope *interno* de esa licencia; el control de "cuántas licencias en total" lo llevas
**tú** al emitir (contando contra la banda del socio). No confundir: la banda de 10 se controla en el
**registro de emisión de ITESICWS**, no dentro de un archivo `.lic`.

---

## 4. Renovación (✅ REAL desde L4 — anual, o más corta para anti-clon)

Las licencias **vencen** y se renuevan con el **mismo baile** de solicitud→emisión→importación (por
archivos; cero internet exigido en la planta):

1. Antes del vencimiento, la app avisa (estado POR VENCER) a los admins (✅ real desde L6: banner en la
   web + correo/campanita semanal a quienes tienen `settings:manage`; en gracia el aviso es diario y
   prominente — `LICENSING.md §5.2`). El detalle e instrucciones viven en **Configuración › Licencia**.
2. **La app ya generó la solicitud sola:** mientras haya licencia, `LicenseService` deja/refresca
   **`renovacion.lreq`** junto a `license.lic` (misma carpeta `./license` del stack). Contiene el
   **linaje** de esa instalación (`renewalCounter` + un *nonce* que rota en cada renovación — ver
   `LICENSING_STRATEGY.md §4`) + huella + `licenseId`. Se lleva a ITESICWS igual que la activación
   (portal o USB→web).
3. **Tú emites la renovación** con la CLI y la custodia (§5-bis):
   ```bash
   pnpm license ledger                       # revisa el historial de esa instalación
   pnpm license renew --request renovacion.lreq \
     --expires 2026-10-05T00:00:00Z --out license.lic
   ```
   - **Sin flags comerciales HEREDA los términos de la última emisión** del ledger (mismo `licenseId`,
     misma edición/módulos/límites). Cualquier flag explícito (`--modules`, `--edition`,
     `--max-named-users`, …) = upgrade en la misma renovación.
   - **Control anti-clon (deniega por defecto):** si el ledger ya registra una renovación de esa
     instalación con el MISMO counter presentado ⇒ **`CLON DETECTADO`, no emite** (exit ≠ 0); lo mismo
     con un counter desfasado o un `licenseId` que no calza. Investiga con el socio; si un humano lo
     autoriza (p. ej. restore legítimo de respaldo), repite con `--force-duplicate` — la emisión queda
     **marcada en el ledger** (`forcedDuplicate:true`, evidencia contractual).
   - **Cambio de servidor/hardware:** la huella presentada difiere de la emitida ⇒ se niega salvo
     `--accept-new-fingerprint` (migración legítima verificada; también queda auditado).
4. **Se importa** (reemplaza `license.lic`): la app la acepta **una sola vez y solo en esa
   instalación** (rota su linaje: counter nuevo + nonce fresco local + `lastRenewalAt`, auditado como
   `license.renewed`). Desde ahí, ni la licencia anterior ni una copia de la respuesta calzan en
   ninguna parte (`LINEAGE_MISMATCH` ⇒ BLOQUEADA = solo lectura + exportación). Sigue operando.

**Por qué el linaje importa:** si el socio **clonó** la instalación para un segundo cliente, ambas
copias tienen el mismo linaje. Cuando las dos pidan renovar, **verás dos solicitudes con el mismo
linaje = sobre-despliegue detectado**, con evidencia. Y si una renueva primero, la otra queda con un
linaje viejo que ya no calza. Honestidad (STRATEGY §9): el clon es indistinguible hasta la primera
renovación — por eso el ciclo corto.

**Política de ciclo (parámetro comercial por defecto, decisión (e) L4):**

| Canal | `--expires` recomendado | Por qué |
|---|---|---|
| **Instalaciones vía socio de canal** | **90 días** | La detección del clon ocurre 4×/año (el linaje solo se contrasta AL RENOVAR); la renovación es un archivo por correo/USB, fricción mínima. |
| Cliente directo / socio de confianza probada | Anual | Menos ceremonia; el riesgo de sobre-despliegue es menor y el contrato lo cubre. |

El contrato puede pactar otra cosa; esto es el default documentado, no un límite del mecanismo.

**Baja de un cliente:** simplemente **no renuevas**. La instalación entra en POR VENCER → GRACIA →
SOLO-LECTURA. **Nunca se borran los datos** (el cliente puede exportar). Es un apagado gradual y ético,
no un secuestro.

---

## 5. ¿Quién emite las licencias: tú o el socio?

Decisión de gobernanza. **Recomendación fuerte: emisión CENTRALIZADA en ITESICWS.**

| Modelo | Cómo | Pro | Contra |
|---|---|---|---|
| **Centralizado (★ recomendado)** | Solo ITESICWS tiene la clave privada y emite. El socio siempre te pide. | **Control total**: ves cada instalación, cuentas la banda, detectas fraude. Es *literalmente* tu requisito "sin que yo sepa". | Tú (o un portal automatizado) estás en el loop de cada activación. |
| **Delegado** | El socio recibe capacidad de sub-emisión. | Cero fricción para el socio. | **Pierdes visibilidad** — el socio podría auto-emitirse de más. **Choca con tu requisito.** |

Para que el modelo centralizado **no sea lento**, se automatiza con un **portal de licencias**
(sube solicitud → recibe licencia en segundos) respaldado por la CLI. Tú mantienes el control sin ser
un cuello de botella. La clave privada vive **cifrada bajo custodia** (§5-bis), nunca en un repo,
imagen o `.env`.

## 5-bis. Custodia de la clave privada de PROD (✅ operativa desde L3)

**Dónde vive:** `LYRA_LICENSE_HOME` (def. `~/.lyra-license/` en la máquina del emisor), FUERA del repo:

| Archivo | Qué es | Secreto |
|---|---|---|
| `prod-private.enc.pem` | Privada Ed25519 de emisión, **PKCS#8 CIFRADO** (aes-256-cbc + passphrase) | **SÍ** — jamás repo/imagen/.env/logs |
| `prod-public.pem` | La pública correspondiente | No (también está committeada en `scripts/license/prod-keys/`) |
| `ledger.jsonl` | Registro append-only de emisiones (cadena de hashes) | Confidencial comercial (no al repo) |

**Reglas de operación:**
- La **passphrase** la generó `keygen` (alta entropía, se mostró UNA vez) y vive en el **gestor de contraseñas del
  dueño**. Entra a la CLI por prompt sin eco, `LYRA_LICENSE_PASSPHRASE` (env efímera) o
  `LYRA_LICENSE_PASSPHRASE_FILE` — **nunca por flag** (quedaría en el historial de shell).
- La privada se **descifra solo en memoria** en el instante de firmar (`lyra-license issue`); nunca se escribe en
  claro a disco. El formato PKCS#8 es estándar: recuperable con `openssl pkcs8` si la CLI no existiera.
- **Respaldo:** copiar `prod-private.enc.pem` (cifrada) a un segundo medio seguro (p. ej. USB en caja fuerte).
  Perderla + perder la passphrase = no poder emitir ni renovar (habría que rotar el par y re-emitir con un release).
- **`keygen` se niega a sobreescribir** un par existente (sin `--force`): pisarlo invalidaría toda licencia emitida.
- **Rotación (procedimiento futuro, sin `kid`):** generar par nuevo → embeber AMBAS públicas en el build (el
  verificador prueba en orden; `verifyLicense` recibe el PEM por parámetro, retrocompatible) → emitir lo nuevo con
  la privada nueva → retirar la pública vieja cuando ya no queden licencias vigentes firmadas con ella.
- El `.gitignore` del repo tiene red de seguridad (`*.enc.pem`, `prod-private*`, `.lyra-license/`, `ledger.jsonl`) y
  el codegen del release **rechaza claves privadas** y **rechaza la pública DEV**.

---

## 6. Ofuscar / minificar el código: ¿cuándo y dónde?

Respuesta corta: **en tu CI (ITESICWS), al construir la imagen, UNA vez por versión, antes de
publicar. Nunca en la máquina del cliente, nunca por-licencia.**

### Qué es cada cosa (en humano)
- **Minificar:** quitarle al código todo lo que sobra para la máquina (espacios, comentarios, nombres
  largos de variables). `calcularVencimientoLicencia` pasa a llamarse `a`. Sigue funcionando, pero
  leerlo es horrible. *Objetivo primario: reducir tamaño; efecto secundario: cuesta más entenderlo.*
- **Ofuscar:** ir más allá y **enredarlo a propósito** para que sea difícil de leer y modificar
  (reordenar lógica, meter indirecciones, cifrar cadenas de texto). *Objetivo: frenar al que quiere
  editarlo.*
- **Compilar a bytecode / binario nativo:** convertir el JavaScript en un formato que **ya no es texto
  fuente** — bytecode de V8 (`bytenode`) o un ejecutable nativo (Node SEA / Bun). El módulo crítico de
  licencia deja de ser un `.js` editable. *Es la capa anti-tamper más fuerte del lado software.*

### Dónde encaja en el pipeline (línea de montaje de la imagen)
Todo esto pasa **en el build del CI de ITESICWS**, en este orden, y queda **horneado dentro de la
imagen Docker** que se publica:

```
   [CI de ITESICWS — GitHub Actions, al cortar una versión vX.Y.Z]
      0. EMBEBER la pública de PROD           (embed-public-key.mjs — ✅ real desde L3;
                                               la imagen deja de aceptar licencias DEV)
      1. TypeScript ──▶ JavaScript            (transpilar)
      2. bundle + MINIFICAR todo el código    (esbuild/webpack)   ← IP general protegida
      3. el MÓDULO DE LICENCIA crítico ──▶ BYTECODE V8 / nativo   (bytenode)  ← anti-tamper reforzado
      4. ensamblar la imagen Docker con el resultado
      5. FIRMAR la imagen (cosign)            ← integridad de cadena de suministro
      6. publicar en el registro privado (por digest)
   ─────────────────────────────────────────────────────────────
   [Cliente]  solo recibe la imagen YA compilada. No tiene el fuente,
              no corre ofuscación, no tiene herramientas de build.
```

### Reglas y matices honestos
- **Se hace una vez por versión, para todos.** No hay una "imagen ofuscada especial por cliente". La
  misma imagen protegida sirve a los 10 clientes; lo que los diferencia es el `license.lic` (§0).
- **Dos niveles de intensidad:**
  - *Todo el código de la app* → minificado/bundled (protege tu IP, sube el listón general).
  - *El módulo de licencia* → además bytecode/nativo, porque es el que un atacante querría editar para
    saltarse el chequeo.
- **La verificación es DISTRIBUIDA**, no un solo `if` (arranque, gating de módulos, generación del acta
  PDF, tareas programadas). Hay que romperlas todas, no una. Ver `LICENSING_STRATEGY.md §5`.
- **Honestidad (de la investigación):** la ofuscación/bytecode **encarece y retrasa** al atacante, no
  lo hace imposible (el bytecode V8 se puede desensamblar; Node SEA por sí solo es débil). Por eso es
  una **capa de refuerzo**, nunca el candado principal. El candado real es la firma asimétrica (no
  pueden fabricar licencias) + el node-lock + la dependencia de updates/soporte. La ofuscación
  simplemente evita que el socio con un dev edite un `if` en una tarde.
- **El cliente nunca ve el fuente.** Recibe imágenes compiladas. Nunca le entregas el repo. La marca
  blanca se logra por **configuración en runtime** (temas, nombre de producto), no tocando código.

---

## 7. Checklist operacional (resumen accionable)

**Alta de un socio nuevo (una vez):**
- [ ] Contrato de banda firmado (N licencias/año, ver `estrategia-canal.md`).
- [ ] Token read-only del registro para ese socio **o** bundle offline entregado.
- [ ] Socio confirma que puede desplegar el stack (arranca en PENDIENTE DE ACTIVACIÓN).

**Activar una instalación (por cada licencia / servidor):**
- [ ] Socio despliega el stack en el servidor del cliente final.
- [ ] App genera `solicitud.lreq` (installationId + huella).
- [ ] Solicitud llega a ITESICWS (portal o USB→web).
- [ ] Verificar cupo de banda del socio.
- [ ] Emitir `license.lic` (CLI + clave privada en HSM), atado a la huella, con módulos/límites/vencimiento.
- [ ] Registrar la emisión (quién, cuándo, qué instalación).
- [ ] Importar `license.lic` en la instalación → VÁLIDA.

**Renovar (anual o por ciclo corto — §4):**
- [ ] Recibir `renovacion.lreq` de la instalación (la app lo mantiene junto a `license.lic`).
- [ ] `pnpm license renew --request renovacion.lreq --expires <ISO> --out license.lic` — la CLI
      **acusa sola** el linaje repetido/desfasado (señal de clon ⇒ NO emitir; investigar con el socio;
      override humano `--force-duplicate` queda auditado) y hereda los términos del ledger.
- [ ] Si cambió el hardware: verificar la migración y repetir con `--accept-new-fingerprint`.
- [ ] Enviar `license.lic` → importar en la instalación → confirmar VALIDA (el linaje rota solo).

**Publicar una versión nueva (una vez, en CI):**
- [ ] Build con minificación + bytecode del módulo crítico.
- [ ] Firmar imagen (cosign) + SBOM + escaneo.
- [ ] Publicar por digest; avisar a socios (pull online o bundle offline).

---

*Documento vivo. Se afinará al construir el módulo (plan L0–L6, `BACKLOG.md §2(1)`). Relacionados:
[`LICENSING_STRATEGY.md`](./LICENSING_STRATEGY.md) (por qué), [`LICENSING.md`](./LICENSING.md) (cómo
técnico), [`estrategia-canal.md`](./estrategia-canal.md) (comercial), [`SECURITY.md §9`](./SECURITY.md)
(cadena de suministro / firma de imágenes), [`DEPLOYMENT.md`](./DEPLOYMENT.md) (runbook de despliegue).*
