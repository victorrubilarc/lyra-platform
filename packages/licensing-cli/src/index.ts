/**
 * @lyra/licensing-cli — herramienta de EMISIÓN de licencias de ITESICWS (L3).
 *
 * Paquete del workspace que JAMÁS se distribuye al cliente: no participa del
 * stage `deps` runtime del Dockerfile (la imagen del cliente no lo contiene) y
 * es `private`. Reusa `@lyra/licensing` para TODA la criptografía; aquí viven
 * la custodia de la clave privada (keystore), la validación de entrada, el
 * ledger de emisiones y el binario `lyra-license` (keygen/issue/inspect/ledger).
 *
 * Este índice exporta las piezas PURAS para que el envoltorio DEV de la API
 * (`apps/watchlog-api/tools/gen-dev-license.ts`) emita con la MISMA
 * implementación (una sola ruta de emisión, sin copiar/pegar).
 */

export { generatePassphrase, keygen, loadPrivateKeyPem, type KeygenResult } from "./keystore.js";
export {
  issueLicense,
  normalizeModules,
  LICENSE_EDITIONS,
  type IssueParams,
  type IssuedLicense,
} from "./issue.js";
export { inspectLicense, type InspectResult } from "./inspect.js";
export {
  appendLedgerEntry,
  readLedger,
  summarizeByPartner,
  verifyLedgerChain,
  type LedgerEntry,
  type LedgerEntryInput,
} from "./ledger.js";
export { parseActivationRequest, readActivationRequest, type ActivationRequest } from "./request.js";
export {
  LICENSE_HOME_ENV,
  PASSPHRASE_ENV,
  PASSPHRASE_FILE_ENV,
  licenseHome,
  ledgerPath,
  privateKeyPath,
  publicKeyPath,
} from "./paths.js";
