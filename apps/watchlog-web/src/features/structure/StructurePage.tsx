import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Layers, Lock, Plus, TriangleAlert } from "lucide-react";
import { Button, EmptyState, Skeleton } from "@lyra/ui";
import type { OrgNodeTree } from "@lyra/contracts";
import { Can } from "../../auth/Can.js";
import { usePermissions } from "../../auth/use-permissions.js";
import { useOrgLevels, useOrgTree } from "./structure-queries.js";
import { OrgTree, type OrgTreeActions } from "./OrgTree.js";
import { NodeDrawer, type NodeDrawerMode } from "./NodeDrawer.js";
import { LevelsDrawer } from "./LevelsDrawer.js";
import { DeleteNodeModal } from "./DeleteNodeModal.js";
import { MoveNodeModal } from "./MoveNodeModal.js";
import styles from "./StructurePage.module.css";

interface NodeDrawerState {
  open: boolean;
  mode: NodeDrawerMode;
  node: OrgNodeTree | null;
}

/**
 * Pantalla de Estructura organizacional. Gateada por `module:structure:view`.
 * CRUD de nodos sobre el árbol; gestión de niveles vía LevelsDrawer.
 */
export function StructurePage() {
  const { t } = useTranslation();
  const perms = usePermissions();

  const { data: tree = [], isLoading: treeLoading, isError: treeError } = useOrgTree();
  const { data: levels = [], isLoading: levelsLoading } = useOrgLevels();

  const [nodeDrawer, setNodeDrawer] = useState<NodeDrawerState>({
    open: false,
    mode: "create-root",
    node: null,
  });
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [moveNode, setMoveNode] = useState<OrgNodeTree | null>(null);
  const [deleteNode, setDeleteNode] = useState<OrgNodeTree | null>(null);

  // Permiso de módulo: sin acceso → EmptyState con candado
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

  const treeActions: OrgTreeActions = {
    onCreateChild: (parent) =>
      setNodeDrawer({ open: true, mode: "create-child", node: parent }),
    onEdit: (node) => setNodeDrawer({ open: true, mode: "edit", node }),
    onMove: (node) => setMoveNode(node),
    onDelete: (node) => setDeleteNode(node),
  };

  const isLoading = treeLoading || levelsLoading;

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

      {/* Aviso si no hay niveles y tiene permiso para crearlos */}
      {!isLoading && levels.length === 0 && perms.can("orglevel:manage") && (
        <div className={styles.noLevelsWarning}>
          <TriangleAlert size={16} />
          {t("structure.noLevelsWarning")}
        </div>
      )}

      {/* Árbol de nodos */}
      <div className={styles.treeCard}>
        {isLoading ? (
          <div className={styles.loadingSkeleton}>
            <Skeleton height={28} width="45%" />
            <div style={{ paddingLeft: 24 }}><Skeleton height={28} width="30%" /></div>
            <div style={{ paddingLeft: 48 }}><Skeleton height={28} width="38%" /></div>
            <Skeleton height={28} width="50%" />
            <div style={{ paddingLeft: 24 }}><Skeleton height={28} width="35%" /></div>
          </div>
        ) : treeError ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<TriangleAlert size={32} />}
              title={t("structure.loadError")}
              description={t("structure.loadErrorDesc")}
            />
          </div>
        ) : tree.length === 0 ? (
          <div style={{ padding: 32 }}>
            <EmptyState
              icon={<Building2 size={40} />}
              title={t("structure.noNodes")}
              description={t("structure.noNodesDesc")}
              action={
                perms.can("orgnode:create") && levels.length > 0 ? (
                  <Button
                    variant="primary"
                    onClick={() =>
                      setNodeDrawer({ open: true, mode: "create-root", node: null })
                    }
                  >
                    <Plus size={15} />
                    {t("structure.node.createRoot")}
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <OrgTree nodes={tree} levels={levels} actions={treeActions} />
        )}
      </div>

      {/* Drawers y modales */}
      <NodeDrawer
        open={nodeDrawer.open}
        mode={nodeDrawer.mode}
        node={nodeDrawer.node}
        levels={levels}
        onClose={() => setNodeDrawer((s) => ({ ...s, open: false }))}
      />

      <LevelsDrawer open={levelsOpen} onClose={() => setLevelsOpen(false)} />

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
