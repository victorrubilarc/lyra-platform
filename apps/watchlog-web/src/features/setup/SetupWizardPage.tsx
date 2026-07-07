import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Boxes,
  Building2,
  Check,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileKey2,
  ImageUp,
  KeyRound,
  Rocket,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import { Button, Checkbox, Chip, FormField, Input, Select, Spinner, Stepper } from "@lyra/ui";
import {
  BRANDING_LOGO_MAX_BYTES,
  THEME_PRESETS,
  emailSchema,
  type SetupContextDto,
  type SetupFinalizeRequest,
  type SetupLocale,
  type SetupThemeMode,
} from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { PaletteSwatch } from "../settings/PaletteSwatch.js";
import {
  downloadActivationRequest,
  fetchSetupContext,
  fetchSetupStatus,
  finalizeSetup,
  importSetupLicense,
  removeSetupLogo,
  uploadSetupLogo,
} from "./setup-api.js";
import styles from "./SetupWizardPage.module.css";

/** Pasos del wizard (tras validar el token). "license" solo si falta activar. */
type StepId = "account" | "identity" | "appearance" | "license" | "summary";

const LOCALE_OPTIONS: Array<{ value: SetupLocale; label: string }> = [
  { value: "es-CL", label: "Español (Chile)" },
  { value: "en", label: "English" },
];

const THEME_MODE_OPTIONS: Array<{ value: SetupThemeMode; label: string; desc: string }> = [
  { value: "dark", label: "Oscuro", desc: "Identidad de marca (recomendado)" },
  { value: "light", label: "Claro", desc: "Superficies claras" },
  { value: "auto", label: "Automático", desc: "Sigue al sistema operativo" },
];

/** Zonas horarias IANA del runtime (fallback mínimo si el navegador no soporta). */
function timezoneOptions(): string[] {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return ["America/Santiago", "UTC"];
  }
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * ASISTENTE DE PRIMER ARRANQUE (OOBE S2). Solo existe en una instalación
 * VIRGEN: pide el token de instalación (archivo `setup-token` de la carpeta
 * de licencia), crea el administrador REAL, captura identidad/apariencia y —
 * si la instalación está PENDIENTE_ACTIVACION — acompaña la ceremonia de
 * activación (descarga de `solicitud.lreq` + importación de `license.lic`).
 * Fullscreen SIEMPRE oscuro (el arranque es experiencia de marca, como la
 * entrada). Al finalizar redirige al login y no vuelve a aparecer jamás.
 */
