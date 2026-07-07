import { z } from "zod";
import { licenseRuntimeStatusSchema } from "../licensing/license-status.js";

/**
 * Contratos del ASISTENTE DE PRIMER ARRANQUE (OOBE, BACKLOG §2(5) S1/S2).
 *
 * El setup corre en una instalación VIRGEN (0 usuarios): sin JWT ni permisos,
 * protegido por el TOKEN DE INSTALACIÓN de un solo uso (`x-setup-token`,
 * archivo `setup-token` junto a la licencia). Los endpoints (salvo `status`)
 * mueren en 404 al completarse — el wizard no vuelve a aparecer jamás.
 */

/**
 * Estado público MÍNIMO (sin token): un booleano y nada más. Es lo ÚNICO que
 * un anónimo puede saber de la instalación (mínimo privilegio): ni versión,
 * ni licencia, ni nombres. La web lo usa para redirigir /login → /setup.
 */
export const setupStatusSchema = z.object({
  setupRequired: z.boolean(),
});
export type SetupStatusDto = z.infer<typeof setupStatusSchema>;

/** Modo de tema por defecto de la instalación (paso Apariencia). */
export const setupThemeModeSchema = z.enum(["dark", "light", "auto"]);
export type SetupThemeMode = z.infer<typeof setupThemeModeSchema>;

/** Idiomas soportados hoy (es-CL nativo; en preparado para i18n). */
export const setupLocaleSchema = z.enum(["es-CL", "en"]);
export type SetupLocale = z.infer<typeof setupLocaleSchema>;

/**
 * Contexto del wizard (SOLO con token válido). Incluye lo que el implementador
 * necesita para la ceremonia de activación (installationId + huella, runbook
 * LICENSING_PROCEDURE §2) y la política de contraseñas para el medidor del
 * paso 2. `customer` viene del payload FIRMADO si la licencia ya se activó
 * (prefill del nombre de empresa). Nada de esto viaja sin token.
 */
export const setupContextSchema = z.object({
  passwordPolicy: z.object({
    minLength: z.number().int().positive(),
    requireUppercase: z.boolean(),
    requireNumber: z.boolean(),
    requireSymbol: z.boolean(),
  }),
  license: z.object({
    status: licenseRuntimeStatusSchema,
    installationId: z.string(),
    fingerprint: z.string(),
    customer: z.string().optional(),
    /** ¿Existe `solicitud.lreq` descargable? (paso Licencia). */
    hasActivationRequest: z.boolean(),
  }),
});
export type SetupContextDto = z.infer<typeof setupContextSchema>;

/**
 * Importación de `license.lic` desde el wizard (decisión 2026-07-06: reabre
 * L6b SOLO para el setup — post-setup la UI sigue sin subir licencias). El
 * contenido va como texto (el .lic es texto firmado); el backend lo VERIFICA
 * (Ed25519 + huella + linaje) ANTES de persistir — jamás se escribe un
 * archivo no verificado.
 */
export const SETUP_LICENSE_MAX_BYTES = 64 * 1024;
export const setupLicenseImportRequestSchema = z.object({
  content: z.string().min(1).max(SETUP_LICENSE_MAX_BYTES),
});
export type SetupLicenseImportRequest = z.infer<typeof setupLicenseImportRequestSchema>;

export const setupLicenseImportResponseSchema = z.object({
  status: licenseRuntimeStatusSchema,
  customer: z.string().optional(),
});
export type SetupLicenseImportResponse = z.infer<typeof setupLicenseImportResponseSchema>;

/**
 * Finalización ATÓMICA del asistente: crea el administrador REAL (política de
 * contraseñas aplicada en el backend), guarda identidad/apariencia, marca la
 * instalación como configurada e invalida el token. Los bloques `identity` y
 * `appearance` son opcionales (pasos saltables).
 */
export const setupFinalizeRequestSchema = z.object({
  admin: z.object({
    email: z.string().trim().toLowerCase().email().max(320),
    displayName: z.string().trim().min(1).max(120),
    password: z.string().min(1).max(200),
  }),
  /**
   * Exigir MFA a los administradores: activa `requireMfa` del rol Administrador
   * (y sube la política a REQUIRED_BY_ROLE si estaba en OPTIONAL) — el
   * enrolamiento se fuerza en el PRIMER login con el gate ya existente.
   */
  requireMfaForAdmins: z.boolean().optional(),
  identity: z
    .object({
      companyDisplayName: z.string().trim().min(1).max(120).optional(),
      timezone: z.string().trim().min(1).max(64).optional(),
      locale: setupLocaleSchema.optional(),
    })
    .optional(),
  appearance: z
    .object({
      themeMode: setupThemeModeSchema.optional(),
      /**
       * Id de una plantilla curada de `THEME_PRESETS` (@lyra/contracts). El
       * SERVIDOR resuelve los tokens desde el catálogo (autoritativo): el
       * cliente no manda colores sueltos en el setup.
       */
      presetId: z.string().optional(),
    })
    .optional(),
});
export type SetupFinalizeRequest = z.infer<typeof setupFinalizeRequestSchema>;

export const setupFinalizeResponseSchema = z.object({
  ok: z.literal(true),
  adminEmail: z.string(),
});
export type SetupFinalizeResponse = z.infer<typeof setupFinalizeResponseSchema>;
