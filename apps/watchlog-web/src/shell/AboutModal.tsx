import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { Button, Chip, Modal } from "@lyra/ui";
import { formatDateTime } from "../lib/format.js";
import { APP_VERSION, BUILD_DATE, IS_DEV, SHORT_SHA, VERSION_LABEL } from "./app-version.js";

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

/** Diálogo «Acerca de»: producto, versión, fecha de compilación y commit. */
export function AboutModal({ open, onClose }: AboutModalProps) {
  const { t } = useTranslation();

  const rows: { label: string; value: React.ReactNode }[] = [
    {
      label: t("about.version"),
      value: (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <code style={{ fontSize: 13 }}>{VERSION_LABEL}</code>
          <Chip
            label={IS_DEV ? t("about.dev") : t("about.prod")}
            variant={IS_DEV ? "warning" : "success"}
          />
        </span>
      ),
    },
    { label: t("about.builtOn"), value: formatDateTime(BUILD_DATE) },
  ];
  if (SHORT_SHA) rows.push({ label: t("about.commit"), value: <code style={{ fontSize: 13 }}>{SHORT_SHA}</code> });

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Info size={18} />
          {t("about.title")}
        </span>
      }
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
        </div>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontFamily: "var(--font-brand)", fontSize: 18, fontWeight: 700 }}>Lyra WatchLog</div>
          <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginTop: 2 }}>{t("about.ecosystem")}</div>
        </div>

        <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 16px", margin: 0 }}>
          {rows.map((r) => (
            <div key={r.label} style={{ display: "contents" }}>
              <dt style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>{r.label}</dt>
              <dd style={{ margin: 0, fontSize: 13, color: "var(--color-text-primary)" }}>{r.value}</dd>
            </div>
          ))}
        </dl>

        {/* Línea de soporte: el dato técnico que pide un técnico al reportar un problema. */}
        <p style={{ margin: 0, fontSize: 12, color: "var(--color-text-muted)", lineHeight: 1.5 }}>
          {t("about.supportHint", { version: APP_VERSION })}
        </p>
      </div>
    </Modal>
  );
}