export function SetupWizardPage() {
  const navigate = useNavigate();

  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);
  const [token, setToken] = useState("");
  const [context, setContext] = useState<SetupContextDto | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);

  // Paso 2 — cuenta de administrador.
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [requireMfa, setRequireMfa] = useState(false);
  const [accountError, setAccountError] = useState<string | null>(null);

  // Paso 3 — identidad de la empresa.
  const [company, setCompany] = useState("");
  const [timezone, setTimezone] = useState("America/Santiago");
  const [locale, setLocale] = useState<SetupLocale>("es-CL");
  // Logo (OOBE S3): se sube DE INMEDIATO (token-gated) — el finalize no lo toca.
  const logoFileRef = useRef<HTMLInputElement>(null);
  const [logoUploaded, setLogoUploaded] = useState(false);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);

  const onLogoFile = async (file: File) => {
    setLogoError(null);
    if (file.size > BRANDING_LOGO_MAX_BYTES) {
      setLogoError("El archivo supera el máximo de 512 KB.");
      return;
    }
    setLogoBusy(true);
    try {
      await uploadSetupLogo(token, file);
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      setLogoPreview(URL.createObjectURL(file));
      setLogoUploaded(true);
    } catch (err) {
      setLogoError(err instanceof ApiError ? err.message : "No se pudo subir el logo.");
    } finally {
      setLogoBusy(false);
      if (logoFileRef.current) logoFileRef.current.value = "";
    }
  };

  const onLogoRemove = async () => {
    setLogoBusy(true);
    setLogoError(null);
    try {
      await removeSetupLogo(token);
      if (logoPreview) URL.revokeObjectURL(logoPreview);
      setLogoPreview(null);
      setLogoUploaded(false);
    } catch (err) {
      setLogoError(err instanceof ApiError ? err.message : "No se pudo quitar el logo.");
    } finally {
      setLogoBusy(false);
    }
  };

  // Paso 4 — apariencia (global de la instalación).
  const [themeMode, setThemeMode] = useState<SetupThemeMode>("dark");
  const [presetId, setPresetId] = useState<string | null>(null);

  // Paso 5 — licencia (estado vivo tras una importación exitosa).
  const [licenseStatus, setLicenseStatus] = useState<string | null>(null);
  const [licenseNotice, setLicenseNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetchSetupStatus()
      .then((s) => setSetupRequired(s.setupRequired))
      .catch(() => setSetupRequired(false));
  }, []);

  // Los pasos se fijan al validar el token (no se recalculan a mitad de camino
  // para no mover el índice bajo los pies del usuario).
  const steps = useMemo<Array<{ id: StepId; label: string; hint?: string }>>(() => {
    if (!context) return [];
    const pending = context.license.status === "PENDIENTE_ACTIVACION";
    return [
      { id: "account", label: "Administrador", hint: "La cuenta real" },
      { id: "identity", label: "Identidad", hint: "Tu empresa" },
      { id: "appearance", label: "Apariencia", hint: "Tema de la instalación" },
      ...(pending ? [{ id: "license" as const, label: "Licencia", hint: "Activación" }] : []),
      { id: "summary", label: "Resumen", hint: "Confirmar y finalizar" },
    ];
  }, [context]);

  const currentStep: StepId | "welcome" = context ? steps[stepIndex]!.id : "welcome";

  if (setupRequired === null) {
    return (
      <div className={styles.screen} data-theme="dark">
        <Spinner />
      </div>
    );
  }
  // Instalación ya configurada: aquí no hay nada que hacer.
  if (!setupRequired && !finished) return <Navigate to="/login" replace />;

  const passwordChecks = context
    ? [
        {
          label: `Mínimo ${context.passwordPolicy.minLength} caracteres`,
          met: password.length >= context.passwordPolicy.minLength,
          required: true,
        },
        {
          label: "Una mayúscula",
          met: /[A-Z]/.test(password),
          required: context.passwordPolicy.requireUppercase,
        },
        {
          label: "Un número",
          met: /[0-9]/.test(password),
          required: context.passwordPolicy.requireNumber,
        },
        {
          label: "Un símbolo",
          met: /[^A-Za-z0-9]/.test(password),
          required: context.passwordPolicy.requireSymbol,
        },
      ].filter((c) => c.required)
    : [];

  const onValidateToken = async () => {
    setServerError(null);
    setBusy(true);
    try {
      const ctx = await fetchSetupContext(token.trim());
      setContext(ctx);
      setLicenseStatus(ctx.license.status);
      if (ctx.license.customer) setCompany(ctx.license.customer);
      setStepIndex(0);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "No se pudo validar el token");
    } finally {
      setBusy(false);
    }
  };

  const onAccountNext = () => {
    setAccountError(null);
    if (!emailSchema.safeParse(email.trim()).success) {
      setAccountError("Ingresa un correo electrónico válido.");
      return;
    }
    if (displayName.trim().length === 0) {
      setAccountError("Ingresa el nombre del administrador.");
      return;
    }
    if (passwordChecks.some((c) => !c.met)) {
      setAccountError("La contraseña aún no cumple la política.");
      return;
    }
    if (password !== confirm) {
      setAccountError("Las contraseñas no coinciden.");
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const onDownloadRequest = async () => {
    setServerError(null);
    try {
      saveBlob(await downloadActivationRequest(token), "solicitud.lreq");
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "No se pudo descargar la solicitud");
    }
  };

  const onLicenseFile = async (file: File) => {
    setServerError(null);
    setLicenseNotice(null);
    setBusy(true);
    try {
      const content = await file.text();
      const res = await importSetupLicense(token, content);
      setLicenseStatus(res.status);
      if (res.customer && company.trim() === "") setCompany(res.customer);
      setLicenseNotice(`Licencia importada y verificada. Estado: ${res.status}.`);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "No se pudo importar la licencia");
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onFinalize = async () => {
    setServerError(null);
    setBusy(true);
    try {
      const identity: SetupFinalizeRequest["identity"] = {
        companyDisplayName: company.trim() === "" ? undefined : company.trim(),
        timezone,
        locale,
      };
      await finalizeSetup(token, {
        admin: { email: email.trim(), displayName: displayName.trim(), password },
        requireMfaForAdmins: requireMfa || undefined,
        identity,
        appearance: { themeMode, presetId: presetId ?? undefined },
      });
      setFinished(true);
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : "No se pudo finalizar la configuración");
    } finally {
      setBusy(false);
    }
  };

  const selectedPreset = presetId ? THEME_PRESETS.find((p) => p.id === presetId) : undefined;

  const lockup = (
    <div className={styles.lockup}>
      <div className={styles.logoTile}>
        <Boxes size={24} color="#fff" />
      </div>
      <div>
        <div className={styles.wordmark}>
          Lyra <span className={styles.wordmarkAccent}>WatchLog</span>
        </div>
        <div className={styles.wordmarkSub}>Configuración inicial</div>
      </div>
    </div>
  );

  const errorBox = serverError && (
    <div className={styles.formError} role="alert">
      <AlertTriangle size={16} aria-hidden="true" />
      {serverError}
    </div>
  );

  // ── Pantalla final ──────────────────────────────────────────────────────────
  if (finished) {
    return (
      <div className={styles.screen} data-theme="dark">
        {lockup}
        <div className={`${styles.card} ${styles.cardNarrow}`}>
          <div className={styles.successIcon}>
            <CheckCircle2 size={30} />
          </div>
          <div className={styles.header}>
            <h1 className={styles.title}>¡Todo listo!</h1>
            <p className={styles.subtitle}>
              La instalación quedó configurada y la cuenta de administrador{" "}
              <strong>{email.trim()}</strong> fue creada. Este asistente no volverá a aparecer.
            </p>
          </div>
          <Button
            variant="primary"
            block
            leftIcon={<Rocket size={18} />}
            onClick={() =>
              navigate("/login", {
                replace: true,
                state: { notice: "Configuración inicial completada. Inicia sesión con tu cuenta de administrador." },
              })
            }
          >
            Ir a iniciar sesión
          </Button>
        </div>
      </div>
    );
  }

  // ── Bienvenida (token) ──────────────────────────────────────────────────────
  if (currentStep === "welcome") {
    return (
      <div className={styles.screen} data-theme="dark">
        {lockup}
        <div className={`${styles.card} ${styles.cardNarrow}`}>
          <div className={styles.header}>
            <h1 className={styles.title}>Bienvenido a tu nueva instalación</h1>
            <p className={styles.subtitle}>
              Esta instalación de Lyra WatchLog aún no tiene usuarios. Este asistente crea la
              cuenta de administrador y deja todo listo para operar. Para continuar, ingresa el
              <strong> token de instalación</strong>: está en el archivo{" "}
              <span className={styles.mono}>setup-token</span> de la carpeta de licencia del
              despliegue (junto a <span className={styles.mono}>license.lic</span>).
            </p>
          </div>
          {errorBox}
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              void onValidateToken();
            }}
            noValidate
          >
            <FormField label="Token de instalación" required>
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  mono
                  autoFocus
                  autoComplete="off"
                  placeholder="Pega aquí el contenido de setup-token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              )}
            </FormField>
            <Button
              type="submit"
              variant="primary"
              block
              loading={busy}
              disabled={token.trim().length === 0}
              leftIcon={<KeyRound size={18} />}
            >
              Validar y comenzar
            </Button>
          </form>
          <div className={styles.notice}>
            <ShieldCheck size={16} aria-hidden="true" />
            El token es de un solo uso y se invalida al terminar. Sin él, nadie en la red puede
            configurar esta instalación.
          </div>
        </div>
        <div className={styles.foot}>© {new Date().getFullYear()} ITESICWS · Ecosistema Lyra</div>
      </div>
    );
  }

  // ── Wizard con stepper ──────────────────────────────────────────────────────
  return (
    <div className={styles.screen} data-theme="dark">
      {lockup}
      <div className={styles.card}>
        <Stepper
          className={styles.stepper}
          steps={steps}
          current={stepIndex}
          onStepClick={(i) => {
            setServerError(null);
            setStepIndex(i);
          }}
        />
        {errorBox}

        {currentStep === "account" && (
          <form
            className={styles.form}
            onSubmit={(e) => {
              e.preventDefault();
              onAccountNext();
            }}
            noValidate
          >
            <div className={styles.header}>
              <h2 className={styles.title}>Cuenta de administrador</h2>
              <p className={styles.subtitle}>
                Esta es la cuenta REAL con acceso total al sistema. Reemplaza a cualquier
                credencial de instalación: elige una contraseña fuerte y guárdala bien.
              </p>
            </div>
            {accountError && (
              <div className={styles.formError} role="alert">
                <AlertTriangle size={16} aria-hidden="true" />
                {accountError}
              </div>
            )}
            <div className={styles.grid2}>
              <FormField label="Correo electrónico" required>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    type="email"
                    autoComplete="username"
                    autoFocus
                    placeholder="admin@tuempresa.cl"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
              </FormField>
              <FormField label="Nombre para mostrar" required>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    autoComplete="name"
                    placeholder="Administrador del sistema"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                )}
              </FormField>
            </div>
            <div className={styles.grid2}>
              <FormField label="Contraseña" required>
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    rightSlot={
                      <button
                        type="button"
                        className={styles.skipButton}
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    }
                  />
                )}
              </FormField>
              <FormField
                label="Confirmar contraseña"
                required
                error={confirm.length > 0 && confirm !== password ? "No coincide" : undefined}
              >
                {({ id, describedBy, invalid }) => (
                  <Input
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••••••"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                )}
              </FormField>
            </div>
            <ul className={styles.policyList} aria-label="Requisitos de la contraseña">
              {passwordChecks.map((c) => (
                <li key={c.label} className={`${styles.policyItem} ${c.met ? styles.policyMet : ""}`}>
                  <Check size={13} aria-hidden="true" />
                  {c.label}
                </li>
              ))}
            </ul>
            <Checkbox
              checked={requireMfa}
              onChange={setRequireMfa}
              label="Exigir verificación en dos pasos (MFA) a los administradores — se enrola en el primer inicio de sesión"
            />
            <div className={styles.actions}>
              <div className={styles.actionsRight}>
                <Button type="submit" variant="primary">
                  Continuar
                </Button>
              </div>
            </div>
          </form>
        )}

        {currentStep === "identity" && (
          <div className={styles.form}>
            <div className={styles.header}>
              <h2 className={styles.title}>Identidad de la empresa</h2>
              <p className={styles.subtitle}>
                Cómo se presenta esta instalación. Todo esto se puede ajustar después en
                Configuración.
              </p>
            </div>
            <FormField label="Nombre visible de la empresa">
              {({ id, describedBy, invalid }) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  invalid={invalid}
                  placeholder="Minera Ejemplo SpA"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  rightSlot={<Building2 size={17} aria-hidden="true" />}
                />
              )}
            </FormField>
            <div className={styles.grid2}>
              <FormField label="Zona horaria">
                {({ id, describedBy, invalid }) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                  >
                    {timezoneOptions().map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
              <FormField label="Idioma">
                {({ id, describedBy, invalid }) => (
                  <Select
                    id={id}
                    aria-describedby={describedBy}
                    invalid={invalid}
                    value={locale}
                    onChange={(e) => setLocale(e.target.value as SetupLocale)}
                  >
                    {LOCALE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                )}
              </FormField>
            </div>
            <FormField
              label="Logo de la empresa (opcional)"
              hint="PNG, JPEG o WebP · máx. 512 KB. Se aplica al acceso y a la barra superior; sin logo se usa un monograma."
              error={logoError ?? undefined}
            >
              {() => (
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  {logoPreview && (
                    <img
                      src={logoPreview}
                      alt="Logo de la empresa"
                      style={{
                        height: 44,
                        maxWidth: 180,
                        objectFit: "contain",
                        background: "rgba(255,255,255,0.92)",
                        borderRadius: 8,
                        padding: "4px 8px",
                      }}
                    />
                  )}
                  <input
                    ref={logoFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void onLogoFile(file);
                    }}
                  />
                  <Button
                    variant="secondary"
                    loading={logoBusy}
                    leftIcon={<ImageUp size={15} />}
                    onClick={() => logoFileRef.current?.click()}
                  >
                    {logoUploaded ? "Cambiar logo" : "Subir logo"}
                  </Button>
                  {logoUploaded && (
                    <Button
                      variant="secondary"
                      disabled={logoBusy}
                      leftIcon={<Trash2 size={15} />}
                      onClick={() => void onLogoRemove()}
                    >
                      Quitar
                    </Button>
                  )}
                </div>
              )}
            </FormField>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.skipButton}
                onClick={() => setStepIndex((i) => i + 1)}
              >
                Configurar después
              </button>
              <div className={styles.actionsRight}>
                <Button variant="primary" onClick={() => setStepIndex((i) => i + 1)}>
                  Continuar
                </Button>
              </div>
            </div>
          </div>
        )}

        {currentStep === "appearance" && (
          <div className={styles.form}>
            <div className={styles.header}>
              <h2 className={styles.title}>Apariencia de la instalación</h2>
              <p className={styles.subtitle}>
                Define el tema por defecto para TODOS los usuarios (cada persona puede elegir el
                suyo después). La entrada al sistema es siempre oscura: es la identidad de marca.
              </p>
            </div>
            <FormField label="Modo por defecto">
              {() => (
                <div className={styles.optionRow} role="radiogroup" aria-label="Modo de tema">
                  {THEME_MODE_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      role="radio"
                      aria-checked={themeMode === o.value}
                      className={`${styles.optionCard} ${themeMode === o.value ? styles.optionCardActive : ""}`}
                      onClick={() => setThemeMode(o.value)}
                    >
                      <span>
                        <strong>{o.label}</strong>
                        <br />
                        {o.desc}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </FormField>
            <FormField label="Paleta de colores">
              {() => (
                <ul className={styles.presetGrid}>
                  <li>
                    <button
                      type="button"
                      className={`${styles.presetCard} ${presetId === null ? styles.presetCardActive : ""}`}
                      onClick={() => setPresetId(null)}
                    >
                      <span className={styles.presetMeta}>
                        <span className={styles.presetName}>Marca Lyra (base)</span>
                        <span className={styles.presetDesc}>Índigo + cian del ecosistema</span>
                      </span>
                    </button>
                  </li>
                  {THEME_PRESETS.map((preset) => (
                    <li key={preset.id}>
                      <button
                        type="button"
                        className={`${styles.presetCard} ${presetId === preset.id ? styles.presetCardActive : ""}`}
                        onClick={() => setPresetId(preset.id)}
                      >
                        <PaletteSwatch tokensDark={preset.tokensDark} tokensLight={preset.tokensLight} />
                        <span className={styles.presetMeta}>
                          <span className={styles.presetName}>{preset.name}</span>
                          <span className={styles.presetDesc}>{preset.description}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </FormField>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.skipButton}
                onClick={() => {
                  setThemeMode("dark");
                  setPresetId(null);
                  setStepIndex((i) => i + 1);
                }}
              >
                Configurar después
              </button>
              <div className={styles.actionsRight}>
                <Button variant="primary" onClick={() => setStepIndex((i) => i + 1)}>
                  Continuar
                </Button>
              </div>
            </div>
          </div>
        )}

        {currentStep === "license" && context && (
          <div className={styles.form}>
            <div className={styles.header}>
              <h2 className={styles.title}>Activación de la licencia</h2>
              <p className={styles.subtitle}>
                La instalación puede configurarse y consultarse sin licencia, pero para OPERAR
                necesita el archivo <span className={styles.mono}>license.lic</span> emitido para
                esta máquina. Descarga la solicitud, envíala a tu proveedor y —cuando recibas la
                licencia— impórtala aquí o déjala en la carpeta de licencia del despliegue.
              </p>
            </div>
            {licenseNotice && (
              <div className={`${styles.notice} ${styles.noticeOk}`} role="status">
                <CheckCircle2 size={16} aria-hidden="true" />
                {licenseNotice}
              </div>
            )}
            <div className={styles.infoList}>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Estado</span>
                <span className={styles.infoValue}>
                  <Chip
                    variant={licenseStatus === "VALIDA" ? "success" : "warning"}
                    label={licenseStatus ?? context.license.status}
                  />
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>ID de instalación</span>
                <span className={`${styles.infoValue} ${styles.mono}`}>
                  {context.license.installationId}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Huella de la máquina</span>
                <span className={`${styles.infoValue} ${styles.mono}`}>
                  {context.license.fingerprint}
                </span>
              </div>
            </div>
            <div className={styles.optionRow}>
              <Button
                variant="secondary"
                leftIcon={<Download size={17} />}
                disabled={!context.license.hasActivationRequest}
                onClick={() => void onDownloadRequest()}
              >
                Descargar solicitud (.lreq)
              </Button>
              <Button
                variant="secondary"
                leftIcon={<Upload size={17} />}
                loading={busy}
                onClick={() => fileInputRef.current?.click()}
              >
                Importar license.lic
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".lic,application/json,text/plain"
                className={styles.hiddenFile}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onLicenseFile(file);
                }}
              />
            </div>
            <div className={styles.notice}>
              <FileKey2 size={16} aria-hidden="true" />
              La licencia se verifica (firma y huella) ANTES de guardarse; un archivo ajeno o
              adulterado se rechaza. Este paso se puede completar después sin este asistente.
            </div>
            <div className={styles.actions}>
              <button
                type="button"
                className={styles.skipButton}
                onClick={() => setStepIndex((i) => i + 1)}
              >
                Activar después
              </button>
              <div className={styles.actionsRight}>
                <Button variant="primary" onClick={() => setStepIndex((i) => i + 1)}>
                  Continuar
                </Button>
              </div>
            </div>
          </div>
        )}

        {currentStep === "summary" && (
          <div className={styles.form}>
            <div className={styles.header}>
              <h2 className={styles.title}>Resumen</h2>
              <p className={styles.subtitle}>
                Revisa la configuración. Al finalizar se crea la cuenta, se aplica todo y el
                asistente se cierra definitivamente.
              </p>
            </div>
            <div className={styles.infoList}>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Administrador</span>
                <span className={styles.infoValue}>
                  {displayName.trim()} · <span className={styles.mono}>{email.trim()}</span>
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>MFA de administradores</span>
                <span className={styles.infoValue}>
                  {requireMfa ? "Obligatorio (se enrola al primer ingreso)" : "Opcional"}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Empresa</span>
                <span className={styles.infoValue}>
                  {company.trim() === "" ? "Sin definir (configurable después)" : company.trim()}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Zona horaria · idioma</span>
                <span className={styles.infoValue}>
                  {timezone} · {LOCALE_OPTIONS.find((o) => o.value === locale)?.label}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Logo</span>
                <span className={styles.infoValue}>
                  {logoUploaded ? "Cargado" : "Sin logo (se usará un monograma)"}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Apariencia</span>
                <span className={styles.infoValue}>
                  {THEME_MODE_OPTIONS.find((o) => o.value === themeMode)?.label} ·{" "}
                  {selectedPreset ? selectedPreset.name : "Marca Lyra (base)"}
                </span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Licencia</span>
                <span className={styles.infoValue}>{licenseStatus ?? "—"}</span>
              </div>
            </div>
            <div className={styles.actions}>
              <div className={styles.actionsRight}>
                <Button
                  variant="primary"
                  loading={busy}
                  leftIcon={<Rocket size={18} />}
                  onClick={() => void onFinalize()}
                >
                  Finalizar configuración
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className={styles.foot}>© {new Date().getFullYear()} ITESICWS · Ecosistema Lyra</div>
    </div>
  );
}
