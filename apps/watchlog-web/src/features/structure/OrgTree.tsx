import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cx } from "@lyra/ui";
import type { OrgLevel, OrgNodeTree } from "@lyra/contracts";
import styles from "./OrgTree.module.css";

interface OrgTreeProps {
  nodes: OrgNodeTree[];
  levels: OrgLevel[];
  selectedId: string | null;
  onSelect: (node: OrgNodeTree) => void;
}

function buildLevelMap(levels: OrgLevel[]): Map<string, OrgLevel> {
  return new Map(levels.map((l) => [l.id, l]));
}

export function levelColor(order: number | undefined): string {
  switch (order) {
    case 0:  return "var(--color-accent-primary)";
    case 1:  return "var(--color-accent-secondary)";
    case 2:  return "var(--color-success)";
    default: return "var(--color-text-muted)";
  }
}

/** Árbol de navegación. La selección y las acciones viven en el panel de detalle. */
export function OrgTree({ nodes, levels, selectedId, onSelect }: OrgTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set);
  const levelMap = buildLevelMap(levels);

  // Auto-expand los ancestros del nodo seleccionado
  useEffect(() => {
    if (!selectedId) return;
    const findPath = (list: OrgNodeTree[]): string | null => {
      for (const n of list) {
        if (n.id === selectedId) return n.path;
        const found = findPath(n.children);
        if (found) return found;
      }
      return null;
    };
    const path = findPath(nodes);
    if (!path) return;
    const ancestorIds = path.split("/").filter(Boolean).slice(0, -1);
    if (ancestorIds.length === 0) return;
    setExpanded((prev) => {
      if (ancestorIds.every((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      ancestorIds.forEach((id) => next.add(id));
      return next;
    });
  }, [selectedId, nodes]);

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
          selectedId={selectedId}
          onSelect={onSelect}
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
  selectedId: string | null;
  onSelect: (node: OrgNodeTree) => void;
}

function NodeBranch({ node, depth, expanded, toggle, levelMap, selectedId, onSelect }: NodeBranchProps) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const level = levelMap.get(node.levelId);
  const isSelected = node.id === selectedId;

  return (
    <div role="treeitem" aria-expanded={hasChildren ? isOpen : undefined} aria-selected={isSelected}>
      <div
        className={cx(styles.nodeRow, isSelected && styles.nodeRowSelected)}
        style={{ paddingLeft: `calc(var(--space-2) + ${depth * 18}px)` }}
        onClick={() => onSelect(node)}
      >
        {hasChildren ? (
          <button
            type="button"
            className={cx(styles.chevronBtn, isOpen && styles.chevronOpen)}
            onClick={(e) => { e.stopPropagation(); toggle(node.id); }}
            tabIndex={-1}
          >
            <ChevronRight size={13} />
          </button>
        ) : (
          <span className={styles.noChevron} />
        )}

        <span className={styles.levelDot} style={{ background: levelColor(level?.order) }} />

        <span className={styles.nodeName}>{node.name}</span>

        {node.code && <span className={styles.nodeCode}>{node.code}</span>}

        {hasChildren && (
          <span className={styles.childCount}>{node.children.length}</span>
        )}
      </div>

      {isOpen && hasChildren && (
        <div role="group">
          {node.children.map((child) => (
            <NodeBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              levelMap={levelMap}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
