import type {
  Column,
  Content,
  ContentColumns,
  ContentTable,
  TableCell,
  TDocumentDefinitions,
} from "pdfmake/interfaces";
import type {
  HandoverGeneralStatus,
  ShiftHandoverDetail,
  ShiftHandoverItem,
} from "@lyra/contracts";

/**
 * Armado del **acta de entrega de turno** (Fase 5 — Slice 4), PURO y determinista:
 * recibe un view-model autocontenido (el detalle con el cockpit CONGELADO + ruta del
 * nodo + hash de integridad) y produce la definición de documento de pdfmake. No hace
 * I/O ni toca la BD ⇒ dos exportaciones de la misma entrega firmada son idénticas
 * (AC-PDF-1). El render a bytes vive en `acta-renderer.ts`.
 *
 * Identidad Lyra (CLAUDE.md): documento en **modo claro premium** (fondo blanco,
 * legible impreso — AC-PDF-6), tinta oscura de marca, acentos índigo/cian por tokens,
 * y el **gradiente de marca reservado a la banda del encabezado** (énfasis máximo, no
 * fondo de pantalla completa). Tipografía Sora (títulos) + Inter (cuerpo), sin mezclar
 * otras familias.
 */

// === Tokens de marca para impresión ==========================================
// El modo oscuro es la identidad en pantalla; el acta se IMPRIME, así que usamos la
// variante clara (válida por CLAUDE.md) con los mismos acentos de marca por token.
const C = {
  ink: "#0C1124", // titulares (superficie profunda de marca como tinta)
  body: "#1F2738", // cuerpo
  muted: "#6B7280", // texto secundario / etiquetas
  hairline: "#E5E7EB", // bordes sutiles
  zebra: "#F7F8FB", // fila alterna muy tenue
  accent: "#6366F1", // índigo (acción/énfasis)
  accent2: "#06B6D4", // cian (información)
  bandFrom: "#6366F1",
  bandTo: "#06B6D4",
  onBand: "#FFFFFF",
  onBandSoft: "#E7EAF3",
  success: "#22C55E",
  warning: "#F59E0B",
  error: "#EF4444",
} as const;

const SEVERITY_COLORS = ["#22C55E", "#22C55E", "#84CC16", "#EAB308", "#F97316", "#EF4444"] as const;
const PAGE_WIDTH = 595.28; // A4 portrait (pt)
const BAND_HEIGHT = 92;

// === Entrada ==================================================================

export interface ActaInput {
  detail: ShiftHandoverDetail;
  /** Ruta del nodo resuelta a nombres legibles ("Planta › Área › Línea"). */
  nodePathLabel: string;
  /** Hash SHA-256 (hex) del snapshot canónico + firmas (integridad/verificación). */
  integrityHash: string;
  /** Instante de exportación (ISO) y quién la solicitó (auditoría visible). */
  exportedAt: string;
  exportedByName: string;
}

// === Helpers de formato (es-CL + TZ del nodo) ================================

function fmtDateTime(iso: string | null | undefined, tz: string): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: tz,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

function fmtDay(day: string): string {
  // operationalDay viene "YYYY-MM-DD"; lo mostramos dd-mm-yyyy sin convertir TZ.
  const [y, m, d] = day.split("-");
  return y && m && d ? `${d}-${m}-${y}` : day;
}

const GENERAL_STATUS_LABEL: Record<HandoverGeneralStatus, string> = {
  OPERATIONAL: "Operativo",
  OPERATIONAL_WITH_OBSERVATIONS: "Operativo con observaciones",
  STOPPED_MAINTENANCE: "Detenido por mantención",
  STOPPED_FAILURE: "Detenido por falla",
};

const GENERAL_STATUS_COLOR: Record<HandoverGeneralStatus, string> = {
  OPERATIONAL: C.success,
  OPERATIONAL_WITH_OBSERVATIONS: C.warning,
  STOPPED_MAINTENANCE: C.muted,
  STOPPED_FAILURE: C.error,
};

