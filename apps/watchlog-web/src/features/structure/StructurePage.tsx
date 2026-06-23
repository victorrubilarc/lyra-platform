import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Layers, Lock, Network, Plus, Search, TriangleAlert } from "lucide-react";
import { Button, EmptyState, Input, ResizableSplit, Skeleton } from "@lyra/ui";
import type { OrgNodeTree } from "@lyra/contracts";
import { Can } from "../../auth/Can.js";
import { usePermissions } from "../../auth/use-permissions.js";
import { useOrgLevels, useOrgTree } from "./structure-queries.js";
import { useEquipmentSearch } from "./equipment-queries.js";
import { OrgTree, type EquipmentHit } from "./OrgTree.js";
import { NodeDetail } from "./NodeDetail.js";
import { NodeDrawer, type NodeDrawerMode } from "./NodeDrawer.js";
import { LevelsDrawer } from "./LevelsDrawer.js";
import { StructuresDrawer } from "./StructuresDrawer.js";
import { DeleteNodeModal } from "./DeleteNodeModal.js";
import { MoveNodeModal } from "./MoveNodeModal.js";
import styles from "./StructurePage.module.css";

interface NodeDrawerState {
  open: boolean;
  mode: NodeDrawerMode;
  node: OrgNodeTree | null;
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

export function StructurePage() {
  const { t } = useTranslation();
  const perms = usePermissions();

  const { data: tree = [], isLoading: treeLoading, isError: treeError } = useOrgTree();
  const { data: levels = [], isLoading: levelsLoading } = useOrgLevels();

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeDrawer, setNodeDrawer] = useState<NodeDrawerState>({
    open: false,
    mode: "create-root",
    node: null,
  });
  const [levelsOpen, setLevelsOpen]   = useState(false);
  const [structuresOpen, setStructuresOpen] = useState(false);
  const [moveNode, setMoveNode]       = useState<OrgNodeTree | null>(null);
  const [deleteNode, setDeleteNode]   = useState<OrgNodeTree | null>(null);
  const [treeQuery, setTreeQuery]     = useState("");

  const flatMap      = useMemo(() => flattenTree(tree), [tree]);
  const selectedNode = selectedNodeId ? (flatMap.get(selectedNodeId) ?? null) : null;

  // Búsqueda de EQUIPOS en toda la estructura accesible (ABAC), para que el
  // buscador del árbol —que solo conoce nodos— también surface nodos por su
  // equipo (ej. "Weinig"). Agrupa los equipos coincidentes por nodo dueño.
  const equipmentSearch = useEquipmentSearch(treeQuery);
  const equipmentHits = useMemo(() => {
    const m = new Map<string, EquipmentHit[]>();
    for (const eq of equipmentSearch.data ?? []) {
      const list = m.get(eq.orgNodeId) ?? [];
      list.push({ id: eq.id, name: eq.name, tag: eq.tag });
      m.set(eq.orgNodeId, list);
    }
    return m;
  }, [equipmentSearch.data]);
  const equipmentSearching = equipmentSearch.isFetching && treeQuery.trim().length >= 2;

  if (!perms.can("module:structure:view")) {
    return (
      <div className={styles.page}>
        <EmptyState
          icon={<Lock size={36} />}
          title={t("structure.noAccess")}
          description={t("structure.noAccessDesc")}
        />
      </div>
    );
  }

  const isLoading = treeLoading || levelsLoading;

  function openEditNode(node: OrgNodeTree) {
    setNodeDrawer({ open: true, mode: "edit", node });
  }
  function openDeleteNode(node: OrgNodeTree) {
    setDeleteNode(node);
  }

