# Módulo de licenciamiento — Lyra WatchLog (especificación)

> **Qué es este documento.** La especificación técnica del **módulo de licenciamiento/activación**
> que hace cumplir el modelo de canal (ver [`estrategia-canal.md`](./estrategia-canal.md)): cada
> instalación on-premise solo funciona con una **llave firmada** por ITESICWS, con vencimiento,
> tope de instalaciones/nodos/usuarios y módulos habilitados. Es un **ítem de desarrollo cerrado**,
> aún no construido.
>
> Última actualización: **2026-07-04**. Estado: **L0 construido** — el núcleo puro (firma/verificación Ed25519,
> huella, máquina de estados §5) existe como **`@lyra/licensing`** (`packages/licensing`, 42 tests). Pendientes
> L1–L6 (servicio NestJS, gating, CLI, linaje, anti-tamper, UI). Estimación total: ~80–160 HH.

---

## 1. Objetivo y principios

- **Hacer cumplir la licencia sin confiar en la honestidad del socio**: que una instalación no
  autorizada, vencida o fuera de límites **no funcione**.
- **Offline por diseño**: no requiere "llamar a casa". Muchas plantas industriales no dan salida a
  internet; el on-premise exige que la validación funcione sin conexión. (El *phone-home* es
  opcional y aditivo, §8.)
- **Firma asimétrica**: solo ITESICWS puede **emitir** licencias (clave privada); cualquier
  instalación puede **verificarlas** (clave pública embebida). El socio no puede fabricar ni alterar
  una licencia.
- **Disuasión, no bóveda** (honestidad): ningún candado que corre en la máquina del cliente es
  inviolable. El objetivo es subir el costo de piratear por encima del costo de pagar, y apoyarse en
  el **modelo de negocio** (updates + soporte indispensables) como lock final. Ver §7.
- **Separado del RBAC**: el licenciamiento gobierna **qué puede correr la INSTALACIÓN** (edición,
  módulos, límites). El RBAC/ABAC gobierna **qué puede hacer un USUARIO**. Son ejes distintos.

---

## 2. Modelo conceptual

```
        ITESICWS (emisor)                        Instalación del cliente (verificador)
   ┌───────────────────────┐                    ┌─────────────────────────────────────┐
   │  Clave PRIVADA (secreta)│                    │  Clave PÚBLICA (embebida en la app) │
   │        │                │   archivo de       │        │                            │
   │        ▼                │   licencia firmado │        ▼                            │
   │  Firma la licencia  ────┼───────────────────▶│  Verifica la firma al arrancar      │
   │  (CLI de emisión)       │  (license.lic)     │  y periódicamente → permite/bloquea │
   └───────────────────────┘                    └─────────────────────────────────────┘
```

- La **clave privada** vive solo en ITESICWS (idealmente en un HSM o un gestor de secretos, nunca en
  el repo ni en una imagen).
- La **clave pública** se compila dentro de la app (API). Aunque el socio la lea, con la pública
  **no puede firmar** — solo verificar.
- El **archivo de licencia** (`license.lic`) se le entrega al socio/cliente y se monta en la
  instalación (volumen Docker / variable / secreto). Si se altera una coma, la firma se rompe.

---

## 3. Contenido del archivo de licencia

El archivo es un **payload JSON firmado** (JWS/Ed25519, §4). Ejemplo del payload:

```json
{
  "licenseId": "lic_2026_ACME_001",
  "issuer": "ITESICWS",
  "issuedAt": "2026-07-01T00:00:00Z",
  "notBefore": "2026-07-01T00:00:00Z",
  "expiresAt": "2027-07-01T00:00:00Z",
  "graceDays": 14,

  "channelPartner": "SOCIO_XYZ",
  "customer": "Minera Acme",
  "installationId": "inst_acme_planta_norte",

  "edition": "professional",
  "modules": ["core", "incidents", "shift-handover", "notifications", "themes"],

  "limits": {
    "maxInstallations": 1,
    "maxNodes": 200,
    "maxNamedUsers": 80
  },

  "whiteLabel": true,
  "supportTier": "L2",
  "schemaVersion": 1,

  "fingerprint": "3f9c…(huella de máquina, node-lock)",
  "renewalCounter": 1,
  "nonce": "…(linaje rotatorio, capa 4)"
}
```