function generalStatusLabel(s: HandoverGeneralStatus | null | undefined): string {
  return s ? GENERAL_STATUS_LABEL[s] : "—";
}

function providerLabel(provider: string | null | undefined): { text: string; ai: boolean } {
  switch (provider) {
    case "anthropic":
      return { text: "Generado por IA (Anthropic) · revisado y firmado por una persona", ai: true };
    case "openai-compatible":
      return { text: "Generado por IA (modelo local/compatible) · revisado y firmado por una persona", ai: true };
    case "none":
    case null:
    case undefined:
      return { text: "Resumen determinista del sistema", ai: false };
    default:
      return { text: `Generado por IA (${provider}) · revisado y firmado por una persona`, ai: true };
  }
}

function methodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  const m = method.toUpperCase();
  if (m.includes("MFA")) return "Contraseña + MFA";
  if (m.includes("PASSWORD")) return "Contraseña";
  return method;
}

// === Tabla utilitaria =========================================================

const hairlineLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0,
  hLineColor: () => C.hairline,
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 4,
  paddingBottom: () => 4,
  fillColor: (rowIndex: number) => (rowIndex === 0 ? "#EEF0FB" : rowIndex % 2 === 0 ? C.zebra : null),
};

function th(text: string): TableCell {
  return { text, style: "th" };
}

function sectionTable(widths: (string | number)[], header: string[], rows: TableCell[][]): ContentTable {
  return {
    table: {
      headerRows: 1,
      widths,
      body: [header.map(th), ...rows],
    },
    layout: hairlineLayout,
    style: "cell",
    margin: [0, 2, 0, 10],
  };
}

function emptyNote(text: string): Content {
  return { text, style: "empty", margin: [0, 2, 0, 10] };
}

function sectionHeading(title: string, count: number): Content {
  return {
    columns: [
      { text: title, style: "h2", width: "*" },
      { text: String(count), style: "countBadge", width: "auto" },
    ],
    columnGap: 8,
    margin: [0, 6, 0, 2],
  };
}

// === Bloques del documento ====================================================

/** Banda de marca (gradiente Lyra) como SVG; solo en la página 1 (énfasis máximo). */
function brandBandSvg(width: number): string {
  return `<svg width="${width}" height="${BAND_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="lyra" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${C.bandFrom}"/>
        <stop offset="1" stop-color="${C.bandTo}"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${width}" height="${BAND_HEIGHT}" fill="url(#lyra)"/>
    <circle cx="${width - 46}" cy="30" r="3.5" fill="#FFFFFF" opacity="0.9"/>
    <circle cx="${width - 30}" cy="46" r="2.2" fill="#FFFFFF" opacity="0.65"/>
    <circle cx="${width - 58}" cy="54" r="1.8" fill="#FFFFFF" opacity="0.5"/>
  </svg>`;
}

function header(input: ActaInput) {
  return (currentPage: number): Content => {
    if (currentPage === 1) {
      return {
        stack: [
          { svg: brandBandSvg(PAGE_WIDTH), absolutePosition: { x: 0, y: 0 } },
          {
            text: "Lyra WatchLog",
            font: "Sora",
            bold: true,
            fontSize: 17,
            color: C.onBand,
            absolutePosition: { x: 40, y: 24 },
          },
          {
            text: "ITESICWS · Bitácoras operacionales",
            font: "Inter",
            fontSize: 8,
            color: C.onBandSoft,
            absolutePosition: { x: 40, y: 46 },
          },
          {
            text: "ACTA DE ENTREGA DE TURNO",
            font: "Sora",
            fontSize: 9,
            characterSpacing: 1.5,
            color: C.onBand,
            absolutePosition: { x: 40, y: 66 },
          },
        ],
      };
    }
    // Páginas siguientes: encabezado fino con folio (sin gradiente a pantalla completa).
    return {
      columns: [
        { text: "Lyra WatchLog · Acta de entrega de turno", style: "runningHeader", width: "*" },
        { text: input.detail.code, style: "runningHeader", alignment: "right", width: "auto" },
      ],
      margin: [40, 24, 40, 0],
    };
  };
}

