import type { ReactNode } from "react";
import { Boxes } from "lucide-react";
import { Card } from "@lyra/ui";
import styles from "./AuthLayout.module.css";

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Contenido bajo la tarjeta (ayuda, enlaces secundarios). */
  footer?: ReactNode;
}

/** Pantalla centrada con la marca Lyra para los flujos de autenticación. */
export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className={styles.screen}>
      <div className={styles.panel}>
        <div className={styles.brand}>
          <div className={styles.brandLogo}>
            <Boxes size={24} color="#fff" />
          </div>
          <div>
            <div className={styles.brandWordmark}>
              Lyra <span className={styles.brandProduct}>WatchLog</span>
            </div>
            <div className={styles.brandSubtitle}>Bitácora operacional</div>
          </div>
        </div>

        <Card glow className={styles.card}>
          <div className={styles.header}>
            <h1 className={styles.title}>{title}</h1>
            {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          {children}
        </Card>

        {footer ? <div className={styles.footnote}>{footer}</div> : null}
      </div>
    </div>
  );
}
