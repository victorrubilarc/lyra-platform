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

export { Textarea } from "./components/Textarea/Textarea.js";
export type { TextareaProps } from "./components/Textarea/Textarea.js";

export { FormField } from "./components/FormField/FormField.js";
export type { FormFieldProps, FieldControlProps } from "./components/FormField/FormField.js";

export { Card } from "./components/Card/Card.js";
export type { CardProps } from "./components/Card/Card.js";

export { ToastProvider, useToast } from "./components/Toast/ToastProvider.js";
export type { ToastVariant } from "./components/Toast/ToastProvider.js";

export { Toggle } from "./components/Toggle/Toggle.js";
export type { ToggleProps } from "./components/Toggle/Toggle.js";

export { Checkbox } from "./components/Checkbox/Checkbox.js";
export type { CheckboxProps } from "./components/Checkbox/Checkbox.js";

export { Skeleton } from "./components/Skeleton/Skeleton.js";
export type { SkeletonProps } from "./components/Skeleton/Skeleton.js";

export { EmptyState } from "./components/EmptyState/EmptyState.js";
export type { EmptyStateProps } from "./components/EmptyState/EmptyState.js";

export { Breadcrumb } from "./components/Breadcrumb/Breadcrumb.js";
export type { BreadcrumbProps, Crumb } from "./components/Breadcrumb/Breadcrumb.js";

export { Tooltip } from "./components/Tooltip/Tooltip.js";
export type { TooltipProps } from "./components/Tooltip/Tooltip.js";

export { Menu, MenuItem, MenuSeparator, MenuLabel } from "./components/Menu/Menu.js";
export type { MenuProps, MenuItemProps } from "./components/Menu/Menu.js";

export { Modal } from "./components/Modal/Modal.js";
export type { ModalProps } from "./components/Modal/Modal.js";

export { Drawer } from "./components/Drawer/Drawer.js";
export type { DrawerProps } from "./components/Drawer/Drawer.js";

export { Chip } from "./components/Chip/Chip.js";
export type { ChipProps, ChipVariant } from "./components/Chip/Chip.js";

export { Select } from "./components/Select/Select.js";
export type { SelectProps } from "./components/Select/Select.js";

export { MultiSelect } from "./components/MultiSelect/MultiSelect.js";
export type { MultiSelectProps, MultiSelectOption } from "./components/MultiSelect/MultiSelect.js";

export { Combobox } from "./components/Combobox/Combobox.js";
export type { ComboboxProps, ComboboxOption } from "./components/Combobox/Combobox.js";

export { LookupPicker } from "./components/LookupPicker/LookupPicker.js";
export type { LookupPickerProps, LookupOption } from "./components/LookupPicker/LookupPicker.js";

export { Table } from "./components/Table/Table.js";
export type { TableProps, TableColumn, TableSort, TableColumnState } from "./components/Table/Table.js";

export { ResizableSplit } from "./components/ResizableSplit/ResizableSplit.js";
export type { ResizableSplitProps } from "./components/ResizableSplit/ResizableSplit.js";
