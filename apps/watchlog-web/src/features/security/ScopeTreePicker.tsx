import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { Checkbox, Input, Toggle } from "@lyra/ui";
import type { OrgNodeTree, ScopeEntry } from "@lyra/contracts";
import styles from "./ScopeTreePicker.module.css";

interface ScopeTreePickerProps {
  tree: OrgNodeTree[];
  /** Entradas de alcance seleccionadas (nodo + herencia). */
  value: ScopeEntry[];
  onChange: (next: ScopeEntry[]) => void;
  disabled?: boolean;
  /**
   * Valor de `includeDescendants` al marcar un nodo. Para el alcance ABAC de
   * usuario/rol el default es heredar (true); para asignar plantillas a nodos
   * (multi-nodo 2.8.0) el default es "solo este nodo" (false), más preciso.
   */
  defaultIncludeDescendants?: boolean;
}

/** Normaliza para buscar sin distinción de mayúsculas ni acentos (es-CL). */
function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Aplana el árbol a un mapa id→nombre (para el resumen de seleccionados). */
function nameMap(nodes: OrgNodeTree[]): Map<string, string> {
  const map = new Map<string, string>();
  const walk = (n: OrgNodeTree) => {
    map.set(n.id, n.name);
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return map;
}

/**
 * Poda el árbol a los nodos cuyo nombre coincide con la consulta, conservando
 * los ancestros como contexto. Devuelve copias con los hijos ya filtrados.
 */
function filterTree(nodes: OrgNodeTree[], q: string): OrgNodeTree[] {
  const out: OrgNodeTree[] = [];
  for (const n of nodes) {
    const children = filterTree(n.children, q);
    if (norm(n.name).includes(q) || children.length > 0) {
      out.push({ ...n, children });
    }
  }
  return out;
}

/**
 * Selector de alcance de datos (ABAC dim. 4) sobre el árbol de la estructura.
 * Marcar un nodo lo añade al alcance; el toggle "incluye descendientes" controla
 * la herencia (por defecto activada, como en el backend). Buscador con poda del
 * árbol y resumen de seleccionados para árboles extensos. La autorización real la
 * aplica el `ScopeService`; aquí solo se compone la lista.
 */
export function ScopeTreePicker({
  tree,
  value,
  onChange,
  disabled,
  defaultIncludeDescendants = true,
}: ScopeTreePickerProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const byId = new Map(value.map((e) => [e.orgNodeId, e]));
  const names = useMemo(() => nameMap(tree), [tree]);

  const q = norm(query.trim());
  const searching = q.length > 0;
  const visibleTree = useMemo(() => (searching ? filterTree(tree, q) : tree), [tree, q, searching]);

  function setNode(nodeId: string, checked: boolean) {
    if (checked) {
      if (byId.has(nodeId)) return;
      onChange([...value, { orgNodeId: nodeId, includeDescendants: defaultIncludeDescendants }]);
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
    // Al buscar, todo se muestra expandido para no ocultar coincidencias.
    const isCollapsed = !searching && collapsed.has(node.id);

    return (
      <Fragment key={node.id}>
        <div className={styles.row} style={{ paddingLeft: depth * 18 }}>
          <button
            type="button"
            className={styles.twisty}
            onClick={() => hasChildren && toggleCollapse(node.id)}
            aria-label={isCollapsed ? t("common.add") : t("common.close")}
            style={{ visibility: hasChildren && !searching ? "visible" : "hidden" }}
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

  return (
    <div className={styles.picker}>
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("security.users.scope.search")}
        rightSlot={<Search size={15} aria-hidden="true" />}
      />

      {/* Resumen de seleccionados (visible aunque el árbol sea enorme). */}
      {value.length > 0 && (
        <div className={styles.summary}>
          <span className={styles.summaryCount}>
            {t("security.users.scope.selectedCount", { count: value.length })}
          </span>
          <div className={styles.chips}>
            {value.map((e) => (
              <span key={e.orgNodeId} className={styles.chip}>
                {names.get(e.orgNodeId) ?? e.orgNodeId}
                {!disabled && (
                  <button
                    type="button"
                    className={styles.chipRemove}
                    onClick={() => setNode(e.orgNodeId, false)}
                    aria-label={t("common.delete")}
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
          </div>
          {!disabled && (
            <button type="button" className={styles.clearBtn} onClick={() => onChange([])}>
              {t("security.users.scope.clear")}
            </button>
          )}
        </div>
      )}

      <div className={styles.tree}>
        {searching && visibleTree.length === 0 ? (
          <p className={styles.empty}>{t("security.users.scope.noMatches")}</p>
        ) : (
          visibleTree.map((n) => renderNode(n, 0))
        )}
      </div>
    </div>
  );
}
