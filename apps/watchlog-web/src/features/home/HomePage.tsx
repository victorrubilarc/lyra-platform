import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  ClipboardList,
  ListTodo,
  AlertOctagon,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ExceptionListQuery } from "@lyra/contracts";
import { Card, cx } from "@lyra/ui";
import { useAuth } from "../../auth/use-auth.js";
import { usePermissions } from "../../auth/use-permissions.js";
import { SIDEBAR_ROUTES } from "../../shell/navigation.js";
import { useMyRoundsStats } from "../schedules/schedules-queries.js";
import { useIncidentStats } from "../incidents/incidents-queries.js";
import { useWorkOrderStats } from "../work-orders/work-orders-queries.js";
import { useExceptions } from "../exceptions/exceptions-queries.js";
import { useInboxUnreadCount } from "../notifications/notifications-queries.js";
import { formatNumber } from "../../lib/format.js";
import styles from "./HomePage.module.css";

/** Severidad semántica de una sub-métrica del tile (solo para su significado). */
type Tone = "alert" | "warn";

/** Sub-métrica (pill) de un tile: un conteo de riesgo con su color. */
interface TileStat {
  text: string;
  tone: Tone;
}

/** Un tile accionable del worklist personal (patrón launchpad Fiori). */
interface WorklistTile {
  key: string;
  icon: LucideIcon;
  label: string;
  /** Conteo principal (headline del módulo). */
  count: number;
  /** Deep-link al listado YA filtrado que corresponde al conteo. */
  to: string;
  /** Cargando el conteo (skeleton). */
  loading: boolean;
  /** Sub-métricas de riesgo (crítico/vencido/sin responsable). Vacío = calmo. */
  stats: TileStat[];
  /** Texto tranquilo cuando el conteo es 0 (buena noticia, no grita). */
  emptyText: string;
}

/**
 * Query mínima para el resumen de excepciones: solo interesa `data.summary`
 * (conteos), no las filas. Constante para no re-disparar la query en cada render.
 */
const EXCEPTIONS_SUMMARY_QUERY: ExceptionListQuery = { page: 1, pageSize: 1 };

/** Rutas cuyo módulo ya está representado por un tile del worklist (no se duplican como acceso). */
const TILE_PATHS = new Set(["/mis-rondas", "/incidencias", "/ordenes-trabajo", "/excepciones"]);

/**
 * Landing de la app autenticada: cockpit del turno, estilo launchpad (SAP Fiori
 * "My Home"). NO es el directorio completo de la app (eso vive en el sidebar):
 *  1. «Mi trabajo hoy»: tiles accionables con conteo EN VIVO + desglose de riesgo
 *     + deep-link al listado filtrado. Cada tile se gatea por su permiso (no se
 *     pide el stat si no tienes el módulo → sin 403).
 *  2. «Operación»: accesos a los módulos operativos del día que no son ya un tile.
 *     Derivados del grupo `operation` del registro de navegación (no una lista
 *     aparte), así el Inicio nunca se desincroniza de los módulos reales.
 */
