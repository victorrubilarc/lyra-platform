import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { CalendarClock, ChevronRight, ClipboardList, FileStack, History, Layers, Lock, Network, TriangleAlert } from "lucide-react";
import { Button, Card, Combobox, EmptyState, FormField, Input, Modal, Skeleton, Textarea, Toggle, useToast } from "@lyra/ui";
import type { EligibleNode, EquipmentMode, TemplateListItem } from "@lyra/contracts";
import { usePermissions } from "../../auth/use-permissions.js";
import { localInputToIso } from "./datetime-local.js";
import { fetchTemplateEligibleNodes } from "./log-entries-api.js";
import { useAvailableTemplates } from "./log-entries-queries.js";
import { useActiveStructureId } from "../structure/structure-queries.js";
import styles from "./LogEntries.module.css";

/** Resumen del alcance de estructura de una plantilla para mostrar en la card. */
function nodeScopeLabel(tpl: TemplateListItem, globalLabel: string, branchSuffix: string, nodesLabel: (n: number) => string): string {
  if (tpl.nodeAssignments.length === 0) return globalLabel;
  if (tpl.nodeAssignments.length === 1) {
    const a = tpl.nodeAssignments[0]!;
    return `${a.orgNodePath ?? a.orgNodeId}${a.includeDescendants ? ` ${branchSuffix}` : ""}`;
  }
  return nodesLabel(tpl.nodeAssignments.length);
}

