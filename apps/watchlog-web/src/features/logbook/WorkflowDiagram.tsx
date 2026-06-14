import { useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Flag, Lock, Play, Timer, User } from "lucide-react";
import type { LogEntryDetail, LogEntryTransitionDto, WorkflowStateDto, WorkflowTransitionDto } from "@lyra/contracts";
import { formatDateTime } from "../../lib/format.js";
import styles from "./WorkflowDiagram.module.css";

const NODE_W = 200;
const NODE_H = 66;
const COL_GAP = 92; // separación HORIZONTAL entre niveles (avance del flujo)
const ROW_GAP = 30; // separación VERTICAL entre ramas del mismo nivel
const PAD = 24;
const BACK_GUTTER = 52; // espacio inferior para aristas de retorno/laterales

interface NodePos {
  state: WorkflowStateDto;
  x: number;
  y: number;
}

interface Layout {
  nodes: Map<string, NodePos>;
  width: number;
  height: number;
  colOf: Map<string, number>;
}

/** Layout HORIZONTAL por CAPAS (BFS desde el estado inicial), izquierda→derecha (estándar
 *  BPMN/Jira). La capa = distancia al inicial = COLUMNA; dentro de la columna las ramas se
 *  apilan en vertical y se centran. El progreso avanza a la derecha; las ramas se abren
 *  arriba/abajo. Los puntos de conexión se distribuyen por nodo (ver `edgeGeometry`). */
function computeLayout(states: WorkflowStateDto[], transitions: { fromStateKey: string; toStateKey: string }[]): Layout {
  const initial = states.find((s) => s.isInitial) ?? states[0];
  const adj = new Map<string, string[]>();
  states.forEach((s) => adj.set(s.key, []));
  transitions.forEach((t) => adj.get(t.fromStateKey)?.push(t.toStateKey));

  const layer = new Map<string, number>();
  if (initial) {
    layer.set(initial.key, 0);
    const queue = [initial.key];
    while (queue.length) {
      const u = queue.shift()!;
      const lu = layer.get(u)!;
      for (const v of adj.get(u) ?? []) {
        if (!layer.has(v)) {
          layer.set(v, lu + 1);
          queue.push(v);
        }
      }
    }
  }
  // Estados no alcanzados desde el inicial: a una columna nueva al final, por `order`.
  let maxLayer = 0;
  layer.forEach((l) => (maxLayer = Math.max(maxLayer, l)));
  states
    .filter((s) => !layer.has(s.key))
    .sort((a, b) => a.order - b.order)
    .forEach((s) => layer.set(s.key, ++maxLayer));

  const byCol = new Map<number, WorkflowStateDto[]>();
  states.forEach((s) => {
    const l = layer.get(s.key)!;
    if (!byCol.has(l)) byCol.set(l, []);
    byCol.get(l)!.push(s);
  });
  byCol.forEach((arr) => arr.sort((a, b) => a.order - b.order));
  const cols = [...byCol.keys()].sort((a, b) => a - b);
  const colOf = new Map<string, number>();
  cols.forEach((l, ci) => byCol.get(l)!.forEach((s) => colOf.set(s.key, ci)));

  const maxRows = Math.max(1, ...[...byCol.values()].map((a) => a.length));
  const contentHeight = maxRows * NODE_H + (maxRows - 1) * ROW_GAP + PAD * 2;
  // Canal inferior para las aristas de RETORNO (escalonadas): cada una su profundidad.
  const backCount = transitions.filter(
    (t) => t.fromStateKey === t.toStateKey || (colOf.get(t.toStateKey) ?? 0) <= (colOf.get(t.fromStateKey) ?? 0),
  ).length;
  const height = contentHeight + (backCount > 0 ? BACK_GUTTER + (backCount - 1) * 16 : 0);
  const width = cols.length * NODE_W + (cols.length - 1) * COL_GAP + PAD * 2;

  const nodes = new Map<string, NodePos>();
  cols.forEach((l, ci) => {
    const arr = byCol.get(l)!;
    const colH = arr.length * NODE_H + (arr.length - 1) * ROW_GAP;
    const startY = PAD + (contentHeight - PAD * 2 - colH) / 2;
    arr.forEach((s, ri) => {
      nodes.set(s.key, {
        state: s,
        x: PAD + ci * (NODE_W + COL_GAP),
        y: startY + ri * (NODE_H + ROW_GAP),
      });
    });
  });
  return { nodes, width, height, colOf };
}

