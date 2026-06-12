import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateTemplateRequest,
  PublishTemplateRequest,
  SaveTemplateDraftRequest,
  TemplateListQuery,
  UpdateTemplateRequest,
} from "@lyra/contracts";
import {
  assignTemplateRoleScope,
  createTemplate,
  deleteTemplate,
  fetchTemplate,
  fetchTemplateRoleScope,
  fetchTemplates,
  publishTemplate,
  saveTemplateDraft,
  updateTemplate,
} from "./templates-api.js";

export const TEMPLATE_KEYS = {
  all: ["templates"] as const,
  list: (query: TemplateListQuery) => ["templates", "list", query] as const,
  detail: (id: string) => ["templates", "detail", id] as const,
  roleScope: (id: string) => ["templates", "role-scope", id] as const,
};

export function useTemplates(query: TemplateListQuery) {
  return useQuery({ queryKey: TEMPLATE_KEYS.list(query), queryFn: () => fetchTemplates(query) });
}

export function useTemplate(id: string | null) {
  return useQuery({
    queryKey: TEMPLATE_KEYS.detail(id ?? ""),
    queryFn: () => fetchTemplate(id!),
    enabled: !!id,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateTemplateRequest) => createTemplate(dto),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATE_KEYS.all }),
  });
}

export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateTemplateRequest }) => updateTemplate(id, dto),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: TEMPLATE_KEYS.all });
      qc.setQueryData(TEMPLATE_KEYS.detail(data.id), data);
    },
  });
}

export function useSaveTemplateDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: SaveTemplateDraftRequest }) => saveTemplateDraft(id, dto),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: TEMPLATE_KEYS.all });
      qc.setQueryData(TEMPLATE_KEYS.detail(data.id), data);
    },
  });
}

export function usePublishTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto?: PublishTemplateRequest }) => publishTemplate(id, dto),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: TEMPLATE_KEYS.all });
      qc.setQueryData(TEMPLATE_KEYS.detail(data.id), data);
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTemplate(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: TEMPLATE_KEYS.all }),
  });
}

export function useTemplateRoleScope(id: string | null) {
  return useQuery({
    queryKey: TEMPLATE_KEYS.roleScope(id ?? ""),
    queryFn: () => fetchTemplateRoleScope(id!),
    enabled: !!id,
  });
}

export function useAssignTemplateRoleScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, roleIds }: { id: string; roleIds: string[] }) =>
      assignTemplateRoleScope(id, { roleIds }),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: TEMPLATE_KEYS.roleScope(id) });
    },
  });
}