> **Nota (L0, 2026-07-04):** el payload **no lleva campo de algoritmo** (`signatureAlg` se eliminó del ejemplo
> original): el algoritmo vive SOLO en la cabecera JWS y el **verificador lo fija a EdDSA** — la cabecera del archivo
> no se obedece, se valida (mitiga la confusión de algoritmo, RFC 8725 §3.1). Se agregaron al esquema `fingerprint`
> (node-lock, capa 2) y los campos de **linaje** `renewalCounter`/`nonce` (capa 4; su flujo se construye en L4).

**Campos clave:**
- `expiresAt` + `graceDays` → vencimiento y periodo de gracia (§5).
- `installationId` → ata la licencia a **esta** instalación (evita copiar la llave a otra).
- `modules` → qué módulos de producto están habilitados (gating de features de pago).
- `limits` → topes duros de instalaciones/nodos/usuarios (evita el sobre-despliegue).
- `edition` → paquete comercial (starter/professional/enterprise), mapea a `modules` + `limits`.
- `whiteLabel` → habilita el modo marca blanca completo.
- La **firma** va aparte (formato JWS: `header.payload.signature`), NO dentro del JSON.

---

## 4. Firma y verificación

- **Algoritmo: Ed25519** (firma asimétrica moderna: llaves pequeñas, rápida, soportada nativamente por
  el módulo `crypto` de Node ≥ 22). Formato de sobre: **JWS compacto** (`cabecera.payload.firma` en
  base64url). **Implementado en L0** como el paquete puro **`@lyra/licensing`** (`packages/licensing`):
  `signLicense`/`verifyLicense` (resultado tipado, alg fijado a EdDSA en el verificador),
  `deriveFingerprint` (huella canónica sha256 de señales del host, capa 2) y `evaluateLicense` + helpers
  (`isExpired`/`isWithinGrace`/`isModuleLicensed`/`exceedsLimits`) para la máquina de estados §5. Las
  llaves entran SIEMPRE por parámetro (puro y testeable); cero dependencias externas.
- **Emisión (ITESICWS):** una **CLI/servicio interno** (`lyra-license issue --customer … --expires …
  --modules …`) toma los parámetros, arma el payload, lo firma con la clave privada y produce el
  `license.lic`. Registro interno de licencias emitidas (a quién, cuándo, con qué límites).
- **Verificación (instalación):** al arrancar la API, un `LicenseService` (NestJS) carga el archivo,
  **verifica la firma con la clave pública**, valida `notBefore`/`expiresAt`, `installationId` y los
  `limits` contra el estado real (nº de instalaciones/nodos/usuarios). Resultado → un **estado de
  licencia** (§5) cacheado y re-evaluado periódicamente (p. ej. cada 6–24 h) y en cada arranque.
- **Custodia de la clave privada:** HSM o gestor de secretos (no en repo, no en imagen, no en el
  `.env` de despliegue). Rotación posible vía `schemaVersion` + varias claves públicas embebidas.

---

## 5. Comportamiento en runtime (máquina de estados)

| Estado | Condición | Comportamiento |
|---|---|---|
| **VÁLIDA** | Firma OK, vigente, dentro de límites | Funciona normal. |
| **POR VENCER** | Faltan ≤ N días para `expiresAt` | Funciona normal + **banner de aviso** a administradores (y notificación). |
| **EN GRACIA** | `expiresAt` pasó pero dentro de `graceDays` | Funciona + **aviso prominente** "licencia vencida, renovar en X días". No corta la operación (no dejar una planta a ciegas de golpe). |
| **VENCIDA / BLOQUEADA** | Pasó la gracia, o firma inválida, o falta el archivo | **Modo restringido**: bloquea el ingreso de datos nuevos y las funciones premium; permite **solo lectura/exportación** para no secuestrar los datos del cliente. Mensaje claro de renovación. |
| **LÍMITE EXCEDIDO** | Supera `maxNodes`/`maxNamedUsers`/`maxInstallations` | Bloquea **crear** por encima del límite (no rompe lo existente); avisa al admin. |
| **MÓDULO NO LICENCIADO** | Se usa un módulo fuera de `modules` | El módulo no aparece / se rechaza en el backend (gating por entitlement, distinto del permiso de usuario). |

**Principios de degradación (importantes por regulación/ética):**
- Nunca **borrar** ni **secuestrar** datos por licencia vencida: en el peor caso, **solo lectura +
  exportación**. Los datos son del cliente.
- La operación crítica no se corta **de golpe**: hay aviso previo (POR VENCER) y gracia.
- Todo cambio de estado de licencia se **audita** (`AuditLog`) y notifica a administradores.

