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

  // Sin nodos, puede haber niveles sueltos de pruebas manuales — limpiar para evitar
  // conflictos en el @@unique([order]) de OrgLevel.
  await prisma.orgLevel.deleteMany();

  // ── Niveles ──────────────────────────────────────────────────────────────
  const levelPlanta  = await prisma.orgLevel.create({ data: { id: "level-planta",  name: "Planta",  order: 0 } });
  const levelArea    = await prisma.orgLevel.create({ data: { id: "level-area",    name: "Area",    order: 1 } });
  const levelProceso = await prisma.orgLevel.create({ data: { id: "level-proceso", name: "Proceso", order: 2 } });

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
      data: { id, name, code, description: NODE_DESCRIPTIONS[id] ?? null, levelId, parentId, path },
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

  console.log("✔ Estructura organizacional de demo (2 plantas) creada");
}

async function main(): Promise<void> {
  await seedPermissions();
  await seedAdminRole();
  await seedPasswordPolicy();
  await seedBootstrapAdmin();
  await seedDemoUser();
  await seedDemoStructure();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