const FALLBACK_COLOR = "var(--color-accent-primary, #6366f1)";

/** Duración compacta (d / h / min) — tiempos reales de ESTE registro. */
function formatDuration(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return "<1 min";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) {
    const rem = m % 60;
    return rem ? `${h} h ${rem} min` : `${h} h`;
  }
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH ? `${d} d ${remH} h` : `${d} d`;
}

/** Capa de "registro" (opcional): el recorrido real que sobreimprime el diagrama. */
export interface WorkflowDiagramRecord {
  executed: LogEntryTransitionDto[];
  currentStateKey: string | null;
  recordedAt: string;
  /** "DRAFT" = aún en curso (hay siguiente paso); sellado/anulado = flujo terminado. */
  status: string;
}

type WorkflowDiagramProps =
  | { entry: LogEntryDetail }
  | { states: WorkflowStateDto[]; transitions: WorkflowTransitionDto[]; record?: WorkflowDiagramRecord };

/**
 * Diagrama del flujo (máquina de estados). DOS MODOS:
 *  - DEFINICIÓN (mantenedor de flujos): solo la estructura (estados + transiciones,
 *    coloreados por estado) para ver "cómo es el flujo".
 *  - REGISTRO (visor/grilla de Bitácoras): sobreimprime el RECORRIDO real — dónde está
 *    ahora (con glow), cuál es el siguiente paso (animado), cuánto llevó cada tramo.
 * Aristas en SVG, nodos en HTML (estilo premium). En registro reusa la versión de flujo
 * CONGELADA ⇒ fiel al histórico.
 */