---

## 6. Emisión y ciclo de vida (proceso ITESICWS)

1. Se acuerda una instalación con el socio → generas `installationId` y emites `license.lic` con la
   CLI (vencimiento = 1 año, `modules`/`limits` según edición comprada).
2. El socio la despliega (monta el archivo en el stack).
3. **Renovación anual:** emites una licencia nueva con `expiresAt` +1 año (y ajustas banda/edición).
   El socio la reemplaza; la app la toma en el próximo arranque o recarga.
4. **Upgrade de edición/módulos:** nueva licencia con más `modules` o `limits`.
5. **Baja:** no renuevas → la instalación entra en POR VENCER → GRACIA → BLOQUEADA (solo lectura).

---

## 7. Anti-tamper / anti-auto-parcheo (capas de disuasión)

El riesgo real que preocupa al negocio: que el socio (o su dev) **edite el código** para saltarse el
chequeo. No se puede volver imposible al 100%, pero se encarece por capas:

| Capa | Qué hace |
|---|---|
| **1. No entregar código fuente** (la principal) | Se entregan **imágenes Docker compiladas** (bundle minificado), no el repo. El módulo de licencia crítico puede compilarse a **bytecode V8** (`bytenode`) o binario nativo (Node SEA / Bun) para que no sea texto editable. |
| **2. Firma asimétrica** | Aunque vean el `license.lic`, no pueden emitir uno válido ni extender el vencimiento (no tienen la clave privada). |
| **3. Verificación distribuida** | El chequeo NO es un solo `if` desactivable: se reparte (arranque, gating de módulos, generación del acta PDF, tareas programadas). Hay que romperlos todos. |
| **4. Marca blanca = config, no código** | El socio personaliza por **temas/config en runtime**, nunca tocando fuente. Nunca necesita ni recibe el código. |
| **5. Disuasivo económico (el lock real)** | Un binario parcheado queda **congelado**: sin parches de seguridad, sin updates, sin módulos nuevos, sin soporte. En industria regulada es inaceptable para el cliente final. Renovar sale más barato que mantener un fork pirata. |
| **6. Legal** | Contrato de canal + auditoría de instalaciones + prohibición de descompilar (§6 de estrategia-canal). |

> **Verdad de fondo:** el candado técnico frena el ~95% (sobre-despliegue casual, copiar la llave,
> "instalé 12 pagando 8"). El 5% restante (un experto decidido con tiempo) lo cubre el modelo de
> negocio (dependencia de updates/soporte) y el contrato. No prometer "imposible de piratear".

---

## 8. Opcionales aditivos (fase 2, si se justifica)

- **Activación / fingerprint de instalación:** al primer arranque, la app deriva una huella
  (installationId + características del entorno) y la liga a la licencia, para que el mismo
  `license.lic` no sirva copiado a otra máquina.
- **Phone-home opcional:** si el cliente permite salida a internet, la instalación puede reportar
  latido (heartbeat) a un servicio de ITESICWS (conteo real de instalaciones activas, revocación
  remota). **Nunca obligatorio** — debe funcionar 100% offline si no hay red.
- **Revocación:** lista de `licenseId` revocados distribuida en updates (para casos de fraude).

---

## 9. Alcance de desarrollo y estimación

| Sub-ítem | HH aprox. |
|---|---|
| Formato de licencia + firma/verificación (Ed25519, JWS) — **✅ hecho en L0 (`@lyra/licensing`)** | 15–25 |
| CLI de emisión + custodia de clave privada | 10–20 |
| `LicenseService` + máquina de estados + caché + re-evaluación | 20–35 |
| Gating de módulos por entitlement (backend) + UI de estado/aviso | 15–30 |
| Enforcement de límites (nodos/usuarios/instalaciones) | 10–20 |
| Empaquetado anti-tamper (bytecode/native del módulo crítico) | 10–30 |
| **Total** | **~80–160 HH** |

Fase 2 (fingerprint/phone-home/revocación): +40–80 HH si se pide.

---

## 10. Qué NO hace (límites honestos)

- No es DRM inviolable: es disuasión + firma + modelo de negocio (§7).
- No secuestra datos: licencia vencida = solo lectura/exportación, nunca borrado.
- No requiere internet (offline por diseño); el phone-home es opcional.
- No reemplaza el RBAC/ABAC: gobierna la **instalación**, no al **usuario**.