/** Selección de plantilla para una nueva entrada (anclada al prototipo: PickTpl). */
export function NewEntryPage() {
  const { t } = useTranslation();
  const perms = usePermissions();
  const navigate = useNavigate();
  const toast = useToast();

  const { data: templates = [], isLoading, isError } = useAvailableTemplates();
  const activeStructureId = useActiveStructureId();

  // Gesto mínimo de registro DIFERIDO (2.7.0): por defecto la entrada es "en
  // línea" (fecha/hora automática); el toggle declara la fecha/hora REAL del
  // evento + motivo, y la entrada nace MARCADA como diferida.
  const [deferredOn, setDeferredOn] = useState(false);
  const [eventAt, setEventAt] = useState("");
  const [reason, setReason] = useState("");
  const deferralReady = !deferredOn || (eventAt.trim() !== "" && reason.trim().length >= 5);

  // Selección de NODO al crear (multi-nodo 2.8.0): si la plantilla resuelve a un
  // solo nodo se autoselecciona; si resuelve a varios, se obliga a elegir.
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [nodeChoice, setNodeChoice] = useState<{
    template: TemplateListItem;
    nodes: EligibleNode[];
    equipmentMode: EquipmentMode;
  } | null>(null);
  const [chosenNode, setChosenNode] = useState("");
  const [chosenEquipment, setChosenEquipment] = useState("");

  // Crear una entrada requiere `logentry:create` (mismo permiso que el endpoint de
  // plantillas disponibles). Quien solo llena/revisa no entra aquí — usa Bitácoras.
  if (!perms.can("logentry:create")) {
    return (
      <div className={styles.page}>
        <EmptyState icon={<Lock size={36} />} title={t("logbook.noAccess")} description={t("logbook.noAccessDesc")} />
      </div>
    );
  }

  // Elegir una plantilla NO crea nada (2.8.2): abre el formulario en modo compose;
  // la entrada se materializa recién en el primer guardado real. El diferido
  // declarado aquí viaja por el state de navegación y se aplica al materializar.
  function goCompose(templateId: string, orgNodeId: string, equipmentId: string | null) {
    navigate(`/nueva-entrada/comenzar/${templateId}`, {
      state: {
        orgNodeId,
        equipmentId,
        deferred: deferredOn ? { effectiveAt: localInputToIso(eventAt), reason: reason.trim() } : null,
      },
    });
  }

  // Resuelve los nodos elegibles (asignaciones ∩ alcance) y sus equipos. Se abre el
  // modal si hay que elegir nodo (>1) y/o equipo (el nodo resuelto tiene equipos,
  // opcional). 1 nodo sin equipos → directo a compose (cero fricción).
  async function start(tpl: TemplateListItem) {
    if (!deferralReady) {
      toast.error(t("logbook.deferral.incomplete"));
      return;
    }
    setResolvingId(tpl.id);
    try {
      const { equipmentMode, nodes } = await fetchTemplateEligibleNodes(tpl.id, activeStructureId);
      if (nodes.length === 0) {
        toast.error(t("logbook.new.noEligibleNodes"));
        return;
      }
      // Modo de equipo (2.8.0.2): REQUIRED exige elegir equipo ⇒ nunca atajo directo.
      const required = equipmentMode === "REQUIRED";
      if (nodes.length === 1 && nodes[0]!.equipment.length === 0 && !required) {
        goCompose(tpl.id, nodes[0]!.id, null);
        return;
      }
      // Autoselección del equipo único cuando se sugiere o exige (un nodo, un equipo).
      const single = nodes.length === 1 ? nodes[0]! : null;
      const autoEquip =
        single && single.equipment.length === 1 && (required || equipmentMode === "SUGGESTED")
          ? single.equipment[0]!.id
          : "";
      setChosenNode(nodes.length === 1 ? nodes[0]!.id : "");
      setChosenEquipment(autoEquip);
      setNodeChoice({ template: tpl, nodes, equipmentMode });
    } catch {
      toast.error(t("logbook.new.loadError"));
    } finally {
      setResolvingId(null);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>
            {t("logbook.new.title")} <span className={styles.accent}>{t("logbook.new.titleAccent")}</span>
          </h1>
          <p className={styles.subtitle}>{t("logbook.new.subtitle")}</p>
        </div>
      </div>

      {/* Registro diferido (2.7.0): gesto mínimo, apagado por defecto. */}
      <Card className={styles.deferralCard}>
        <div className={styles.deferralToggleRow}>
          <Toggle checked={deferredOn} onChange={setDeferredOn} aria-label={t("logbook.deferral.toggleLabel")} />
          <button type="button" className={styles.deferralToggleLabel} onClick={() => setDeferredOn(!deferredOn)}>
            <History size={15} /> {t("logbook.deferral.toggleLabel")}
          </button>
          {!deferredOn && <span className={styles.deferralHint}>{t("logbook.deferral.toggleHint")}</span>}
        </div>
        {deferredOn && (
          <div className={styles.deferralFields}>
            <FormField label={t("logbook.deferral.effectiveAt")} required>
              {(field) => (
                <Input
                  {...field}
                  type="datetime-local"
                  value={eventAt}
                  onChange={(e) => setEventAt(e.target.value)}
                  rightSlot={<CalendarClock size={15} />}
                />
              )}
            </FormField>
            <FormField label={t("logbook.deferral.reason")} required hint={t("logbook.deferral.reasonHint")}>
              {(field) => (
                <Textarea
                  {...field}
                  value={reason}
                  rows={2}
                  placeholder={t("logbook.deferral.reasonPlaceholder")}
                  onChange={(e) => setReason(e.target.value)}
                />
              )}
            </FormField>
            <p className={styles.deferralExplain}>{t("logbook.deferral.explain")}</p>
          </div>
        )}
      </Card>

      {isLoading ? (
        <div className={styles.grid}>
          {[0, 1, 2].map((i) => (
            <Card key={i} className={styles.card}>
              <Skeleton height={18} width="70%" />
              <Skeleton height={14} width="90%" />
            </Card>
          ))}
        </div>
      ) : isError ? (
        <EmptyState icon={<TriangleAlert size={30} />} title={t("logbook.new.loadError")} />
      ) : templates.length === 0 ? (
        <EmptyState icon={<FileStack size={36} />} title={t("logbook.new.empty")} description={t("logbook.new.emptyDesc")} />
      ) : (
        <div className={styles.grid}>
          {templates.map((tpl) => (
            <Card
              key={tpl.id}
              className={styles.card}
              hoverable
              style={{ cursor: resolvingId ? "wait" : "pointer", opacity: resolvingId && resolvingId !== tpl.id ? 0.6 : 1 }}
              onClick={() => !resolvingId && start(tpl)}
            >
              <div className={styles.cardTop}>
                <ClipboardList size={22} color="var(--color-accent-primary, #6366f1)" />
                <span
                  className={styles.nodeTag}
                  title={tpl.nodeAssignments.map((a) => a.orgNodePath ?? a.orgNodeId).join(" · ")}
                >
                  <Network size={11} />
                  {nodeScopeLabel(
                    tpl,
                    t("logbook.new.globalNode"),
                    t("templates.nodeBranchSuffix"),
                    (n) => t("templates.nodeCount", { count: n }),
                  )}
                </span>
              </div>
              <div className={styles.cardName}>{tpl.name}</div>
              {tpl.description && <div className={styles.cardDesc}>{tpl.description}</div>}
              <div className={styles.cardTop}>
                <span className={styles.cardMeta}>
                  <Layers size={12} /> {t("templates.sections", { count: tpl.sectionCount })} · {t("templates.fields", { count: tpl.fieldCount })}
                </span>
                <ChevronRight size={16} color="var(--color-text-muted)" />
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Nodo (obligatorio si >1) + equipo OPCIONAL del nodo elegido (2.8.0 / 2.8.0.1). */}
      <Modal
        open={nodeChoice !== null}
        onClose={() => setNodeChoice(null)}
        title={t("logbook.new.chooseNode")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setNodeChoice(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              disabled={!chosenNode || (nodeChoice?.equipmentMode === "REQUIRED" && !chosenEquipment)}
              onClick={() => {
                if (nodeChoice && chosenNode) {
                  const tplId = nodeChoice.template.id;
                  const equip = chosenEquipment || null;
                  setNodeChoice(null);
                  goCompose(tplId, chosenNode, equip);
                }
              }}
            >
              {t("common.continue")}
            </Button>
          </>
        }
      >
        {nodeChoice &&
          (() => {
            const multiNode = nodeChoice.nodes.length > 1;
            const current = nodeChoice.nodes.find((n) => n.id === chosenNode) ?? null;
            const equipment = current?.equipment ?? [];
            // Gobernanza del equipo (2.8.0.2): REQUIRED obliga (sin "(sin equipo)");
            // SUGGESTED ofrece "(sin equipo)" pero empuja a elegir.
            const equipRequired = nodeChoice.equipmentMode === "REQUIRED";
            const equipSuggested = nodeChoice.equipmentMode === "SUGGESTED";
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
                {multiNode ? (
                  <FormField label={t("logbook.new.node")} hint={t("logbook.new.chooseNodeHint")}>
                    {({ id }) => (
                      <Combobox
                        id={id}
                        value={chosenNode}
                        onChange={(v) => {
                          setChosenNode(v);
                          setChosenEquipment(""); // el equipo depende del nodo
                        }}
                        options={nodeChoice.nodes.map((n) => ({ value: n.id, label: n.path }))}
                        placeholder={t("logbook.new.nodePlaceholder")}
                        searchPlaceholder={t("common.search")}
                        ariaLabel={t("logbook.new.node")}
                      />
                    )}
                  </FormField>
                ) : (
                  <FormField label={t("logbook.new.node")}>
                    {() => <div className={styles.nodeFixed}>{current?.path}</div>}
                  </FormField>
                )}

                {/* Equipo (2.8.0.1/2.8.0.2): se muestra si el nodo tiene equipos. El modo
                    de la plantilla decide si es obligatorio (REQUIRED) o sugerido. */}
                {equipment.length > 0 && (
                  <FormField
                    label={t("logbook.new.equipment")}
                    required={equipRequired}
                    hint={
                      equipRequired
                        ? t("logbook.new.equipmentRequiredHint")
                        : equipSuggested
                          ? t("logbook.new.equipmentSuggestedHint")
                          : t("logbook.new.equipmentHint")
                    }
                  >
                    {({ id }) => (
                      <Combobox
                        id={id}
                        value={chosenEquipment}
                        onChange={setChosenEquipment}
                        options={[
                          // REQUIRED no ofrece "(sin equipo)"; el backend también lo rechaza.
                          ...(equipRequired ? [] : [{ value: "", label: t("logbook.new.equipmentNone") }]),
                          ...equipment.map((e) => ({ value: e.id, label: e.tag ? `${e.name} · ${e.tag}` : e.name })),
                        ]}
                        placeholder={equipRequired ? t("logbook.new.equipmentChoose") : t("logbook.new.equipmentNone")}
                        searchPlaceholder={t("common.search")}
                        ariaLabel={t("logbook.new.equipment")}
                      />
                    )}
                  </FormField>
                )}
                {/* REQUIRED pero el nodo elegido no tiene equipos activos: no se puede
                    crear la entrada hasta dar de alta un equipo en ese nodo. */}
                {equipRequired && equipment.length === 0 && chosenNode && (
                  <p className={styles.equipmentBlocked}>{t("logbook.new.equipmentRequiredNoneInNode")}</p>
                )}
              </div>
            );
          })()}
      </Modal>
    </div>
  );
}