  return (
    <div className={styles.page}>
      {/* Cabecera */}
      <div className={styles.header}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{t("structure.title")}</h1>
          <p className={styles.subtitle}>{t("structure.subtitle")}</p>
        </div>
        <div className={styles.actions}>
          <Can perform="orglevel:manage">
            <Button variant="secondary" onClick={() => setStructuresOpen(true)}>
              <Network size={16} />
              {t("structure.manageStructures")}
            </Button>
          </Can>
          <Can perform="orglevel:manage">
            <Button variant="secondary" onClick={() => setLevelsOpen(true)}>
              <Layers size={16} />
              {t("structure.configureLevels")}
            </Button>
          </Can>
          <Can perform="orgnode:create">
            <Button
              variant="primary"
              onClick={() => setNodeDrawer({ open: true, mode: "create-root", node: null })}
              disabled={levels.length === 0}
            >
              <Plus size={16} />
              {t("structure.newRoot")}
            </Button>
          </Can>
        </div>
      </div>

      {!isLoading && levels.length === 0 && perms.can("orglevel:manage") && (
        <div className={styles.noLevelsWarning}>
          <TriangleAlert size={16} />
          {t("structure.noLevelsWarning")}
        </div>
      )}

      {/* Workspace de dos paneles redimensionables */}
      <ResizableSplit
        storageKey="wl_structure_split"
        left={
          <>
            <div className={styles.treePanelHeader}>
              <span className={styles.treePanelTitle}>{t("structure.tree.panelTitle")}</span>
            </div>

            {!isLoading && !treeError && tree.length > 0 && (
              <div className={styles.treeSearch}>
                <Input
                  value={treeQuery}
                  onChange={(e) => setTreeQuery(e.target.value)}
                  placeholder={t("structure.tree.searchPlaceholder")}
                  aria-label={t("structure.tree.searchPlaceholder")}
                  rightSlot={<Search size={15} />}
                />
              </div>
            )}

            {isLoading ? (
              <div className={styles.loadingSkeleton}>
                <Skeleton height={26} width="60%" />
                <div style={{ paddingLeft: 18 }}><Skeleton height={26} width="50%" /></div>
                <div style={{ paddingLeft: 36 }}><Skeleton height={26} width="55%" /></div>
                <Skeleton height={26} width="65%" />
                <div style={{ paddingLeft: 18 }}><Skeleton height={26} width="45%" /></div>
              </div>
            ) : treeError ? (
              <div style={{ padding: 16 }}>
                <EmptyState
                  icon={<TriangleAlert size={28} />}
                  title={t("structure.loadError")}
                />
              </div>
            ) : tree.length === 0 ? (
              <div style={{ padding: 16 }}>
                <EmptyState
                  icon={<Building2 size={36} />}
                  title={t("structure.noNodes")}
                  description={t("structure.noNodesDesc")}
                />
              </div>
            ) : (
              <OrgTree
                nodes={tree}
                levels={levels}
                selectedId={selectedNodeId}
                onSelect={(node) => setSelectedNodeId(node.id)}
                query={treeQuery}
                equipmentHits={equipmentHits}
                searching={equipmentSearching}
              />
            )}
          </>
        }
        right={
          <NodeDetail
            node={selectedNode}
            allNodes={tree}
            levels={levels}
            onCreateChild={() =>
              setNodeDrawer({ open: true, mode: "create-child", node: selectedNode })
            }
            onEdit={() => selectedNode && openEditNode(selectedNode)}
            onMove={() => selectedNode && setMoveNode(selectedNode)}
            onDelete={() => selectedNode && openDeleteNode(selectedNode)}
            onNavigateTo={(n) => setSelectedNodeId(n.id)}
            onEditChild={(child) => openEditNode(child)}
            onDeleteChild={(child) => openDeleteNode(child)}
          />
        }
      />

      {/* Drawers y modales */}
      <NodeDrawer
        open={nodeDrawer.open}
        mode={nodeDrawer.mode}
        node={nodeDrawer.node}
        levels={levels}
        onClose={() => setNodeDrawer((s) => ({ ...s, open: false }))}
      />

      <LevelsDrawer open={levelsOpen} onClose={() => setLevelsOpen(false)} />

      <StructuresDrawer open={structuresOpen} onClose={() => setStructuresOpen(false)} />

      <DeleteNodeModal
        open={deleteNode !== null}
        node={deleteNode}
        onClose={() => setDeleteNode(null)}
      />

      <MoveNodeModal
        open={moveNode !== null}
        node={moveNode}
        allNodes={tree}
        onClose={() => setMoveNode(null)}
      />
    </div>
  );
}
