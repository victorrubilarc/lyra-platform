import { beforeEach, describe, expect, it } from "vitest";
import { resolveTheme, useThemeStore } from "./theme-store.js";

/**
 * Fallback de tema de la INSTALACIÓN (OOBE S3): `defaultThemeMode` gobierna
 * SOLO mientras el usuario no elija; la elección explícita queda por encima.
 */
describe("theme-store: default de instalación vs. preferencia explícita", () => {
  beforeEach(() => {
    useThemeStore.setState({ preference: "dark", explicit: false });
  });

  it("applyInstallDefault aplica cuando el usuario nunca eligió (y no marca explícito)", () => {
    useThemeStore.getState().applyInstallDefault("light");
    expect(useThemeStore.getState().preference).toBe("light");
    expect(useThemeStore.getState().explicit).toBe(false);
  });

  it("si el admin cambia el default, el usuario sin elección lo sigue en la próxima carga", () => {
    useThemeStore.getState().applyInstallDefault("light");
    useThemeStore.getState().applyInstallDefault("auto");
    expect(useThemeStore.getState().preference).toBe("auto");
  });

  it("la elección del usuario manda: el default de instalación ya no la pisa", () => {
    useThemeStore.getState().setPreference("auto");
    expect(useThemeStore.getState().explicit).toBe(true);
    useThemeStore.getState().applyInstallDefault("light");
    expect(useThemeStore.getState().preference).toBe("auto");
  });

  it("resolveTheme respeta dark/light directos", () => {
    expect(resolveTheme("dark")).toBe("dark");
    expect(resolveTheme("light")).toBe("light");
  });
});