function footer(input: ActaInput) {
  const shortHash = input.integrityHash.slice(0, 16);
  return (currentPage: number, pageCount: number): Content => ({
    columns: [
      {
        text: [
          { text: `${input.detail.code}`, bold: true },
          { text: `  ·  Integridad sha256:${shortHash}…  ·  Documento generado del snapshot congelado`, color: C.muted },
        ],
        style: "footer",
        width: "*",
      },
      { text: `Pág. ${currentPage} / ${pageCount}`, style: "footer", alignment: "right", width: "auto" },
    ],
    margin: [40, 12, 40, 0],
  });
}

function metaBlock(input: ActaInput): Content {
  const d = input.detail;
  const s = d.cockpit.scope;
  const outgoing = s.shiftLabel ?? s.shiftCode ?? "—";
  const incoming = s.incomingShiftLabel ?? s.incomingShiftCode ?? "—";
  const gColor = d.generalStatus ? GENERAL_STATUS_COLOR[d.generalStatus] : C.muted;

  function pair(label: string, value: Content): TableCell[] {
    return [
      { text: label, style: "metaLabel" },
      typeof value === "string" ? { text: value, style: "metaValue" } : value,
    ];
  }

  return {
    columns: [
      {
        width: "*",
        table: {
          widths: [78, "*"],
          body: [
            pair("Folio", { text: d.code, style: "metaValue", bold: true }),
            pair("Nodo", { text: d.nodeName, style: "metaValue", bold: true }),
            pair("Ubicación", { text: input.nodePathLabel || "—", style: "metaValue" }),
            pair("Día operacional", fmtDay(d.operationalDay)),
          ],
        },
        layout: "noBorders",
      },
      {
        width: "*",
        table: {
          widths: [86, "*"],
          body: [
            pair("Turno", { text: `${outgoing}  →  ${incoming}`, style: "metaValue", bold: true }),
            pair("Ventana", `${fmtDateTime(s.windowStart, s.timezone)} – ${fmtDateTime(s.windowEnd, s.timezone)}`),
            pair("Zona horaria", s.timezone),
            pair("Estado general", { text: generalStatusLabel(d.generalStatus), style: "metaValue", bold: true, color: gColor }),
          ],
        },
        layout: "noBorders",
      },
    ],
    columnGap: 18,
    margin: [0, 0, 0, 10],
  };
}

function summaryBlock(input: ActaInput): Content[] {
  const d = input.detail;
  const prov = providerLabel(d.summaryProvider);
  return [
    { text: "Resumen del turno", style: "h2", margin: [0, 4, 0, 2] },
    {
      text: prov.text,
      style: "tag",
      color: prov.ai ? C.accent : C.muted,
      margin: [0, 0, 0, 4],
    },
    {
      text: d.summaryText?.trim() ? d.summaryText : "Sin resumen registrado.",
      style: "body",
      margin: [0, 0, 0, 10],
    },
  ];
}

function batonBlock(input: ActaInput): Content[] {
  const open = input.detail.items.filter((i) => i.status === "OPEN" || i.status === "CARRIED");
  const heading = sectionHeading("Pendientes para el turno entrante", open.length);
  if (open.length === 0) return [heading, emptyNote("Sin pendientes adicionales para el turno entrante.")];

  const rows: TableCell[][] = open.map((it: ShiftHandoverItem) => [
    { text: it.title, style: "cell" },
    { text: it.detail ?? "—", style: "cellMuted" },
    it.severity
      ? { text: `S${it.severity}`, style: "cell", color: SEVERITY_COLORS[it.severity] ?? C.muted, bold: true, alignment: "center" }
      : { text: "—", style: "cellMuted", alignment: "center" },
    {
      text: it.status === "CARRIED" ? "Heredado" : "Nuevo",
      style: "cell",
      color: it.status === "CARRIED" ? C.warning : C.body,
      alignment: "center",
    },
  ]);

  return [heading, sectionTable(["*", "*", 34, 56], ["Pendiente", "Detalle", "Sev.", "Origen"], rows)];
}

