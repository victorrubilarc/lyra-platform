import { effectiveToken, type PaletteTokens } from "@lyra/contracts";
import styles from "./AppearanceSettingsPanel.module.css";

/**
 * Mini muestra (2×2) de una paleta o plantilla: acento primario + secundario (oscuro)
 * y fondo claro, sobre un fondo oscuro con borde del acento. Sirve tanto para la lista
 * de paletas como para el picker de plantillas (mismo lenguaje visual).
 */
export function PaletteSwatch({
  tokensDark,
  tokensLight,
}: {
  tokensDark: PaletteTokens;
  tokensLight: PaletteTokens;
}) {
  return (
    <span
      className={styles.swatch}
      style={{
        background: effectiveToken(tokensDark, "bgBase", "dark"),
        borderColor: effectiveToken(tokensDark, "accentPrimary", "dark"),
      }}
    >
      <span style={{ background: effectiveToken(tokensDark, "accentPrimary", "dark") }} />
      <span style={{ background: effectiveToken(tokensDark, "accentSecondary", "dark") }} />
      <span style={{ background: effectiveToken(tokensLight, "bgBase", "light") }} />
      <span style={{ background: effectiveToken(tokensLight, "accentPrimary", "light") }} />
    </span>
  );
}
