import { useState } from "react";
import { useTranslation } from "react-i18next";
import { MoveRight, Check } from "lucide-react";
import { Button, Modal, useToast } from "@lyra/ui";
import type { OrgNodeTree } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { useUpdateNode } from "./structure-queries.js";
import styles from "./MoveNodeModal.module.css";

interface MoveNodeModalProps {
  open: boolean;
  node: OrgNodeTree | null;
  allNodes: OrgNodeTree[];
  onClose: () => void;
}

const ROOT_SENTINEL = "__ROOT__";

export function MoveNodeModal({ open, node, allNodes, onClose }: MoveNodeModalProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const updateNode = useUpdateNode();
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function isDisabled(candidate: OrgNodeTree): boolean {
    if (!node) return true;
    // El propio nodo no puede ser su padre
    if (candidate.id === node.id) return true;
    // Un descendiente tampoco puede ser padre (ruta materializada)
    if (candidate.path.startsWith(node.path)) return true;
    return false;
  }

  async function handleMove() {
    if (!node || selectedParentId === null) return;
    const newParentId = selectedParentId === ROOT_SENTINEL ? null : selectedParentId;
    try {
      await updateNode.mutateAsync({
        id: node.id,
        dto: { parentId: newParentId },
      });
      toast.success(t("structure.node.moved"));
      onClose();
      setSelectedParentId(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    }
  }

  function handleClose() {
    setSelectedParentId(null);
    onClose();
  }

  const selectedLabel =
    selectedParentId === ROOT_SENTINEL
      ? t("structure.move.makeRoot")
      : selectedParentId !== null
        ? findNodeName(allNodes, selectedParentId)
        : null;

  return (
    <Modal
      open={open}
      onClose={handleClose}
      size="md"
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <MoveRight size={18} />
          {t("structure.move.title")}: <em style={{ fontWeight: 400 }}>{node?.name}</em>
        </span>
      }
      footer={
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={handleClose} disabled={updateNode.isPending}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={handleMove}
            loading={updateNode.isPending}
            disabled={selectedParentId === null}
          >
            {t("structure.move.confirm")}
          </Button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className={styles.selectionLabel}>{t("structure.move.selectParent")}</p>

        <div className={styles.treeWrapper}>
          {/* Opción "sin padre" (hacer nodo raíz) */}
          <button
            type="button"
            className={`${styles.makeRootOption} ${selectedParentId === ROOT_SENTINEL ? styles.makeRootSelected : ""}`}
            onClick={() => setSelectedParentId(ROOT_SENTINEL)}
          >
            {selectedParentId === ROOT_SENTINEL && <Check size={14} />}
            {t("structure.move.makeRoot")}
          </button>

          {allNodes.map((n) => (
            <MoveTreeRow
              key={n.id}
              node={n}
              depth={0}
              disabled={isDisabled}
              expanded={expanded}
              toggle={toggle}
              selected={selectedParentId}
              onSelect={setSelectedParentId}
            />
          ))}
        </div>

        {selectedLabel && (
          <div className={styles.selectedInfo}>
            {t("structure.move.selectedParent")}: <strong>{selectedLabel}</strong>
          </div>
        )}
      </div>
    </Modal>
  );
}

interface MoveTreeRowProps {
  node: OrgNodeTree;
  depth: number;
  disabled: (n: OrgNodeTree) => boolean;
  expanded: Set<string>;
  toggle: (id: string) => void;
  selected: string | null;
  onSelect: (id: string) => void;
}

function MoveTreeRow({ node, depth, disabled, expanded, toggle, selected, onSelect }: MoveTreeRowProps) {
  const { t } = useTranslation();
  const isDisabled = disabled(node);
  const isSelected = selected === node.id;
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;

  return (
    <>
      <button
        type="button"
        className={`${styles.treeRow} ${isDisabled ? styles.disabled : ""} ${isSelected ? styles.selected : ""}`}
        style={{ paddingLeft: `calc(var(--space-3) + ${depth * 20}px)` }}
        onClick={() => !isDisabled && onSelect(node.id)}
        disabled={isDisabled}
      >
        {isSelected && <Check size={14} />}
        {!isSelected && hasChildren && (
          <button
            type="button"
            style={{ background: "none", border: "none", padding: 2, cursor: "pointer", color: "inherit", display: "inline-flex" }}
            onClick={(e) => { e.stopPropagation(); toggle(node.id); }}
          >
            {isOpen ? "▾" : "▸"}
          </button>
        )}
        <span style={{ flex: 1 }}>{node.name}</span>
        {isDisabled && (
          <span className={styles.disabledHint}>
            {node.id === node.id ? t("structure.move.descendantDisabled") : ""}
          </span>
        )}
      </button>
      {isOpen && hasChildren &&
        node.children.map((child) => (
          <MoveTreeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            disabled={disabled}
            expanded={expanded}
            toggle={toggle}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

function findNodeName(nodes: OrgNodeTree[], id: string): string {
  for (const n of nodes) {
    if (n.id === id) return n.name;
    const found = findNodeName(n.children, id);
    if (found) return found;
  }
  return id;
}
