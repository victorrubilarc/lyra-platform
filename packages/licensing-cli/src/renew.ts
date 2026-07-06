import type { LicenseEdition } from "@lyra/licensing";

import { issueLicense, type IssuedLicense } from "./issue.js";
import { findDuplicateLineage, lastEntryForInstallation, type LedgerEntry } from "./ledger.js";
import type { RenewalRequest } from "./request.js";

/**
 * Renovación de licencias (Licenciamiento L4 — LICENSING_STRATEGY §4, PoC T6).
 *
 * La renovación es la MISMA emisión de siempre (reusa `issueLicense`, que reusa
 * `signLicense` de `@lyra/licensing` — cero criptografía nueva) con tres cosas
 * encima, que son el corazón de la capa 4:
 *
 *  1. VALIDA EL LINAJE contra el ledger: una renovación ya registrada para el
 *     mismo `installationId` con el MISMO counter presentado = dos solicitudes
 *     con el mismo linaje = **CLON DETECTADO** → se DENIEGA por defecto y se
 *     escala a humano (`--force-duplicate` explícito y auditado en el ledger).
 *  2. HEREDA los términos comerciales de la última emisión del ledger para esa
 *     instalación (cliente/socio/edición/módulos/límites/gracia…): renovar es
 *     "misma licencia, nuevo vencimiento"; cualquier flag explícito = upgrade.
 *  3. ATA la respuesta al linaje presentado (`renewalCounter = presentado + 1`,
 *     `nonce = nonce presentado`): la instalación que la pidió la importa UNA
 *     sola vez y rota su linaje local; en cualquier otra, no calza.
 */

export interface RenewParams {
  /** Nuevo vencimiento ISO 8601 (anual o ciclo corto — LICENSING_PROCEDURE §4). */
  expiresAt: string;
  // Overrides opcionales (upgrade); por defecto se hereda del ledger.
  customer?: string;
  channelPartner?: string;
  edition?: LicenseEdition;
  modules?: string[];
  maxInstallations?: number;
  maxNodes?: number;
  maxNamedUsers?: number;
  graceDays?: number;
  notBefore?: string;
  licenseId?: string;
  issuer?: string;
  supportTier?: string;
  whiteLabel?: boolean;
  /** SOLO para dev/tests (renovaciones vencidas de smoke). */
  allowPast?: boolean;
  /** Override HUMANO ante linaje repetido/desfasado. Queda auditado en el ledger. */
  forceDuplicate?: boolean;
  /** Acepta que la huella presentada difiera de la del ledger (migración de hardware). */
  acceptNewFingerprint?: boolean;
}

export interface RenewedLicense extends IssuedLicense {
  /** La emisión previa del ledger de la que se heredaron los términos. */
  base: LedgerEntry;
  /** Linaje presentado por la solicitud (la evidencia que va al ledger). */
  presented: { renewalCounter: number; nonce: string };
  /** true si `--force-duplicate` efectivamente saltó un control de linaje. */
  forcedDuplicate: boolean;
  /** true si `--accept-new-fingerprint` efectivamente aceptó otra huella. */
  acceptedNewFingerprint: boolean;
}

export function renewLicense(opts: {
  request: RenewalRequest;
  privateKeyPem: string;
  /** Ledger COMPLETO del emisor: la renovación exige historial (sin `--no-ledger`). */
  ledgerEntries: LedgerEntry[];
  params: RenewParams;
  now?: Date;
}): RenewedLicense {
  const { request, privateKeyPem, ledgerEntries, params } = opts;
  const force = params.forceDuplicate === true;

  const base = lastEntryForInstallation(ledgerEntries, request.installationId);
  if (base === undefined) {
    throw new Error(
      `la instalación ${request.installationId} no tiene emisiones en el ledger — ` +
        "no se puede renovar lo que nunca se emitió (para activar usa `lyra-license issue`)",
    );
  }

  // --- Los tres controles de linaje (denegar por defecto, PoC T6 / Wibu) ---
  let bypassedLineageCheck = false;

  const duplicate = findDuplicateLineage(ledgerEntries, request.installationId, request.renewalCounter);
  if (duplicate !== undefined) {
    if (!force) {
      throw new Error(
        `⚠️ CLON DETECTADO: ya se emitió una renovación para ${request.installationId} con el ` +
          `MISMO linaje (counter=${request.renewalCounter}, ledger #${duplicate.seq} del ` +
          `${duplicate.issuedAt}). Dos solicitudes con el mismo linaje = sobre-despliegue ` +
          "(LICENSING_STRATEGY §4). Investiga con el socio antes de emitir; si un humano lo " +
          "autoriza, repite con --force-duplicate (queda auditado en el ledger).",
      );
    }
    bypassedLineageCheck = true;
  }

  const lastIssuedCounter = base.renewalCounter ?? 0;
  if (request.renewalCounter !== lastIssuedCounter) {
    if (!force) {
      throw new Error(
        `linaje desfasado: la solicitud presenta counter=${request.renewalCounter} pero la última ` +
          `emisión del ledger para ${request.installationId} fue counter=${lastIssuedCounter} ` +
          `(#${base.seq}). Posible clon con linaje viejo o importación perdida — investiga; ` +
          "override humano: --force-duplicate (queda auditado).",
      );
    }
    bypassedLineageCheck = true;
  }

  if (request.licenseId !== base.licenseId) {
    if (!force) {
      throw new Error(
        `la solicitud presenta licenseId=${request.licenseId} pero el ledger registra ` +
          `${base.licenseId} para esa instalación — no calza; override humano: --force-duplicate`,
      );
    }
    bypassedLineageCheck = true;
  }

  const fingerprintChanged = request.fingerprint !== base.fingerprint;
  if (fingerprintChanged && params.acceptNewFingerprint !== true) {
    throw new Error(
      `la huella presentada (${request.fingerprint}) difiere de la emitida (${base.fingerprint}): ` +
        "¿migración de hardware legítima? Verifica con el socio y repite con " +
        "--accept-new-fingerprint (queda auditado en el ledger).",
    );
  }

  const issued = issueLicense({
    request,
    privateKeyPem,
    now: opts.now,
    params: {
      customer: params.customer ?? base.customer,
      channelPartner: params.channelPartner ?? base.channelPartner,
      edition: params.edition ?? (base.edition as LicenseEdition),
      modules: params.modules ?? base.modules,
      limits: {
        maxInstallations: params.maxInstallations ?? base.limits.maxInstallations,
        maxNodes: params.maxNodes ?? base.limits.maxNodes,
        maxNamedUsers: params.maxNamedUsers ?? base.limits.maxNamedUsers,
      },
      expiresAt: params.expiresAt,
      graceDays: params.graceDays ?? base.graceDays,
      notBefore: params.notBefore,
      // Renovar = la MISMA licencia con nuevo vencimiento: conserva el licenseId.
      licenseId: params.licenseId ?? base.licenseId,
      issuer: params.issuer ?? base.issuer,
      supportTier: params.supportTier ?? base.supportTier,
      whiteLabel: params.whiteLabel ?? base.whiteLabel,
      allowPast: params.allowPast,
      lineage: { renewalCounter: request.renewalCounter + 1, nonce: request.nonce },
    },
  });

  return {
    ...issued,
    base,
    presented: { renewalCounter: request.renewalCounter, nonce: request.nonce },
    forcedDuplicate: bypassedLineageCheck,
    acceptedNewFingerprint: fingerprintChanged,
  };
}
