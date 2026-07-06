import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronRight,
  FolderOpen,
  MoveRight,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button, Chip, EmptyState, Table } from "@lyra/ui";
import type { OrgLevel, OrgNodeTree } from "@lyra/contracts";
import type { TableColumn, TableSort } from "@lyra/ui";
import { useLicenseQuotas } from "../../auth/use-license.js";
import { usePermissions } from "../../auth/use-permissions.js";
import { useUpdateNode } from "./structure-queries.js";
import { useEquipmentByNode } from "./equipment-queries.js";
import { levelColor, LevelIcon } from "./OrgTree.js";
import { EquipmentSection } from "./EquipmentSection.js";
import styles from "./NodeDetail.module.css";

/** Celda editable inline del orden en informes de un nodo hijo. */
function ReportOrderCell({ node, editable }: { node: OrgNodeTree; editable: boolean }) {
  const updateNode = useUpdateNode();
  const [value, setValue] = useState(String(node.reportOrder));

  // Re-sincroniza si el valor cambia por fuera (otra edición, refetch).
  useEffect(() => {
    setValue(String(node.reportOrder));
  }, [node.reportOrder]);

  function commit() {
    const n = Math.trunc(Number(value));
    if (!Number.isFinite(n) || n < 0 || n === node.reportOrder) {
      setValue(String(node.reportOrder));
      return;
    }
    updateNode.mutate({ id: node.id, dto: { reportOrder: n } });
  }

  if (!editable) return <span className={styles.orderReadonly}>{node.reportOrder}</span>;

  return (
    <input
      className={styles.orderInput}
      type="number"
      min={0}
      step={10}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      onClick={(e) => e.stopPropagation()}
      aria-label="Orden en informes"
    />
  );
}

/** Ordena los hijos según la columna/dirección activas. */
function sortChildren(children: OrgNodeTree[], sort: TableSort): OrgNodeTree[] {
  const dir = sort.direction === "asc" ? 1 : -1;
  return [...children].sort((a, b) => {
    let cmp: number;
    switch (sort.key) {
      case "reportOrder":
        cmp = a.reportOrder - b.reportOrder;
        break;
      case "code":
        cmp = (a.code ?? "").localeCompare(b.code ?? "");
        break;
      case "externalCode":
        cmp = (a.externalCode ?? "").localeCompare(b.externalCode ?? "");
        break;
      default:
        cmp = a.name.localeCompare(b.name);
    }
    // Desempate estable por nombre.
    if (cmp === 0 && sort.key !== "name") cmp = a.name.localeCompare(b.name);
    return cmp * dir;
  });
}

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
  // Cupo de nodos de la licencia (L2b): sin cupo, "agregar hijo" se deshabilita
  // con hint. El candado real es el 403 LICENSE_LIMIT_EXCEEDED del backend.
  const { nodes: nodeQuota } = useLicenseQuotas();
  const nodesAtLimit = nodeQuota?.atLimit === true;
  const quotaHint = nodeQuota?.atLimit
    ? t("license.quota.nodesFull", { max: nodeQuota.max, inUse: nodeQuota.inUse })
    : undefined;

  // Orden de la grilla de hijos. Por defecto: orden en informes (asc).
  const [sort, setSort] = useState<TableSort>({ key: "reportOrder", direction: "asc" });
  const sortedChildren = useMemo(
    () => (node ? sortChildren(node.children, sort) : []),
    [node, sort],
  );

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

  // Conteo de equipos para el badge de la pestaña (misma query/caché que usa
  // EquipmentSection ⇒ sin doble llamada). Permite ver "Equipos N" aunque la
  // pestaña activa sea la de hijos.
  const { data: equipmentList } = useEquipmentByNode(node?.id ?? null);
  const equipmentCount = equipmentList?.length;

  // Sub-pestaña activa (hijos / equipos). Por defecto la que tiene contenido:
  // si el nodo tiene hijos parte en "hijos"; si no, parte en "equipos" (así un
  // proceso hoja como Molienda muestra de una sus equipos).
  const [activeTab, setActiveTab] = useState<"children" | "equipment">("children");
  const nodeId = node?.id;
  const childCount = node?.children.length ?? 0;
  useEffect(() => {
    if (!nodeId) return;
    setActiveTab(childCount > 0 ? "children" : "equipment");
  }, [nodeId, childCount]);

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
      sortable: true,
      render: (row) => {
        const cl = levelMap.get(row.levelId);
        return (
          <div className={styles.childNameCell}>
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
            {row.description && <span className={styles.childDesc}>{row.description}</span>}
          </div>
        );
      },
    },
    {
      key: "reportOrder",
      header: t("structure.node.reportOrder"),
      width: 96,
      sortable: true,
      align: "center",
      render: (row) => <ReportOrderCell node={row} editable={canEdit} />,
    },
    {
      key: "code",
      header: t("structure.node.code"),
      width: 90,
      sortable: true,
      render: (row) =>
        row.code ? <code className={styles.code}>{row.code}</code> : <span className={styles.nullText}>—</span>,
    },
    {
      key: "externalCode",
      header: t("structure.node.externalCode"),
      width: 110,
      sortable: true,
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
          {node.description && (
            <p className={styles.nodeDescription}>{node.description}</p>
          )}
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

      {/* Hijos Y equipos: un nodo puede tener AMBOS. Antes la UI los excluía por
          profundidad (mostraba O hijos O equipos) y los equipos de nodos
          intermedios quedaban invisibles (QA#3). Ahora: si hay un nivel inferior
          se muestran SUB-PESTAÑAS con contador (el badge "Equipos N" hace visible
          el equipo aunque la pestaña activa sea la de hijos); si es el último
          nivel, solo equipos. */}
      {!isLastLevel ? (
        <>
          <div className={styles.tabBar} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "children"}
              className={`${styles.tab} ${activeTab === "children" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("children")}
            >
              {childLevel ? childLevel.name + "s" : t("structure.detail.children")}
              <span className={styles.tabCount}>{node.children.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "equipment"}
              className={`${styles.tab} ${activeTab === "equipment" ? styles.tabActive : ""}`}
              onClick={() => setActiveTab("equipment")}
            >
              {t("equipment.title")}
              {equipmentCount !== undefined && (
                <span className={styles.tabCount}>{equipmentCount}</span>
              )}
            </button>
          </div>

          {activeTab === "children" ? (
            <section className={styles.section}>
              {canCreate && (
                <div className={styles.sectionHeader} style={{ justifyContent: "flex-end" }}>
                  <Button variant="primary" onClick={onCreateChild} disabled={nodesAtLimit} title={quotaHint}>
                    <Plus size={14} />
                    {childLevel
                      ? `${t("common.add")} ${childLevel.name}`
                      : t("structure.node.addChild")}
                  </Button>
                </div>
              )}
              <Table
                columns={childColumns}
                data={sortedChildren}
                rowKey={(n) => n.id}
                sort={sort}
                onSort={(key, direction) => setSort({ key, direction })}
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
                        <Button variant="primary" onClick={onCreateChild} disabled={nodesAtLimit} title={quotaHint}>
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
            <EquipmentSection orgNodeId={node.id} hideTitle />
          )}
        </>
      ) : (
        <EquipmentSection orgNodeId={node.id} />
      )}
    </div>
  );
}
