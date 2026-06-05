/**
 * @lyra/ui — Design System del ecosistema Lyra.
 *
 * Tokens (CSS): se importan por separado en el entry point de la app:
 *   import "@lyra/ui/tokens.css";
 *
 * Componentes React premium: se exportan desde aquí. Cada uno vive en su carpeta
 * con su CSS Module sobre tokens, respeta dark-mode, área táctil 44px e
 * iconografía Lucide. Ver docs/DESIGN_SYSTEM.md.
 */
export const LYRA_UI_VERSION = "0.1.0";

export { cx } from "./cx.js";

export { Button } from "./components/Button/Button.js";
export type { ButtonProps, ButtonVariant } from "./components/Button/Button.js";

export { Spinner } from "./components/Spinner/Spinner.js";
export type { SpinnerProps } from "./components/Spinner/Spinner.js";

export { Input } from "./components/Input/Input.js";
export type { InputProps } from "./components/Input/Input.js";

export { FormField } from "./components/FormField/FormField.js";
export type { FormFieldProps, FieldControlProps } from "./components/FormField/FormField.js";

export { Card } from "./components/Card/Card.js";
export type { CardProps } from "./components/Card/Card.js";

export { ToastProvider, useToast } from "./components/Toast/ToastProvider.js";
export type { ToastVariant } from "./components/Toast/ToastProvider.js";