function entriesBlock(input: ActaInput): Content[] {
  const list = input.detail.cockpit.entries;
  const heading = sectionHeading("Registros sellados en el turno", list.length);
  if (list.length === 0) return [heading, emptyNote("Sin registros sellados en la ventana del turno.")];
  const rows: TableCell[][] = list.map((e) => [
    { text: e.folio, style: "cell" },
    { text: e.templateName, style: "cell" },
    { text: e.byName ?? "—", style: "cellMuted" },
    { text: fmtDateTime(e.at, input.detail.cockpit.scope.timezone), style: "cellMuted" },
  ]);
  return [heading, sectionTable([70, "*", "*", 96], ["Folio", "Bitácora", "Por", "Sellado"], rows)];
}

function exceptionsBlock(input: ActaInput): Content[] {
  const list = input.detail.cockpit.exceptions;
  const heading = sectionHeading("Excepciones operacionales", list.length);
  if (list.length === 0) return [heading, emptyNote("Sin excepciones en el turno.")];
  const rows: TableCell[][] = list.map((x) => [
    { text: kindLabel(x.kind), style: "cell", color: x.kind === "critical" ? C.error : C.body },
    { text: x.detail, style: "cell" },
    { text: x.fieldLabel ?? "—", style: "cellMuted" },
    { text: x.status, style: "cellMuted", alignment: "center" },
  ]);
  return [heading, sectionTable([62, "*", 110, 64], ["Tipo", "Detalle", "Campo", "Estado"], rows)];
}

function incidentsBlock(input: ActaInput): Content[] {
  const list = input.detail.cockpit.incidents;
  const heading = sectionHeading("Incidencias activas en el alcance", list.length);
  if (list.length === 0) return [heading, emptyNote("Sin incidencias activas en el alcance.")];
  const rows: TableCell[][] = list.map((i) => [
    { text: i.folio, style: "cell" },
    { text: i.title, style: "cell" },
    { text: `S${i.severity}`, style: "cell", color: SEVERITY_COLORS[i.severity] ?? C.muted, bold: true, alignment: "center" },
    { text: i.stateName ?? "—", style: "cellMuted" },
    {
      text: flags(i.critical, i.overdue),
      style: "cell",
      color: i.critical || i.overdue ? C.error : C.muted,
      alignment: "center",
    },
  ]);
  return [heading, sectionTable([64, "*", 28, 90, 70], ["Folio", "Título", "Sev.", "Estado", "Alerta"], rows)];
}

function followupsBlock(input: ActaInput): Content[] {
  const list = input.detail.cockpit.followups;
  const heading = sectionHeading("Acciones y reportes pendientes", list.length);
  if (list.length === 0) return [heading, emptyNote("Sin acciones ni reportes pendientes.")];
  const rows: TableCell[][] = list.map((f) => [
    { text: f.kind === "ACTION" ? "Acción" : "Reporte", style: "cell" },
    { text: f.code, style: "cell" },
    { text: f.title, style: "cell" },
    { text: f.incidentFolio, style: "cellMuted" },
    {
      text: f.dueAt ? fmtDateTime(f.dueAt, input.detail.cockpit.scope.timezone) : "—",
      style: "cell",
      color: f.overdue ? C.error : C.body,
    },
  ]);
  return [heading, sectionTable([52, 64, "*", 64, 96], ["Tipo", "Código", "Título", "Incidencia", "Plazo"], rows)];
}