export function WorkflowDiagram(props: WorkflowDiagramProps) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<string | null>(null); // transitionKey resaltado
  const [tip, setTip] = useState<{ x: number; y: number; content: ReactNode } | null>(null);

  // Normaliza ambos modos a una sola forma.
  const isRecord = "entry" in props;
  const states = isRecord ? (props.entry.workflowVersion?.states ?? []) : props.states;
  const transitions = isRecord ? (props.entry.workflowVersion?.transitions ?? []) : props.transitions;
  const record: WorkflowDiagramRecord | null = isRecord
    ? props.entry.workflowVersion
      ? {
          executed: props.entry.transitions,
          currentStateKey: props.entry.currentStateKey,
          recordedAt: props.entry.recordedAt,
          status: props.entry.status,
        }
      : null
    : (props.record ?? null);

  const executed = record ? [...record.executed].sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1)) : [];
  const currentStateKey = record?.currentStateKey ?? null;

  const layout = useMemo(() => (states.length ? computeLayout(states, transitions) : null), [states, transitions]);

  if (!states.length || !layout) {
    return <p className={styles.noFlow}>{t("logbook.diagram.noFlow")}</p>;
  }

  // --- Recorrido (solo modo registro) ---------------------------------------
  const initial = states.find((s) => s.isInitial);
  const visitStep = new Map<string, number>();
  if (record && initial) visitStep.set(initial.key, 1);
  executed.forEach((tr, i) => {
    if (!visitStep.has(tr.toStateKey)) visitStep.set(tr.toStateKey, i + 2);
  });
  const traversed = new Map<string, number[]>();
  executed.forEach((tr, i) => {
    if (!traversed.has(tr.transitionKey)) traversed.set(tr.transitionKey, []);
    traversed.get(tr.transitionKey)!.push(i + 1);
  });

  // --- Tiempos reales de ESTE registro + siguiente paso ---------------------
  const startMs = record ? new Date(record.recordedAt).getTime() : 0;
  const lastTr = executed[executed.length - 1];
  const inCurrentSinceMs = lastTr ? new Date(lastTr.occurredAt).getTime() : startMs;
  const isActive = record?.status === "DRAFT";
  const currentElapsedMs = Date.now() - inCurrentSinceMs;
  // Duración de cada tramo = tiempo en el estado ORIGEN antes de disparar la transición.
  const legMs = new Map<string, number>(); // transition.id → ms
  executed.forEach((tr, i) => {
    const prevMs = i === 0 ? startMs : new Date(executed[i - 1]!.occurredAt).getTime();
    legMs.set(tr.id, new Date(tr.occurredAt).getTime() - prevMs);
  });
  // Siguiente paso = transiciones salientes del estado actual (si sigue en curso).
  const nextTransitionKeys = new Set(
    isActive && currentStateKey ? transitions.filter((tr) => tr.fromStateKey === currentStateKey).map((tr) => tr.key) : [],
  );
  const nextStateKeys = new Set(
    isActive && currentStateKey ? transitions.filter((tr) => tr.fromStateKey === currentStateKey).map((tr) => tr.toStateKey) : [],
  );
  const nextTransitions = transitions.filter((tr) => nextTransitionKeys.has(tr.key));

  const anchor = (key: string) => layout.nodes.get(key)!;
  const stateName = (key: string) => states.find((s) => s.key === key)?.name ?? key;
  // Color de la transición = color de su estado DESTINO (hacia dónde lleva).
  const stateColorOf = (key: string) => states.find((s) => s.key === key)?.color ?? FALLBACK_COLOR;

  /** Contenido del tooltip de un ESTADO: identidad + situación + cómo se ingresó. */
  function nodeTip(s: WorkflowStateDto): ReactNode {
    const step = visitStep.get(s.key);
    const isCurrent = s.key === currentStateKey;
    const enter = [...executed].reverse().find((tr) => tr.toStateKey === s.key);
    const color = s.color ?? FALLBACK_COLOR;
    return (
      <>
        <div className={styles.tipTitle}>
          <span className={styles.tipDot} style={{ background: color }} />
          {s.name}
        </div>
        <div className={styles.tipTags}>
          {s.isInitial && <span className={styles.tipTag}>{t("logbook.diagram.tipInitial")}</span>}
          {s.isFinal && <span className={styles.tipTag}>{t("logbook.diagram.tipFinal")}</span>}
          {isCurrent && <span className={`${styles.tipTag} ${styles.tipTagOn}`}>{t("logbook.diagram.current")}</span>}
          <span className={styles.tipTag}>{step ? t("logbook.diagram.tipStep", { n: step }) : t("logbook.diagram.pending")}</span>
        </div>
        {s.description && <div className={styles.tipDesc}>{s.description}</div>}
        {enter ? (
          <div className={styles.tipMeta}>
            <div className={styles.tipMetaStrong}>{enter.label ?? enter.transitionKey}</div>
            <div>
              <User size={11} /> {enter.actorName ?? "—"}
            </div>
            <div>
              <Clock size={11} /> {formatDateTime(enter.occurredAt)}
            </div>
          </div>
        ) : s.isInitial ? (
          <div className={styles.tipMeta}>{t("logbook.diagram.tipInitialNote")}</div>
        ) : null}
      </>
    );
  }

  /** Contenido del tooltip de una TRANSICIÓN: acción + recorrido + ejecución/posible. */
  function transitionTip(tr: WorkflowTransitionDto): ReactNode {
    const execs = executed.filter((e) => e.transitionKey === tr.key);
    const last = execs[execs.length - 1];
    return (
      <>
        <div className={styles.tipTitle}>{tr.label}</div>
        <div className={styles.tipFlow}>
          {stateName(tr.fromStateKey)} <span className={styles.tipArrow}>→</span> {stateName(tr.toStateKey)}
        </div>
        {last ? (
          <div className={styles.tipMeta}>
            <div>
              <User size={11} /> {last.actorName ?? "—"}
            </div>
            <div>
              <Clock size={11} /> {formatDateTime(last.occurredAt)}
            </div>
            {last.reason && <div className={styles.tipReason}>“{last.reason}”</div>}
            {last.signature && (
              <div className={styles.tipSig}>
                <Lock size={11} /> {last.signature.meaning}
              </div>
            )}
            {execs.length > 1 && <div>{t("logbook.diagram.tipTimes", { n: execs.length })}</div>}
          </div>
        ) : (
          <div className={styles.tipMeta}>
            <div>{t("logbook.diagram.tipPossible")}</div>
            {tr.requireSignature && (
              <div className={styles.tipSig}>
                <Lock size={11} /> {tr.signatureMeaning ?? t("logbook.diagram.tipNeedsSign")}
              </div>
            )}
          </div>
        )}
      </>
    );
  }

  const showTip = (e: { clientX: number; clientY: number }, content: ReactNode) =>
    setTip({ x: e.clientX, y: e.clientY, content });

  // --- Puertos distribuidos: reparte los anclajes de las aristas a lo largo del
  // borde derecho (salidas) e izquierdo (entradas) de cada nodo, ordenados por la
  // posición del nodo opuesto ⇒ las flechas no se amontonan ni se cruzan en el centro.
  const colOf = (key: string) => layout.colOf.get(key) ?? 0;
  const isForward = (tr: { fromStateKey: string; toStateKey: string }) =>
    tr.fromStateKey !== tr.toStateKey && colOf(tr.toStateKey) > colOf(tr.fromStateKey);
  const fwdOut = new Map<string, WorkflowTransitionDto[]>();
  const fwdIn = new Map<string, WorkflowTransitionDto[]>();
  for (const tr of transitions) {
    if (!isForward(tr)) continue;
    (fwdOut.get(tr.fromStateKey) ?? fwdOut.set(tr.fromStateKey, []).get(tr.fromStateKey)!).push(tr);
    (fwdIn.get(tr.toStateKey) ?? fwdIn.set(tr.toStateKey, []).get(tr.toStateKey)!).push(tr);
  }
  fwdOut.forEach((arr) => arr.sort((x, y) => anchor(x.toStateKey).y - anchor(y.toStateKey).y));
  fwdIn.forEach((arr) => arr.sort((x, y) => anchor(x.fromStateKey).y - anchor(y.fromStateKey).y));
  const portY = (node: NodePos, index: number, count: number) => node.y + (NODE_H * (index + 1)) / (count + 1);

  // Canal inferior para las aristas de RETORNO: corren por DEBAJO de todos los nodos
  // (nunca cruzan el flujo) y cada una a su propia profundidad (sin solaparse entre sí).
  const nodesBottom = Math.max(...[...layout.nodes.values()].map((n) => n.y + NODE_H));
  const backIndex = new Map<string, number>();
  transitions.filter((tr) => tr.fromStateKey !== tr.toStateKey && !isForward(tr)).forEach((tr, i) => backIndex.set(tr.key, i));

  function edgeGeometry(t0: WorkflowTransitionDto) {
    const a = anchor(t0.fromStateKey);
    const b = anchor(t0.toStateKey);
    if (t0.fromStateKey === t0.toStateKey) {
      // Self-loop (raro): pequeño bucle arriba.
      const x = a.x + NODE_W / 2;
      const y = a.y;
      return { path: `M${x - 16},${y} C${x - 26},${y - 38} ${x + 26},${y - 38} ${x + 16},${y}`, mx: x, my: y - 32 };
    }
    if (isForward(t0)) {
      const outArr = fwdOut.get(t0.fromStateKey)!;
      const inArr = fwdIn.get(t0.toStateKey)!;
      const si = outArr.findIndex((x) => x.key === t0.key);
      const di = inArr.findIndex((x) => x.key === t0.key);
      const x1 = a.x + NODE_W;
      const y1 = portY(a, si, outArr.length);
      const x2 = b.x;
      const y2 = portY(b, di, inArr.length);
      const dx = Math.max(34, (x2 - x1) * 0.5);
      return { path: `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`, mx: (x1 + x2) / 2, my: (y1 + y2) / 2 };
    }
    // Retorno/lateral (reabrir/observar): baja al CANAL inferior, corre por debajo de
    // todos los nodos y sube al destino ⇒ no cruza las aristas del avance.
    const x1 = a.x + NODE_W / 2;
    const y1 = a.y + NODE_H;
    const x2 = b.x + NODE_W / 2;
    const y2 = b.y + NODE_H;
    const chY = nodesBottom + 18 + (backIndex.get(t0.key) ?? 0) * 16;
    return { path: `M${x1},${y1} C${x1},${chY} ${x2},${chY} ${x2},${y2}`, mx: (x1 + x2) / 2, my: chY - 7 };
  }

  return (
    <div className={styles.wrap}>
      {/* Banner: DÓNDE estás ahora (con cuánto llevas) y CUÁL es el siguiente paso. */}
      {record && currentStateKey && (
        <div className={styles.statusBar}>
          <div className={styles.statusNow} style={{ ["--state-color" as string]: stateColorOf(currentStateKey) }}>
            <span className={styles.statusKicker}>{t("logbook.diagram.youAreHere")}</span>
            <span className={styles.statusState}>
              <span className={styles.tipDot} style={{ background: stateColorOf(currentStateKey) }} />
              {stateName(currentStateKey)}
            </span>
            <span className={styles.statusElapsed}>
              <Clock size={12} /> {isActive ? t("logbook.diagram.hereFor", { d: formatDuration(currentElapsedMs) }) : t("logbook.diagram.finished")}
            </span>
          </div>
          <div className={styles.statusNext}>
            <span className={styles.statusKicker}>{t("logbook.diagram.nextStep")}</span>
            {nextTransitions.length > 0 ? (
              nextTransitions.map((tr) => (
                <span key={tr.key} className={styles.nextChip} style={{ ["--state-color" as string]: stateColorOf(tr.toStateKey) }}>
                  {tr.label}
                  <span className={styles.nextChipArrow}>→</span>
                  {stateName(tr.toStateKey)}
                </span>
              ))
            ) : (
              <span className={styles.statusDone}>{isActive ? t("logbook.diagram.noNext") : t("logbook.diagram.flowEnded")}</span>
            )}
          </div>
        </div>
      )}

      <div className={styles.canvasScroll}>
        <div className={styles.canvas} style={{ width: layout.width, height: layout.height }}>
          <svg className={styles.edges} width={layout.width} height={layout.height} aria-hidden>
            <defs>
              {/* La punta de flecha hereda el color del trazo (context-stroke) ⇒ cada
                  transición lleva el color de su estado destino sin marcadores por color. */}
              <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
              </marker>
            </defs>
            {transitions.map((tr) => {
              const g = edgeGeometry(tr);
              const on = traversed.has(tr.key);
              const isNext = nextTransitionKeys.has(tr.key);
              const hot = hovered === tr.key;
              const toColor = stateColorOf(tr.toStateKey);
              // Coloreada (con el color del destino) si: recorrida, es el siguiente paso,
              // o estamos en modo DEFINICIÓN (todas las transiciones son "reales").
              const colored = on || isNext || !record;
              return (
                <g key={tr.key}>
                  <path
                    d={g.path}
                    fill="none"
                    className={`${styles.edge} ${colored ? styles.edgeOn : ""} ${isNext ? styles.edgeNext : ""} ${hot ? styles.edgeHot : ""}`}
                    style={colored ? { stroke: toColor } : undefined}
                    markerEnd="url(#wf-arrow)"
                  />
                  {/* Hit-path invisible y ancho: hace fácil pasar el cursor por la arista. */}
                  <path
                    d={g.path}
                    fill="none"
                    className={styles.edgeHit}
                    onMouseEnter={(e) => {
                      setHovered(tr.key);
                      showTip(e, transitionTip(tr));
                    }}
                    onMouseMove={(e) => showTip(e, transitionTip(tr))}
                    onMouseLeave={() => {
                      setHovered(null);
                      setTip(null);
                    }}
                  />
                </g>
              );
            })}
          </svg>

          {/* Badge sobre cada arista RECORRIDA: la DURACIÓN del tramo (tiempo real). */}
          {record &&
            transitions.map((tr) => {
              const execs = executed.filter((e) => e.transitionKey === tr.key);
              const lastExec = execs[execs.length - 1];
              if (!lastExec) return null;
              const g = edgeGeometry(tr);
              const dur = formatDuration(legMs.get(lastExec.id) ?? 0);
              return (
                <span
                  key={`b-${tr.key}`}
                  className={`${styles.edgeBadge} ${hovered === tr.key ? styles.edgeBadgeHot : ""}`}
                  style={{ left: g.mx, top: g.my, background: `color-mix(in srgb, ${stateColorOf(tr.toStateKey)} 88%, #000)` }}
                  onMouseEnter={(e) => {
                    setHovered(tr.key);
                    showTip(e, transitionTip(tr));
                  }}
                  onMouseMove={(e) => showTip(e, transitionTip(tr))}
                  onMouseLeave={() => {
                    setHovered(null);
                    setTip(null);
                  }}
                >
                  {dur}
                </span>
              );
            })}

          {/* Nodos de estado */}
          {states.map((s) => {
            const p = anchor(s.key);
            const step = visitStep.get(s.key);
            const isCurrent = s.key === currentStateKey;
            const isNext = Boolean(record) && nextStateKeys.has(s.key) && !isCurrent;
            const color = s.color ?? FALLBACK_COLOR;
            const cls = [
              styles.node,
              !record ? styles.nodeDefined : step ? styles.nodeVisited : isNext ? styles.nodeNext : styles.nodePending,
              isCurrent ? styles.nodeCurrent : "",
            ].join(" ");
            return (
              <div
                key={s.key}
                className={cls}
                style={{
                  left: p.x,
                  top: p.y,
                  width: NODE_W,
                  height: NODE_H,
                  ["--state-color" as string]: color,
                }}
                onMouseEnter={(e) => showTip(e, nodeTip(s))}
                onMouseMove={(e) => showTip(e, nodeTip(s))}
                onMouseLeave={() => setTip(null)}
              >
                <span className={styles.nodeBar} />
                <div className={styles.nodeTop}>
                  {s.isInitial && <Play size={12} className={styles.nodeMark} />}
                  {s.isFinal && <Flag size={12} className={styles.nodeMark} />}
                  <span className={styles.nodeName}>{s.name}</span>
                </div>
                <div className={styles.nodeBottom}>
                  {record && step && <span className={styles.stepBadge}>{step}</span>}
                  {isCurrent && <span className={styles.currentPill}>{t("logbook.diagram.current")}</span>}
                  {isCurrent && isActive && (
                    <span className={styles.nodeElapsed}>
                      <Clock size={11} /> {formatDuration(currentElapsedMs)}
                    </span>
                  )}
                  {isNext && <span className={styles.nextPill}>{t("logbook.diagram.next")}</span>}
                  {record && !step && !isCurrent && !isNext && <span className={styles.pendingText}>{t("logbook.diagram.pending")}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tooltip flotante (sigue el cursor; position:fixed ⇒ sin recortes por el scroll). */}
      {tip && (
        <div className={styles.tooltip} style={{ left: tip.x + 14, top: tip.y + 16 }} role="tooltip">
          {tip.content}
        </div>
      )}

      {/* Historial de transiciones — cada tarjeta enlaza con su arista (hover) */}
      {record &&
        (executed.length > 0 ? (
        <ol className={styles.history}>
          {executed.map((tr, i) => {
            const fromName = states.find((s) => s.key === tr.fromStateKey)?.name ?? tr.fromStateKey;
            const toState = states.find((s) => s.key === tr.toStateKey);
            const toColor = toState?.color ?? FALLBACK_COLOR;
            return (
              <li
                key={tr.id}
                className={styles.histItem}
                onMouseEnter={() => setHovered(tr.transitionKey)}
                onMouseLeave={() => setHovered(null)}
              >
                <span className={styles.histIndex}>{i + 1}</span>
                <div className={styles.histBody}>
                  <div className={styles.histHead}>
                    <span className={styles.histLabel}>{tr.label ?? tr.transitionKey}</span>
                    <span className={styles.histFlow}>
                      <span className={styles.histFrom}>{fromName}</span>
                      <span className={styles.histArrow}>→</span>
                      <span className={styles.histTo} style={{ ["--state-color" as string]: toColor }}>
                        {toState?.name ?? tr.toStateKey}
                      </span>
                    </span>
                    {tr.signature && (
                      <span className={styles.histSig} title={tr.signature.meaning}>
                        <Lock size={11} /> {tr.signature.meaning}
                      </span>
                    )}
                  </div>
                  <div className={styles.histMeta}>
                    <span>
                      <User size={11} /> {tr.actorName ?? "—"}
                    </span>
                    <span>
                      <Clock size={11} /> {formatDateTime(tr.occurredAt)}
                    </span>
                    <span className={styles.histDur} title={t("logbook.diagram.legNote")}>
                      <Timer size={11} /> {formatDuration(legMs.get(tr.id) ?? 0)}
                    </span>
                  </div>
                  {tr.reason && <div className={styles.histReason}>“{tr.reason}”</div>}
                </div>
              </li>
            );
          })}
        </ol>
        ) : (
          <p className={styles.noFlow}>{t("logbook.diagram.noTransitions")}</p>
        ))}
    </div>
  );
}
