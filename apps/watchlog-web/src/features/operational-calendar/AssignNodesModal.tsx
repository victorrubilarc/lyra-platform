import { Fragment, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { Button, Checkbox, Chip, Input, Modal, useToast } from "@lyra/ui";
import type { OrgNodeTree } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { useOrgTree } from "../structure/structure-queries.js";
import { useAssignCalendarNodes } from "./operational-calendar-queries.js";
import styles from "./OperationalCalendarPage.module.css";

function norm(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function filterTree(nodes: OrgNodeTree[], q: string): OrgNodeTree[] {
  const out: OrgNodeTree[] = [];
  for (const n of nodes) {
    const children = filterTree(n.children, q);
    if (norm(n.name).includes(q) || children.length > 0) out.push({ ...n, children });
  }
  return out;
}

interface AssignNodesModalProps {
  calendarId: string;
  currentNodeIds: string[];
  onClose: () => void;
}

/**
 * Selección de nodos asignados directamente a este calendario (set plano). La
 * herencia a descendientes la resuelve el backend por la ruta materializada, así
 * que basta marcar el nodo raíz de una rama. Picker mínimo sobre el árbol existente.
 */
export function AssignNodesModal({ calendarId, currentNodeIds, onClose }: AssignNodesModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { data: tree = [] } = useOrgTree();
  const assign = useAssignCalendarNodes();

  const [selected, setSelected] = useState<Set<string>>(new Set(currentNodeIds));
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const q = norm(query.trim());
  const visible = useMemo(() => (q ? filterTree(tree, q) : tree), [tree, q]);

  const toggleNode = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // `inherited` = algún ancestro está seleccionado ⇒ el nodo ya queda cubierto por
  // herencia (no se marca directamente; se muestra como "heredado").
  const renderNode = (node: OrgNodeTree, depth: number, inherited: boolean): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    const isCollapsed = collapsed.has(node.id) && !q;
    const directlySelected = selected.has(node.id);
    return (
      <Fragment key={node.id}>
        <div className={styles.nodeRow} style={{ paddingLeft: depth * 18 }}>
          {hasChildren ? (
            <button type="button" className={styles.nodeToggle} onClick={() => toggleCollapse(node.id)} aria-label={t("common.expand")}>
              {isCollapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
            </button>
          ) : (
            <span style={{ width: 19, display: "inline-block" }} />
          )}
          <Checkbox
            checked={directlySelected || inherited}
            disabled={inherited}
            onChange={() => toggleNode(node.id)}
            label={node.name}
          />
          {inherited && <Chip label={t("opsCalendar.inherited")} variant="default" size="sm" />}
        </div>
        {hasChildren && !isCollapsed && node.children.map((c) => renderNode(c, depth + 1, inherited || directlySelected))}
      </Fragment>
    );
  };

  const onSave = async () => {
    try {
      await assign.mutateAsync({ id: calendarId, dto: { orgNodeIds: [...selected] } });
      toast.success(t("opsCalendar.nodesSaved"));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t("opsCalendar.manageNodes")}
      footer={
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: 8 }}>
          <span style={{ fontSize: 13, color: "var(--color-text-muted)", alignSelf: "center" }}>
            {t("opsCalendar.nodeCount", { count: selected.size })}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={() => void onSave()} loading={assign.isPending}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className={styles.hint}>{t("opsCalendar.inheritedHint")}</p>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("opsCalendar.searchNodes")}
          rightSlot={<Search size={15} color="var(--color-text-muted)" />}
        />
        <div className={styles.nodeTree}>
          {visible.length === 0 ? (
            <p className={styles.hint}>{t("opsCalendar.noNodesAvailable")}</p>
          ) : (
            visible.map((n) => renderNode(n, 0, false))
          )}
        </div>
      </div>
    </Modal>
  );
}
