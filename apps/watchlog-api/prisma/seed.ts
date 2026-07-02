/**
 * Seed idempotente de la Fase 1. Inserta el catálogo de permisos, el rol de
 * sistema "Administrador" (con todos los permisos), la política de contraseñas
 * por defecto y, si se configura, un usuario administrador de arranque que
 * deberá cambiar su contraseña en el primer login.
 *
 * Ejecutar: `pnpm --filter @lyra/watchlog-api run db:seed`
 */
import { PERMISSION_CATALOG } from "@lyra/contracts";
import { PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";
import { NODE_DESCRIPTIONS } from "./structure-descriptions.js";
import { assignReportOrderBySiblings } from "./report-order.js";
import { DEMO_EQUIPMENT, EQUIPMENT_CATEGORIES } from "./equipment-seed-data.js";
import { REFERENCE_LISTS } from "./reference-data-seed.js";
import { DEMO_CALENDAR, DEMO_FISCAL_CALENDAR } from "./operational-calendar-seed.js";
import { NOTIFICATION_TEMPLATE_SEEDS } from "./notification-templates-seed.js";
import { INCIDENT_WORKFLOW, INCIDENT_TYPES, INCIDENT_CATEGORIES, REPORTING_OBLIGATIONS } from "./incidents-seed-data.js";
import { WORK_ORDER_TYPES, WORK_ORDER_SPECIALTIES } from "./work-orders-seed-data.js";

const prisma = new PrismaClient();

const ADMIN_ROLE_KEY = "admin";

async function seedPermissions(): Promise<void> {
  for (const def of PERMISSION_CATALOG) {
    await prisma.permission.upsert({
      where: { key: def.key },
      create: { key: def.key, dimension: def.dimension, group: def.group, description: def.description },
      update: { dimension: def.dimension, group: def.group, description: def.description },
    });
  }
  console.log(`✔ Permisos sincronizados: ${PERMISSION_CATALOG.length}`);
}

async function seedAdminRole(): Promise<void> {
  const role = await prisma.role.upsert({
    where: { key: ADMIN_ROLE_KEY },
    create: { key: ADMIN_ROLE_KEY, name: "Administrador", description: "Acceso total al sistema", isSystem: true },
    update: { isSystem: true },
  });
  const permissions = await prisma.permission.findMany({ select: { id: true } });
  await prisma.rolePermission.createMany({
    data: permissions.map((p) => ({ roleId: role.id, permissionId: p.id })),
    skipDuplicates: true,
  });
  console.log(`✔ Rol "${ADMIN_ROLE_KEY}" con ${permissions.length} permisos`);
}

async function seedPasswordPolicy(): Promise<void> {
  await prisma.passwordPolicy.upsert({
    where: { id: "singleton" },
    create: { id: "singleton" },
    update: {},
  });
  console.log("✔ Política de contraseñas por defecto");
}

async function seedBootstrapAdmin(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("• Sin BOOTSTRAP_ADMIN_EMAIL/PASSWORD: no se crea admin de arranque");
    return;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`• El usuario ${email} ya existe: no se recrea`);
    return;
  }
  const role = await prisma.role.findUniqueOrThrow({ where: { key: ADMIN_ROLE_KEY } });
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const user = await prisma.user.create({
    data: {
      email,
      displayName: "Administrador",
      passwordHash,
      forcePasswordChange: true,
      roles: { create: { roleId: role.id } },
    },
  });
  await prisma.passwordHistory.create({ data: { userId: user.id, passwordHash } });
  console.log(`✔ Admin de arranque creado: ${email} (debe cambiar la contraseña al ingresar)`);
}

/**
 * Usuario de prueba (SOLO fuera de producción) para ejercitar flujos como la
 * recuperación de contraseña sin tocar el admin de arranque. Idempotente.
 * Su contraseña cumple la política por defecto (≥12, mayúscula, número).
 */
async function seedDemoUser(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;
  const email = "demo@watchlog.local";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`• Usuario de prueba ${email} ya existe: no se recrea`);
    return;
  }
  const role = await prisma.role.findUniqueOrThrow({ where: { key: ADMIN_ROLE_KEY } });
  const password = "Demo!Pass2026";
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const user = await prisma.user.create({
    data: {
      email,
      displayName: "Usuario Demo",
      passwordHash,
      forcePasswordChange: false,
      roles: { create: { roleId: role.id } },
    },
  });
  await prisma.passwordHistory.create({ data: { userId: user.id, passwordHash } });
  console.log(`✔ Usuario de prueba (dev) creado: ${email} / ${password}`);
}