function roundsBlock(input: ActaInput): Content[] {
  const list = input.detail.cockpit.rounds;
  const heading = sectionHeading("Rondas del turno", list.length);
  if (list.length === 0) return [heading, emptyNote("Sin rondas programadas en la ventana.")];
  const rows: TableCell[][] = list.map((r) => [
    { text: r.name, style: "cell" },
    { text: r.templateName, style: "cellMuted" },
    {
      text: roundStatusLabel(r.status),
      style: "cell",
      color: r.status === "OVERDUE" ? C.error : r.status === "COMPLETED" ? C.success : C.body,
      alignment: "center",
    },
    { text: fmtDateTime(r.scheduledFor, input.detail.cockpit.scope.timezone), style: "cellMuted" },
  ]);
  return [heading, sectionTable(["*", "*", 70, 96], ["Ronda", "Plantilla", "Estado", "Programada"], rows)];
}

function signaturesBlock(input: ActaInput): Content {
  const d = input.detail;
  const tz = d.cockpit.scope.timezone;
  const acked = !!d.acknowledgement.at;

  function signCol(opts: {
    role: string;
    name: string | null;
    at: string | null;
    meaning: string | null;
    method: string | null;
    pending?: string;
    extra?: Content[];
  }): Column {
    const stack: Content[] = [
      { text: opts.role, style: "signRole" },
    ];
    if (!opts.at && opts.pending) {
      stack.push({ text: opts.pending, style: "signPending", margin: [0, 6, 0, 0] });
    } else {
      stack.push(
        { text: opts.name ?? "—", style: "signName", margin: [0, 4, 0, 0] },
        { text: `Firmado: ${fmtDateTime(opts.at, tz)}`, style: "signMeta" },
        { text: `Método: ${methodLabel(opts.method)}`, style: "signMeta" },
        { text: opts.meaning ?? "—", style: "signMeaning", margin: [0, 4, 0, 0] },
        ...(opts.extra ?? []),
      );
    }
    return {
      width: "*",
      table: { widths: ["*"], body: [[{ stack, margin: [10, 8, 10, 10] }]] },
      layout: {
        hLineWidth: () => 0.75,
        vLineWidth: () => 0.75,
        hLineColor: () => C.hairline,
        vLineColor: () => C.hairline,
      },
    };
  }

  const ackExtra: Content[] = acked
    ? [
        {
          text: d.ackState.noObservations ? "Sin observaciones." : `Observaciones: ${d.ackState.observations ?? "—"}`,
          style: "signMeta",
          margin: [0, 4, 0, 0],
        },
        {
          text: `Revisó resumen: ${d.ackState.readSummary ? "Sí" : "No"} · Revisó pendientes: ${d.ackState.reviewedItems ? "Sí" : "No"}`,
          style: "signMeta",
        },
      ]
    : [];

  return {
    columns: [
      signCol({
        role: "ENTREGA (turno saliente)",
        name: d.signOut.byName,
        at: d.signOut.at,
        meaning: d.signOut.meaning,
        method: d.signOut.method,
      }),
      signCol({
        role: "RECEPCIÓN (turno entrante)",
        name: d.acknowledgement.byName,
        at: d.acknowledgement.at,
        meaning: d.acknowledgement.meaning,
        method: d.acknowledgement.method,
        pending: "Pendiente de reconocimiento por el turno entrante.",
        extra: ackExtra,
      }),
    ],
    columnGap: 14,
    margin: [0, 2, 0, 10],
  } satisfies ContentColumns;
}

function verificationBlock(input: ActaInput): Content {
  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            stack: [
              { text: "Verificación de integridad", style: "h3" },
              {
                text: "Este documento se generó a partir del snapshot CONGELADO al firmar la entrega; su contenido es inmutable y reproducible. El hash identifica unívocamente esa foto del turno.",
                style: "verifyNote",
                margin: [0, 2, 0, 4],
              },
              { text: `Folio: ${input.detail.code}`, style: "verifyMono" },
              { text: `SHA-256: ${input.integrityHash}`, style: "verifyMono" },
              {
                text: `Exportado: ${fmtDateTime(input.exportedAt, input.detail.cockpit.scope.timezone)} por ${input.exportedByName}`,
                style: "verifyMono",
              },
            ],
            margin: [10, 8, 10, 10],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0.75,
      vLineWidth: () => 0.75,
      hLineColor: () => C.accent,
      vLineColor: () => C.accent,
    },
    margin: [0, 6, 0, 0],
  };
}

