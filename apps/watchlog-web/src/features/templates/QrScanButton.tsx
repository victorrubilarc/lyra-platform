import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ScanLine, X } from "lucide-react";
import { Button } from "@lyra/ui";
import { BrowserMultiFormatReader, type IScannerControls } from "@zxing/browser";
import styles from "./AttachmentControl.module.css";

/**
 * Botón de ESCANEO QR / código de barras (Ola 3). NO es un archivo: decodifica con
 * la cámara client-side (`@zxing/browser`) y rellena el valor del campo (TEXT). Sin
 * storage. Si no hay cámara/permiso, el usuario igual puede teclear el valor.
 */
export function QrScanButton({ onResult, disabled }: { onResult: (text: string) => void; disabled?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();
    setError(null);
    reader
      .decodeFromVideoDevice(undefined, videoRef.current ?? undefined, (result, _err, controls) => {
        controlsRef.current = controls;
        if (cancelled) return;
        if (result) {
          controls.stop();
          onResult(result.getText());
          setOpen(false);
        }
      })
      .catch(() => setError(t("templates.attachment.scanError")));
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [open, onResult, t]);

  return (
    <>
      <Button variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>
        <ScanLine size={15} /> {t("templates.attachment.scan")}
      </Button>
      {open && (
        <div className={styles.sketchOverlay} role="dialog" aria-modal aria-label={t("templates.attachment.scan")}>
          <div className={styles.sketchCard}>
            <div className={styles.sketchHead}>{t("templates.attachment.scanTitle")}</div>
            <video ref={videoRef} className={styles.sketchCanvas} style={{ maxHeight: 360 }} aria-label={t("templates.attachment.scanTitle")} />
            {error && <div className={styles.error} style={{ padding: "8px 16px" }}>{error}</div>}
            <div className={styles.sketchActions}>
              <span style={{ flex: 1 }} />
              <Button variant="secondary" onClick={() => setOpen(false)}>
                <X size={15} /> {t("common.cancel")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
