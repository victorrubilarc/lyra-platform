import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Clock, Flag, Lock, Play, User } from "lucide-react";
import type { LogEntryDetail, WorkflowStateDto } from "@lyra/contracts";
import { formatDateTime } from "../../lib/format.js";
import styles from "./WorkflowDiagram.module.css";

const NODE_W = 224;
const NODE_H = 64;
const ROW_GAP = 46; // separación vertical entre niveles (capas)
const COL_GAP = 36; // separación horizontal entre ramas del mismo nivel
const PAD = 20;

interface NodePos {
  state: WorkflowStateDto;
  x: number;
  y: number;
}

interface Layout {
  nodes: Map<string, NodePos>;
  width: number;
  height: number;
  rowOf: Map<string, number>;
}

/** Layout VERTICAL por CAPAS (BFS desde el estado inicial). La capa = distancia al
 *  inicial determina la FILA (de arriba hacia abajo); dentro de la fila, las ramas se
 *  ordenan por `order` y se centran horizontalmente. Lee como un viaje + scroll natural. */
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
  // Estados no alcanzados desde el inicial: a una fila nueva al final, por `order`.
  let maxLayer = 0;
  layer.forEach((l) => (maxLayer = Math.max(maxLayer, l)));
  states
    .filter((s) => !layer.has(s.key))
    .sort((a, b) => a.order - b.order)
    .forEach((s) => layer.set(s.key, ++maxLayer));

  const byLayer = new Map<number, WorkflowStateDto[]>();
  states.forEach((s) => {
    const l = layer.get(s.key)!;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(s);
  });
  byLayer.forEach((arr) => arr.sort((a, b) => a.order - b.order));
  const rows = [...byLayer.keys()].sort((a, b) => a - b);
  const rowOf = new Map<string, number>();
  rows.forEach((l, ri) => byLayer.get(l)!.forEach((s) => rowOf.set(s.key, ri)));

  const maxCols = Math.max(1, ...[...byLayer.values()].map((a) => a.length));
  const contentWidth = maxCols * NODE_W + (maxCols - 1) * COL_GAP + PAD * 2;
  const height = rows.length * NODE_H + (rows.length - 1) * ROW_GAP + PAD * 2;
  // Las aristas de retorno/laterales y los self-loops bordean por la derecha: gutter.
  const hasSideEdge = transitions.some(
    (t) => t.fromStateKey === t.toStateKey || (rowOf.get(t.toStateKey) ?? 0) <= (rowOf.get(t.fromStateKey) ?? 0),
  );
  const width = contentWidth + (hasSideEdge ? 64 : 0);

  const nodes = new Map<string, NodePos>();
  rows.forEach((l, ri) => {
    const arr = byLayer.get(l)!;
    const layerW = arr.length * NODE_W + (arr.length - 1) * COL_GAP;
    const startX = PAD + (contentWidth - PAD * 2 - layerW) / 2;
    arr.forEach((s, ci) => {
      nodes.set(s.key, {
        state: s,
        x: startX + ci * (NODE_W + COL_GAP),
        y: PAD + ri * (NODE_H + ROW_GAP),
      });
    });
  });
  return { nodes, width, height, rowOf };
}

const FALLBACK_COLOR = "var(--color-accent-primary, #6366f1)";

/**
 * Diagrama del flujo (máquina de estados) con el RECORRIDO del registro resaltado
 * (Fase 2.8.1c-UX). Estados visitados numerados en orden, estado actual con glow,
 * aristas recorridas vs. posibles. Aristas en SVG, nodos en HTML (estilo premium).
 * Reusa la versión de flujo CONGELADA del registro (no la vigente) ⇒ fiel al histórico.
 */
