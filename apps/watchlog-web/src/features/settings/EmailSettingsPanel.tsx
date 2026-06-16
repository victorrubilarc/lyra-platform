import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Info, Mail, Send, Server, ShieldCheck, PlugZap } from "lucide-react";
import { Button, Card, Input, Select, Toggle, useToast } from "@lyra/ui";
import type { EmailConfigDto, UpdateEmailConfigRequest } from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { fetchEmailConfig, saveEmailConfig, testEmailConfig, verifyEmailConfig } from "./email-api.js";
import styles from "./EmailSettingsPanel.module.css";

type Form = Omit<UpdateEmailConfigRequest, "password"> & { password: string };

const BLANK: Form = {
  enabled: false, service: "", host: "", port: 587, secure: false, user: "", password: "", fromName: "", fromEmail: "",
};

/** Presets de proveedor: rellenan host/puerto/TLS y muestran la pista de credenciales. */
interface Preset {
  id: string;
  label: string;
  service?: string;
  host?: string;
  port?: number;
  secure?: boolean;
  hintKey?: string;
}
const PRESETS: Preset[] = [
  { id: "custom", label: "Personalizado / otro" },
  { id: "gmail", label: "Gmail / Google Workspace", service: "gmail", hintKey: "gmail" },
  { id: "m365", label: "Microsoft 365 / Outlook", service: "outlook365", hintKey: "m365" },
  { id: "ses", label: "Amazon SES", host: "email-smtp.us-east-1.amazonaws.com", port: 587, secure: false, hintKey: "ses" },
  { id: "sendgrid", label: "SendGrid", host: "smtp.sendgrid.net", port: 587, secure: false, hintKey: "sendgrid" },
  { id: "mailpit", label: "Mailpit (desarrollo)", host: "mailpit", port: 1025, secure: false, hintKey: "mailpit" },
];

