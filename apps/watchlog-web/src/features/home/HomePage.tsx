import { Activity, Database, Layers, Network, ShieldCheck, type LucideIcon } from "lucide-react";
import { Card, cx } from "@lyra/ui";
import { useAuth } from "../../auth/use-auth.js";
import styles from "./HomePage.module.css";

interface ModuleCard {
  name: string;
  description: string;
  icon: LucideIcon;
  ready: boolean;
}

const MODULES: ModuleCard[] = [
  { name: "Seguridad", description: "Usuarios, roles, permisos y alcance de datos", icon: ShieldCheck, ready: false },
  { name: "Estructura", description: "Jerarquía organizacional por nodos", icon: Network, ready: false },
  { name: "Plantillas", description: "Form builder de bitácoras", icon: Layers, ready: false },
  { name: "Orígenes de datos", description: "Integraciones externas", icon: Database, ready: false },
  { name: "Incidencias", description: "Workflow HSE", icon: Activity, ready: false },
];

/** Landing de la app autenticada. En esta fase, da la bienvenida y muestra el mapa de módulos. */
export function HomePage() {
  const { user } = useAuth();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Hola, {user?.displayName ?? "operador"}</h1>
        <p className={styles.subtitle}>
          Bienvenido a Lyra WatchLog. Los módulos se irán habilitando por fase.
        </p>
      </div>

      <div className={styles.grid}>
        {MODULES.map((m) => {
          const Icon = m.icon;
          return (
            <Card key={m.name} hoverable className={styles.module}>
              <div className={styles.moduleHead}>
                <div className={styles.moduleIcon}>
                  <Icon size={20} aria-hidden="true" />
                </div>
                <span
                  className={cx(styles.statusChip, m.ready ? styles.statusReady : styles.statusSoon)}
                >
                  {m.ready ? "Disponible" : "Pronto"}
                </span>
              </div>
              <div className={styles.moduleName}>{m.name}</div>
              <div className={styles.moduleDesc}>{m.description}</div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
