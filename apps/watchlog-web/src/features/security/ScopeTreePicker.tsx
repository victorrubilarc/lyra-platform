import { Fragment, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Checkbox, Toggle } from "@lyra/ui";
import type { OrgNodeTree, ScopeEntry } from "@lyra/contracts";
import styles from "./ScopeTreePicker.module.css";

interface ScopeTreePickerProps {
  tree: OrgNodeTree[];
  /** Entradas de alcance seleccionadas (nodo + herencia). */
  value: ScopeEntry[];
  onChange: (next: ScopeEntry[]) => void;
  disabled?: boolean;
}

/**
 * Selector de alcance de datos (ABAC dim. 4) sobre el árbol de la estructura.
 * Marcar un nodo lo añade al alcance; el toggle "incluye descendientes" controla
 * la herencia (por defecto activada, como en el backend). La autorización real la
 * aplica el `ScopeService`; aquí solo se compone la lista.
 */
export function ScopeTreePicker({ tree, value, onChange, disabled }: ScopeTreePickerProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const byId = new Map(value.map((e) => [e.orgNodeId, e]));

  function setNode(nodeId: string, checked: boolean) {
    if (checked) {
      if (byId.has(nodeId)) return;
      onChange([...value, { orgNodeId: nodeId, includeDescendants: true }]);
    } else {
      onChange(value.filter((e) => e.orgNodeId !== nodeId));
    }
  }

  function setInherit(nodeId: string, includeDescendants: boolean) {
    onChange(value.map((e) => (e.orgNodeId === nodeId ? { ...e, includeDescendants } : e)));
  }

  function toggleCollapse(nodeId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  function renderNode(node: OrgNodeTree, depth: number) {
    const entry = byId.get(node.id);
    const checked = entry !== undefined;
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id);

    return (
      <Fragment key={node.id}>
        <div className={styles.row} style={{ paddingLeft: depth * 18 }}>
          <button
            type="button"
            className={styles.twisty}
            onClick={() => hasChildren && toggleCollapse(node.id)}
            aria-label={isCollapsed ? t("common.add") : t("common.close")}
            style={{ visibility: hasChildren ? "visible" : "hidden" }}
          >
            {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
          </button>

          <Checkbox
            checked={checked}
            disabled={disabled}
            onChange={(v) => setNode(node.id, v)}
            label={node.name}
            aria-label={node.name}
          />

          {checked && (
            <span className={styles.inherit}>
              <Toggle
                size="sm"
                checked={entry.includeDescendants}
                onChange={(v) => setInherit(node.id, v)}
                aria-label={t("security.users.scope.includeDescendants")}
              />
              <span className={styles.inheritLabel}>{t("security.users.scope.includeDescendants")}</span>
            </span>
          )}
        </div>

        {hasChildren && !isCollapsed && node.children.map((c) => renderNode(c, depth + 1))}
      </Fragment>
    );
  }

  if (tree.length === 0) {
    return <p className={styles.empty}>{t("security.users.scope.noNodes")}</p>;
  }

  return <div className={styles.tree}>{tree.map((n) => renderNode(n, 0))}</div>;
}