/**
 * Estructura organizacional de referencia para desarrollo (2 plantas de ejemplo).
 * Idempotente: salta si ya existen nodos.
 */
async function seedDemoStructure(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;

  const existingNodes = await prisma.orgNode.count();
  if (existingNodes > 0) {
    console.log("• Estructura organizacional ya existe: no se recrea");
    return;
  }

  // Multi-estructura: todo cuelga de la estructura por defecto (la que la migración
  // inserta; upsert por si el seed corre sobre una BD recién migrada o de pruebas).
  const defaultStructure = await prisma.orgStructure.upsert({
    where: { key: "default" },
    update: {},
    create: { id: "org_structure_default", key: "default", name: "Estructura por defecto", isDefault: true, active: true },
  });
  const structureId = defaultStructure.id;

  // Sin nodos, puede haber niveles sueltos de pruebas manuales — limpiar para evitar
  // conflictos en el @@unique([structureId, order]) de OrgLevel.
  await prisma.orgLevel.deleteMany();

  // ── Niveles ──────────────────────────────────────────────────────────────
  const levelPlanta  = await prisma.orgLevel.create({ data: { id: "level-planta",  name: "Planta",  order: 0, structureId } });
  const levelArea    = await prisma.orgLevel.create({ data: { id: "level-area",    name: "Area",    order: 1, structureId } });
  const levelProceso = await prisma.orgLevel.create({ data: { id: "level-proceso", name: "Proceso", order: 2, structureId } });

  // ── Función auxiliar ──────────────────────────────────────────────────────
  async function createNode(
    id: string,
    name: string,
    code: string | null,
    levelId: string,
    parentId: string | null,
    parentPath: string,
  ) {
    const path = `${parentPath}${id}/`;
    return prisma.orgNode.create({
      data: { id, name, code, description: NODE_DESCRIPTIONS[id] ?? null, levelId, parentId, path, structureId },
    });
  }

  // ── PLANTA 1: REMANUFACTURE PLANT ────────────────────────────────────────
  const p1 = await createNode("p1", "REMANUFACTURE PLANT", "REMA", levelPlanta.id, null, "/");

  // Areas de Planta 1
  const a_patio      = await createNode("a-patio",   "PATIO",       "PATIO",  levelArea.id, p1.id, p1.path);
  const a_secado     = await createNode("a-secado",  "SECADO",      "SECA",   levelArea.id, p1.id, p1.path);
  const a_prep       = await createNode("a-prep",    "PREPARACION", "PREP",   levelArea.id, p1.id, p1.path);
  const a_elab       = await createNode("a-elab",    "ELABORACION", "ELAB",   levelArea.id, p1.id, p1.path);

  // Procesos de PATIO
  const patio_procs = [
    ["pr-patio-rec",    "RECEPCION",               "REC"],
    ["pr-patio-emp",    "EMPALILLADO",              "EMP"],
    ["pr-patio-imp",    "IMPREGNADO",               "IMP"],
    ["pr-patio-recv",   "RECEPCION VERDE",          "RECV"],
    ["pr-patio-recs",   "RECEPCION SECO",           "RECS"],
    ["pr-patio-recb",   "RECEPCION BLOCK",          "RECB"],
    ["pr-patio-recbl",  "RECEPCION BLANKS",         "RECBL"],
    ["pr-patio-recrip", "RECEPCION RIP CEPILLADO",  "RECRIP"],
  ] as [string, string, string][];
  for (const [id, name, code] of patio_procs) {
    await createNode(id, name, code, levelProceso.id, a_patio.id, a_patio.path);
  }

  // Procesos de SECADO
  for (const [id, name, code] of [
    ["pr-seca-seca",  "SECADO",        "SECA"],
    ["pr-seca-flash", "FLASH OFF Rema","FLASH"],
  ] as [string, string, string][]) {
    await createNode(id, name, code, levelProceso.id, a_secado.id, a_secado.path);
  }

  // Procesos de PREPARACION
  for (const [id, name, code] of [
    ["pr-prep-cep",    "CEPILLADO",     "CEP"],
    ["pr-prep-troz",   "TROZADO",       "TROZ"],
    ["pr-prep-finger", "FINGER",        "FINGER"],
    ["pr-prep-huin",   "HUINCHA",       "HUIN"],
    ["pr-prep-prens",  "PRENSA",        "PREN"],
    ["pr-prep-rip",    "RIP SAW",       "RIP"],
    ["pr-prep-imp",    "IMPREGNADO Rema","IMPR"],
  ] as [string, string, string][]) {
    await createNode(id, name, code, levelProceso.id, a_prep.id, a_prep.path);
  }

  // Procesos de ELABORACION
  for (const [id, name, code] of [
    ["pr-elab-part",  "PARTIDO",        "PART"],
    ["pr-elab-mold",  "MOLDURERA",      "MOLD"],
    ["pr-elab-lij",   "LIJADO",         "LIJ"],
    ["pr-elab-cola",  "LINEA DE COLA",  "COLA"],
    ["pr-elab-esc",   "ESCUADRADO",     "ESC"],
    ["pr-elab-dim",   "DIMENSIONADO",   "DIM"],
    ["pr-elab-rep",   "REPARADO",       "REP"],
    ["pr-elab-raj",   "RAJADO",         "RAJ"],
    ["pr-elab-deb",   "DESBASTE",       "DEB"],
  ] as [string, string, string][]) {
    await createNode(id, name, code, levelProceso.id, a_elab.id, a_elab.path);
  }

  // ── PLANTA 2: TREATMENT PLANT ────────────────────────────────────────────
  const p2 = await createNode("p2", "TREATMENT PLANT", "TRAT", levelPlanta.id, null, "/");

  // Areas de Planta 2
  const a_trat   = await createNode("a-trat",   "TRATAMIENTO", "TRAT",  levelArea.id, p2.id, p2.path);
  const _a_rec2  = await createNode("a-rec2",   "RECEPCION",   "REC",   levelArea.id, p2.id, p2.path);
  const a_pint   = await createNode("a-pint",   "PINTADO",     "PINT",  levelArea.id, p2.id, p2.path);
  const a_p2     = await createNode("a-p2",     "PLANTA P2",   "P2",    levelArea.id, p2.id, p2.path);

  // Procesos de TRATAMIENTO
  for (const [id, name, code] of [
    ["pr-trat-impp",  "IMPREGNADO Pintado",  "IMPP"],
    ["pr-trat-flash", "FLASH OFF Pintado",   "FLASHP"],
    ["pr-trat-boro",  "IMPREGNADO BORO",     "BORO"],
  ] as [string, string, string][]) {
    await createNode(id, name, code, levelProceso.id, a_trat.id, a_trat.path);
  }

  // RECEPCION Planta 2 no tiene procesos visibles en la referencia — queda vacía

  // Procesos de PINTADO
  for (const [id, name, code] of [
    ["pr-pint-air",  "AIRLESS",              "AIR"],
    ["pr-pint-vac",  "VACÍO",                "VAC"],
    ["pr-pint-arm",  "ARMADO",               "ARM"],
    ["pr-pint-br1",  "BAJADA RACK (1eraM)",  "BR1"],
    ["pr-pint-br2",  "BAJADA RACK (2daM)",   "BR2"],
    ["pr-pint-brl",  "BAJADA RACK (Latex)",  "BRL"],
    ["pr-pint-brm",  "BAJADA RACK (Manual)", "BRM"],
    ["pr-pint-brs",  "BAJADA RACK SELLANTE", "BRS"],
    ["pr-pint-brlfx","BAJADA RACK (Latex FFX)","BRLFX"],
  ] as [string, string, string][]) {
    await createNode(id, name, code, levelProceso.id, a_pint.id, a_pint.path);
  }

  // Procesos de PLANTA P2
  await createNode("pr-p2-pint2", "PINTADO 2", "PINT2", levelProceso.id, a_p2.id, a_p2.path);

  // Orden inicial en informes: escalonado por grupo de hermanos.
  await assignReportOrderBySiblings(prisma);

  console.log("✔ Estructura organizacional de demo (2 plantas) creada");
}

