import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Building2, ChevronRight, Cog, FolderOpen, Layers, SearchX, Wrench } from "lucide-react";
import { cx } from "@lyra/ui";
import type { OrgLevel, OrgNodeTree } from "@lyra/contracts";
import styles from "./OrgTree.module.css";

// ── Helpers de nivel (exportados para reutilización en NodeDetail) ────────────

export function levelColor(order: number | undefined): string {
  switch (order) {
    case 0:  return "var(--color-accent-primary)";
    case 1:  return "var(--color-accent-secondary)";
    case 2:  return "var(--color-success)";
    case 3:  return "var(--color-warning)";
    default: return "var(--color-text-muted)";
  }
}

export function LevelIcon({ order, size = 16 }: { order: number | undefined; size?: number }): ReactNode {
  const color = levelColor(order);
  switch (order) {
    case 0:  return <Building2  size={size} color={color} />;
    case 1:  return <Layers     size={size} color={color} />;
    case 2:  return <Cog        size={size} color={color} />;
    case 3:  return <Wrench     size={size} color={color} />;
    default: return <FolderOpen size={size} color={color} />;
  }
}

// ── Helpers de búsqueda ───────────────────────────────────────────────────────

/** Normaliza para comparar sin acentos ni mayúsculas (es-CL). */
function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** ¿El nodo coincide con la consulta (nombre / código / cód. externo / descripción)? */
function nodeMatches(node: OrgNodeTree, q: string): boolean {
  return (
    norm(node.name).includes(q) ||
    (!!node.code && norm(node.code).includes(q)) ||
    (!!node.externalCode && norm(node.externalCode).includes(q)) ||
    (!!node.description && norm(node.description).includes(q))
  );
}

/** Resalta la coincidencia en el nombre (insensible a mayúsculas). */
function highlightName(name: string, rawQuery: string): ReactNode {
  const q = rawQuery.trim();
  if (!q) return name;
  const idx = name.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return name; // coincidió por acento/otro campo: mostramos sin resaltar
  return (
    <>
      {name.slice(0, idx)}
      <mark className={styles.mark}>{name.slice(idx, idx + q.length)}</mark>
      {name.slice(idx + q.length)}
    </>
  );
}

// ── Componente ────────────────────────────────────────────────────────────────

interface OrgTreeProps {
  nodes: OrgNodeTree[];
  levels: OrgLevel[];
  selectedId: string | null;
  onSelect: (node: OrgNodeTree) => void;
  /** Texto de búsqueda: filtra el árbol a las ramas con coincidencias y las expande. */
  query?: string;
}

function buildLevelMap(levels: OrgLevel[]): Map<string, OrgLevel> {
  return new Map(levels.map((l) => [l.id, l]));
}

export function OrgTree({ nodes, levels, selectedId, onSelect, query = "" }: OrgTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set);
  const levelMap = buildLevelMap(levels);

  const q = norm(query.trim());
  const rawQuery = query.trim();

  // Ramas visibles al filtrar: cada coincidencia + todos sus ancestros (para
  // ver el camino). Sin query, no se filtra nada.
  const { visibleIds, matchCount } = useMemo(() => {
    const visible = new Set<string>();
    if (!q) return { visibleIds: visible, matchCount: 0 };
    let count = 0;
    const walk = (list: OrgNodeTree[], ancestors: string[]): void => {
      for (const n of list) {
        if (nodeMatches(n, q)) {
          count++;
          ancestors.forEach((a) => visible.add(a));
          visible.add(n.id);
        }
        walk(n.children, [...ancestors, n.id]);
      }
    };
    walk(nodes, []);
    return { visibleIds: visible, matchCount: count };
  }, [nodes, q]);

  // Auto-expand los ancestros del nodo seleccionado (solo sin búsqueda activa;
  // con búsqueda, el filtro fuerza la apertura del camino).
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

  const filtering = q.length > 0;
  const rootNodes = filtering ? nodes.filter((n) => visibleIds.has(n.id)) : nodes;

  if (filtering && matchCount === 0) {
    return (
      <div className={styles.noResults}>
        <SearchX size={26} color="var(--color-text-muted)" />
        <span>Sin coincidencias para «{rawQuery}»</span>
      </div>
    );
  }

  return (
    <div className={styles.tree} role="tree">
      {rootNodes.map((node) => (
        <NodeBranch
          key={node.id}
          node={node}
          depth={0}
          expanded={expanded}
          toggle={toggle}
          levelMap={levelMap}
          selectedId={selectedId}
          onSelect={onSelect}
          filtering={filtering}
          visibleIds={visibleIds}
          rawQuery={rawQuery}
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
  /** Búsqueda activa: fuerza apertura del camino y filtra hijos a coincidencias. */
  filtering: boolean;
  visibleIds: Set<string>;
  rawQuery: string;
}

function NodeBranch({
  node, depth, expanded, toggle, levelMap, selectedId, onSelect, filtering, visibleIds, rawQuery,
}: NodeBranchProps) {
  const level      = levelMap.get(node.levelId);
  const isSelected = node.id === selectedId;

  // Con búsqueda: el camino se abre solo y los hijos se acotan a coincidencias.
  const childNodes = filtering ? node.children.filter((c) => visibleIds.has(c.id)) : node.children;
  const hasChildren = childNodes.length > 0;
  const isOpen = filtering ? true : expanded.has(node.id);

  return (
    <div role="treeitem" aria-expanded={hasChildren ? isOpen : undefined} aria-selected={isSelected}>
      <div
        className={cx(styles.nodeRow, isSelected && styles.nodeRowSelected)}
        style={{ paddingLeft: `calc(var(--space-2) + ${depth * 18}px)` }}
        title={node.name}
        onClick={() => onSelect(node)}
      >
        {/* Chevron expandir/colapsar */}
        {hasChildren ? (
          <button
            type="button"
            className={cx(styles.chevronBtn, isOpen && styles.chevronOpen)}
            onClick={(e) => { e.stopPropagation(); if (!filtering) toggle(node.id); }}
            tabIndex={-1}
          >
            <ChevronRight size={13} />
          </button>
        ) : (
          <span className={styles.noChevron} />
        )}

        {/* Ícono de nivel */}
        <span className={styles.levelIcon}>
          <LevelIcon order={level?.order} size={14} />
        </span>

        {/* Nombre + subnota */}
        <span className={styles.nodeText}>
          <span className={cx(styles.nodeName, isSelected && styles.nodeNameSelected)}>
            {highlightName(node.name, rawQuery)}
          </span>
          {(node.description || node.externalCode) && (
            <span className={styles.nodeSubline}>
              {node.description
                ? node.description.length > 60
                  ? node.description.slice(0, 57) + "…"
                  : node.description
                : null}
              {node.description && node.externalCode && " · "}
              {node.externalCode && (
                <span className={styles.nodeSublineCode}>{node.externalCode}</span>
              )}
            </span>
          )}
        </span>

        {/* Código */}
        {node.code && <span className={styles.nodeCode}>{node.code}</span>}

        {/* Badge de hijos (conteo real, no el filtrado) */}
        {node.children.length > 0 && (
          <span className={styles.childCount}>{node.children.length}</span>
        )}
      </div>

      {isOpen && hasChildren && (
        <div role="group">
          {childNodes.map((child) => (
            <NodeBranch
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              levelMap={levelMap}
              selectedId={selectedId}
              onSelect={onSelect}
              filtering={filtering}
              visibleIds={visibleIds}
              rawQuery={rawQuery}
            />
          ))}
        </div>
      )}
    </div>
  );
}
