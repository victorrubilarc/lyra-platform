import { useCallback } from "react";
import { Copy, Download, ShieldAlert } from "lucide-react";
import { Button, cx, useToast } from "@lyra/ui";
import styles from "./security.module.css";

/**
 * Muestra los códigos de recuperación de un solo uso. Se ven UNA sola vez (tras
 * activar o regenerar MFA): permiten copiarlos o descargarlos como `.txt`.
 */
export function RecoveryCodesPanel({ codes }: { codes: string[] }) {
  const toast = useToast();

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      toast.success("Códigos copiados al portapapeles");
    } catch {
      toast.error("No se pudo copiar; descárgalos en su lugar");
    }
  }, [codes, toast]);

  const download = useCallback(() => {
    const blob = new Blob([`${codes.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "lyra-watchlog-codigos-recuperacion.txt";
    a.click();
    URL.revokeObjectURL(url);
  }, [codes]);

  return (
    <>
      <div className={cx(styles.notice, styles.noticeWarn)}>
        <ShieldAlert size={18} className={styles.noticeIcon} aria-hidden="true" />
        <span>
          Guarda estos códigos en un lugar seguro. Cada uno sirve <strong>una sola vez</strong> para
          entrar si pierdes tu teléfono. <strong>No volverán a mostrarse.</strong>
        </span>
      </div>
      <div className={styles.codesGrid}>
        {codes.map((c) => (
          <div key={c} className={styles.code}>
            {c}
          </div>
        ))}
      </div>
      <div className={styles.actions}>
        <Button variant="secondary" leftIcon={<Copy size={16} />} onClick={() => void copy()}>
          Copiar
        </Button>
        <Button variant="secondary" leftIcon={<Download size={16} />} onClick={download}>
          Descargar .txt
        </Button>
      </div>
    </>
  );
}