/**
 * Catálogo de categorías/clases de equipo. Idempotente: upsert por id fijo.
 * El catálogo es editable desde la UI; esto solo asegura un punto de partida.
 */
async function seedEquipmentCategories(): Promise<void> {
  let order = 0;
  for (const cat of EQUIPMENT_CATEGORIES) {
    order += 10;
    await prisma.equipmentCategory.upsert({
      where: { id: cat.id },
      create: { id: cat.id, name: cat.name, code: cat.code, isoRef: cat.isoRef ?? null, reportOrder: order },
      update: { name: cat.name, code: cat.code, isoRef: cat.isoRef ?? null },
    });
  }
  console.log(`✔ Categorías de equipo sincronizadas: ${EQUIPMENT_CATEGORIES.length}`);
}

/**
 * Equipos de ejemplo (SOLO desarrollo). Idempotente: salta si ya hay equipos.
 * El orden en informes se asigna escalonado por nodo (10, 20, 30…).
 */
async function seedDemoEquipment(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;

  const existing = await prisma.equipment.count();
  if (existing > 0) {
    console.log("• Equipos de demo ya existen: no se recrean");
    return;
  }

  const orderByNode = new Map<string, number>();
  let created = 0;
  for (const eq of DEMO_EQUIPMENT) {
    // Solo sembrar si el nodo destino existe (la estructura de demo puede no estar).
    const node = await prisma.orgNode.count({ where: { id: eq.orgNodeId, deletedAt: null } });
    if (node === 0) continue;
    const next = (orderByNode.get(eq.orgNodeId) ?? 0) + 10;
    orderByNode.set(eq.orgNodeId, next);
    await prisma.equipment.create({
      data: {
        name: eq.name,
        code: eq.code ?? null,
        tag: eq.tag ?? null,
        categoryId: eq.categoryId ?? null,
        manufacturer: eq.manufacturer ?? null,
        model: eq.model ?? null,
        criticality: eq.criticality ?? null,
        reportOrder: next,
        orgNodeId: eq.orgNodeId,
      },
    });
    created++;
  }
  console.log(`✔ Equipos de demo creados: ${created}`);
}

