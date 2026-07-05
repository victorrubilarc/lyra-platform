# @lyra/licensing-cli — `lyra-license` (herramienta del EMISOR)

CLI de **emisión de licencias** de ITESICWS (Licenciamiento **L3**). Reusa `@lyra/licensing`
para TODA la criptografía (firma/verificación Ed25519, evaluación); aquí viven la **custodia
de la clave privada**, la **validación de entrada comercial** y el **ledger de emisiones**.

> ⚠️ **Jamás se distribuye al cliente.** Es un paquete privado del workspace: la imagen
> runtime del api la excluye (`pnpm deploy --prod` no lleva devDependencies) y no tiene
> endpoints. El que la tenga NO puede emitir nada útil sin la clave privada bajo custodia
> (la firma es el candado, no el código — prueba T3 del PoC y T2 del smoke).

## Invocación

Desde la raíz del monorepo:

```bash
pnpm license keygen                 # genera el par Ed25519 de PRODUCCIÓN
pnpm license issue …                # emite un license.lic desde un solicitud.lreq
pnpm license inspect <license.lic>  # QA del emisor: verifica firma + evalúa estado
pnpm license ledger                 # registro de emisiones + banda por socio
```

## Custodia (env)

| Variable | Default | Qué es |
|---|---|---|
| `LYRA_LICENSE_HOME` | `~/.lyra-license` | Carpeta de custodia: `prod-private.enc.pem` (PKCS#8 **CIFRADO** aes-256-cbc), `prod-public.pem`, `ledger.jsonl`. **FUERA del repo.** |
| `LYRA_LICENSE_PASSPHRASE` | — | Passphrase de la privada (env efímera para automatización/smokes). |
| `LYRA_LICENSE_PASSPHRASE_FILE` | — | Ruta a un archivo con la passphrase. |

Sin env, `issue` pide la passphrase por **prompt sin eco**. Nunca por flag (historial de shell).
`keygen` **genera** una passphrase de alta entropía y la muestra **una sola vez** → guardarla en el
gestor de contraseñas. Procedimiento completo de custodia/respaldo/rotación:
`docs/LICENSING_PROCEDURE.md §5-bis`.

## `issue` — parámetros

```bash
pnpm license issue \
  --request solicitud.lreq \            # el challenge que escribe la app sin licencia (L1)
  --customer "Minera Acme" --channel-partner SOCIO_XYZ \
  --edition professional \              # starter | professional | enterprise
  --modules core,logbook,incidents \    # validados contra LICENSED_MODULE_KEYS (core siempre entra)
  --max-nodes 200 --max-named-users 80 [--max-installations 1] \
  --expires 2027-07-01T00:00:00Z [--grace-days 14] [--not-before <ISO>] \
  [--license-id <id>] [--issuer ITESICWS] [--support-tier L2] [--no-white-label] \
  [--out license.lic] [--private-key <pem>] [--no-ledger] [--allow-past]
```

- La **huella** (node-lock) y el `installationId` salen SIEMPRE de la solicitud — no se inventan.
- `--private-key` permite firmar con otro par (p. ej. el DEV committeado, para builds de dev).
- `--allow-past` emite vencidas (solo smokes/pruebas). `--no-ledger` omite el registro (solo dev).
- Tras firmar, `issue` **auto-verifica** (round-trip + huella) antes de escribir el archivo.

## Ledger

`~/.lyra-license/ledger.jsonl` — JSON Lines **append-only con cadena de hashes** (`prevHash`):
editar o borrar una línea rompe la cadena y `pnpm license ledger` lo acusa (exit ≠ 0). Es el
registro autoritativo del control de banda del canal (`docs/LICENSING_PROCEDURE.md §3/§5`).
Vive SOLO en la máquina del emisor; jamás en el producto ni en el repo.

## Relación con el resto del sistema

- **Flujo DEV:** `pnpm license:dev` (en el api) es un envoltorio delgado de `issueLicense` de este
  paquete con el par DEV committeado (`scripts/license/dev-keys/`) — una sola implementación.
- **Pública de PROD:** committeada en `scripts/license/prod-keys/` (no es secreto); el build de
  RELEASE la embebe vía `scripts/license/embed-public-key.mjs` (ver `release.yml`). Dev/CI usan la DEV.
- Specs: `docs/LICENSING.md` (§4/§6) · runbook: `docs/LICENSING_PROCEDURE.md` · porqué:
  `docs/LICENSING_STRATEGY.md`.
