import { z } from "zod";
import {
  createPaletteRequestSchema,
  palettePublicSchema,
  publishPaletteRequestSchema,
  selectPaletteRequestSchema,
  themePaletteSchema,
  updatePaletteRequestSchema,
  userThemePreferenceSchema,
  type CreatePaletteRequest,
  type PalettePublicDto,
  type ThemePaletteDto,
  type UpdatePaletteRequest,
  type UserThemePreferenceDto,
} from "@lyra/contracts";
import { apiJson, apiVoid } from "../../lib/api-client.js";

const paletteListSchema = z.array(themePaletteSchema);
const publicListSchema = z.array(palettePublicSchema);

// --- Usuario (cualquier sesión) ------------------------------------------------

/** Preferencia de tema efectiva del usuario (paleta elegida o por defecto). */
export function fetchMyTheme(): Promise<UserThemePreferenceDto> {
  return apiJson("/theme/me", userThemePreferenceSchema);
}

/** Paletas publicadas (selector del usuario). */
export function fetchPublishedPalettes(): Promise<PalettePublicDto[]> {
  return apiJson("/theme/palettes", publicListSchema);
}

/** El usuario elige una paleta publicada (o `null` para volver a la por defecto). */
export function selectPalette(paletteId: string | null): Promise<UserThemePreferenceDto> {
  const body = selectPaletteRequestSchema.parse({ paletteId });
  return apiJson("/theme/me", userThemePreferenceSchema, { method: "PUT", body });
}

// --- Admin (theme:manage) ------------------------------------------------------

export function fetchAllPalettes(): Promise<ThemePaletteDto[]> {
  return apiJson("/theme/admin/palettes", paletteListSchema);
}

export function createPalette(dto: CreatePaletteRequest): Promise<ThemePaletteDto> {
  const body = createPaletteRequestSchema.parse(dto);
  return apiJson("/theme/admin/palettes", themePaletteSchema, { method: "POST", body });
}

export function updatePalette(id: string, dto: UpdatePaletteRequest): Promise<ThemePaletteDto> {
  const body = updatePaletteRequestSchema.parse(dto);
  return apiJson(`/theme/admin/palettes/${id}`, themePaletteSchema, { method: "PATCH", body });
}

export function publishPalette(id: string, isPublished: boolean): Promise<ThemePaletteDto> {
  const body = publishPaletteRequestSchema.parse({ isPublished });
  return apiJson(`/theme/admin/palettes/${id}/publish`, themePaletteSchema, { method: "PUT", body });
}

export function setDefaultPalette(id: string): Promise<ThemePaletteDto[]> {
  return apiJson(`/theme/admin/palettes/${id}/default`, paletteListSchema, { method: "PUT" });
}

export function clearDefaultPalette(): Promise<ThemePaletteDto[]> {
  return apiJson("/theme/admin/default", paletteListSchema, { method: "DELETE" });
}

export function deletePalette(id: string): Promise<void> {
  return apiVoid(`/theme/admin/palettes/${id}`, { method: "DELETE" });
}
