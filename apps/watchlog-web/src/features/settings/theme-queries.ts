import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreatePaletteRequest, UpdatePaletteRequest } from "@lyra/contracts";
import {
  clearDefaultPalette,
  createPalette,
  deletePalette,
  fetchAllPalettes,
  fetchMyTheme,
  fetchPublishedPalettes,
  publishPalette,
  selectPalette,
  setDefaultPalette,
  updatePalette,
} from "./theme-api.js";

export const THEME_ME_KEY = ["theme", "me"] as const;
export const THEME_PUBLISHED_KEY = ["theme", "published"] as const;
export const THEME_ADMIN_KEY = ["theme", "admin"] as const;

// --- Usuario -------------------------------------------------------------------

export function useMyTheme() {
  return useQuery({ queryKey: THEME_ME_KEY, queryFn: fetchMyTheme });
}

export function usePublishedPalettes() {
  return useQuery({ queryKey: THEME_PUBLISHED_KEY, queryFn: fetchPublishedPalettes });
}

export function useSelectPalette() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (paletteId: string | null) => selectPalette(paletteId),
    onSuccess: (data) => qc.setQueryData(THEME_ME_KEY, data),
  });
}

// --- Admin ---------------------------------------------------------------------

export function useAllPalettes(enabled = true) {
  return useQuery({ queryKey: THEME_ADMIN_KEY, queryFn: fetchAllPalettes, enabled });
}

/** Tras cualquier mutación de admin se invalida la lista admin + las superficies de usuario. */
function useAdminInvalidation() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: THEME_ADMIN_KEY });
    void qc.invalidateQueries({ queryKey: THEME_PUBLISHED_KEY });
    void qc.invalidateQueries({ queryKey: THEME_ME_KEY });
  };
}

export function useCreatePalette() {
  const invalidate = useAdminInvalidation();
  return useMutation({ mutationFn: (dto: CreatePaletteRequest) => createPalette(dto), onSuccess: invalidate });
}

export function useUpdatePalette() {
  const invalidate = useAdminInvalidation();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePaletteRequest }) => updatePalette(id, dto),
    onSuccess: invalidate,
  });
}

export function usePublishPalette() {
  const invalidate = useAdminInvalidation();
  return useMutation({
    mutationFn: ({ id, isPublished }: { id: string; isPublished: boolean }) => publishPalette(id, isPublished),
    onSuccess: invalidate,
  });
}

export function useSetDefaultPalette() {
  const qc = useQueryClient();
  const invalidate = useAdminInvalidation();
  return useMutation({
    mutationFn: (id: string) => setDefaultPalette(id),
    onSuccess: (rows) => {
      qc.setQueryData(THEME_ADMIN_KEY, rows);
      invalidate();
    },
  });
}

export function useClearDefaultPalette() {
  const qc = useQueryClient();
  const invalidate = useAdminInvalidation();
  return useMutation({
    mutationFn: () => clearDefaultPalette(),
    onSuccess: (rows) => {
      qc.setQueryData(THEME_ADMIN_KEY, rows);
      invalidate();
    },
  });
}

export function useDeletePalette() {
  const invalidate = useAdminInvalidation();
  return useMutation({ mutationFn: (id: string) => deletePalette(id), onSuccess: invalidate });
}