/**
 * Listas de referencia de demo (SOLO desarrollo). Idempotente: upsert por `key`
 * estable (lista) y `(listId, code)` (ítem). Ver `reference-data-seed.ts`.
 */
async function seedReferenceData(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;

  for (const list of REFERENCE_LISTS) {
    const saved = await prisma.referenceList.upsert({
      where: { key: list.key },
      create: { key: list.key, name: list.name, description: list.description, sortOrder: list.sortOrder },
      update: { name: list.name, description: list.description, sortOrder: list.sortOrder },
    });
    for (const item of list.items) {
      await prisma.referenceItem.upsert({
        where: { listId_code: { listId: saved.id, code: item.code } },
        create: {
          listId: saved.id,
          code: item.code,
          label: item.label,
          sortOrder: item.sortOrder,
          metadata: item.metadata ?? undefined,
        },
        update: { label: item.label, sortOrder: item.sortOrder, metadata: item.metadata ?? undefined },
      });
    }
  }
  console.log(`✔ Listas de referencia de demo sincronizadas: ${REFERENCE_LISTS.length}`);
}

/**
 * Calendario operacional de demo (SOLO desarrollo). Idempotente: upsert por `key`;
 * reemplaza sus turnos para reflejar la definición de la fuente. Ver
 * `operational-calendar-seed.ts`.
 */
async function seedOperationalCalendar(): Promise<void> {
  if (process.env.NODE_ENV === "production") return;

  // Multi-estructura: los calendarios de demo cuelgan de la estructura por defecto.
  const defaultStructure = await prisma.orgStructure.upsert({
    where: { key: "default" },
    update: {},
    create: { id: "org_structure_default", key: "default", name: "Estructura por defecto", isDefault: true, active: true },
  });
  const structureId = defaultStructure.id;

  const c = DEMO_CALENDAR;
  const cal = await prisma.operationalCalendar.upsert({
    where: { key: c.key },
    create: {
      structureId,
      key: c.key,
      name: c.name,
      description: c.description,
      timezone: c.timezone,
      isDefault: c.isDefault,
      dayStartShiftCode: c.dayStartShiftCode,
    },
    update: {
      name: c.name,
      description: c.description,
      timezone: c.timezone,
      dayStartShiftCode: c.dayStartShiftCode,
    },
  });
  await prisma.operationalShift.deleteMany({ where: { calendarId: cal.id } });
  await prisma.operationalShift.createMany({
    data: c.shifts.map((s, i) => ({ calendarId: cal.id, code: s.code, label: s.label, startTime: s.startTime, durationMinutes: s.durationMinutes, sortOrder: i * 10 })),
  });
  console.log(`✔ Calendario operacional de demo sincronizado: ${c.key} (${c.shifts.length} turnos)`);

  // Calendario FISCAL por defecto (Fase 2.7.1.1). Idempotente y NO destructivo: solo
  // crea si falta (update vacío) para no sobreescribir la config de período de una
  // instalación existente (el periodKey histórico ya estampado debe quedar intacto).
  const f = DEMO_FISCAL_CALENDAR;
  await prisma.fiscalCalendar.upsert({
    where: { key: f.key },
    create: {
      structureId,
      key: f.key,
      name: f.name,
      description: f.description,
      timezone: f.timezone,
      isDefault: f.isDefault,
      periodKind: f.periodKind,
      periodAnchorDay: f.periodAnchorDay,
      requirePeriod: false,
    },
    update: {},
  });
  console.log(`✔ Calendario fiscal por defecto asegurado: ${f.key} (${f.periodKind})`);
}