// === Etiquetas auxiliares =====================================================

function kindLabel(kind: string): string {
  switch (kind) {
    case "critical":
      return "Crítica";
    case "warning":
      return "Alerta";
    case "rule":
      return "Regla";
    case "manual":
      return "Manual";
    default:
      return kind;
  }
}

function roundStatusLabel(status: string): string {
  switch (status) {
    case "COMPLETED":
      return "Cumplida";
    case "OVERDUE":
      return "Vencida";
    case "PENDING":
      return "Pendiente";
    case "SKIPPED":
      return "Omitida";
    default:
      return status;
  }
}

function flags(critical: boolean, overdue: boolean): string {
  const f: string[] = [];
  if (critical) f.push("Crítica");
  if (overdue) f.push("Vencida");
  return f.length ? f.join(" · ") : "—";
}

// === Documento ================================================================

export function buildActaDocument(input: ActaInput): TDocumentDefinitions {
  const content: Content[] = [
    metaBlock(input),
    ...summaryBlock(input),
    ...batonBlock(input),
    { text: "Detalle del turno", style: "h1", margin: [0, 4, 0, 4] },
    ...entriesBlock(input),
    ...exceptionsBlock(input),
    ...incidentsBlock(input),
    ...followupsBlock(input),
    ...roundsBlock(input),
    { text: "Firmas electrónicas (21 CFR Part 11)", style: "h1", margin: [0, 8, 0, 4] },
    signaturesBlock(input),
    verificationBlock(input),
  ];

  return {
    pageSize: "A4",
    pageMargins: [40, BAND_HEIGHT + 18, 40, 42],
    defaultStyle: { font: "Inter", fontSize: 9, color: C.body, lineHeight: 1.2 },
    info: {
      title: `Acta de entrega de turno ${input.detail.code}`,
      author: "Lyra WatchLog · ITESICWS",
      subject: `Entrega de turno ${input.detail.nodeName} — ${input.detail.operationalDay}`,
      creator: "Lyra WatchLog",
    },
    header: header(input),
    footer: footer(input),
    content,
    styles: {
      h1: { font: "Sora", fontSize: 12, bold: true, color: C.ink },
      h2: { font: "Sora", fontSize: 10.5, bold: true, color: C.ink },
      h3: { font: "Sora", fontSize: 9.5, bold: true, color: C.accent },
      body: { fontSize: 9, color: C.body },
      tag: { font: "InterMedium", fontSize: 8, italics: true },
      th: { font: "InterMedium", fontSize: 7.5, bold: true, color: C.ink, characterSpacing: 0.3 },
      cell: { fontSize: 8, color: C.body },
      cellMuted: { fontSize: 8, color: C.muted },
      empty: { fontSize: 8.5, italics: true, color: C.muted },
      countBadge: { font: "Sora", fontSize: 10.5, bold: true, color: C.accent },
      metaLabel: { fontSize: 8, color: C.muted, margin: [0, 1, 0, 1] },
      metaValue: { fontSize: 9, color: C.body, margin: [0, 1, 0, 1] },
      signRole: { font: "Sora", fontSize: 8.5, bold: true, color: C.accent, characterSpacing: 0.5 },
      signName: { fontSize: 10.5, bold: true, color: C.ink },
      signMeta: { fontSize: 8, color: C.muted },
      signMeaning: { fontSize: 8.5, italics: true, color: C.body },
      signPending: { fontSize: 9, italics: true, color: C.warning },
      verifyNote: { fontSize: 8, color: C.muted },
      verifyMono: { font: "Inter", fontSize: 8, color: C.ink },
      runningHeader: { fontSize: 7.5, color: C.muted },
      footer: { fontSize: 7, color: C.muted },
    },
  };
}
