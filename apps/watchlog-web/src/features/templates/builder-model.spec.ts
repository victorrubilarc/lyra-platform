import { describe, expect, it } from "vitest";
import type { TemplateDetail } from "@lyra/contracts";
import { detailToEditState, editStateToDraftRequest } from "./builder-model.js";

/**
 * GUARD DE REGRESIÓN — permisos por SECCIÓN y CAMPO del Form Builder.
 *
 * Contexto: durante las reescrituras del builder (Fase 2.1.x) el round-trip
 * detalle→modelo→payload dejó de propagar los `roleIds` a nivel de SECCIÓN (los de
 * campo sobrevivieron). Como cada entrada congela su versión, eso desactivó la
 * autorización por sección en las plantillas publicadas de ese período SIN que
 * ningún test lo notara. Estos casos blindan EXACTAMENTE esa superficie: si alguien
 * vuelve a quitar la propagación de `roleIds` (sección o campo), aquí revienta.
 *
 * No basta con que el backend lo persista: si el builder no lo ENVÍA, se pierde.
 */

const SECTION_ROLE = "role-operador";
const FIELD_ROLE = "role-mantenedor";

function detailWithRoles(): TemplateDetail {
  return {
    id: "tpl-1",
    name: "Bitácora con roles",
    description: null,
    orgNodeId: null,
    purpose: null,
    status: "PUBLISHED",
    currentVersionId: "ver-1",
    editWindowAnchor: null,
    editWindowMinutes: null,
    equipmentMode: "OPTIONAL",
    gridFieldKeys: [],
    createdAt: "2026-06-17T00:00:00.000Z",
    updatedAt: "2026-06-17T00:00:00.000Z",
    hasDraft: false,
    nodeAssignments: [],
    version: {
      id: "ver-1",
      templateId: "tpl-1",
      versionNumber: 1,
      status: "PUBLISHED",
      name: "Bitácora con roles",
      description: null,
      workflowDefinitionId: null,
      workflowDefinitionVersionId: null,
      requireSignature: false,
      recurrenceKind: "NONE",
      recurrenceConfig: null,
      rules: [],
      publishedAt: "2026-06-17T00:00:00.000Z",
      sections: [
        {
          id: "sec-1",
          key: "lecturas",
          title: "Lecturas y estado del equipo",
          description: null,
          order: 1,
          requireSignature: false,
          editableInStateKey: null,
          roleIds: [SECTION_ROLE],
          fields: [
            {
              id: "fld-1",
              key: "estado_mecanico",
              type: "SELECT",
              dataType: "CODE",
              semanticRole: null,
              label: "Estado mecánico (lo registra Mantenedor)",
              help: null,
              required: true,
              order: 1,
              config: { optionSource: { kind: "inline", items: [{ code: "ok", label: "Conforme" }] } },
              visibleWhen: null,
              computed: null,
              colSpan: 6,
              gridX: 0,
              gridY: 0,
              gridH: 1,
              roleIds: [FIELD_ROLE],
            },
          ],
        },
      ],
    },
  };
}

describe("builder-model — round-trip de permisos por sección/campo", () => {
  it("detailToEditState conserva roleIds de sección y de campo", () => {
    const state = detailToEditState(detailWithRoles());
    expect(state.sections[0]!.roleIds).toEqual([SECTION_ROLE]);
    expect(state.sections[0]!.fields[0]!.roleIds).toEqual([FIELD_ROLE]);
  });

  it("editStateToDraftRequest envía roleIds de sección y de campo (regresión v3–v11)", () => {
    const req = editStateToDraftRequest(detailToEditState(detailWithRoles()));
    const section = req.sections[0]!;
    expect(section.roleIds).toEqual([SECTION_ROLE]);
    expect(section.fields[0]!.roleIds).toEqual([FIELD_ROLE]);
  });

  it("una sección SIN roles round-trippea como vacía (no inventa restricciones)", () => {
    const detail = detailWithRoles();
    detail.version.sections[0]!.roleIds = [];
    detail.version.sections[0]!.fields[0]!.roleIds = [];
    const req = editStateToDraftRequest(detailToEditState(detail));
    expect(req.sections[0]!.roleIds).toEqual([]);
    expect(req.sections[0]!.fields[0]!.roleIds).toEqual([]);
  });
});
