import { useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  Boxes,
  ClipboardList,
  Lock,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { cx } from "@lyra/ui";
import { licenseeInitials, useBranding, type Branding } from "../../branding.js";
import { BrandScene } from "./BrandScene.js";
import styles from "./AuthLayout.module.css";

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Contenido bajo la tarjeta (ayuda, enlaces secundarios). */
  footer?: ReactNode;
}

interface Feature {
  icon: LucideIcon;
  title: string;
  desc: string;
}

const FEATURES: Feature[] = [
  { icon: ClipboardList, title: "Registro por turno", desc: "Entradas estructuradas con validación en terreno" },
  { icon: ArrowLeftRight, title: "Cambio de turno", desc: "Entregas y recepciones con respaldo y firma" },
  { icon: TriangleAlert, title: "Incidencias con workflow", desc: "Detección, escalamiento y cierre auditable" },
  { icon: ShieldCheck, title: "Seguridad y auditoría", desc: "RBAC/ABAC, MFA y registro inmutable" },
];

/**
 * Identidad de la empresa (branding RUNTIME): logo sobre una placa clara
 * (legible para cualquier color de logo) o, si no hay logo o falla la carga,
 * un monograma con sus iniciales.
 */
function CompanyMark({ branding, variant }: { branding: Branding; variant: "panel" | "card" }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const name = branding.companyName ?? "";

  if (branding.logoUrl && !logoFailed) {
    return (
      <div
        className={cx(
          styles.logoPlate,
          variant === "panel" ? styles.logoPlatePanel : styles.logoPlateCard,
        )}
      >
        <img
          className={styles.logoImg}
          src={branding.logoUrl}
          alt={name}
          onError={() => setLogoFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={cx(styles.mark, variant === "panel" ? styles.markLg : styles.markSm)}
      aria-hidden="true"
    >
      {licenseeInitials(name)}
    </div>
  );
}

/** Lockup del producto (marca Lyra WatchLog). */
function ProductLockup() {
  return (
    <div className={styles.productLockup}>
      <div className={styles.logoTile}>
        <Boxes size={25} color="#fff" />
      </div>
      <div>
        <div className={styles.wordmark}>
          Lyra <span className={styles.wordmarkAccent}>WatchLog</span>
        </div>
        <div className={styles.wordmarkSub}>Bitácoras operacionales</div>
      </div>
    </div>
  );
}

/** Lockup dominante de la empresa (modo marca blanca): su logo/monograma + nombre. */
function CompanyLockup({ branding }: { branding: Branding }) {
  return (
    <div className={styles.productLockup}>
      <CompanyMark branding={branding} variant="card" />
      <div>
        <div className={styles.wordmark}>{branding.companyName}</div>
        <div className={styles.wordmarkSub}>Bitácoras operacionales</div>
      </div>
    </div>
  );
}

/**
 * Entrada de producto con branding RUNTIME (OOBE S3, matriz decisión (b)):
 *  - `lyra` (sin nombre configurado): marca Lyra a secas.
 *  - `cobrand` (whiteLabel:false): panel Lyra dominante + "Licenciado para
 *    {empresa}" con su logo; la card también se co-marca (móvil/tablet).
 *  - `whitelabel` (whiteLabel:true, gate L6d): la marca del cliente toma el
 *    lugar dominante; Lyra queda en el "Operado con Lyra WatchLog" discreto y
 *    el pie NO menciona ITESICWS (regla: jamás ITESICWS en textos de cliente).
 */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  const branding = useBranding();
  const whitelabel = branding.mode === "whitelabel";

  return (
    // La entrada es siempre OSCURA (experiencia de marca), sin importar
    // el tema del workspace.
    <div className={styles.screen} data-theme="dark">
      <aside className={styles.brandPane}>
        <BrandScene />
        {whitelabel ? <CompanyLockup branding={branding} /> : <ProductLockup />}

        <div className={styles.brandHero}>
          <span className={styles.heroEyebrow}>
            <span className={styles.heroDot} />
            Trazabilidad operacional de extremo a extremo
          </span>
          <h2 className={styles.heroTitle}>
            El registro de tu operación, <span className={styles.heroTitleAccent}>turno a turno</span>
          </h2>
          <p className={styles.heroLead}>
            Centraliza bitácoras de turno, entregas, incidencias y conformidades con validación en
            terreno y auditoría inmutable. Pensada para faenas de minería, manufactura y energía.
          </p>

          <div className={styles.features}>
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className={styles.feature}>
                  <div className={styles.featureIcon}>
                    <Icon size={19} aria-hidden="true" />
                  </div>
                  <div className={styles.featureText}>
                    <span className={styles.featureTitle}>{f.title}</span>
                    <span className={styles.featureDesc}>{f.desc}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {branding.mode === "cobrand" && (
          <div className={styles.licenseeLockup}>
            <CompanyMark branding={branding} variant="panel" />
            <div className={styles.licenseeInfo}>
              <span className={styles.licenseeLabel}>Licenciado para</span>
              <span className={styles.licenseeName}>{branding.companyName}</span>
            </div>
          </div>
        )}

        <div className={styles.brandFoot}>
          {whitelabel
            ? `© ${new Date().getFullYear()} ${branding.companyName}`
            : `© ${new Date().getFullYear()} ITESICWS · Ecosistema Lyra`}
        </div>
      </aside>

      <main className={styles.formPane}>
        <div className={styles.panel}>
          <div className={styles.card}>
            <div className={styles.cardBrand}>
              {branding.mode === "lyra" ? (
                <>
                  <div className={styles.logoTile}>
                    <Boxes size={19} color="#fff" />
                  </div>
                  <div className={styles.cardBrandText}>
                    <span className={styles.cardBrandName}>Lyra WatchLog</span>
                    <span className={styles.cardBrandIndustry}>Bitácoras operacionales</span>
                  </div>
                </>
              ) : (
                <>
                  <CompanyMark branding={branding} variant="card" />
                  <div className={styles.cardBrandText}>
                    {branding.logoUrl ? (
                      <span className={styles.cardBrandIndustry}>Bitácoras operacionales</span>
                    ) : (
                      <>
                        <span className={styles.cardBrandName}>{branding.companyName}</span>
                        <span className={styles.cardBrandIndustry}>Bitácoras operacionales</span>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className={styles.divider} />

            <div className={styles.header}>
              <h1 className={styles.title}>{title}</h1>
              {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
            </div>

            {children}

            <div className={styles.footerMeta}>
              <div className={styles.secureNote}>
                <Lock size={14} aria-hidden="true" />
                Conexión cifrada · Acceso auditado · On-premise
              </div>
              <div className={styles.poweredBy}>
                <span className={styles.poweredDot}>
                  <Boxes size={10} color="#fff" />
                </span>
                Operado con <strong>Lyra WatchLog</strong>
              </div>
            </div>
          </div>
          {footer ? <div className={styles.footnote}>{footer}</div> : null}
        </div>
      </main>
    </div>
  );
}