/**
 * Plantillas de mensaje por defecto del motor de notificaciones (Bloque N).
 * Idempotente por la única `(eventKey, locale, channel)`. NO sobrescribe el cuerpo
 * si el admin ya lo personalizó (solo crea las que falten).
 */
async function seedNotificationTemplates(): Promise<void> {
  let created = 0;
  for (const t of NOTIFICATION_TEMPLATE_SEEDS) {
    // Las plantillas de sistema son GENÉRICAS (templateId null); la unique pasó a
    // incluir templateId en Fase A, así que se busca la genérica con findFirst.
    const existing = await prisma.notificationTemplate.findFirst({
      where: { eventKey: t.eventKey, locale: t.locale, channel: t.channel, templateId: null },
    });
    if (existing) continue;
    await prisma.notificationTemplate.create({
      data: { ...t, templateId: null, active: true, isSystem: true },
    });
    created++;
  }
  console.log(`✔ Plantillas de notificación: ${created} creadas, ${NOTIFICATION_TEMPLATE_SEEDS.length - created} ya existían`);
}

// Flujo de incidencias por defecto (Fase 4.0). Reusa WorkflowDefinition: crea la
// definición + UNA versión PUBLICADA con sus estados y transiciones. Idempotente:
// si ya existe la definición por clave, no la recrea.
async function seedIncidentWorkflow(): Promise<void> {
  const existing = await prisma.workflowDefinition.findFirst({ where: { key: INCIDENT_WORKFLOW.key } });
  if (existing) {
    console.log(`• Flujo de incidencias "${INCIDENT_WORKFLOW.key}" ya existe: no se recrea`);
    return;
  }
  const def = await prisma.workflowDefinition.create({
    data: { key: INCIDENT_WORKFLOW.key, name: INCIDENT_WORKFLOW.name, description: INCIDENT_WORKFLOW.description, status: "PUBLISHED" },
  });
  const version = await prisma.workflowDefinitionVersion.create({
    data: {
      workflowDefinitionId: def.id,
      versionNumber: 1,
      status: "PUBLISHED",
      name: INCIDENT_WORKFLOW.name,
      description: INCIDENT_WORKFLOW.description,
      publishedAt: new Date(),
    },
  });
  const stateIdByKey = new Map<string, string>();
  for (const s of INCIDENT_WORKFLOW.states) {
    const row = await prisma.workflowState.create({
      data: {
        workflowDefinitionVersionId: version.id,
        key: s.key,
        name: s.name,
        order: s.order,
        isInitial: s.isInitial,
        isFinal: s.isFinal,
        color: s.color,
      },
    });
    stateIdByKey.set(s.key, row.id);
  }
  let order = 0;
  for (const t of INCIDENT_WORKFLOW.transitions) {
    await prisma.workflowTransition.create({
      data: {
        workflowDefinitionVersionId: version.id,
        key: t.key,
        label: t.label,
        fromStateId: stateIdByKey.get(t.from)!,
        toStateId: stateIdByKey.get(t.to)!,
        order: order++,
      },
    });
  }
  await prisma.workflowDefinition.update({ where: { id: def.id }, data: { currentVersionId: version.id } });
  console.log(`✔ Flujo de incidencias "${INCIDENT_WORKFLOW.key}" publicado (${INCIDENT_WORKFLOW.states.length} estados)`);
}

