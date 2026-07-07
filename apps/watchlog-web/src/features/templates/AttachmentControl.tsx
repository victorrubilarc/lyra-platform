import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Camera, Download, ExternalLink, Eye, FileText, Image as ImageIcon, Loader2, Mic, PenLine, Square, Trash2, Upload, X } from "lucide-react";
import { Button } from "@lyra/ui";
import {
  effectiveAccept,
  maxAttachmentBytes,
  maxAttachmentCount,
  type AttachmentFieldConfig,
  type FileDescriptor,
} from "@lyra/contracts";
import { formatFileSize } from "../../lib/format.js";
import styles from "./AttachmentControl.module.css";

/** Handlers de subida/descarga ligados a una entrada+sección+campo por el llamador. */
export interface AttachmentHandlers {
  upload: (file: File) => Promise<FileDescriptor>;
  /**
   * Object URL del adjunto (descarga PROXIED por la API con fetch autenticado —
   * el navegador no toca el storage). `inline` = para PREVISUALIZAR. El widget
   * revoca la URL cuando termina de usarla.
   */
  getDownloadUrl: (descriptorId: string, inline?: boolean) => Promise<{ url: string }>;
}

function descriptors(value: unknown): FileDescriptor[] {
  return Array.isArray(value) ? (value as FileDescriptor[]).filter((d) => d && typeof d.id === "string") : [];
}

function kindIcon(kind: string, contentType: string) {
  if (contentType.startsWith("image/")) return <ImageIcon size={16} />;
  if (contentType.startsWith("audio/") || kind === "audio") return <Mic size={16} />;
  if (kind === "sketch") return <PenLine size={16} />;
  return <FileText size={16} />;
}

/**
 * Control de ADJUNTOS / EVIDENCIA (Ola 3) — foto/archivo/nota de voz/croquis sobre
 * el render ÚNICO. La subida es PROXIED por la API (los `handlers` la ligan a
 * entrada+sección+campo); el valor es un descriptor[]. En modo `readOnly` (visor)
 * solo lista + descarga; sin `handlers` (vista previa del builder) muestra el
 * marcador "se sube al llenar". Premium, tokens, áreas táctiles 44px.
 */
