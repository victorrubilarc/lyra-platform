# Clave PÚBLICA de emisión de PRODUCCIÓN (Licenciamiento L3)

`prod-public.pem` es la clave **pública** Ed25519 del par de emisión REAL de
ITESICWS. **No es un secreto**: viaja embebida dentro de cada imagen que se
distribuye (cualquier cliente puede extraerla; con la pública solo se puede
VERIFICAR, jamás firmar). Por eso vive committeada aquí — el build de release
es reproducible y auditable sin depender de un secret externo
(DECISIONS 2026-07-05, decisión (c) de L3).

- El **release** (`.github/workflows/release.yml`) corre
  `node scripts/license/embed-public-key.mjs` antes del `docker build`: el
  codegen REESCRIBE `apps/watchlog-api/src/licensing/license-public-key.ts`
  con esta pública (sustitución en BUILD, jamás por env en runtime). Las
  imágenes de release SÍ son aptas para distribuirse comercialmente.
- `pnpm build` local y el CI (`ci.yml`) NO corren el codegen: siguen con la
  pública DEV committeada (`../dev-keys/`) y todo el ciclo de dev/tests
  funciona sin la clave de PROD.

La clave **PRIVADA** correspondiente NO está aquí ni estará jamás: vive
CIFRADA (PKCS#8 + passphrase) en la custodia del emisor
(`LYRA_LICENSE_HOME`, def. `~/.lyra-license/prod-private.enc.pem`), junto a la
passphrase guardada en el gestor de contraseñas del dueño. Ver
`docs/LICENSING_PROCEDURE.md` §5-bis (custodia y rotación).