// Catálogo de tipos/categorías de incidencia (configurable; upsert idempotente por clave).
async function seedIncidentCatalog(): Promise<void> {
  const typeIdByKey = new Map<string, string>();
  for (const t of INCIDENT_TYPES) {
    const row = await prisma.incidentType.upsert({
      where: { key: t.key },
      create: {
        key: t.key,
        name: t.name,
        description: t.description,
        color: t.color,
        requiresInvestigation: t.requiresInvestigation,
        requiresCapa: t.requiresCapa,
        reportableDefault: t.reportableDefault,
        sortOrder: t.sortOrder,
      },
      update: { name: t.name, description: t.description, color: t.color, sortOrder: t.sortOrder },
    });
    typeIdByKey.set(t.key, row.id);
  }
  for (const c of INCIDENT_CATEGORIES) {
    const typeId = c.typeKey ? typeIdByKey.get(c.typeKey) ?? null : null;
    await prisma.incidentCategory.upsert({
      where: { key: c.key },
      create: { key: c.key, name: c.name, typeId, sortOrder: c.sortOrder },
      update: { name: c.name, typeId, sortOrder: c.sortOrder },
    });
  }
  // Obligaciones de reporte (Fase 4.3): catálogo de ejemplo, idempotente por clave.
  for (const o of REPORTING_OBLIGATIONS) {
    const appliesToTypeIds = o.appliesToTypeKeys.map((k) => typeIdByKey.get(k)).filter((x): x is string => !!x);
    await prisma.reportingObligation.upsert({
      where: { key: o.key },
      create: {
        key: o.key,
        name: o.name,
        description: o.description,
        authorityName: o.authorityName,
        defaultDueMinutes: o.defaultDueMinutes,
        appliesToTypeIds,
        minSeverity: o.minSeverity,
        mandatory: o.mandatory,
        sortOrder: o.sortOrder,
      },
      update: { name: o.name, description: o.description, authorityName: o.authorityName, defaultDueMinutes: o.defaultDueMinutes, appliesToTypeIds, minSeverity: o.minSeverity, mandatory: o.mandatory, sortOrder: o.sortOrder },
    });
  }
  console.log(
    `✔ Catálogo de incidencias sincronizado: ${INCIDENT_TYPES.length} tipos, ${INCIDENT_CATEGORIES.length} categorías, ${REPORTING_OBLIGATIONS.length} obligaciones de reporte`,
  );
}

// Catálogo de arranque de Órdenes de Trabajo (OT / PTW) — tipos + áreas +
// especialidades. Configurable desde la UI; upsert idempotente por clave.
async function seedWorkOrderCatalog(): Promise<void> {
  for (const t of WORK_ORDER_TYPES) {
    await prisma.workOrderType.upsert({
      where: { key: t.key },
      create: {
        key: t.key,
        name: t.name,
        description: t.description,
        color: t.color,
        requiresPtwDefault: t.requiresPtwDefault,
        criticalityDefault: t.criticalityDefault,
        sortOrder: t.sortOrder,
      },
      update: { name: t.name, description: t.description, color: t.color, requiresPtwDefault: t.requiresPtwDefault, criticalityDefault: t.criticalityDefault, sortOrder: t.sortOrder },
    });
  }
  for (const s of WORK_ORDER_SPECIALTIES) {
    await prisma.specialty.upsert({
      where: { key: s.key },
      create: { key: s.key, name: s.name, description: s.description, color: s.color, sortOrder: s.sortOrder },
      update: { name: s.name, description: s.description, color: s.color, sortOrder: s.sortOrder },
    });
  }
  console.log(
    `✔ Catálogo de OT sincronizado: ${WORK_ORDER_TYPES.length} tipos, ${WORK_ORDER_SPECIALTIES.length} especialidades`,
  );
}

async function main(): Promise<void> {
  await seedPermissions();
  await seedAdminRole();
  await seedNotificationTemplates();
  await seedPasswordPolicy();
  await seedBootstrapAdmin();
  await seedDemoUser();
  await seedDemoStructure();
  await seedEquipmentCategories();
  await seedDemoEquipment();
  await seedReferenceData();
  await seedOperationalCalendar();
  await seedIncidentWorkflow();
  await seedIncidentCatalog();
  await seedWorkOrderCatalog();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
