import styles from "./BrandScene.module.css";

/** Una arista de la constelación, con retardo de dibujado escalonado. */
function ConstellationLine({ d, delay }: { d: string; delay: number }) {
  return (
    <path
      className={styles.line}
      d={d}
      pathLength={1}
      style={{ animationDelay: `${delay}s` }}
    />
  );
}

/** Una estrella con parpadeo escalonado. */
function Star({ cx, cy, r, bright, delay }: { cx: number; cy: number; r: number; bright?: boolean; delay: number }) {
  return (
    <circle
      className={bright ? styles.starBright : styles.star}
      cx={cx}
      cy={cy}
      r={r}
      style={{ animationDelay: `${delay}s` }}
    />
  );
}

/**
 * Escena gráfica de la entrada: la constelación Lyra (Vega + el paralelogramo
 * Sheliak/Sulafat — los nombres de los productos del ecosistema) sobre una línea
 * de telemetría operacional que se dibuja sola, con un dato en vivo y un pulso
 * tipo radar. Evoca "vigilar el turno" y registrar la operación (bitácoras).
 * Puramente decorativa; respeta `prefers-reduced-motion`.
 */
export function BrandScene() {
  return (
    <svg
      className={styles.scene}
      viewBox="0 0 600 820"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="lyraTelemetryGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#6366f1" />
          <stop offset="1" stopColor="#22d3ee" />
        </linearGradient>
        <linearGradient id="lyraAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="rgba(34,211,238,0.45)" />
          <stop offset="1" stopColor="rgba(34,211,238,0)" />
        </linearGradient>
        <path
          id="lyraTelemetryPath"
          d="M40 740 L120 706 L190 726 L260 678 L330 708 L410 666 L500 694 L560 672"
        />
      </defs>

      {/* Constelación Lyra (aristas + estrellas) */}
      <g>
        <ConstellationLine d="M160 120 L225 205" delay={0.2} />
        <ConstellationLine d="M225 205 L270 300" delay={0.5} />
        <ConstellationLine d="M270 300 L205 372" delay={0.8} />
        <ConstellationLine d="M205 372 L150 285" delay={1.1} />
        <ConstellationLine d="M150 285 L225 205" delay={1.4} />

        <Star cx={160} cy={120} r={3.2} bright delay={0} />
        <Star cx={225} cy={205} r={2.4} delay={0.6} />
        <Star cx={150} cy={285} r={2.2} delay={1.2} />
        <Star cx={270} cy={300} r={2} delay={0.9} />
        <Star cx={205} cy={372} r={1.9} delay={1.6} />
        {/* Estrellas de fondo */}
        <Star cx={95} cy={170} r={1.3} delay={0.3} />
        <Star cx={320} cy={130} r={1.5} delay={1.0} />
        <Star cx={300} cy={235} r={1.2} delay={1.8} />
        <Star cx={110} cy={400} r={1.4} delay={0.7} />
        <Star cx={360} cy={330} r={1.3} delay={2.1} />
      </g>

      {/* Telemetría operacional */}
      <path
        className={styles.area}
        d="M40 740 L120 706 L190 726 L260 678 L330 708 L410 666 L500 694 L560 672 L560 820 L40 820 Z"
        fill="url(#lyraAreaGrad)"
      />
      <use className={styles.telemetry} href="#lyraTelemetryPath" />

      {/* Pulso radar en el dato más reciente */}
      <circle className={styles.radar} cx={500} cy={694} r={9} />
      <circle className={styles.radar} cx={500} cy={694} r={9} style={{ animationDelay: "2.2s" }} />

      {/* Dato en vivo recorriendo la telemetría */}
      <circle className={styles.telemetryDot} r={4}>
        <animateMotion dur="3s" begin="2.6s" repeatCount="indefinite">
          <mpath href="#lyraTelemetryPath" />
        </animateMotion>
      </circle>
    </svg>
  );
}
