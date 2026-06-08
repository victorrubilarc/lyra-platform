import { Link } from "react-router-dom";
import { Activity, ArrowRight, Database, Layers, Network, ShieldCheck, type LucideIcon } from "lucide-react";
import { Card, cx } from "@lyra/ui";
import type { Permission } from "@lyra/permissions";
import { useAuth } from "../../auth/use-auth.js";
import { usePermissions } from "../../auth/use-permissions.js";
import styles from "./HomePage.module.css";

/** Estado de cada módulo en el mapa de la app. */
type ModuleStatus = "ready" | "building" | "soon";

interface ModuleCard {
  name: string;
  description: string;
  icon: LucideIcon;
  status: ModuleStatus;
  /** Ruta navegable (si el módulo ya tiene pantalla, aunque sea placeholder). */
  path?: string;
  /** Permiso de módulo que habilita el acceso (la UI solo oculta el enlace). */
  permission?: Permission;
}

const MODULES: ModuleCard[] = [
  {
    name: "Estructura",
    description: "Jerarquía organizacional por nodos y equipos",
    icon: Network,
    status: "ready",
    path: "/estructura",
    permission: "module:structure:view",
  },
  {
    name: "Seguridad",
    description: "Usuarios, roles, permisos y alcance de datos",
    icon: ShieldCheck,
    status: "building",
    path: "/seguridad",
    permission: "module:security:view",
  },
  { name: "Plantillas", description: "Form builder de bitácoras", icon: Layers, status: "soon" },
  { name: "Orígenes de datos", description: "Integraciones externas", icon: Database, status: "soon" },
  { name: "Incidencias", description: "Workflow HSE", icon: Activity, status: "soon" },
];

const STATUS_LABEL: Record<ModuleStatus, string> = {
  ready: "Disponible",
  building: "En construcción",
  soon: "Pronto",
};

const STATUS_CLASS: Record<ModuleStatus, string> = {
  ready: "statusReady",
  building: "statusBuilding",
  soon: "statusSoon",
};

/** Landing de la app autenticada: bienvenida + mapa de módulos navegables. */
export function HomePage() {
  const { user } = useAuth();
  const perms = usePermissions();

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
          // Navegable si tiene ruta y el usuario tiene el permiso de módulo.
          const accessible = !!m.path && (!m.permission || perms.can(m.permission));

          const inner = (
            <Card key={m.name} hoverable={accessible} className={styles.module}>
              <div className={styles.moduleHead}>
                <div className={styles.moduleIcon}>
                  <Icon size={20} aria-hidden="true" />
                </div>
                <span className={cx(styles.statusChip, styles[STATUS_CLASS[m.status]])}>
                  {STATUS_LABEL[m.status]}
                </span>
              </div>
              <div className={styles.moduleName}>{m.name}</div>
              <div className={styles.moduleDesc}>{m.description}</div>
              {accessible && (
                <span className={styles.moduleCta}>
                  Abrir <ArrowRight size={14} aria-hidden="true" />
                </span>
              )}
            </Card>
          );

          if (accessible && m.path) {
            return (
              <Link key={m.name} to={m.path} className={styles.moduleLink} aria-label={`Abrir ${m.name}`}>
                {inner}
              </Link>
            );
          }
          return inner;
        })}
      </div>
    </div>
  );
}
