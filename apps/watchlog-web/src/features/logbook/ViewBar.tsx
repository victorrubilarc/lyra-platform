import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Bookmark, Check, ChevronDown, Plus, Save, Star, Trash2 } from "lucide-react";
import { Button, Checkbox, Input, Menu, MenuItem, MenuLabel, MenuSeparator, Modal } from "@lyra/ui";
import { LOGBOOK_SYSTEM_VIEWS, type SavedViewDto, type SystemView } from "@lyra/contracts";
import styles from "./Logbook.module.css";

interface Props {
  views: SavedViewDto[];
  activeViewId: string | null;
  dirty: boolean;
  busy: boolean;
  onApplyView: (view: SavedViewDto) => void;
  onApplySystem: (view: SystemView) => void;
  onApplyDefault: () => void;
  onSaveAs: (name: string, isDefault: boolean) => void;
  onUpdateActive: () => void;
  onToggleDefault: (view: SavedViewDto) => void;
  onDelete: (view: SavedViewDto) => void;
}

export function ViewBar({
  views,
  activeViewId,
  dirty,
  busy,
  onApplyView,
  onApplySystem,
  onApplyDefault,
  onSaveAs,
  onUpdateActive,
  onToggleDefault,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  const [saveAsOpen, setSaveAsOpen] = useState(false);
  const [name, setName] = useState("");
  const [makeDefault, setMakeDefault] = useState(false);

  const activeView = views.find((v) => v.id === activeViewId) ?? null;
  const activeSystem = LOGBOOK_SYSTEM_VIEWS.find((v) => v.id === activeViewId) ?? null;
  const activeLabel = activeView
    ? activeView.name
    : activeSystem
      ? t(activeSystem.labelKey)
      : t("logbook.views.none");

  function confirmSaveAs() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSaveAs(trimmed, makeDefault);
    setSaveAsOpen(false);
    setName("");
    setMakeDefault(false);
  }

  return (
    <div className={styles.viewBar}>
      <Menu
        ariaLabel={t("logbook.views.pick")}
        trigger={
          <button type="button" className={styles.viewTrigger}>
            <Bookmark size={15} />
            <span className={styles.viewName}>{activeLabel}</span>
            {dirty && <span className={styles.dirtyDot} title={t("logbook.views.modified")} />}
            <ChevronDown size={14} />
          </button>
        }
      >
        <MenuItem icon={<Check size={14} className={activeViewId ? styles.invisible : ""} />} onSelect={onApplyDefault}>
          {t("logbook.views.default")}
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>{t("logbook.views.systemGroup")}</MenuLabel>
        {LOGBOOK_SYSTEM_VIEWS.map((v) => (
          <MenuItem
            key={v.id}
            icon={<Check size={14} className={activeViewId === v.id ? "" : styles.invisible} />}
            onSelect={() => onApplySystem(v)}
          >
            {t(v.labelKey)}
          </MenuItem>
        ))}
        {views.length > 0 && (
          <>
            <MenuSeparator />
            <MenuLabel>{t("logbook.views.mine")}</MenuLabel>
            {views.map((v) => (
              <MenuItem
                key={v.id}
                icon={<Check size={14} className={activeViewId === v.id ? "" : styles.invisible} />}
                trailing={v.isDefault ? <Star size={12} className={styles.defaultStar} /> : undefined}
                onSelect={() => onApplyView(v)}
              >
                {v.name}
              </MenuItem>
            ))}
          </>
        )}
      </Menu>

      {/* Acciones contextuales a la vista activa */}
      {activeView && dirty && (
        <Button variant="secondary" leftIcon={<Save size={14} />} loading={busy} onClick={onUpdateActive}>
          {t("logbook.views.update")}
        </Button>
      )}
      {activeView && (
        <>
          <button
            type="button"
            className={activeView.isDefault ? `${styles.viewIconBtn} ${styles.viewIconBtnActive}` : styles.viewIconBtn}
            title={activeView.isDefault ? t("logbook.views.isDefault") : t("logbook.views.makeDefault")}
            onClick={() => onToggleDefault(activeView)}
          >
            <Star size={15} />
          </button>
          <button
            type="button"
            className={styles.viewIconBtn}
            title={t("logbook.views.delete")}
            onClick={() => onDelete(activeView)}
          >
            <Trash2 size={15} />
          </button>
        </>
      )}
      <Button variant="secondary" leftIcon={<Plus size={14} />} onClick={() => setSaveAsOpen(true)}>
        {t("logbook.views.saveAs")}
      </Button>

      <Modal open={saveAsOpen} onClose={() => setSaveAsOpen(false)} title={t("logbook.views.saveAsTitle")}>
        <div className={styles.saveAsBody}>
          <Input
            autoFocus
            value={name}
            placeholder={t("logbook.views.namePlaceholder")}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmSaveAs()}
          />
          <Checkbox checked={makeDefault} onChange={setMakeDefault} label={t("logbook.views.makeDefaultOnSave")} />
          <div className={styles.saveAsActions}>
            <Button variant="secondary" onClick={() => setSaveAsOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={confirmSaveAs}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