export function EmailSettingsPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState<Form>(BLANK);
  const [meta, setMeta] = useState<Pick<EmailConfigDto, "passwordSet" | "source">>({ passwordSet: false, source: "env" });
  const [provider, setProvider] = useState("custom");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<"" | "verify" | "test">("");
  const [testTo, setTestTo] = useState("");

  useEffect(() => {
    fetchEmailConfig()
      .then((c) => {
        setForm({ ...c, password: "" });
        setMeta({ passwordSet: c.passwordSet, source: c.source });
        setProvider(PRESETS.find((p) => (p.service && p.service === c.service) || (p.host && p.host === c.host))?.id ?? "custom");
      })
      .catch(() => toast.error(t("settings.email.loadError")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  function applyPreset(id: string) {
    setProvider(id);
    const p = PRESETS.find((x) => x.id === id);
    if (!p || p.id === "custom") return;
    setForm((f) => ({ ...f, service: p.service ?? "", host: p.host ?? (p.service ? "" : f.host), port: p.port ?? f.port, secure: p.secure ?? f.secure, enabled: true }));
  }

  function payload(): UpdateEmailConfigRequest {
    return {
      enabled: form.enabled, service: form.service || "", host: form.host || "", port: Number(form.port) || 587, secure: form.secure,
      user: form.user || "", password: form.password || undefined, fromName: form.fromName || "", fromEmail: form.fromEmail || "",
    };
  }

  async function save() {
    if (!form.service?.trim() && !form.host?.trim()) { toast.error(t("settings.email.needHost")); return; }
    setSaving(true);
    try {
      const saved = await saveEmailConfig(payload());
      setForm({ ...saved, password: "" });
      setMeta({ passwordSet: saved.passwordSet, source: saved.source });
      toast.success(t("settings.email.saved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally { setSaving(false); }
  }

  async function verify() {
    setBusy("verify");
    try {
      const res = await verifyEmailConfig(payload());
      if (res.ok) toast.success(t("settings.email.verifyOk"));
      else toast.error(res.error || t("settings.email.verifyFail"));
    } catch { toast.error(t("settings.email.verifyFail")); }
    finally { setBusy(""); }
  }

  async function sendTest() {
    if (!testTo.trim()) { toast.error(t("settings.email.needTestTo")); return; }
    setBusy("test");
    try {
      const res = await testEmailConfig({ ...payload(), to: testTo.trim() });
      if (res.ok) toast.success(t("settings.email.testOk", { to: testTo }));
      else toast.error(res.error || t("settings.email.testFail"));
    } catch { toast.error(t("settings.email.testFail")); }
    finally { setBusy(""); }
  }

  if (loading) return <div className={styles.note}>{t("common.loading")}</div>;
  const serviceMode = !!form.service?.trim();
  const hint = PRESETS.find((p) => p.id === provider)?.hintKey;

  return (
    <div className={styles.panel}>
      <div className={styles.banner}>
        <Info size={18} className={styles.bannerIcon} />
        <span>
          {t("settings.email.intro")}{" "}
          <span className={styles.source}>
            {t("settings.email.sourceLabel")}:{" "}
            <strong className={meta.source === "db" ? styles.sourceDb : ""}>
              {meta.source === "db" ? t("settings.email.sourceDb") : t("settings.email.sourceEnv")}
            </strong>
          </span>
        </span>
      </div>

      <Card className={styles.card}>
        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <span className={styles.toggleName}><ShieldCheck size={15} /> {t("settings.email.enabled")}</span>
            <span className={styles.note}>{t("settings.email.enabledDesc")}</span>
          </div>
          <Toggle checked={form.enabled} onChange={(v) => set("enabled", v)} aria-label={t("settings.email.enabled")} />
        </div>
      </Card>

      <Card className={styles.card}>
        <div className={styles.cardTitle}><Server size={16} /> {t("settings.email.server")}</div>

        <div className={styles.row}>
          <label className={styles.label}>{t("settings.email.provider")}</label>
          <Select value={provider} onChange={(e) => applyPreset(e.target.value)}>
            {PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select>
          {hint && <p className={styles.hint}><Info size={14} className={styles.hintIcon} /> {t(`settings.email.hint.${hint}`)}</p>}
        </div>

        <div className={styles.row}>
          <label className={styles.label}>{t("settings.email.service")} <span className={styles.labelNote}>({t("settings.email.serviceNote")})</span></label>
          <Input value={form.service ?? ""} onChange={(e) => set("service", e.target.value)} placeholder="gmail, outlook365, …" autoCapitalize="off" />
          <p className={styles.note}>{t("settings.email.serviceHelp")}</p>
        </div>

        <div className={serviceMode ? styles.dim : undefined}>
          <div className={styles.grid3}>
            <div className={styles.row}>
              <label className={styles.label}>{t("settings.email.host")}</label>
              <Input value={form.host ?? ""} onChange={(e) => set("host", e.target.value)} placeholder="smtp.tuempresa.cl" />
            </div>
            <div className={styles.row}>
              <label className={styles.label}>{t("settings.email.port")}</label>
              <Input type="number" value={String(form.port)} onChange={(e) => set("port", Number(e.target.value))} placeholder="587" />
            </div>
          </div>
          <label className={styles.hint} style={{ cursor: "pointer", marginTop: 12 }}>
            <input type="checkbox" checked={form.secure} onChange={(e) => set("secure", e.target.checked)} style={{ width: 16, height: 16 }} />
            <span>{t("settings.email.secure")}</span>
          </label>
        </div>

        <div className={styles.grid2}>
          <div className={styles.row}>
            <label className={styles.label}>{t("settings.email.user")}</label>
            <Input value={form.user ?? ""} onChange={(e) => set("user", e.target.value)} placeholder={t("settings.email.userPlaceholder")} autoComplete="off" />
          </div>
          <div className={styles.row}>
            <label className={styles.label}>
              {t("settings.email.password")} {meta.passwordSet && <span className={styles.ok}>· {t("settings.email.configured")}</span>}
            </label>
            <Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)}
              placeholder={meta.passwordSet ? "•••••••• (sin cambios)" : t("settings.email.password")} autoComplete="new-password" />
          </div>
        </div>
        <p className={styles.note}>{t("settings.email.passwordNote")}</p>
      </Card>

      <Card className={styles.card}>
        <div className={styles.cardTitle}><Mail size={16} /> {t("settings.email.sender")}</div>
        <div className={styles.grid2}>
          <div className={styles.row}>
            <label className={styles.label}>{t("settings.email.fromName")}</label>
            <Input value={form.fromName ?? ""} onChange={(e) => set("fromName", e.target.value)} placeholder="Lyra WatchLog" />
          </div>
          <div className={styles.row}>
            <label className={styles.label}>{t("settings.email.fromEmail")}</label>
            <Input value={form.fromEmail ?? ""} onChange={(e) => set("fromEmail", e.target.value)} placeholder="no-reply@tuempresa.cl" />
          </div>
        </div>
        <p className={styles.note}>{t("settings.email.fromNote")}</p>
      </Card>

      <Card className={styles.card}>
        <div className={styles.cardTitle}><Send size={16} /> {t("settings.email.testTitle")}</div>
        <div className={styles.testRow}>
          <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="tu-correo@ejemplo.cl" />
          <Button variant="secondary" onClick={verify} loading={busy === "verify"} leftIcon={<PlugZap size={16} />}>
            {t("settings.email.verify")}
          </Button>
          <Button variant="secondary" onClick={sendTest} loading={busy === "test"} leftIcon={<Send size={16} />}>
            {t("settings.email.sendTest")}
          </Button>
        </div>
        <p className={styles.note}>{t("settings.email.testNote")}</p>
      </Card>

      <div className={styles.actions}>
        <Button variant="primary" onClick={save} loading={saving}>{t("settings.email.save")}</Button>
      </div>
    </div>
  );
}
