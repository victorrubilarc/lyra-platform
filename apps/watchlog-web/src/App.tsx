import { useQuery } from "@tanstack/react-query";
import { healthStatusSchema, type HealthStatus } from "@lyra/contracts";
import { Activity, Boxes, Database, Layers, ShieldCheck, Zap } from "lucide-react";

async function fetchHealth(): Promise<HealthStatus> {
  const res = await fetch("/api/health/ready");
  const json: unknown = await res.json();
  return healthStatusSchema.parse(json);
}

function ApiStatus() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
    retry: false,
    refetchInterval: 10_000,
  });

  let color = "var(--color-warning)";
  let label = "Conectando con el API…";
  if (isError) {
    color = "var(--color-error)";
    label = "API no disponible — ¿levantaste `pnpm dev`?";
  } else if (data) {
    const ok = data.status === "ok";
    color = ok ? "var(--color-success)" : "var(--color-warning)";
    label = ok
      ? `API operativa · v${data.version}`
      : `API arriba, base de datos no lista (${data.status})`;
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        borderRadius: "var(--radius-full)",
        background: "rgba(255,255,255,.05)",
        border: "var(--glass-border)",
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <span
        style={{
          width: 9,
          height: 9,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 10px ${color}`,
          opacity: isLoading ? 0.5 : 1,
        }}
      />
      {label}
    </div>
  );
}

const PIECES = [
  { icon: ShieldCheck, label: "Seguridad RBAC/ABAC", phase: "Fase 1" },
  { icon: Layers, label: "Plantillas & Form Builder", phase: "Fase 2" },
  { icon: Database, label: "Orígenes de datos", phase: "Fase 3" },
  { icon: Activity, label: "Motor de incidencias", phase: "Fase 4" },
  { icon: Boxes, label: "Cambio de turno + IA", phase: "Fase 5" },
];

export function App() {
  return (
    <main
      style={{
        maxWidth: 960,
        margin: "0 auto",
        padding: "80px 32px",
        fontFamily: "var(--font-body)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: "var(--gradient-brand)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Zap size={26} color="#fff" />
        </div>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-brand)",
              fontWeight: 800,
              fontSize: 30,
              margin: 0,
            }}
          >
            Lyra{" "}
            <span
              style={{
                background: "linear-gradient(90deg,#a5b4fc,#67e8f9)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              WatchLog
            </span>
          </h1>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 1,
              color: "var(--color-text-secondary)",
              textTransform: "uppercase",
            }}
          >
            Bitácora operacional inteligente
          </div>
        </div>
      </div>

      <p style={{ color: "var(--color-text-secondary)", fontSize: 15, marginBottom: 20 }}>
        Andamiaje de la plataforma listo —{" "}
        <strong style={{ color: "var(--color-text-primary)" }}>Fase 0 · Cimientos</strong>. Monorepo,
        Design System, contratos compartidos y backend con healthchecks operativos.
      </p>

      <ApiStatus />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 14,
          marginTop: 36,
        }}
      >
        {PIECES.map(({ icon: Icon, label, phase }) => (
          <div
            key={label}
            style={{
              background: "var(--glass-bg)",
              border: "var(--glass-border)",
              borderRadius: "var(--radius-xl)",
              backdropFilter: "var(--glass-blur)",
              padding: 18,
            }}
          >
            <Icon size={22} color="var(--color-accent-primary)" />
            <div style={{ fontWeight: 600, fontSize: 14, marginTop: 10 }}>{label}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
              {phase}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