export function WorkflowDiagram({ entry }: { entry: LogEntryDetail }) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<string | null>(null); // transitionKey resaltado

  const wf = entry.workflowVersion;
  const executed = useMemo(
    () => [...entry.transitions].sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1)),
    [entry.transitions],
  );

  const layout = useMemo(() => (wf ? computeLayout(wf.states, wf.transitions) : null), [wf]);

  if (!wf || !layout) {
    return <p className={styles.noFlow}>{t("logbook.diagram.noFlow")}</p>;
  }

  // Recorrido: estado inicial = paso 1; cada transición ejecutada visita su destino.
  const initial = wf.states.find((s) => s.isInitial);
  const visitStep = new Map<string, number>();
  if (initial) visitStep.set(initial.key, 1);
  executed.forEach((tr, i) => {
    if (!visitStep.has(tr.toStateKey)) visitStep.set(tr.toStateKey, i + 2);
  });
  // Aristas recorridas: por clave de transición → órdenes de ejecución (1-based).
  const traversed = new Map<string, number[]>();
  executed.forEach((tr, i) => {
    if (!traversed.has(tr.transitionKey)) traversed.set(tr.transitionKey, []);
    traversed.get(tr.transitionKey)!.push(i + 1);
  });

  const anchor = (key: string) => layout.nodes.get(key)!;

  function edgeGeometry(t0: { fromStateKey: string; toStateKey: string }) {
    const a = anchor(t0.fromStateKey);
    const b = anchor(t0.toStateKey);
    const forward = (layout!.rowOf.get(t0.toStateKey) ?? 0) > (layout!.rowOf.get(t0.fromStateKey) ?? 0);
    if (t0.fromStateKey === t0.toStateKey) {
      // Self-loop (raro): pequeño bucle a la derecha.
      const x = a.x + NODE_W;
      const y = a.y + NODE_H / 2;
      return { path: `M${x},${y - 14} C${x + 42},${y - 26} ${x + 42},${y + 26} ${x},${y + 14}`, mx: x + 34, my: y };
    }
    if (forward) {
      // Hacia abajo: del borde inferior del origen al borde superior del destino.
      const x1 = a.x + NODE_W / 2;
      const y1 = a.y + NODE_H;
      const x2 = b.x + NODE_W / 2;
      const y2 = b.y;
      const my = (y1 + y2) / 2;
      return { path: `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`, mx: (x1 + x2) / 2, my };
    }
    // Retorno/lateral (reabrir, observar): arco por el LADO DERECHO.
    const x1 = a.x + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const x2 = b.x + NODE_W;
    const y2 = b.y + NODE_H / 2;
    const bulge = 48;
    const mx = Math.max(x1, x2) + bulge;
    return { path: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`, mx: mx - 8, my: (y1 + y2) / 2 };
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.canvasScroll}>
        <div className={styles.canvas} style={{ width: layout.width, height: layout.height }}>
          <svg className={styles.edges} width={layout.width} height={layout.height} aria-hidden>
            <defs>
              <marker id="wf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className={styles.arrowHead} />
              </marker>
              <marker id="wf-arrow-on" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" className={styles.arrowHeadOn} />
              </marker>
            </defs>
            {wf.transitions.map((tr) => {
              const g = edgeGeometry(tr);
              const orders = traversed.get(tr.key);
              const on = Boolean(orders);
              const hot = hovered === tr.key;
              return (
                <path
                  key={tr.key}
                  d={g.path}
                  fill="none"
                  className={`${styles.edge} ${on ? styles.edgeOn : ""} ${hot ? styles.edgeHot : ""}`}
                  markerEnd={on ? "url(#wf-arrow-on)" : "url(#wf-arrow)"}
                />
              );
            })}
          </svg>

          {/* Badges de orden de recorrido sobre las aristas (en HTML para estilo) */}
          {wf.transitions.map((tr) => {
            const orders = traversed.get(tr.key);
            if (!orders) return null;
            const g = edgeGeometry(tr);
            return (
              <span
                key={`b-${tr.key}`}
                className={`${styles.edgeBadge} ${hovered === tr.key ? styles.edgeBadgeHot : ""}`}
                style={{ left: g.mx, top: g.my }}
                title={tr.label}
              >
                {orders.length > 1 ? `${orders[0]}…` : orders[0]}
              </span>
            );
          })}

          {/* Nodos de estado */}
          {wf.states.map((s) => {
            const p = anchor(s.key);
            const step = visitStep.get(s.key);
            const isCurrent = s.key === entry.currentStateKey;
            const color = s.color ?? FALLBACK_COLOR;
            const cls = [
              styles.node,
              step ? styles.nodeVisited : styles.nodePending,
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
              >
                <div className={styles.nodeTop}>
                  {s.isInitial && <Play size={12} className={styles.nodeMark} />}
                  {s.isFinal && <Flag size={12} className={styles.nodeMark} />}
                  <span className={styles.nodeName}>{s.name}</span>
                </div>
                <div className={styles.nodeBottom}>
                  {step && <span className={styles.stepBadge}>{step}</span>}
                  {isCurrent && <span className={styles.currentPill}>{t("logbook.diagram.current")}</span>}
                  {!step && !isCurrent && <span className={styles.pendingText}>{t("logbook.diagram.pending")}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Historial de transiciones — cada tarjeta enlaza con su arista (hover) */}
      {executed.length > 0 ? (
        <ol className={styles.history}>
          {executed.map((tr, i) => {
            const fromName = wf.states.find((s) => s.key === tr.fromStateKey)?.name ?? tr.fromStateKey;
            const toState = wf.states.find((s) => s.key === tr.toStateKey);
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
                  </div>
                  {tr.reason && <div className={styles.histReason}>“{tr.reason}”</div>}
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className={styles.noFlow}>{t("logbook.diagram.noTransitions")}</p>
      )}
    </div>
  );
}