export function HomePage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { can } = usePermissions();

  // Permisos de los tiles: gatean el fetch (enabled) y la visibilidad del tile.
  const canRounds = can("round:execute");
  const canIncidents = can("module:incidents:view");
  const canWorkOrders = can("module:workorders:view");

  // Conteos en vivo. Los hooks se llaman SIEMPRE (regla de hooks); `enabled`
  // decide si realmente consultan. Todos respetan estructura activa ∩ ABAC.
  const rounds = useMyRoundsStats(canRounds);
  const incidents = useIncidentStats(canIncidents);
  const workOrders = useWorkOrderStats(canWorkOrders);
  const exceptions = useExceptions(EXCEPTIONS_SUMMARY_QUERY, canIncidents);
  const inbox = useInboxUnreadCount(true); // bandeja propia: accesible a todos

  const tiles: WorklistTile[] = [];

  if (canRounds) {
    const pending = rounds.data?.pending ?? 0;
    const overdue = rounds.data?.overdue ?? 0;
    const stats: TileStat[] = [];
    if (overdue > 0) stats.push({ text: t("home.tiles.rounds.overdue", { count: overdue }), tone: "alert" });
    tiles.push({
      key: "rounds",
      icon: ListTodo,
      label: t("home.tiles.rounds.label"),
      count: pending,
      to: "/mis-rondas",
      loading: rounds.isLoading,
      emptyText: t("home.tiles.rounds.none"),
      stats,
    });
  }

  if (canIncidents) {
    const open = incidents.data?.open ?? 0;
    const critical = incidents.data?.critical ?? 0;
    const overdue = incidents.data?.overdue ?? 0;
    const unassigned = incidents.data?.unassigned ?? 0;
    const stats: TileStat[] = [];
    if (critical > 0) stats.push({ text: t("home.tiles.incidents.critical", { count: critical }), tone: "alert" });
    if (overdue > 0) stats.push({ text: t("home.tiles.incidents.overdue", { count: overdue }), tone: "alert" });
    if (unassigned > 0) stats.push({ text: t("home.tiles.incidents.unassigned", { count: unassigned }), tone: "warn" });
    tiles.push({
      key: "incidents",
      icon: AlertTriangle,
      label: t("home.tiles.incidents.label"),
      count: open,
      to: "/incidencias",
      loading: incidents.isLoading,
      emptyText: t("home.tiles.incidents.none"),
      stats,
    });
  }

  if (canWorkOrders) {
    const open = workOrders.data?.open ?? 0;
    const overdue = workOrders.data?.overdue ?? 0;
    const atRisk = workOrders.data?.atRisk ?? 0;
    const unassigned = workOrders.data?.unassigned ?? 0;
    const stats: TileStat[] = [];
    if (overdue > 0) stats.push({ text: t("home.tiles.workOrders.overdue", { count: overdue }), tone: "alert" });
    if (atRisk > 0) stats.push({ text: t("home.tiles.workOrders.atRisk", { count: atRisk }), tone: "warn" });
    if (unassigned > 0) stats.push({ text: t("home.tiles.workOrders.unassigned", { count: unassigned }), tone: "warn" });
    tiles.push({
      key: "workOrders",
      icon: ClipboardList,
      label: t("home.tiles.workOrders.label"),
      count: open,
      to: "/ordenes-trabajo?lifecycle=OPEN",
      loading: workOrders.isLoading,
      emptyText: t("home.tiles.workOrders.none"),
      stats,
    });
  }

  if (canIncidents) {
    const summary = exceptions.data?.summary;
    const open = summary?.open ?? 0;
    const critical = summary?.critical ?? 0;
    const warning = summary?.warning ?? 0;
    const stats: TileStat[] = [];
    if (critical > 0) stats.push({ text: t("home.tiles.exceptions.critical", { count: critical }), tone: "alert" });
    if (warning > 0) stats.push({ text: t("home.tiles.exceptions.warning", { count: warning }), tone: "warn" });
    tiles.push({
      key: "exceptions",
      icon: AlertOctagon,
      label: t("home.tiles.exceptions.label"),
      count: open,
      to: "/excepciones",
      loading: exceptions.isLoading,
      emptyText: t("home.tiles.exceptions.none"),
      stats,
    });
  }

  {
    const unread = inbox.data?.unread ?? 0;
    tiles.push({
      key: "notifications",
      icon: Bell,
      label: t("home.tiles.notifications.label"),
      count: unread,
      to: "/mis-notificaciones",
      loading: inbox.isLoading,
      emptyText: t("home.tiles.notifications.none"),
      stats: [],
    });
  }

  // Accesos de «Operación»: módulos del grupo operativo del registro que NO son ya
  // un tile (evita duplicar Incidencias/OT/Rondas/Excepciones). Filtrados por permiso.
  const shortcuts = SIDEBAR_ROUTES.filter(
    (r) =>
      r.group === "operation" &&
      r.path !== "/" &&
      !TILE_PATHS.has(r.path) &&
      (!r.permission || can(r.permission)),
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{t("home.greeting", { name: user?.displayName ?? t("home.greetingFallback") })}</h1>
        <p className={styles.subtitle}>{t("home.subtitle")}</p>
      </div>

      {tiles.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("home.worklistHeading")}</h2>
          <div className={styles.tileGrid}>
            {tiles.map((tile) => {
              const Icon = tile.icon;
              const isEmpty = tile.count === 0;
              return (
                <Link key={tile.key} to={tile.to} className={styles.tileLink} aria-label={tile.label}>
                  <Card hoverable className={cx(styles.tile, isEmpty && styles.tileCalm)}>
                    <div className={styles.tileHead}>
                      <span className={styles.tileIcon}>
                        <Icon size={18} aria-hidden="true" />
                      </span>
                      <span className={styles.tileLabel}>{tile.label}</span>
                    </div>
                    <div className={styles.tileCount}>{tile.loading ? "—" : formatNumber(tile.count)}</div>
                    <div className={styles.tileStats}>
                      {isEmpty ? (
                        <span className={styles.tileEmpty}>{tile.emptyText}</span>
                      ) : tile.stats.length > 0 ? (
                        tile.stats.map((s, i) => (
                          <span key={i} className={cx(styles.tileStat, styles[s.tone])}>
                            {s.text}
                          </span>
                        ))
                      ) : (
                        <span className={styles.tileCta}>
                          {t("home.seeAll")} <ArrowRight size={13} aria-hidden="true" />
                        </span>
                      )}
                    </div>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {shortcuts.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("home.operationHeading")}</h2>
          <div className={styles.moduleGrid}>
            {shortcuts.map((route) => {
              const Icon = route.icon;
              const desc = route.descKey ? t(route.descKey) : null;
              return (
                <Link
                  key={route.path}
                  to={route.path}
                  className={styles.moduleLink}
                  aria-label={t("home.open") + " " + t(route.labelKey)}
                >
                  <Card hoverable className={styles.module}>
                    <div className={styles.moduleHead}>
                      <span className={styles.moduleIcon}>
                        <Icon size={20} aria-hidden="true" />
                      </span>
                    </div>
                    <div className={styles.moduleName}>{t(route.labelKey)}</div>
                    {desc && <div className={styles.moduleDesc}>{desc}</div>}
                    <span className={styles.moduleCta}>
                      {t("home.open")} <ArrowRight size={14} aria-hidden="true" />
                    </span>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
