import { useState } from "react";
import { ChevronRight, MoreHorizontal, Plus, Pencil, MoveRight, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cx, Chip, Menu, MenuItem, MenuSeparator } from "@lyra/ui";
import type { OrgLevel, OrgNodeTree } from "@lyra/contracts";
import { usePermissions } from "../../auth/use-permissions.js";
import styles from "./OrgTree.module.css";

export interface OrgTreeActions {
  onCreateChild: (parent: OrgNodeTree) => void;
  onEdit: (node: OrgNodeTree) => void;
  onMove: (node: OrgNodeTree) => void;
  onDelete: (node: OrgNodeTree) => void;
}

interface OrgTreeProps {
  nodes: OrgNodeTree[];
  levels: OrgLevel[];
  actions: OrgTreeActions;
}

/** Mapa de id → nivel para lookup O(1). */
function buildLevelMap(levels: OrgLevel[]): Map<string, OrgLevel> {
  return new Map(levels.map((l) => [l.id, l]));
}

/** Árbol de nodos organizacionales con expansión/colapso local. */
export function OrgTree({ nodes, levels, actions }: OrgTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const levelMap = buildLevelMap(levels);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className={styles.tree} role="tree">
      {nodes.map((node) => (
        <NodeBranch
          key={node.id}
          node={node}
          depth={0}
          expanded={expanded}
          toggle={toggle}
          levelMap={levelMap}
          actions={actions}
        />
      ))}
    </div>
  );
}

interface NodeBranchProps {
  node: OrgNodeTree;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  levelMap: Map<string, OrgLevel>;
  actions: OrgTreeActions;
}

function NodeBranch({ node, depth, expanded, toggle, levelMap, actions }: NodeBranchProps) {
  const { t } = useTranslation();
  const perms = usePermissions();
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const level = levelMap.get(node.levelId);

  const canCreate = perms.can("orgnode:create");
  const canEdit = perms.can("orgnode:edit");
  const canDelete = perms.can("orgnode:delete");

  return (
    <div role="treeitem" aria-expanded={hasChildren ? isOpen : undefined}>
      <div
        className={styles.nodeRow}
        style={{ paddingLeft: `calc(var(--space-3) + ${depth * 24}px)` }}
      >
        {hasChildren ? (
          <button
            type="button"
            className={cx(styles.chevronBtn, isOpen && styles.chevronOpen)}
            onClick={() => toggle(node.id)}
            aria-label={isOpen ? t("structure.collapse") : t("structure.expand")}
          >
            <ChevronRight size={16} />
          </button>
        ) : (
          <span className={styles.noChevron} />
        )}

        <span className={styles.nodeName}>{node.name}</span>

        {node.code && <span className={styles.nodeCode}>{node.code}</span>}

        {level && (
          <Chip label={level.name} variant="default" size="sm" />
        )}

        <span className={styles.nodeActions}>
          <Menu
            trigger={<MoreHorizontal size={16} />}
            ariaLabel={t("structure.node.actions")}
            minWidth={180}
          >
            {canCreate && (
              <MenuItem icon={<Plus size={15} />} onSelect={() => actions.onCreateChild(node)}>
                {t("structure.node.addChild")}
              </MenuItem>
            )}
            {canEdit && (
              <MenuItem icon={<Pencil size={15} />} onSelect={() => actions.onEdit(node)}>
                {t("structure.node.edit")}
              </MenuItem>
            )}
            {canEdit && (
              <MenuItem icon={<MoveRight size={15} />} onSelect={() => actions.onMove(node)}>
                {t("structure.node.move")}
              </MenuItem>
            )}
            {(canCreate || canEdit) && canDelete && <MenuSeparator />}
            {canDelete && (
              <MenuItem
                icon={<Trash2 size={15} />}
                danger
                onSelect={() => actions.onDelete(node)}
              >
                {t("structure.node.delete")}
              </MenuItem>
            )}
          </Menu>
        </span>
      </div>

      {isOpen && hasChildren && (
        <div className={styles.nodeChildren} role="group">
          {node.children.map((child) => (
            <NodeBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              levelMap={levelMap}
              actions={actions}
            />
          ))}
        </div>
      )}
    </div>
  );
}