export function AttachmentControl({
  field,
  value,
  onChange,
  readOnly,
  handlers,
}: {
  field: { config: Record<string, unknown>; label: string };
  value: unknown;
  onChange: (value: unknown) => void;
  readOnly?: boolean;
  handlers?: AttachmentHandlers;
}) {
  const { t } = useTranslation();
  const cfg = field.config as AttachmentFieldConfig;
  const kind = cfg.kind ?? "file";
  const items = descriptors(value);
  const maxCount = maxAttachmentCount(cfg);
  const accept = effectiveAccept(cfg).join(",");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sketchOpen, setSketchOpen] = useState(false);
  const [preview, setPreview] = useState<FileDescriptor | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const canAdd = !readOnly && !!handlers && items.length < maxCount;

  const doUpload = useCallback(
    async (file: File) => {
      if (!handlers) return;
      setError(null);
      if (file.size > maxAttachmentBytes(cfg)) {
        setError(t("templates.attachment.tooLarge", { max: formatFileSize(maxAttachmentBytes(cfg)) }));
        return;
      }
      setBusy(true);
      try {
        const desc = await handlers.upload(file);
        const next = cfg.multiple ? [...items, desc] : [desc];
        onChange(next.slice(0, maxCount));
      } catch (e) {
        setError(e instanceof Error ? e.message : t("templates.attachment.uploadError"));
      } finally {
        setBusy(false);
      }
    },
    [handlers, cfg, items, maxCount, onChange, t],
  );

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-subir el mismo archivo
    if (file) void doUpload(file);
  };

  const remove = (id: string) => onChange(items.filter((d) => d.id !== id));

  const download = async (d: FileDescriptor) => {
    if (!handlers) return;
    try {
      const { url } = await handlers.getDownloadUrl(d.id);
      // Ancla con `download`: conserva el nombre real del archivo (un object URL
      // abierto con window.open descargaría con un nombre aleatorio).
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = d.filename;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError(t("templates.attachment.downloadError"));
    }
  };

  return (
    <div className={styles.root}>
      {items.length > 0 && (
        <ul className={styles.list}>
          {items.map((d) => (
            <li key={d.id} className={styles.item}>
              {handlers ? (
                <button type="button" className={styles.itemOpen} onClick={() => setPreview(d)} title={t("templates.attachment.view")}>
                  <span className={styles.itemIcon}>{kindIcon(kind, d.contentType)}</span>
                  <span className={styles.itemMeta}>
                    <span className={styles.itemName} title={d.filename}>
                      {d.filename}
                    </span>
                    <span className={styles.itemSize}>{formatFileSize(d.size)}</span>
                  </span>
                </button>
              ) : (
                <span className={styles.itemOpen}>
                  <span className={styles.itemIcon}>{kindIcon(kind, d.contentType)}</span>
                  <span className={styles.itemMeta}>
                    <span className={styles.itemName} title={d.filename}>
                      {d.filename}
                    </span>
                    <span className={styles.itemSize}>{formatFileSize(d.size)}</span>
                  </span>
                </span>
              )}
              {handlers && (
                <button type="button" className={styles.itemBtn} onClick={() => setPreview(d)} title={t("templates.attachment.view")}>
                  <Eye size={15} />
                </button>
              )}
              {handlers && (
                <button type="button" className={styles.itemBtn} onClick={() => void download(d)} title={t("templates.attachment.download")}>
                  <Download size={15} />
                </button>
              )}
              {!readOnly && (
                <button type="button" className={styles.itemBtn} data-danger onClick={() => remove(d.id)} title={t("common.delete")}>
                  <Trash2 size={15} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Vista previa del builder (sin handlers, editable): marcador de qué se subirá. */}
      {!readOnly && !handlers && (
        <div className={styles.placeholder}>
          {kindIcon(kind, "")} {t(`templates.attachment.kindHint.${kind}`)}
          <span className={styles.placeholderHint}>{t("templates.attachment.uploadOnFill")}</span>
        </div>
      )}

      {canAdd && (
        <div className={styles.actions}>
          {(kind === "file" || kind === "photo") && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={accept || undefined}
                capture={kind === "photo" && cfg.capture ? "environment" : undefined}
                hidden
                onChange={onFileInput}
              />
              <Button variant="secondary" disabled={busy} onClick={() => fileInputRef.current?.click()}>
                {busy ? <Loader2 size={15} className={styles.spin} /> : kind === "photo" ? <Camera size={15} /> : <Upload size={15} />}
                {kind === "photo" ? t("templates.attachment.capture") : t("templates.attachment.upload")}
              </Button>
            </>
          )}
          {kind === "audio" && <AudioRecorder busy={busy} onRecorded={(f) => void doUpload(f)} accept={accept} onFile={onFileInput} fileRef={fileInputRef} />}
          {kind === "sketch" && (
            <Button variant="secondary" disabled={busy} onClick={() => setSketchOpen(true)}>
              {busy ? <Loader2 size={15} className={styles.spin} /> : <PenLine size={15} />}
              {t("templates.attachment.draw")}
            </Button>
          )}
          {cfg.multiple && (
            <span className={styles.count}>
              {items.length}/{maxCount}
            </span>
          )}
        </div>
      )}

      {!readOnly && handlers && items.length >= maxCount && cfg.multiple && (
        <div className={styles.full}>{t("templates.attachment.maxReached", { max: maxCount })}</div>
      )}
      {readOnly && items.length === 0 && <div className={styles.empty}>—</div>}
      {error && <div className={styles.error}>{error}</div>}

      {sketchOpen && (
        <SketchModal
          title={field.label}
          onCancel={() => setSketchOpen(false)}
          onSave={(file) => {
            setSketchOpen(false);
            void doUpload(file);
          }}
        />
      )}

      {preview && handlers && (
        <PreviewModal descriptor={preview} getUrl={handlers.getDownloadUrl} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}

/**
 * Vista previa de un adjunto: obtiene el contenido PROXIED por la API (fetch
 * autenticado + ABAC → object URL) y lo muestra según el tipo (imagen / audio /
 * video / PDF / otros). El object URL se revoca al cerrar el modal.
 */
function PreviewModal({
  descriptor,
  getUrl,
  onClose,
}: {
  descriptor: FileDescriptor;
  getUrl: (id: string, inline?: boolean) => Promise<{ url: string }>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const ct = descriptor.contentType || "";

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    getUrl(descriptor.id, true)
      .then(({ url }) => {
        objectUrl = url;
        if (alive) setUrl(url);
        else URL.revokeObjectURL(url);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [descriptor.id, getUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const body = () => {
    if (failed) return <div className={styles.previewMsg}>{t("templates.attachment.downloadError")}</div>;
    if (!url) return <div className={styles.previewMsg}><Loader2 size={20} className={styles.spin} /> {t("common.loading")}</div>;
    if (ct.startsWith("image/")) return <img src={url} alt={descriptor.filename} className={styles.previewImage} />;
    if (ct.startsWith("audio/")) return <audio src={url} controls autoPlay className={styles.previewAudio} />;
    if (ct.startsWith("video/")) return <video src={url} controls className={styles.previewVideo} />;
    if (ct === "application/pdf") return <iframe src={url} title={descriptor.filename} className={styles.previewFrame} />;
    return (
      <div className={styles.previewMsg}>
        <FileText size={28} />
        <span>{t("templates.attachment.previewUnsupported")}</span>
      </div>
    );
  };

  return (
    <div className={styles.previewOverlay} role="dialog" aria-modal aria-label={descriptor.filename} onClick={onClose}>
      <div className={styles.previewCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.previewHead}>
          <span className={styles.previewName} title={descriptor.filename}>{descriptor.filename}</span>
          <span className={styles.previewSize}>{formatFileSize(descriptor.size)}</span>
          <span style={{ flex: 1 }} />
          {url && (
            <a className={styles.previewIconLink} href={url} target="_blank" rel="noreferrer noopener" title={t("templates.attachment.openInTab")}>
              <ExternalLink size={16} />
            </a>
          )}
          <button type="button" className={styles.previewIconBtn} onClick={onClose} title={t("common.close")}>
            <X size={16} />
          </button>
        </div>
        <div className={styles.previewBody}>{body()}</div>
      </div>
    </div>
  );
}

/** Grabadora de nota de voz (MediaRecorder) + fallback de subida de archivo. */
function AudioRecorder({
  busy,
  onRecorded,
  accept,
  onFile,
  fileRef,
}: {
  busy: boolean;
  onRecorded: (file: File) => void;
  accept: string;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { t } = useTranslation();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const supported = typeof navigator !== "undefined" && !!navigator.mediaDevices && typeof MediaRecorder !== "undefined";

  const stop = useCallback(() => {
    recorderRef.current?.stop();
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((tr) => tr.stop());
        setRecording(false);
        setElapsed(0);
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes("ogg") ? "ogg" : type.includes("mp4") ? "m4a" : "webm";
        onRecorded(new File([blob], `nota-de-voz-${Date.now()}.${ext}`, { type }));
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      // Sin permiso/soporte: el usuario puede subir un archivo de audio.
    }
  };

  return (
    <>
      <input ref={fileRef} type="file" accept={accept || "audio/*"} hidden onChange={onFile} />
      {supported && !recording && (
        <Button variant="secondary" disabled={busy} onClick={() => void start()}>
          {busy ? <Loader2 size={15} className={styles.spin} /> : <Mic size={15} />}
          {t("templates.attachment.record")}
        </Button>
      )}
      {supported && recording && (
        <Button variant="danger" onClick={stop}>
          <Square size={14} /> {t("templates.attachment.stop")} · {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
        </Button>
      )}
      <Button variant="secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
        <Upload size={15} /> {t("templates.attachment.uploadAudio")}
      </Button>
    </>
  );
}

/** Lienzo de croquis (canvas → PNG). Trazo con puntero (mouse/touch/lápiz). */
function SketchModal({ title, onCancel, onSave }: { title: string; onCancel: () => void; onSave: (file: File) => void }) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#0c1124";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#e7eaf3";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * e.currentTarget.width, y: ((e.clientY - rect.top) / rect.height) * e.currentTarget.height };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const up = () => {
    drawing.current = false;
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = "#0c1124";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };
  const save = () => {
    canvasRef.current?.toBlob((blob) => {
      if (blob) onSave(new File([blob], `croquis-${Date.now()}.png`, { type: "image/png" }));
    }, "image/png");
  };

  return (
    <div className={styles.sketchOverlay} role="dialog" aria-modal aria-label={title}>
      <div className={styles.sketchCard}>
        <div className={styles.sketchHead}>{t("templates.attachment.sketchTitle")}</div>
        <canvas
          ref={canvasRef}
          width={640}
          height={400}
          className={styles.sketchCanvas}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
        />
        <div className={styles.sketchActions}>
          <Button variant="secondary" onClick={clear}>
            {t("templates.attachment.sketchClear")}
          </Button>
          <span style={{ flex: 1 }} />
          <Button variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={save}>
            {t("templates.attachment.sketchSave")}
          </Button>
        </div>
      </div>
    </div>
  );
}
