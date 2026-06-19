import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BrainCircuit, CheckCircle2, Cpu, Info, KeyRound, PlugZap, ShieldCheck, XCircle } from "lucide-react";
import { Button, Card, Input, Select, Toggle, useToast } from "@lyra/ui";
import {
  aiProviderNeedsBaseUrl,
  aiProviderUsesApiKey,
  DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
  type AiConfigDto,
  type AiProvider,
  type AiTestResult,
  type UpdateAiConfigRequest,
} from "@lyra/contracts";
import { ApiError } from "../../lib/api-client.js";
import { fetchAiConfig, saveAiConfig, testAiConfig } from "./ai-api.js";
import styles from "./EmailSettingsPanel.module.css";

type Form = {
  enabled: boolean;
  provider: AiProvider;
  model: string;
  baseUrl: string;
  apiKey: string;
};

const BLANK: Form = { enabled: false, provider: "none", model: "", baseUrl: "", apiKey: "" };

export function AiSettingsPanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState<Form>(BLANK);
  const [meta, setMeta] = useState<Pick<AiConfigDto, "keySet" | "source">>({ keySet: false, source: "env" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<AiTestResult | null>(null);

  useEffect(() => {
    fetchAiConfig()
      .then((c) => {
        setForm({ enabled: c.enabled, provider: c.provider, model: c.model, baseUrl: c.baseUrl, apiKey: "" });
        setMeta({ keySet: c.keySet, source: c.source });
      })
      .catch(() => toast.error(t("settings.ai.loadError")))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  function setProvider(provider: AiProvider) {
    setForm((f) => ({
      ...f,
      provider,
      // Al elegir un proveedor real, sugiere activar; al volver a "none", apaga.
      enabled: provider === "none" ? false : f.enabled,
      baseUrl: provider === "openai-compatible" && !f.baseUrl ? DEFAULT_OPENAI_COMPATIBLE_BASE_URL : f.baseUrl,
    }));
    setResult(null);
  }

  function payload(): UpdateAiConfigRequest {
    return {
      enabled: form.enabled,
      provider: form.provider,
      model: form.model || "",
      baseUrl: form.baseUrl || "",
      apiKey: form.apiKey || undefined,
    };
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await saveAiConfig(payload());
      setForm({ enabled: saved.enabled, provider: saved.provider, model: saved.model, baseUrl: saved.baseUrl, apiKey: "" });
      setMeta({ keySet: saved.keySet, source: saved.source });
      toast.success(t("settings.ai.saved"));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("common.errorGeneric"));
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const res = await testAiConfig(payload());
      setResult(res);
      if (res.ok) toast.success(t("settings.ai.testOk"));
      else toast.error(res.error || t("settings.ai.testFail"));
    } catch (err) {
      const error = err instanceof ApiError ? err.message : t("settings.ai.testFail");
      setResult({ ok: false, text: null, provider: form.provider, model: null, latencyMs: null, error });
      toast.error(error);
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <div className={styles.note}>{t("common.loading")}</div>;

  const isNone = form.provider === "none";
  const needsBaseUrl = aiProviderNeedsBaseUrl(form.provider);
  const usesKey = aiProviderUsesApiKey(form.provider);

  return (
    <div className={styles.panel}>
      <div className={styles.banner}>
        <Info size={18} className={styles.bannerIcon} />
        <span>
          {t("settings.ai.intro")}{" "}
          <span className={styles.source}>
            {t("settings.ai.sourceLabel")}:{" "}
            <strong className={meta.source === "db" ? styles.sourceDb : ""}>
              {meta.source === "db" ? t("settings.ai.sourceDb") : t("settings.ai.sourceEnv")}
            </strong>
          </span>
        </span>
      </div>

      <Card className={styles.card}>
        <div className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <span className={styles.toggleName}>
              <ShieldCheck size={15} /> {t("settings.ai.enabled")}
            </span>
            <span className={styles.note}>{t("settings.ai.enabledDesc")}</span>
          </div>
          <Toggle
            checked={form.enabled}
            disabled={isNone}
            onChange={(v) => set("enabled", v)}
            aria-label={t("settings.ai.enabled")}
          />
        </div>
      </Card>

      <Card className={styles.card}>
        <div className={styles.cardTitle}>
          <BrainCircuit size={16} /> {t("settings.ai.provider")}
        </div>

        <div className={styles.row}>
          <label className={styles.label}>{t("settings.ai.providerLabel")}</label>
          <Select value={form.provider} onChange={(e) => setProvider(e.target.value as AiProvider)}>
            <option value="none">{t("settings.ai.providerNone")}</option>
            <option value="anthropic">{t("settings.ai.providerAnthropic")}</option>
            <option value="openai-compatible">{t("settings.ai.providerLocal")}</option>
          </Select>
          <p className={styles.note}>{t(`settings.ai.providerHint.${form.provider}`)}</p>
        </div>

        {!isNone && (
          <>
            <div className={styles.row}>
              <label className={styles.label}>{t("settings.ai.model")}</label>
              <Input
                value={form.model}
                onChange={(e) => set("model", e.target.value)}
                placeholder={form.provider === "anthropic" ? "claude-opus-4-8" : "qwen2.5:7b-instruct"}
                autoCapitalize="off"
              />
              <p className={styles.note}>{t("settings.ai.modelHelp")}</p>
            </div>

            {needsBaseUrl && (
              <div className={styles.row}>
                <label className={styles.label}>
                  <Cpu size={14} /> {t("settings.ai.baseUrl")}
                </label>
                <Input
                  value={form.baseUrl}
                  onChange={(e) => set("baseUrl", e.target.value)}
                  placeholder={DEFAULT_OPENAI_COMPATIBLE_BASE_URL}
                  autoCapitalize="off"
                />
                <p className={styles.note}>{t("settings.ai.baseUrlHelp")}</p>
              </div>
            )}

            {usesKey && (
              <div className={styles.row}>
                <label className={styles.label}>
                  <KeyRound size={14} /> {t("settings.ai.apiKey")}{" "}
                  {meta.keySet && <span className={styles.ok}>· {t("settings.ai.configured")}</span>}
                </label>
                <Input
                  type="password"
                  value={form.apiKey}
                  onChange={(e) => set("apiKey", e.target.value)}
                  placeholder={meta.keySet ? "•••••••• (sin cambios)" : t("settings.ai.apiKeyPlaceholder")}
                  autoComplete="new-password"
                />
                <p className={styles.note}>{t("settings.ai.apiKeyNote")}</p>
              </div>
            )}
          </>
        )}
      </Card>

      {!isNone && (
        <Card className={styles.card}>
          <div className={styles.cardTitle}>
            <PlugZap size={16} /> {t("settings.ai.testTitle")}
          </div>
          <div className={styles.testRow}>
            <Button variant="secondary" onClick={test} loading={testing} leftIcon={<PlugZap size={16} />}>
              {t("settings.ai.test")}
            </Button>
          </div>
          {result && (
            <div className={result.ok ? styles.banner : styles.banner} style={{ marginTop: 12 }}>
              {result.ok ? (
                <CheckCircle2 size={18} className={styles.bannerIcon} />
              ) : (
                <XCircle size={18} className={styles.bannerIcon} />
              )}
              <span>
                {result.ok ? (
                  <>
                    <strong>{t("settings.ai.testOk")}</strong>
                    {result.model ? ` · ${result.model}` : ""}
                    {typeof result.latencyMs === "number" ? ` · ${result.latencyMs} ms` : ""}
                    {result.text ? <em style={{ display: "block", marginTop: 6, opacity: 0.85 }}>“{result.text}”</em> : null}
                  </>
                ) : (
                  <>
                    <strong>{t("settings.ai.testFail")}</strong>
                    {result.error ? <span style={{ display: "block", marginTop: 4 }}>{result.error}</span> : null}
                  </>
                )}
              </span>
            </div>
          )}
          <p className={styles.note}>{t("settings.ai.testNote")}</p>
        </Card>
      )}

      <div className={styles.actions}>
        <Button variant="primary" onClick={save} loading={saving}>
          {t("settings.ai.save")}
        </Button>
      </div>
    </div>
  );
}
