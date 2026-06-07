import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  FolderOpen,
  MoveRight,
  Pencil,
  Plus,
  Trash2,
  Wrench,
} from "lucide-react";
import { Button, Chip, EmptyState, Table } from "@lyra/ui";
import type { OrgLevel, OrgNodeTree } from "@lyra/contracts";
import type { TableColumn } from "@lyra/ui";
import { usePermissions } from "../../auth/use-permissions.js";
import { levelColor, LevelIcon } from "./OrgTree.js";
import styles from "./NodeDetail.module.css";

function flattenTree(nodes: OrgNodeTree[]): Map<string, OrgNodeTree> {
  const map = new Map<string, OrgNodeTree>();
  function walk(n: OrgNodeTree) {
    map.set(n.id, n);
    n.children.forEach(walk);
  }
  nodes.forEach(walk);
  return map;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface NodeDetailProps {
  node: OrgNodeTree | null;
  allNodes: OrgNodeTree[];
  levels: OrgLevel[];
  /** Abrir drawer de creación de hijo del nodo actual */
  onCreateChild: () => void;
  /** Editar el nodo actual */
  onEdit: () => void;
  /** Mover el nodo actual */
  onMove: () => void;
  /** Eliminar el nodo actual */
  onDelete: () => void;
  /** Navegar a cualquier nodo (breadcrumb, clic en fila de hijos) */
  onNavigateTo: (node: OrgNodeTree) => void;
  /** Editar un nodo hijo directamente desde la tabla */
  onEditChild: (node: OrgNodeTree) => void;
  /** Eliminar un nodo hijo directamente desde la tabla */
  onDeleteChild: (node: OrgNodeTree) => void;
}

// ── Componente ────────────────────────────────────────────────────────────────

export function NodeDetail({
  node,
  allNodes,
  levels,
  onCreateChild,
  onEdit,
  onMove,
  onDelete,
  onNavigateTo,
  onEditChild,
  onDeleteChild,
}: NodeDetailProps) {
  const { t } = useTranslation();
  const perms = usePermissions();

  const canCreate = perms.can("orgnode:create");
  const canEdit   = perms.can("orgnode:edit");
  const canDelete = perms.can("orgnode:delete");

  const levelMap = useMemo(() => new Map(levels.map((l) => [l.id, l])), [levels]);
  const flatMap  = useMemo(() => flattenTree(allNodes), [allNodes]);

  // Breadcrumb: IDs del path → nodos
  const breadcrumb = useMemo(() => {
    if (!node) return [];
    return node.path
      .split("/")
      .filter(Boolean)
      .map((id) => flatMap.get(id))
      .filter((n): n is OrgNodeTree => !!n);
  }, [node, flatMap]);

  // Nivel hijo inmediato (siguiente en la jerarquía ordenada por `order`)
  const childLevel = useMemo(() => {
    if (!node) return undefined;
    const currentLevel = levelMap.get(node.levelId);
    if (!currentLevel) return undefined;
    const sorted = [...levels].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((l) => l.id === currentLevel.id);
    return idx >= 0 && idx < sorted.length - 1 ? sorted[idx + 1] : undefined;
  }, [node, levelMap, levels]);

  const currentLevel = node ? levelMap.get(node.levelId) : undefined;
  const isLastLevel  = !!node && !childLevel;

  // ── Panel vacío ──────────────────────────────────────────────────────────────
  if (!node) {
    return (
      <div className={styles.emptyPanel}>
        <EmptyState
          icon={<FolderOpen size={40} color="var(--color-text-muted)" />}
          title={t("structure.detail.emptyTitle")}
          description={t("structure.detail.emptyDesc")}
        />
      </div>
    );
  }

  // ── Columnas de la tabla de hijos ────────────────────────────────────────────
  const childColumns: TableColumn<OrgNodeTree>[] = [
    {
      key: "name",
      header: t("structure.node.name"),
      render: (row) => {
        const cl = levelMap.get(row.levelId);
        return (
          <button
            type="button"
            className={styles.childNameBtn}
            onClick={() => onNavigateTo(row)}
          >
            <span
              className={styles.childDot}
              style={{ background: levelColor(cl?.order) }}
            />
            <span className={styles.childNameText}>{row.name}</span>
            {row.children.length > 0 && (
              <span className={styles.childBadge}>{row.children.length}</span>
            )}
          </button>
        );
      },
    },
    {
      key: "code",
      header: t("structure.node.code"),
      width: 90,
      render: (row) =>
        row.code ? <code className={styles.code}>{row.code}</code> : <span className={styles.nullText}>—</span>,
    },
    {
      key: "externalCode",
      header: t("structure.node.externalCode"),
      width: 110,
      render: (row) =>
        row.externalCode
          ? <code className={styles.code}>{row.externalCode}</code>
          : <span className={styles.nullText}>—</span>,
    },
    {
      key: "level",
      header: t("structure.node.level"),
      width: 100,
      render: (row) => {
        const cl = levelMap.get(row.levelId);
        return cl ? <Chip label={cl.name} variant="default" size="sm" /> : null;
      },
    },
    {
      key: "_actions",
      header: "",
      width: 72,
      align: "right",
      render: (row) => (
        <span className={styles.rowActions}>
          {canEdit && (
            <Button
              variant="icon"
              aria-label={t("common.edit")}
              onClick={() => onEditChild(row)}
            >
              <Pencil size={14} />
            </Button>
          )}
          {canDelete && (
            <Button
              variant="icon"
              aria-label={t("common.delete")}
              onClick={() => onDeleteChild(row)}
            >
              <Trash2 size={14} />
            </Button>
          )}
        </span>
      ),
    },
  ];

  // ── Panel de detalle ─────────────────────────────────────────────────────────
  return (
    <div className={styles.panel}>
      {/* Breadcrumb */}
      {breadcrumb.length > 1 && (
        <nav className={styles.breadcrumb} aria-label="Ruta del nodo">
          {breadcrumb.map((ancestor, i) => {
            const isCurrent = ancestor.id === node.id;
            return (
              <span key={ancestor.id} className={styles.breadcrumbItem}>
                {i > 0 && <ChevronRight size={11} className={styles.breadcrumbSep} />}
                {isCurrent ? (
                  <span className={styles.breadcrumbCurrent}>{ancestor.name}</span>
                ) : (
                  <button
                    type="button"
                    className={styles.breadcrumbLink}
                    onClick={() => onNavigateTo(ancestor)}
                  >
                    {ancestor.name}
                  </button>
                )}
              </span>
            );
          })}
        </nav>
      )}

      {/* Cabecera del nodo */}
      <div className={styles.nodeHeader}>
        <span className={styles.nodeIcon}>
          <LevelIcon order={currentLevel?.order} size={20} />
        </span>
        <div className={styles.nodeInfo}>
          <h2 className={styles.nodeName}>{node.name}</h2>
          <div className={styles.nodeMeta}>
            {currentLevel && (
              <Chip label={currentLevel.name} variant="primary" size="sm" />
            )}
            {node.code && <code className={styles.code}>{node.code}</code>}
            {node.externalCode && (
              <span className={styles.externalCodeBadge} title={t("structure.node.externalCode")}>
                <span className={styles.externalCodeLabel}>EXT</span>
                <code className={styles.code}>{node.externalCode}</code>
              </span>
            )}
          </div>
        </div>
        <div className={styles.headerActions}>
          {canEdit && (
            <Button variant="secondary" onClick={onEdit}>
              <Pencil size={14} />
              {t("common.edit")}
            </Button>
          )}
          {canEdit && (
            <Button variant="secondary" onClick={onMove}>
              <MoveRight size={14} />
              {t("structure.node.move")}
            </Button>
          )}
          {canDelete && (
            <Button variant="danger" onClick={onDelete}>
              <Trash2 size={14} />
              {t("common.delete")}
            </Button>
          )}
        </div>
      </div>

      <div className={styles.divider} />

      {/* Hijos o equipos */}
      {!isLastLevel ? (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>
              {childLevel
                ? childLevel.name + "s"
                : t("structure.detail.children")}
            </h3>
            {canCreate && (
              <Button variant="primary" onClick={onCreateChild}>
                <Plus size={14} />
                {childLevel
                  ? `${t("common.add")} ${childLevel.name}`
                  : t("structure.node.addChild")}
              </Button>
            )}
          </div>
          <Table
            columns={childColumns}
            data={node.children}
            rowKey={(n) => n.id}
            paginated
            defaultPageSize={10}
            emptyState={
              <EmptyState
                title={t("structure.detail.noChildren")}
                description={
                  canCreate ? t("structure.detail.noChildrenCreate") : undefined
                }
                action={
                  canCreate ? (
                    <Button variant="primary" onClick={onCreateChild}>
                      <Plus size={14} />
                      {childLevel
                        ? `${t("common.add")} ${childLevel.name}`
                        : t("structure.node.addChild")}
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        </section>
      ) : (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>{t("structure.detail.equipment")}</h3>
          </div>
          <div className={styles.equipmentPlaceholder}>
            <EmptyState
              icon={<Wrench size={32} color="var(--color-text-muted)" />}
              title={t("structure.detail.equipmentSoon")}
              description={t("structure.detail.equipmentSoonDesc")}
            />
          </div>
        </section>
      )}
    </div>
  );
}
